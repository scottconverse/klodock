import type { Options } from "@wdio/types";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the built Tauri application
const APP_PATH = path.resolve(
  __dirname,
  "src-tauri/target/release/clawpad.exe"
);

// Path to tauri-driver (installed via cargo install)
const TAURI_DRIVER = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cargo/bin/tauri-driver"
);

let tauriDriver: ChildProcess | null = null;

export const config: Options.Testrunner = {
  runner: "local",
  specs: ["./e2e/**/*.e2e.ts"],
  exclude: [],
  maxInstances: 1,
  capabilities: [
    {
      "tauri:options": {
        application: APP_PATH,
      },
    } as any,
  ],
  logLevel: "warn",
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 5,
  port: 4444,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  onPrepare: function () {
    console.log(`Starting tauri-driver from: ${TAURI_DRIVER}`);
    console.log(`App path: ${APP_PATH}`);

    tauriDriver = spawn(TAURI_DRIVER, ["--port", "4444"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    tauriDriver.stdout?.on("data", (data: Buffer) => {
      console.log(`[tauri-driver] ${data.toString().trim()}`);
    });

    tauriDriver.stderr?.on("data", (data: Buffer) => {
      console.error(`[tauri-driver] ${data.toString().trim()}`);
    });

    tauriDriver.on("error", (err: Error) => {
      console.error(`[tauri-driver] Failed to start: ${err.message}`);
    });

    // Give tauri-driver time to start listening
    return new Promise<void>((resolve) => {
      setTimeout(resolve, 4000);
    });
  },

  onComplete: function () {
    if (tauriDriver) {
      tauriDriver.kill();
      tauriDriver = null;
    }
  },
};
