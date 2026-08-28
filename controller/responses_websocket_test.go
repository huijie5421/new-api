package controller

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeResponsesWebSocketTurn(t *testing.T) {
	tests := []struct {
		name         string
		input        string
		wantError    string
		wantModel    string
		wantPrevious string
	}{
		{
			name:         "valid turn",
			input:        `{"type":"response.create","model":"gpt-test","input":"hello","stream":false,"previous_response_id":"resp_1"}`,
			wantModel:    "gpt-test",
			wantPrevious: "resp_1",
		},
		{name: "malformed JSON", input: `{`, wantError: "valid JSON object"},
		{name: "array", input: `[]`, wantError: "valid JSON object"},
		{name: "null", input: `null`, wantError: "valid JSON object"},
		{name: "wrong event", input: `{"type":"response.cancel","model":"gpt-test"}`, wantError: "response.create"},
		{name: "missing event defaults to create", input: `{"model":"gpt-test"}`, wantModel: "gpt-test"},
		{name: "missing model", input: `{"type":"response.create"}`, wantError: "model"},
		{name: "blank model", input: `{"type":"response.create","model":"  "}`, wantError: "model"},
		{name: "null model", input: `{"type":"response.create","model":null}`, wantError: "model"},
		{name: "non-string model", input: `{"type":"response.create","model":42}`, wantError: "model"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			body, err := normalizeResponsesWebSocketTurn([]byte(test.input))
			if test.wantError != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), test.wantError)
				return
			}

			require.NoError(t, err)
			var payload map[string]any
			require.NoError(t, common.Unmarshal(body, &payload))
			assert.NotContains(t, payload, "type")
			assert.Equal(t, test.wantModel, payload["model"])
			assert.Equal(t, true, payload["stream"])
			if test.wantPrevious != "" {
				assert.Equal(t, test.wantPrevious, payload["previous_response_id"])
			}
		})
	}
}

func TestNormalizeResponsesWebSocketTurnUsesSessionModel(t *testing.T) {
	body, err := normalizeResponsesWebSocketTurn(
		[]byte(`{"type":"response.create","previous_response_id":"resp_1"}`),
		"gpt-session",
	)
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, common.Unmarshal(body, &payload))
	assert.Equal(t, "gpt-session", payload["model"])
	assert.Equal(t, true, payload["stream"])
}

func TestNormalizeResponsesWebSocketTurnPreservesLargeNumbers(t *testing.T) {
	const largeInteger = "900719925474099312345"
	body, err := normalizeResponsesWebSocketTurn([]byte(
		`{"type":"response.create","model":"gpt-test","metadata":{"sequence":` + largeInteger + `}}`,
	))
	require.NoError(t, err)
	assert.Contains(t, string(body), largeInteger)
}

func TestResponsesWebSocketBridgeSequentialTurns(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalFirstTimeout := constant.ResponsesWSFirstMessageTimeoutSeconds
	originalIdleTimeout := constant.ResponsesWSInterTurnIdleTimeoutSeconds
	originalMaxConnections := constant.ResponsesWSMaxConnectionsPerToken
	constant.ResponsesWSFirstMessageTimeoutSeconds = 5
	constant.ResponsesWSInterTurnIdleTimeoutSeconds = 5
	constant.ResponsesWSMaxConnectionsPerToken = 4
	t.Cleanup(func() {
		constant.ResponsesWSFirstMessageTimeoutSeconds = originalFirstTimeout
		constant.ResponsesWSInterTurnIdleTimeoutSeconds = originalIdleTimeout
		constant.ResponsesWSMaxConnectionsPerToken = originalMaxConnections
	})

	var requests []map[string]any
	inner := gin.New()
	inner.POST("/v1/responses", func(c *gin.Context) {
		r := c.Request
		require.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		var payload map[string]any
		require.NoError(t, common.DecodeJson(r.Body, &payload))
		requests = append(requests, payload)

		c.Writer.Header().Set("Content-Type", "text/event-stream")
		_, err := fmt.Fprintf(c.Writer, "event: response.created\ndata: {\"type\":\"response.created\",\"response\":{\"model\":%q}}\n\n", payload["model"])
		require.NoError(t, err)
		c.Writer.Flush()
		_, err = fmt.Fprint(c.Writer, "event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\n\n")
		require.NoError(t, err)
		c.Writer.Flush()
	})

	outer := gin.New()
	handlerDone := make(chan struct{})
	outer.GET("/v1/responses", func(c *gin.Context) {
		defer close(handlerDone)
		c.Set("token_id", 9001)
		ResponsesWebSocketBridge(c, inner)
	})
	server := httptest.NewServer(outer)
	t.Cleanup(server.Close)

	header := http.Header{"Authorization": []string{"Bearer test-key"}}
	conn, response, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/v1/responses", header)
	if response != nil && response.Body != nil {
		defer response.Body.Close()
	}
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })

	turns := []struct {
		message string
		model   string
	}{
		{message: `{"type":"response.create","model":"gpt-first","input":"hello"}`, model: "gpt-first"},
		{message: `{"type":"response.create","previous_response_id":"resp_1","input":"again"}`, model: "gpt-first"},
	}
	for _, turn := range turns {
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(turn.message)))
		_, created, err := conn.ReadMessage()
		require.NoError(t, err)
		assert.JSONEq(t, fmt.Sprintf(`{"type":"response.created","response":{"model":%q}}`, turn.model), string(created))
		_, completed, err := conn.ReadMessage()
		require.NoError(t, err)
		assert.JSONEq(t, `{"type":"response.completed","response":{"status":"completed"}}`, string(completed))
	}

	require.Len(t, requests, 2)
	for _, payload := range requests {
		assert.Equal(t, true, payload["stream"])
		assert.NotContains(t, payload, "type")
	}
	require.NoError(t, conn.Close())
	select {
	case <-handlerDone:
	case <-time.After(2 * time.Second):
		t.Fatal("websocket handler did not stop after client close")
	}
}

func TestResponsesWebSocketBridgeCancelsActiveTurnOnDisconnect(t *testing.T) {
	gin.SetMode(gin.TestMode)
	turnStarted := make(chan struct{})
	turnCanceled := make(chan struct{})
	handlerDone := make(chan struct{})

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(turnStarted)
		<-r.Context().Done()
		close(turnCanceled)
	})
	outer := gin.New()
	outer.GET("/v1/responses", func(c *gin.Context) {
		defer close(handlerDone)
		c.Set("token_id", 9002)
		ResponsesWebSocketBridge(c, inner)
	})
	server := httptest.NewServer(outer)
	t.Cleanup(server.Close)

	conn, response, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/v1/responses", nil)
	if response != nil && response.Body != nil {
		defer response.Body.Close()
	}
	require.NoError(t, err)
	require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.create","model":"gpt-test","input":"hello"}`)))
	select {
	case <-turnStarted:
	case <-time.After(time.Second):
		t.Fatal("internal Responses turn did not start")
	}
	require.NoError(t, conn.Close())

	select {
	case <-turnCanceled:
	case <-time.After(2 * time.Second):
		t.Fatal("active Responses turn was not canceled after websocket disconnect")
	}
	select {
	case <-handlerDone:
	case <-time.After(2 * time.Second):
		t.Fatal("websocket handler did not stop after active turn cancellation")
	}
}

type responsesWSFrameSink struct {
	frames        [][]byte
	writeErr      error
	writeDeadline time.Time
}

func (s *responsesWSFrameSink) WriteMessage(messageType int, data []byte) error {
	if messageType != websocket.TextMessage {
		return assert.AnError
	}
	if s.writeErr != nil {
		return s.writeErr
	}
	s.frames = append(s.frames, append([]byte(nil), data...))
	return nil
}

func (s *responsesWSFrameSink) SetWriteDeadline(deadline time.Time) error {
	s.writeDeadline = deadline
	return nil
}

func TestResponsesWSBridgeWriter(t *testing.T) {
	sink := &responsesWSFrameSink{}
	w := newResponsesWSBridgeWriter(sink)
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)

	_, err := w.Write([]byte("event: response.created\r\ndata: {\"type\":\"response.created\"}\r\n\r\ndata: {\"type\":\"response.output_text.delta\","))
	require.NoError(t, err)
	_, err = w.Write([]byte("\"delta\":\"hello\"}\n\n: keepalive\n\ndata: {\"type\":\"response.completed\"}\n\ndata: [DONE]\n"))
	require.NoError(t, err)
	require.NoError(t, w.finish())

	require.Len(t, sink.frames, 3)
	assert.Equal(t, `{"type":"response.created"}`, string(sink.frames[0]))
	assert.Equal(t, `{"type":"response.output_text.delta","delta":"hello"}`, string(sink.frames[1]))
	assert.Equal(t, `{"type":"response.completed"}`, string(sink.frames[2]))
	assert.False(t, sink.writeDeadline.IsZero())
}

func TestResponsesWSBridgeWriterConvertsHTTPError(t *testing.T) {
	sink := &responsesWSFrameSink{}
	w := newResponsesWSBridgeWriter(sink)
	w.WriteHeader(http.StatusBadGateway)
	_, err := w.Write([]byte(`{"error":{"type":"upstream_error","message":"upstream failed"}}`))
	require.NoError(t, err)
	require.NoError(t, w.finish())

	require.Len(t, sink.frames, 1)
	assert.JSONEq(t, `{"type":"error","error":{"type":"upstream_error","message":"upstream failed"}}`, string(sink.frames[0]))
}

func TestResponsesWSBridgeWriterConvertsEmptyHTTPError(t *testing.T) {
	sink := &responsesWSFrameSink{}
	w := newResponsesWSBridgeWriter(sink)
	w.WriteHeader(http.StatusServiceUnavailable)
	require.NoError(t, w.finish())

	require.Len(t, sink.frames, 1)
	assert.JSONEq(t, `{"type":"error","error":{"type":"http_error","message":"Service Unavailable","code":503}}`, string(sink.frames[0]))
}

func TestResponsesWSBridgeWriterRequiresTerminalEvent(t *testing.T) {
	sink := &responsesWSFrameSink{}
	w := newResponsesWSBridgeWriter(sink)
	w.Header().Set("Content-Type", "text/event-stream")
	_, err := w.Write([]byte("data: {\"type\":\"response.created\"}\n\n"))
	require.NoError(t, err)
	err = w.finish()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "terminal")
}

func TestResponsesWSBridgeWriterCancelsTurnOnWriteFailure(t *testing.T) {
	sink := &responsesWSFrameSink{writeErr: assert.AnError}
	turnContext, cancel := context.WithCancel(context.Background())
	w := newResponsesWSBridgeWriter(sink, cancel)
	w.Header().Set("Content-Type", "text/event-stream")

	_, err := w.Write([]byte("data: {\"type\":\"response.completed\"}\n\n"))
	require.Error(t, err)
	select {
	case <-turnContext.Done():
	case <-time.After(time.Second):
		t.Fatal("turn context was not canceled after websocket write failure")
	}
}

func TestResponsesWSBridgeWriterFlushesFinalUnterminatedData(t *testing.T) {
	sink := &responsesWSFrameSink{}
	w := newResponsesWSBridgeWriter(sink)
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	_, err := w.Write(bytes.TrimSpace([]byte("data: {\"type\":\"response.done\"}")))
	require.NoError(t, err)
	require.NoError(t, w.finish())

	require.Len(t, sink.frames, 1)
	assert.Equal(t, `{"type":"response.done"}`, string(sink.frames[0]))
}
