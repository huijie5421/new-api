package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
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

type responsesWSDeadlineWriter interface {
	SetWriteDeadline(deadline time.Time) error
}

type responsesWSInbound struct {
	message []byte
	err     error
}

type responsesWSReader struct {
	inbound      chan responsesWSInbound
	activeMu     sync.Mutex
	activeCancel context.CancelFunc
}

func (r *responsesWSReader) setActiveCancel(cancel context.CancelFunc) {
	r.activeMu.Lock()
	r.activeCancel = cancel
	r.activeMu.Unlock()
}

func (r *responsesWSReader) clearActiveCancel() {
	r.setActiveCancel(nil)
}

func (r *responsesWSReader) cancelActiveTurn() {
	r.activeMu.Lock()
	cancel := r.activeCancel
	r.activeMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

const responsesWSWriteTimeout = 30 * time.Second

type responsesWSBridgeWriter struct {
	sink        responsesWSMessageWriter
	cancel      context.CancelFunc
	header      http.Header
	statusCode  int
	wroteHeader bool
	lineBuffer  []byte
	eventData   [][]byte
	body        bytes.Buffer
	writeErr    error
	terminal    bool
}

func newResponsesWSBridgeWriter(sink responsesWSMessageWriter, cancel ...context.CancelFunc) *responsesWSBridgeWriter {
	var cancelFunc context.CancelFunc
	if len(cancel) > 0 {
		cancelFunc = cancel[0]
	}
	return &responsesWSBridgeWriter{
		sink:       sink,
		cancel:     cancelFunc,
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

// SetWriteDeadline lets net/http's ResponseController carry the existing
// streaming write timeout through Gin to the WebSocket connection.
func (w *responsesWSBridgeWriter) SetWriteDeadline(deadline time.Time) error {
	if sink, ok := w.sink.(responsesWSDeadlineWriter); ok {
		return sink.SetWriteDeadline(deadline)
	}
	return nil
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
	w.writeErr = w.writeMessage(payload)
	if w.writeErr != nil {
		if w.cancel != nil {
			w.cancel()
		}
		return
	}
	var event struct {
		Type string `json:"type"`
	}
	if json.Unmarshal(payload, &event) == nil && isResponsesWSTerminalEvent(event.Type) {
		w.terminal = true
	}
}

func isResponsesWSTerminalEvent(eventType string) bool {
	switch eventType {
	case "response.completed", "response.done", "response.failed", "response.incomplete", "response.cancelled", "response.canceled", "response.error", "error":
		return true
	default:
		return false
	}
}

func (w *responsesWSBridgeWriter) finish() error {
	if w.isEventStream() {
		if len(w.lineBuffer) > 0 {
			w.processSSELine(bytes.TrimSuffix(w.lineBuffer, []byte{'\r'}))
			w.lineBuffer = nil
		}
		w.flushSSEEvent()
		if w.writeErr != nil {
			return w.writeErr
		}
		if !w.terminal {
			return fmt.Errorf("Responses stream ended without a terminal event")
		}
		return nil
	}

	if w.body.Len() == 0 {
		if w.statusCode < http.StatusBadRequest {
			return w.writeErr
		}
		return w.writeMessage(responsesWSHTTPErrorEvent(w.statusCode, nil))
	}
	message := append([]byte(nil), w.body.Bytes()...)
	if w.statusCode >= http.StatusBadRequest {
		message = responsesWSHTTPErrorEvent(w.statusCode, message)
	}
	return w.writeMessage(message)
}

func (w *responsesWSBridgeWriter) writeMessage(message []byte) error {
	if err := w.SetWriteDeadline(time.Now().Add(responsesWSWriteTimeout)); err != nil {
		if w.cancel != nil {
			w.cancel()
		}
		return err
	}
	err := w.sink.WriteMessage(websocket.TextMessage, message)
	if err != nil && w.cancel != nil {
		w.cancel()
	}
	return err
}

func responsesWSHTTPErrorEvent(statusCode int, body []byte) []byte {
	message := strings.TrimSpace(string(body))
	if message == "" {
		message = http.StatusText(statusCode)
	}
	var payload map[string]any
	if err := common.Unmarshal(body, &payload); err != nil || payload == nil {
		payload = map[string]any{
			"error": map[string]any{
				"type":    "http_error",
				"message": message,
				"code":    statusCode,
			},
		}
	}
	errorValue, ok := payload["error"]
	if !ok {
		errorValue = map[string]any{
			"type":    "http_error",
			"message": message,
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

	firstMessageTimeout := constant.ResponsesWSFirstMessageTimeoutSeconds
	interTurnIdleTimeout := constant.ResponsesWSInterTurnIdleTimeoutSeconds
	readContext, cancelRead := context.WithCancel(c.Request.Context())
	defer cancelRead()
	reader := readResponsesWSMessages(conn, readContext, firstMessageTimeout)
	inbound := reader.inbound
	sessionModel := ""
	var pending *responsesWSInbound
	for {
		var item responsesWSInbound
		if pending != nil {
			item = *pending
			pending = nil
		} else {
			idleTimeout := interTurnIdleTimeout
			if sessionModel == "" {
				idleTimeout = firstMessageTimeout
			}
			if idleTimeout <= 0 {
				var ok bool
				item, ok = <-inbound
				if !ok {
					return
				}
			} else {
				timer := time.NewTimer(time.Duration(idleTimeout) * time.Second)
				select {
				case nextItem, ok := <-inbound:
					if !timer.Stop() {
						<-timer.C
					}
					if !ok {
						return
					}
					item = nextItem
				case <-timer.C:
					return
				}
			}
		}
		if item.err != nil {
			return
		}

		body, model, err := normalizeResponsesWebSocketTurnWithModel(item.message, sessionModel)
		if err != nil {
			if writeErr := writeResponsesWebSocketError(conn, "invalid_request_error", err.Error()); writeErr != nil {
				return
			}
			continue
		}
		sessionModel = model

		turnContext, cancelTurn := context.WithCancel(c.Request.Context())
		reader.setActiveCancel(cancelTurn)
		turnResult := make(chan error, 1)
		go func() {
			turnResult <- dispatchResponsesWebSocketTurnContext(c, next, body, conn, turnContext, cancelTurn)
		}()
		var turnErr error
		for {
			select {
			case turnErr = <-turnResult:
				goto turnComplete
			case nextItem, ok := <-inbound:
				if !ok || nextItem.err != nil {
					cancelTurn()
					<-turnResult
					return
				}
				if pending != nil {
					cancelTurn()
					<-turnResult
					return
				}
				pending = &nextItem
			}
		}

	turnComplete:
		reader.clearActiveCancel()
		cancelTurn()
		if turnErr != nil {
			if writeErr := writeResponsesWebSocketError(conn, "upstream_error", turnErr.Error()); writeErr != nil {
				return
			}
		}
	}
}

func readResponsesWSMessages(conn *websocket.Conn, ctx context.Context, firstMessageTimeout int) *responsesWSReader {
	reader := &responsesWSReader{inbound: make(chan responsesWSInbound, 1)}
	go func() {
		defer close(reader.inbound)
		for turn := 0; ; turn++ {
			if deadline := responsesWSReadDeadline(turn, firstMessageTimeout, 0); !deadline.IsZero() {
				if err := conn.SetReadDeadline(deadline); err != nil {
					reader.cancelActiveTurn()
					select {
					case reader.inbound <- responsesWSInbound{err: err}:
					case <-ctx.Done():
					}
					return
				}
			}
			_, message, err := conn.ReadMessage()
			if turn == 0 && err == nil {
				if deadlineErr := conn.SetReadDeadline(time.Time{}); deadlineErr != nil {
					err = deadlineErr
				}
			}
			if err != nil {
				reader.cancelActiveTurn()
			}
			item := responsesWSInbound{message: message, err: err}
			select {
			case reader.inbound <- item:
			case <-ctx.Done():
				return
			default:
				// Keep the reader responsive to a close frame instead of
				// blocking behind an already queued turn. One pending turn is
				// enough for sequential mode; excess client frames end the
				// session and cancel the active downstream request.
				reader.cancelActiveTurn()
				return
			}
			if err != nil {
				return
			}
		}
	}()
	return reader
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

func maxResponsesWSFrameBytes() int64 {
	maxMB := constant.MaxRequestBodyMB
	if maxMB <= 0 {
		maxMB = 128
	}
	return int64(maxMB) << 20
}

func responsesWSReadDeadline(turn, firstMessageTimeout, interTurnIdleTimeout int) time.Time {
	seconds := firstMessageTimeout
	if turn > 0 {
		seconds = interTurnIdleTimeout
	}
	if seconds <= 0 {
		return time.Time{}
	}
	return time.Now().Add(time.Duration(seconds) * time.Second)
}

func dispatchResponsesWebSocketTurn(parent *gin.Context, next http.Handler, body []byte, conn *websocket.Conn) error {
	turnContext, cancelTurn := context.WithCancel(parent.Request.Context())
	defer cancelTurn()
	return dispatchResponsesWebSocketTurnContext(parent, next, body, conn, turnContext, cancelTurn)
}

func dispatchResponsesWebSocketTurnContext(parent *gin.Context, next http.Handler, body []byte, conn *websocket.Conn, turnContext context.Context, cancelTurn context.CancelFunc) error {
	req := parent.Request.Clone(turnContext)
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

	writer := newResponsesWSBridgeWriter(conn, cancelTurn)
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
	if err := conn.SetWriteDeadline(time.Now().Add(responsesWSWriteTimeout)); err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, body)
}

func normalizeResponsesWebSocketTurn(message []byte, fallbackModel ...string) ([]byte, error) {
	fallback := ""
	if len(fallbackModel) > 0 {
		fallback = fallbackModel[0]
	}
	body, _, err := normalizeResponsesWebSocketTurnWithModel(message, fallback)
	return body, err
}

func normalizeResponsesWebSocketTurnWithModel(message []byte, fallbackModel string) ([]byte, string, error) {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(message, &payload); err != nil || payload == nil {
		return nil, "", fmt.Errorf("message must be a valid JSON object")
	}

	if rawType, ok := payload["type"]; ok {
		var eventType string
		if json.Unmarshal(rawType, &eventType) != nil || eventType != "response.create" {
			return nil, "", fmt.Errorf("message type must be response.create")
		}
	}

	model := ""
	modelPresent := false
	if rawModel, ok := payload["model"]; ok {
		modelPresent = true
		if bytes.Equal(bytes.TrimSpace(rawModel), []byte("null")) || json.Unmarshal(rawModel, &model) != nil {
			return nil, "", fmt.Errorf("model must be a non-empty string")
		}
	}
	model = strings.TrimSpace(model)
	if model == "" && modelPresent {
		return nil, "", fmt.Errorf("model must be a non-empty string")
	}
	if model == "" {
		model = strings.TrimSpace(fallbackModel)
		if model != "" {
			encodedModel, err := json.Marshal(model)
			if err != nil {
				return nil, "", fmt.Errorf("serialize Responses model: %w", err)
			}
			payload["model"] = encodedModel
		}
	}
	if model == "" {
		return nil, "", fmt.Errorf("model must be a non-empty string")
	}

	delete(payload, "type")
	payload["stream"] = json.RawMessage("true")
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, "", fmt.Errorf("serialize Responses request: %w", err)
	}
	return body, model, nil
}
