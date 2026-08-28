# Responses WebSocket HTTP Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sub2API-compatible client-facing WebSocket ingress for the Responses protocol by bridging each sequential `response.create` turn through the existing HTTP/SSE relay.

**Architecture:** A dedicated WebSocket controller normalizes client frames into internal `POST /v1/responses` requests dispatched through the existing Gin engine. A streaming response writer converts SSE `data:` records back into WebSocket text frames, preserving all existing authentication, channel selection, billing, logging, and retry behavior.

**Tech Stack:** Go, Gin, Gorilla WebSocket, `net/http`, existing New API relay and middleware packages, Testify.

---

### Task 1: Lock the public route contract

**Files:**
- Modify: `router/relay_router_test.go`
- Modify: `router/relay-router.go`

- [x] **Step 1: Write the failing route test**

Add a table-driven test that inspects `engine.Routes()` and requires `GET` routes for `/v1/responses`, `/responses`, and `/backend-api/codex/responses`, while asserting that `/v1/messages` and `/v1/chat/completions` have no `GET` registration.

- [x] **Step 2: Run the route test and verify RED**

Run: `go test ./router -run TestResponsesWebSocketRouteContract -count=1`

Expected: failure because the three Responses `GET` routes are absent.

- [x] **Step 3: Register the minimum routes**

Register the three GET ingress routes with route tagging, system-performance checks, and token authentication. Keep model-rate limiting on the internal POST turn only: applying it to the bodyless handshake would count a connection rather than a model request. Each route calls `controller.ResponsesWebSocketBridge(c, router)`.

- [x] **Step 4: Re-run the route test**

Run: `go test ./router -run TestResponsesWebSocketRouteContract -count=1`

Expected: PASS.

### Task 2: Preserve API-key authentication with WebSocket subprotocols

**Files:**
- Modify: `middleware/auth_test.go`
- Modify: `middleware/auth.go`

- [x] **Step 1: Write failing extraction tests**

Add table tests for a pure `webSocketAPIKeyFromSubprotocol` helper. Cover an explicit `openai-insecure-api-key.sk-test` item, unrelated Responses feature protocols, whitespace, and a missing key. The unrelated protocol case must return no replacement key.

- [x] **Step 2: Run the middleware test and verify RED**

Run: `go test ./middleware -run TestWebSocketAPIKeyFromSubprotocol -count=1`

Expected: failure because the helper is absent.

- [x] **Step 3: Implement minimal extraction**

Split `Sec-WebSocket-Protocol` on commas and return only the suffix of an item beginning with `openai-insecure-api-key.`. Update `TokenAuth` to replace `Authorization` only when this helper returns a non-empty key.

- [x] **Step 4: Re-run middleware tests**

Run: `go test ./middleware -run 'TestWebSocketAPIKeyFromSubprotocol|TestToken' -count=1`

Expected: PASS.

### Task 3: Add configurable ingress limits

**Files:**
- Modify: `constant/env.go`
- Modify: `common/init.go`
- Create: `controller/responses_websocket_limits.go`
- Create: `controller/responses_websocket_limits_test.go`

- [x] **Step 1: Write failing connection-limit tests**

Test that a limiter admits up to its configured per-token count, rejects the next acquisition, releases capacity, treats different token IDs independently, and disables the cap when configured as zero.

- [x] **Step 2: Run the limit tests and verify RED**

Run: `go test ./controller -run TestResponsesWSConnectionLimiter -count=1`

Expected: failure because the limiter is absent.

- [x] **Step 3: Implement settings and limiter**

Load `RESPONSES_WS_FIRST_MESSAGE_TIMEOUT`, `RESPONSES_WS_INTER_TURN_IDLE_TIMEOUT`, and `RESPONSES_WS_MAX_CONNECTIONS_PER_TOKEN` with defaults `30`, `300`, and `64`. Implement a mutex-protected token-ID counter whose acquire operation returns a release closure.

- [x] **Step 4: Re-run limit tests**

Run: `go test ./controller -run TestResponsesWSConnectionLimiter -count=1`

Expected: PASS.

### Task 4: Normalize `response.create` turns

**Files:**
- Create: `controller/responses_websocket.go`
- Create: `controller/responses_websocket_test.go`

- [x] **Step 1: Write failing normalization tests**

Cover valid input, forced `stream=true`, removal of `type`, preservation of `previous_response_id`, malformed JSON, non-object JSON, the wrong event type, and a missing/blank/non-string model.

- [x] **Step 2: Run normalization tests and verify RED**

Run: `go test ./controller -run TestNormalizeResponsesWebSocketTurn -count=1`

Expected: failure because normalization is absent.

- [x] **Step 3: Implement normalization**

Use `common.Unmarshal` and `common.Marshal` with `map[string]any`. Return typed client errors for invalid messages so the handler can emit deterministic WebSocket `error` events.

- [x] **Step 4: Re-run normalization tests**

Run: `go test ./controller -run TestNormalizeResponsesWebSocketTurn -count=1`

Expected: PASS.

### Task 5: Convert internal SSE output to WebSocket frames

**Files:**
- Modify: `controller/responses_websocket.go`
- Modify: `controller/responses_websocket_test.go`

- [x] **Step 1: Write failing writer tests**

Use a frame-sink interface to test fragmented SSE writes, multiple `data:` records in one write, comments, CRLF, `[DONE]`, a final unterminated record, JSON error bodies, and a normal JSON body.

- [x] **Step 2: Run writer tests and verify RED**

Run: `go test ./controller -run TestResponsesWSBridgeWriter -count=1`

Expected: failure because the writer is absent.

- [x] **Step 3: Implement the bridge writer**

Implement `http.ResponseWriter` and `http.Flusher`. Buffer incomplete lines, send each complete SSE `data:` payload as a text frame, and convert HTTP failures into a `type=error` frame during `finish()`.

- [x] **Step 4: Re-run writer tests**

Run: `go test ./controller -run TestResponsesWSBridgeWriter -count=1`

Expected: PASS.

### Task 6: Implement sequential WebSocket-to-HTTP turns

**Files:**
- Modify: `controller/responses_websocket.go`
- Modify: `controller/responses_websocket_test.go`

- [x] **Step 1: Write a failing WebSocket integration test**

Start an `httptest.Server` whose WebSocket route invokes `ResponsesWebSocketBridge` with a recording inner handler. Dial it with Gorilla WebSocket, submit two sequential `response.create` messages, and assert that each inner request is `POST /v1/responses`, has `stream=true`, retains authorization, and returns raw Responses event frames in order.

- [x] **Step 2: Run the integration test and verify RED**

Run: `go test ./controller -run TestResponsesWebSocketBridgeSequentialTurns -count=1`

Expected: failure because the handler is absent.

- [x] **Step 3: Implement the handler**

Validate upgrade requests, acquire the per-token connection slot, upgrade with the dedicated Responses upgrader, set read limits/deadlines, normalize one turn at a time, create the in-process HTTP request, copy end-to-end headers, call the supplied `http.Handler`, finish the response writer, and then wait for the next turn.

- [x] **Step 4: Re-run controller tests**

Run: `go test ./controller -run 'TestResponsesWS|TestNormalizeResponsesWebSocketTurn|TestResponsesWebSocketBridgeSequentialTurns' -count=1`

Expected: PASS.

### Task 7: Verify the complete change

**Files:**
- Modify: `docs/superpowers/plans/2026-08-28-responses-websocket-http-bridge.md`

- [x] **Step 1: Format and run focused tests**

Run: `gofmt -w controller/responses_websocket*.go middleware/auth.go middleware/auth_test.go router/relay-router.go router/relay_router_test.go constant/env.go common/init.go`

Run: `go test ./controller ./middleware ./router -count=1`

Expected: PASS.

- [x] **Step 2: Run root verification**

Run: `go test ./... -count=1`

Run: `go vet ./...`

Expected: PASS.

- [x] **Step 3: Verify the independent relaykit module**

Run: `cd relaykit && GOWORK=off go build ./...`

Expected: PASS.

- [x] **Step 4: Build the production binary**

Run: `go build -o output/new-api-responses-ws ./`

Expected: exit code 0 and a non-empty binary.

- [x] **Step 5: Review scope**

Confirm that no `GET` WebSocket routes were added for Messages or Chat Completions, no database migration was introduced, and existing HTTP Responses tests remain green.
