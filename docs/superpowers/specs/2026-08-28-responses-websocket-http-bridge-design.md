# Responses WebSocket HTTP Bridge Design

## Goal

Add the same client-facing WebSocket surface that Sub2API exposes for the OpenAI Responses protocol, while keeping the existing New API channel, billing, logging, retry, and HTTP/SSE implementation as the only business path.

## Scope

The gateway accepts WebSocket upgrades on:

- `GET /v1/responses`
- `GET /responses`
- `GET /backend-api/codex/responses`

Each connection accepts sequential `response.create` JSON messages. Each message is converted into an internal `POST /v1/responses` request with `stream=true`. The internal request re-enters the existing Gin router so authentication, rate limiting, channel distribution, request conversion, quota checks, retries, usage settlement, request logs, and channel health behavior remain identical to ordinary Responses HTTP requests.

The following endpoints remain HTTP/SSE-only:

- `/v1/messages`
- `/v1/chat/completions`
- `/chat/completions`

`/v1/realtime` keeps its existing Realtime WebSocket behavior and is not reused by the Responses bridge.

## Architecture

### WebSocket ingress

A dedicated controller upgrades an authenticated request, enforces a per-token live-connection cap, then reads one complete `response.create` message at a time. The first read and inter-turn idle reads use separate configurable deadlines. Concurrent turns on one connection are intentionally excluded; a turn must reach its terminal event before the next message is processed, matching Sub2API's sequential turn mode.

### Request normalization

The bridge requires a valid JSON object. When present, `type` must be
`"response.create"`; an omitted type defaults to that event. The first turn
requires a non-empty string `model`; later turns may omit `model` and reuse the
last validated session model.

It removes the WebSocket-only `type` field and forces `stream=true`. All other Responses fields, including `previous_response_id`, tools, reasoning, input, cache keys, and metadata, pass to the existing HTTP Responses parser.

As in Sub2API, a missing `type` defaults to `response.create`, and later turns may omit `model` and reuse the last validated session model. Raw JSON fields are retained during normalization so large numeric metadata is not rounded.

### Internal HTTP bridge

For every turn, the controller constructs an in-process HTTP request to `POST /v1/responses` and dispatches it through the existing `http.Handler`. Authentication and client headers are copied except for hop-by-hop and WebSocket handshake headers. No loopback TCP connection and no second public endpoint are introduced.

### Response conversion

The internal response writer implements `http.Flusher`. It incrementally parses `text/event-stream` output and sends each SSE `data:` payload as one WebSocket text message. SSE comments and `[DONE]` sentinels are omitted. An HTTP JSON error is converted into a WebSocket `error` event and the connection stays available for a later valid turn unless the WebSocket transport itself closes.

Every downstream frame has a bounded write deadline. A client close cancels the active internal POST, and an SSE turn must include a terminal Responses event before the next queued turn is dispatched. Empty HTTP errors such as an in-memory `429` are synthesized into a terminal WebSocket error event.

### Limits

Environment-backed settings provide Sub2API-aligned defaults:

- `RESPONSES_WS_FIRST_MESSAGE_TIMEOUT=30` seconds
- `RESPONSES_WS_INTER_TURN_IDLE_TIMEOUT=300` seconds
- `RESPONSES_WS_MAX_CONNECTIONS_PER_TOKEN=64`

The connection counter is process-local because the current production topology runs one New API process. This keeps the implementation small; distributed leases are outside this scope.

## Compatibility and safety

- Existing HTTP Responses requests are unchanged.
- Existing database schemas and persisted options are unchanged.
- Existing API-key authentication via `Authorization` and `openai-insecure-api-key.<key>` WebSocket subprotocol remains available.
- A non-key WebSocket subprotocol no longer overwrites an existing `Authorization` header.
- Model-request rate limiting runs once per internal POST turn; the bodyless GET handshake is not counted as a model request.
- Nginx already forwards `Upgrade` and `Connection` headers globally, so no additional proxy change is part of this feature.

## Verification

Automated tests cover route registration, message normalization, fragmented SSE conversion, JSON error conversion, sequential multi-turn bridging, timeout/connection-limit helpers, and WebSocket subprotocol API-key extraction. Root Go tests, `go vet`, the independent `relaykit` build, and a production build are run before packaging.
