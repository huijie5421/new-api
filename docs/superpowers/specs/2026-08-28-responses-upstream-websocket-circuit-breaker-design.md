# Responses Upstream WebSocket and Per-Channel Circuit Breaker Design

## Status

Approved on 2026-08-28 for the slim New API gateway based on official
`v1.0.0-rc.25`. The active source branch is `codex/slim-aigc-v1`; production
release `.13` already accepts downstream Responses WebSocket connections but
converts each turn back to the existing internal HTTP Responses relay.

## Goal

Add request-scoped upstream Responses WebSocket transport for explicitly
enabled channels while preserving the existing HTTP/SSE path for every other
request. When one channel explicitly rejects WebSocket, replay the current turn
through that same channel's HTTP/SSE path and suppress further WebSocket
attempts for that channel for 24 hours.

## Non-goals

- No WebSocket application transport for Messages or Chat Completions.
- No global conversion of channel base URLs from HTTP to WebSocket.
- No raw reverse proxy that bypasses New API authentication, distribution,
  model mapping, quota, billing, retries, or logs.
- No change to Sub2API source or its account-level `ctx_pool` and `passthrough`
  decisions.
- No automatic probing of channels whose administrator setting is off.

## Approaches considered

### Integrated Responses relay adapter — selected

The downstream bridge continues dispatching an internal `POST /v1/responses`.
The normal relay selects and prepares a channel. For an eligible channel, the
Responses helper dials the corresponding upstream WebSocket endpoint, writes
one normalized `response.create` message, converts upstream JSON events to the
existing downstream stream writer, parses terminal usage, and settles billing.

This retains one source of truth for authentication, distribution, mapping,
pre-consumption, post-consumption, retries, and logs.

### Raw WebSocket reverse proxy — rejected

This is smaller but moves channel selection and accounting outside the normal
relay. It also makes safe HTTP fallback and exactly-once billing harder.

### Force Sub2API HTTP ingress to use WebSocket upstream — rejected

This keeps the New API to Sub2API hop on HTTP but requires a maintained Sub2API
behavioral fork and does not preserve the intended WebSocket ingress contract.

## Channel configuration

Extend `relaykit/dto.ChannelSettings` with:

```go
ResponsesWSUpstreamEnabled bool   `json:"responses_ws_upstream_enabled,omitempty"`
ResponsesWSUpstreamURL     string `json:"responses_ws_upstream_url,omitempty"`
```

The administrator channel form exposes a `Responses 上游 WebSocket` switch,
off by default, plus an optional override URL shown only when enabled.

When the override is empty, derive the WebSocket endpoint from the exact
Responses request URL produced by the selected channel adaptor:

- `http` becomes `ws`;
- `https` becomes `wss`;
- query parameters and the generated path are retained;
- every other scheme is rejected at channel-setting validation time.

An explicit override must use `ws` or `wss`. It may include its own path and
query. The HTTP `base_url` remains unchanged for models, balance, health tests,
Chat Completions, images, videos, and ordinary HTTP Responses requests.

## Eligibility and request flow

Upstream WebSocket is eligible only when all of these are true:

1. The downstream request entered through one of the three Responses WS routes.
2. The selected channel has `responses_ws_upstream_enabled=true`.
3. The selected channel is outside its circuit-breaker window.
4. The request is `RelayModeResponses`, rather than Responses Compact.

The bridge marks its internal POST with a private Gin/request-context value.
Client headers cannot set this value. The existing relay parses the request,
estimates tokens, performs pre-consumption, selects the channel, initializes
channel metadata, maps the model, applies disabled-field and parameter-override
rules, and then chooses the upstream transport.

For an eligible turn:

1. Dial the channel's derived or explicit WS endpoint with its normal upstream
   authentication and permitted request headers.
2. Send one `response.create` JSON message. The outbound object contains the
   mapped model and the same normalized fields the HTTP adaptor would send;
   `type` is present and `stream` is removed because the WS protocol is already
   event-streaming.
3. Forward text/binary JSON events through the existing downstream Responses
   bridge. Ping, pong, and close frames are handled at the transport layer.
4. Require a recognized Responses terminal event. Parse usage from terminal
   events with the existing Responses usage semantics and call the existing
   text post-consumption path exactly once.
5. Close the per-turn upstream connection after the terminal event. Sub2API's
   own `ctx_pool` may retain its OpenAI upstream lease; New API does not pool or
   share channel credentials across downstream users.

Ordinary downstream HTTP/SSE requests retain their current behavior even when
the channel setting is enabled.

## Explicit unsupported classification

The 24-hour breaker is conservative. It trips only before the first valid
upstream response event and only for one of these signals:

- WebSocket handshake HTTP status `404`, `405`, `410`, `426`, or `501`.
- A structured error code in the allowlist:
  `websocket_not_supported`, `unsupported_transport`,
  `responses_websockets_disabled`, or `responses_websockets_v2_disabled`.
- A WebSocket policy close whose normalized reason exactly matches the
  Sub2API condition `websocket mode is disabled for this account`.
- Close status `1003` (unsupported data) before any valid response event.

Authentication failures, permission failures without an allowlisted transport
code, rate limits, overload, timeouts, DNS/TLS/network errors, status `5xx`
other than `501`, malformed upstream events, and disconnects after output are
ordinary channel errors. They follow the existing retry/error path and do not
trip the WebSocket capability breaker.

## Current-turn HTTP fallback

On an explicit unsupported signal before output:

1. Persist the breaker for the selected channel.
2. Discard the failed WS attempt; it has emitted no downstream event and has
   performed no post-consumption.
3. Recreate the outbound body from the replayable normalized request.
4. Execute the existing HTTP/SSE adaptor on the same selected channel inside
   the same relay attempt.
5. Settle quota once from the HTTP result and record transport metadata in the
   consume log.

Fallback is never replayed after a valid upstream response event, preventing
duplicate output and duplicate upstream work.

## Circuit-breaker persistence and half-open recovery

Create an additive table dedicated to operational state:

```text
channel_responses_ws_breakers
  channel_id       primary key
  disabled_until   bigint, Unix seconds
  reason_code      varchar(64)
  reason_detail    varchar(255)
  updated_at       bigint, Unix seconds
```

This leaves all existing channel, user, order, payment, session, and token rows
unchanged. Code rollback may leave the additive table in place without changing
older runtime behavior.

The runtime keeps a concurrency-safe cache keyed by channel ID and lazily loads
persisted state. A trip performs an upsert with `disabled_until = now + 24h`.
During that window, downstream WS turns for the channel immediately select its
HTTP/SSE path.

At expiry, one request acquires a per-channel half-open probe lease. Other
concurrent requests use HTTP/SSE until the probe finishes:

- a terminal WS success deletes the persisted breaker and closes the lease;
- another explicit unsupported signal writes a new 24-hour window;
- a transient failure closes the lease without extending the breaker, allowing
  a later request to probe again after a short in-process 60-second guard.

Disabling the administrator channel switch stops WS attempts immediately.
Turning it from off to on clears an existing breaker, making that explicit
administrator action an immediate manual retry.

## Logging and observability

Consume/error log metadata records:

```json
{
  "responses_transport": "upstream_ws|http_sse|http_sse_breaker|http_sse_fallback",
  "responses_ws_breaker_reason": "REASON_CODE",
  "responses_ws_disabled_until": 0
}
```

Administrator channel data exposes the read-only breaker reason and expiry.
The channel form shows a warning with the Asia/Shanghai expiry time while the
breaker is active. No secret URL or channel key is exposed to ordinary users.

## Resource limits and cancellation

- Reuse the release `.13` downstream turn timeout and write deadline.
- Bound upstream dial and handshake time to 10 seconds.
- Bound upstream event frames by the existing maximum request-body setting.
- Downstream disconnect cancels the upstream dial/read and closes the upstream
  socket.
- One downstream connection still processes turns sequentially.
- The existing per-token downstream connection limiter remains authoritative.

## Testing strategy

Tests are written before production code and cover:

1. channel-setting JSON compatibility and URL derivation/validation;
2. downstream HTTP requests retaining HTTP/SSE;
3. downstream WS plus enabled channel dialing WS and forwarding terminal events;
4. channel switch off using HTTP/SSE;
5. each explicit unsupported signal tripping only its channel;
6. current-turn HTTP fallback on the same channel with one billing settlement;
7. transient/auth/rate-limit errors leaving the breaker closed;
8. breaker persistence across service objects/restart simulation;
9. 24-hour boundary and single half-open probe under concurrency;
10. successful probe clearing persisted state;
11. no replay after an upstream event was emitted;
12. downstream cancellation closing the upstream socket;
13. administrator serialization/localization and ordinary-user field isolation;
14. full Go, race, frontend typecheck/build, and existing regression suites.

Production acceptance uses an isolated candidate port and local mock WS/HTTP
upstreams before the standard database backup, binary switch, public handshake,
service-health checks, and one-click rollback artifact generation.
