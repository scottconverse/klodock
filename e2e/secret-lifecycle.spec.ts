/**
 * E2E: Secret Lifecycle — full API key management flow.
 *
 * Tests three distinct paths through the secret management system:
 *
 * Path 1: Happy path — store, validate, use, delete
 *   1. Navigate to API Keys settings.
 *   2. Click "Add Key" and select provider (e.g., Anthropic).
 *   3. Enter API key in the input field.
 *   4. Click "Validate" — test_api_key returns true.
 *   5. Key is stored in the OS keychain via store_secret.
 *   6. Key appears in the list view.
 *   7. Start the daemon — .env is materialized with the key.
 *   8. Delete the key — confirm dialog appears.
 *   9. After deletion, key no longer appears in list.
 *   10. Daemon restart scrubs the old key from .env.
 *
 * Path 2: Invalid key rejection
 *   1. Navigate to API Keys settings.
 *   2. Click "Add Key" and select provider.
 *   3. Enter an invalid API key.
 *   4. Click "Validate" — test_api_key returns false.
 *   5. Error message is shown: "Invalid API key".
 *   6. Key is NOT stored in the keychain.
 *   7. "Save" / "Next" button remains disabled.
 *
 * Path 3: Key rotation
 *   1. An existing key is stored for a provider.
 *   2. Navigate to the key's detail/edit view.
 *   3. Enter a new key value.
 *   4. Click "Validate" — returns true.
 *   5. Click "Update" — overwrites the old key in the keychain.
 *   6. Restart daemon — .env now has the new key.
 *   7. Old key is no longer retrievable from the keychain.
 *
 * TODO: Implement once e2e framework is configured.
 */

import { describe, it } from "vitest";

describe("Secret Lifecycle E2E", () => {
  describe("Path 1: Happy path", () => {
    it.todo("stores a validated API key in the keychain");
    it.todo("shows the key in the list view");
    it.todo("materializes the key in .env on daemon start");
    it.todo("removes the key on deletion");
  });

  describe("Path 2: Invalid key rejection", () => {
    it.todo("shows error for invalid API key");
    it.todo("does not store invalid key in keychain");
    it.todo("keeps save button disabled");
  });

  describe("Path 3: Key rotation", () => {
    it.todo("overwrites existing key with new validated key");
    it.todo("daemon uses the updated key after restart");
    it.todo("old key is not retrievable");
  });
});
