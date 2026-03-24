//! WebSocket proxy for chat — connects to the OpenClaw gateway from Rust
//! (no browser origin restrictions) and relays messages to the frontend
//! via Tauri events.

use std::sync::Arc;
use tokio::sync::Mutex;
use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter, Manager};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Shared state for the active WebSocket connection
struct ChatConnection {
    /// Sender half of the WS — used to send messages to the gateway
    tx: futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
}

type SharedChat = Arc<Mutex<Option<ChatConnection>>>;

#[derive(Clone, Serialize)]
struct ChatEvent {
    /// "connected", "disconnected", "message", "error"
    kind: String,
    /// The raw JSON payload from the gateway (for message events)
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
    /// Human-readable error (for error events)
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Deserialize)]
pub struct ConnectParams {
    port: u16,
    password: String,
}

/// Connect to the gateway WebSocket.
/// Spawns a background task that reads messages and emits them as Tauri events.
#[tauri::command]
pub async fn chat_connect(
    app: AppHandle,
    params: ConnectParams,
) -> Result<(), String> {
    let state = app
        .try_state::<SharedChat>()
        .ok_or("Chat state not initialized")?;

    // Close any existing connection
    {
        let mut guard = state.lock().await;
        if let Some(mut conn) = guard.take() {
            let _ = conn.tx.close().await;
        }
    }

    let url = format!("ws://127.0.0.1:{}", params.port);
    let password = params.password.clone();

    // Connect — no Origin header, so no origin rejection
    let (ws_stream, _) = connect_async(&url)
        .await
        .map_err(|e| format!("Couldn't connect to agent: {}", e))?;

    let (mut tx, mut rx) = ws_stream.split();

    // Read the challenge, send connect frame
    let challenge_msg = rx
        .next()
        .await
        .ok_or("Gateway closed before challenge")?
        .map_err(|e| format!("WS read error: {}", e))?;

    let challenge_text = challenge_msg.into_text().unwrap_or_default().to_string();
    let challenge: serde_json::Value =
        serde_json::from_str(&challenge_text).map_err(|_| "Invalid challenge")?;

    // Verify it's a challenge
    if challenge.get("event").and_then(|v| v.as_str()) != Some("connect.challenge") {
        return Err("Unexpected first message from gateway".into());
    }

    // Send connect frame — as Rust process, no origin issues
    let connect_frame = serde_json::json!({
        "type": "req",
        "id": "connect-1",
        "method": "connect",
        "params": {
            "minProtocol": 3,
            "maxProtocol": 3,
            "auth": { "password": password },
            "client": {
                "id": "openclaw-control-ui",
                "version": "1.3.0",
                "platform": "web",
                "mode": "ui"
            },
            "scopes": [
                "operator.read",
                "operator.write",
                "operator.admin",
                "operator.approvals",
                "operator.pairing"
            ]
        }
    });

    tx.send(Message::Text(connect_frame.to_string().into()))
        .await
        .map_err(|e| format!("Couldn't send connect: {}", e))?;

    // Read connect response
    let response_msg = rx
        .next()
        .await
        .ok_or("Gateway closed before connect response")?
        .map_err(|e| format!("WS read error: {}", e))?;

    let response_text = response_msg.into_text().unwrap_or_default().to_string();
    let response: serde_json::Value =
        serde_json::from_str(&response_text).map_err(|_| "Invalid connect response")?;

    if response.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        let error_msg = response
            .pointer("/error/message")
            .and_then(|v| v.as_str())
            .unwrap_or("Connection rejected by gateway");
        return Err(error_msg.to_string());
    }

    // Store the sender
    {
        let mut guard = state.lock().await;
        *guard = Some(ChatConnection { tx });
    }

    // Emit connected event
    let _ = app.emit("chat-event", ChatEvent {
        kind: "connected".into(),
        data: None,
        error: None,
    });

    // Spawn background reader
    let app_handle = app.clone();
    let state_clone = Arc::clone(&state);
    tokio::spawn(async move {
        while let Some(msg_result) = rx.next().await {
            match msg_result {
                Ok(Message::Text(text)) => {
                    let text_str = text.to_string();
                    // Skip tick and health events to reduce noise
                    if text_str.contains("\"event\":\"tick\"") || text_str.contains("\"event\":\"health\"") {
                        continue;
                    }
                    let _ = app_handle.emit("chat-event", ChatEvent {
                        kind: "message".into(),
                        data: Some(text_str),
                        error: None,
                    });
                }
                Ok(Message::Close(_)) => break,
                Err(e) => {
                    log::warn!("Chat WS error: {}", e);
                    break;
                }
                _ => {} // Ignore binary, ping, pong
            }
        }

        // Connection closed
        {
            let mut guard = state_clone.lock().await;
            *guard = None;
        }
        let _ = app_handle.emit("chat-event", ChatEvent {
            kind: "disconnected".into(),
            data: None,
            error: None,
        });
    });

    Ok(())
}

/// Send a message to the gateway via the proxied WebSocket
#[tauri::command]
pub async fn chat_send(app: AppHandle, frame: String) -> Result<(), String> {
    let state = app
        .try_state::<SharedChat>()
        .ok_or("Chat state not initialized")?;

    let mut guard = state.lock().await;
    let conn = guard.as_mut().ok_or("Not connected to agent")?;

    conn.tx
        .send(Message::Text(frame.into()))
        .await
        .map_err(|e| format!("Couldn't send message: {}", e))
}

/// Disconnect from the gateway
#[tauri::command]
pub async fn chat_disconnect(app: AppHandle) -> Result<(), String> {
    let state = app
        .try_state::<SharedChat>()
        .ok_or("Chat state not initialized")?;

    let mut guard = state.lock().await;
    if let Some(mut conn) = guard.take() {
        let _ = conn.tx.close().await;
    }

    let _ = app.emit("chat-event", ChatEvent {
        kind: "disconnected".into(),
        data: None,
        error: None,
    });

    Ok(())
}

/// Initialize the chat state — call from lib.rs setup
pub fn init_chat_state(app: &AppHandle) {
    app.manage(Arc::new(Mutex::new(None::<ChatConnection>)) as SharedChat);
}
