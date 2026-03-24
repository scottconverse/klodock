#!/bin/bash
# Run E2E tests with a pre-started Vite server for reliability.
# Avoids port conflicts from starting/stopping Vite per test suite.

cd "$(dirname "$0")/.."

# Kill any stale Vite on port 1420
kill $(lsof -t -i:1420 2>/dev/null) 2>/dev/null || true

# Start Vite in background
npx vite --port 1420 --strictPort &
VITE_PID=$!

# Wait for Vite to be ready
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:1420/ 2>/dev/null; then
    break
  fi
  sleep 1
done

# Run tests
node --test --test-concurrency=1 e2e/dist/tests/*.test.js
EXIT_CODE=$?

# Cleanup
kill $VITE_PID 2>/dev/null
exit $EXIT_CODE
