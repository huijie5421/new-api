package controller

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type responsesWSMessageWriter interface {
	WriteMessage(messageType int, data []byte) error
}

type responsesWSBridgeWriter struct {
	sink        responsesWSMessageWriter
	header      http.Header
	statusCode  int
	wroteHeader bool
	lineBuffer  []byte
	eventData   [][]byte
	body        bytes.Buffer
	writeErr    error
}

func newResponsesWSBridgeWriter(sink responsesWSMessageWriter) *responsesWSBridgeWriter {
	return &responsesWSBridgeWriter{
		sink:       sink,
		header:     make(http.Header),
		statusCode: http.StatusOK,
	}
}

func (w *responsesWSBridgeWriter) Header() http.Header {
	return w.header
}

func (w *responsesWSBridgeWriter) WriteHeader(statusCode int) {
	if w.wroteHeader || statusCode == 0 {
		return
	}
	w.statusCode = statusCode
	w.wroteHeader = true
}

func (w *responsesWSBridgeWriter) Write(data []byte) (int, error) {
	if w.writeErr != nil {
		return 0, w.writeErr
	}
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if !w.isEventStream() {
		return w.body.Write(data)
	}

	w.lineBuffer = append(w.lineBuffer, data...)
	for {
		newline := bytes.IndexByte(w.lineBuffer, '\n')
		if newline < 0 {
			break
		}
		line := append([]byte(nil), w.lineBuffer[:newline]...)
		w.lineBuffer = w.lineBuffer[newline+1:]
		w.processSSELine(bytes.TrimSuffix(line, []byte{'\r'}))
		if w.writeErr != nil {
			return 0, w.writeErr
		}
	}
	return len(data), nil
}

func (w *responsesWSBridgeWriter) Flush() {
	// SSE events are sent as soon as their terminating blank line is written.
}

func (w *responsesWSBridgeWriter) isEventStream() bool {
	return strings.Contains(strings.ToLower(w.header.Get("Content-Type")), "text/event-stream")
}

func (w *responsesWSBridgeWriter) processSSELine(line []byte) {
	if len(line) == 0 {
		w.flushSSEEvent()
		return
	}
	if line[0] == ':' || !bytes.HasPrefix(line, []byte("data:")) {
		return
	}
	payload := bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data:")))
	w.eventData = append(w.eventData, append([]byte(nil), payload...))
}

func (w *responsesWSBridgeWriter) flushSSEEvent() {
	if len(w.eventData) == 0 || w.writeErr != nil {
		w.eventData = nil
		return
	}
	payload := bytes.Join(w.eventData, []byte("\n"))
	w.eventData = nil
	if bytes.Equal(payload, []byte("[DONE]")) || len(payload) == 0 {
		return
	}
	w.writeErr = w.sink.WriteMessage(websocket.TextMessage, payload)
}

func (w *responsesWSBridgeWriter) finish() error {
	if w.isEventStream() {
		if len(w.lineBuffer) > 0 {
			w.processSSELine(bytes.TrimSuffix(w.lineBuffer, []byte{'\r'}))
			w.lineBuffer = nil
		}
		w.flushSSEEvent()
		return w.writeErr
	}

	if w.body.Len() == 0 {
		return w.writeErr
	}
	message := append([]byte(nil), w.body.Bytes()...)
	if w.statusCode >= http.StatusBadRequest {
		message = responsesWSHTTPErrorEvent(w.statusCode, message)
	}
	return w.sink.WriteMessage(websocket.TextMessage, message)
}

func responsesWSHTTPErrorEvent(statusCode int, body []byte) []byte {
	var payload map[string]any
	if err := common.Unmarshal(body, &payload); err != nil || payload == nil {
		payload = map[string]any{
			"error": map[string]any{
				"type":    "http_error",
				"message": strings.TrimSpace(string(body)),
				"code":    statusCode,
			},
		}
	}
	errorValue, ok := payload["error"]
	if !ok {
		errorValue = map[string]any{
			"type":    "http_error",
			"message": strings.TrimSpace(string(body)),
			"code":    statusCode,
		}
	}
	event, err := common.Marshal(map[string]any{
		"type":  "error",
		"error": errorValue,
	})
	if err != nil {
		return []byte(fmt.Sprintf(`{"type":"error","error":{"type":"http_error","code":%d}}`, statusCode))
	}
	return event
}

var responsesWSUpgrader = websocket.Upgrader{
	CheckOrigin: func(*http.Request) bool { return true },
}

// ResponsesWebSocketBridge accepts the Sub2API-compatible Responses WS
// ingress and dispatches each turn through the existing HTTP relay handler.
func ResponsesWebSocketBridge(c *gin.Context, next http.Handler) {
	if c == nil || c.Request == nil || next == nil {
		return
	}
	if !isResponsesWebSocketUpgrade(c.Request) {
		c.Header("Upgrade", "websocket")
		c.JSON(http.StatusUpgradeRequired, gin.H{
			"error": gin.H{
				"type":    "invalid_request_error",
				"message": "WebSocket upgrade required (Upgrade: websocket)",
			},
		})
		return
	}

	maxConnections := constant.ResponsesWSMaxConnectionsPerToken
	release, admitted := globalResponsesWSConnectionLimiter.acquire(c.GetInt("token_id"), maxConnections)
	if !admitted {
		c.Header("Retry-After", "5")
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": gin.H{
				"type":    "rate_limit_error",
				"message": "Too many open WebSocket connections, please retry later",
			},
		})
		return
	}
	defer release()

	conn, err := responsesWSUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.LogError(c, "Responses WebSocket upgrade failed: "+err.Error())
		return
	}
	defer conn.Close()
	conn.SetReadLimit(int64(maxResponsesWSFrameBytes()))

	for turn := 0; ; turn++ {
		if deadline := responsesWSReadDeadline(turn); !deadline.IsZero() {
			if err := conn.SetReadDeadline(deadline); err != nil {
				return
			}
		}
		_, message, err := conn.ReadMessage()
		if err != nil {
			return
		}

		body, err := normalizeResponsesWebSocketTurn(message)
		if err != nil {
			if writeErr := writeResponsesWebSocketError(conn, "invalid_request_error", err.Error()); writeErr != nil {
				return
			}
			continue
		}
		if err := dispatchResponsesWebSocketTurn(c, next, body, conn); err != nil {
			if writeErr := writeResponsesWebSocketError(conn, "upstream_error", err.Error()); writeErr != nil {
				return
			}
		}
	}
}

func ResponsesWebSocketBridgeHandler(next http.Handler) gin.HandlerFunc {
	return func(c *gin.Context) {
		ResponsesWebSocketBridge(c, next)
	}
}

func isResponsesWebSocketUpgrade(r *http.Request) bool {
	if r == nil || !strings.EqualFold(r.Method, http.MethodGet) {
		return false
	}
	return headerContainsToken(r.Header.Get("Connection"), "upgrade") && strings.EqualFold(strings.TrimSpace(r.Header.Get("Upgrade")), "websocket")
}

func headerContainsToken(value, token string) bool {
	for _, part := range strings.Split(value, ",") {
		if strings.EqualFold(strings.TrimSpace(part), token) {
			return true
		}
	}
	return false
}

func maxResponsesWSFrameBytes() int {
	maxMB := constant.MaxRequestBodyMB
	if maxMB <= 0 {
		maxMB = 128
	}
	return maxMB << 20
}

func responsesWSReadDeadline(turn int) time.Time {
	seconds := constant.ResponsesWSFirstMessageTimeoutSeconds
	if turn > 0 {
		seconds = constant.ResponsesWSInterTurnIdleTimeoutSeconds
	}
	if seconds <= 0 {
		return time.Time{}
	}
	return time.Now().Add(time.Duration(seconds) * time.Second)
}

func dispatchResponsesWebSocketTurn(parent *gin.Context, next http.Handler, body []byte, conn *websocket.Conn) error {
	req := parent.Request.Clone(parent.Request.Context())
	req.Method = http.MethodPost
	req.URL.Path = "/v1/responses"
	req.URL.RawPath = ""
	req.Body = io.NopCloser(bytes.NewReader(body))
	req.ContentLength = int64(len(body))
	req.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(body)), nil
	}
	req.Header = responsesWSForwardHeaders(parent.Request.Header)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	writer := newResponsesWSBridgeWriter(conn)
	next.ServeHTTP(writer, req)
	return writer.finish()
}

func responsesWSForwardHeaders(source http.Header) http.Header {
	destination := make(http.Header)
	for key, values := range source {
		if isResponsesWSHopByHopHeader(key) {
			continue
		}
		for _, value := range values {
			destination.Add(key, value)
		}
	}
	return destination
}

func isResponsesWSHopByHopHeader(key string) bool {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "connection", "upgrade", "proxy-connection", "keep-alive", "te", "trailer", "transfer-encoding", "host", "content-length", "sec-websocket-key", "sec-websocket-version", "sec-websocket-extensions", "sec-websocket-protocol":
		return true
	default:
		return false
	}
}

func writeResponsesWebSocketError(conn *websocket.Conn, errorType, message string) error {
	body, err := common.Marshal(map[string]any{
		"type": "error",
		"error": map[string]any{
			"type":    errorType,
			"message": message,
		},
	})
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, body)
}

func normalizeResponsesWebSocketTurn(message []byte) ([]byte, error) {
	var payload map[string]any
	if err := common.Unmarshal(message, &payload); err != nil || payload == nil {
		return nil, fmt.Errorf("message must be a valid JSON object")
	}

	eventType, ok := payload["type"].(string)
	if !ok || eventType != "response.create" {
		return nil, fmt.Errorf("message type must be response.create")
	}
	model, ok := payload["model"].(string)
	if !ok || strings.TrimSpace(model) == "" {
		return nil, fmt.Errorf("model must be a non-empty string")
	}

	delete(payload, "type")
	payload["stream"] = true
	body, err := common.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("serialize Responses request: %w", err)
	}
	return body, nil
}
