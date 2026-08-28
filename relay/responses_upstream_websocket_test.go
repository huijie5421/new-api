package relay

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	rootcommon "github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/sub2api"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestDeriveResponsesWSURL(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "https", in: "https://upstream.example/base/v1/responses?x=1", want: "wss://upstream.example/base/v1/responses?x=1"},
		{name: "http", in: "http://upstream.example/v1/responses", want: "ws://upstream.example/v1/responses"},
		{name: "already ws", in: "wss://upstream.example/v1/responses", want: "wss://upstream.example/v1/responses"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := deriveResponsesWSURL(tt.in)
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestDeriveResponsesWSURLRejectsUnsupportedScheme(t *testing.T) {
	_, err := deriveResponsesWSURL("ftp://upstream.example/v1/responses")
	require.Error(t, err)
}

func TestNormalizeResponsesWSCreatePayload(t *testing.T) {
	got, err := normalizeResponsesWSCreatePayload([]byte(`{"model":"gpt-test","stream":true,"metadata":{"large":900719925474099312345}}`))
	require.NoError(t, err)
	require.JSONEq(t, `{"type":"response.create","model":"gpt-test","metadata":{"large":900719925474099312345}}`, string(got))
}

func TestClassifyResponsesWSUnsupported(t *testing.T) {
	for _, status := range []int{404, 405, 410, 426, 501} {
		require.True(t, isResponsesWSUnsupported(status, nil, 0), "status %d", status)
	}
	require.True(t, isResponsesWSUnsupported(400, []byte(`{"error":{"code":"websocket_not_supported"}}`), 0))
	require.True(t, isResponsesWSUnsupported(400, []byte(`{"error":{"message":"OpenAI WSv1 is temporarily unsupported. Please enable responses_websockets_v2."}}`), 0))
	require.True(t, isResponsesWSUnsupported(200, nil, 1003))
	require.False(t, isResponsesWSUnsupported(429, []byte(`{"error":{"code":"rate_limit"}}`), 0))
}

func TestResponsesWSCircuitDecision(t *testing.T) {
	now := time.Unix(1000, 0)
	require.True(t, responsesWSCircuitAllows(0, now))
	require.False(t, responsesWSCircuitAllows(now.Add(24*time.Hour-1).Unix(), now))
	require.True(t, responsesWSCircuitAllows(now.Unix(), now))
}

func TestShouldUseResponsesWSUpstreamRequiresPrivateBridgeMarker(t *testing.T) {
	setting := dto.ChannelSettings{ResponsesWSUpstreamEnabled: true}
	require.False(t, shouldUseResponsesWSUpstream(context.Background(), relayconstant.RelayModeResponses, setting))
	require.True(t, shouldUseResponsesWSUpstream(MarkResponsesWSUpstreamRequest(context.Background()), relayconstant.RelayModeResponses, setting))
	require.False(t, shouldUseResponsesWSUpstream(MarkResponsesWSUpstreamRequest(context.Background()), relayconstant.RelayModeResponsesCompact, setting))
	require.False(t, shouldUseResponsesWSUpstream(MarkResponsesWSUpstreamRequest(context.Background()), relayconstant.RelayModeResponses, dto.ChannelSettings{}))
}

func TestDialResponsesWSStreamForwardsEventsAsSSE(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer upstream-key", r.Header.Get("Authorization"))
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		defer conn.Close()
		_, request, err := conn.ReadMessage()
		require.NoError(t, err)
		require.JSONEq(t, `{"type":"response.create","model":"gpt-test"}`, string(request))
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.created","response":{"id":"resp_1"}}`)))
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed","response":{"usage":{"input_tokens":2,"output_tokens":3,"total_tokens":5}}}`)))
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	resp, unsupported, _, err := dialResponsesWSStream(
		context.Background(),
		websocket.DefaultDialer,
		wsURL,
		http.Header{"Authorization": []string{"Bearer upstream-key"}},
		[]byte(`{"type":"response.create","model":"gpt-test"}`),
	)
	require.NoError(t, err)
	require.False(t, unsupported)
	require.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Contains(t, string(body), `data: {"type":"response.created"`)
	require.Contains(t, string(body), `data: {"type":"response.completed"`)
}

func TestDialResponsesWSStreamClassifiesHandshakeUnsupported(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":{"code":"websocket_not_supported"}}`, http.StatusNotFound)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	resp, unsupported, reason, err := dialResponsesWSStream(context.Background(), websocket.DefaultDialer, wsURL, nil, []byte(`{"type":"response.create","model":"gpt-test"}`))
	require.Error(t, err)
	require.Nil(t, resp)
	require.True(t, unsupported)
	require.Contains(t, reason, "404")
}

func TestDialResponsesWSStreamClassifiesFirstErrorEventUnsupported(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		defer conn.Close()
		_, _, err = conn.ReadMessage()
		require.NoError(t, err)
		require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","error":{"code":"responses_websockets_disabled"}}`)))
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	resp, unsupported, reason, err := dialResponsesWSStream(context.Background(), websocket.DefaultDialer, wsURL, nil, []byte(`{"type":"response.create","model":"gpt-test"}`))
	require.Error(t, err)
	require.Nil(t, resp)
	require.True(t, unsupported)
	require.Contains(t, reason, "responses_websockets_disabled")
}

func TestResponsesWSBreakerManagerIsPerChannelAndSingleProbe(t *testing.T) {
	now := time.Unix(20_000, 0)
	var mu sync.Mutex
	stored := map[int]*model.ChannelResponsesWSBreaker{
		7: {ChannelID: 7, DisabledUntil: now.Add(time.Hour).Unix()},
	}
	manager := &responsesWSBreakerManager{
		states: make(map[int]*responsesWSBreakerState),
		load: func(channelID int) (*model.ChannelResponsesWSBreaker, error) {
			mu.Lock()
			defer mu.Unlock()
			breaker := stored[channelID]
			if breaker == nil {
				return nil, gorm.ErrRecordNotFound
			}
			copy := *breaker
			return &copy, nil
		},
		trip: func(channelID int, code, detail string, at time.Time) error {
			mu.Lock()
			defer mu.Unlock()
			stored[channelID] = &model.ChannelResponsesWSBreaker{ChannelID: channelID, DisabledUntil: at.Add(24 * time.Hour).Unix(), ReasonCode: code, ReasonDetail: detail}
			return nil
		},
		clear: func(channelID int) error {
			mu.Lock()
			defer mu.Unlock()
			delete(stored, channelID)
			return nil
		},
	}

	allowed, probe, _ := manager.begin(7, now)
	require.False(t, allowed)
	require.False(t, probe)
	allowed, probe, _ = manager.begin(8, now)
	require.True(t, allowed, "another channel remains independent")
	require.False(t, probe)

	expired := now.Add(time.Hour)
	allowed, probe, _ = manager.begin(7, expired)
	require.True(t, allowed)
	require.True(t, probe)
	allowed, secondProbe, _ := manager.begin(7, expired)
	require.False(t, allowed)
	require.False(t, secondProbe)

	manager.transient(7, true, expired)
	allowed, _, _ = manager.begin(7, expired.Add(30*time.Second))
	require.False(t, allowed)
	allowed, probe, _ = manager.begin(7, expired.Add(time.Minute))
	require.True(t, allowed)
	require.True(t, probe)

	manager.success(7, true)
	allowed, probe, disabledUntil := manager.begin(7, expired.Add(time.Minute))
	require.True(t, allowed)
	require.False(t, probe)
	require.Zero(t, disabledUntil)
}

func TestTryResponsesWSUpstreamFallsBackWithoutConsumingHTTPBody(t *testing.T) {
	service.InitHttpClient()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":{"code":"websocket_not_supported"}}`, http.StatusNotFound)
	}))
	defer server.Close()

	previousManager := globalResponsesWSBreakerManager
	manager := &responsesWSBreakerManager{
		states: make(map[int]*responsesWSBreakerState),
		load: func(int) (*model.ChannelResponsesWSBreaker, error) {
			return nil, gorm.ErrRecordNotFound
		},
		trip:  func(int, string, string, time.Time) error { return nil },
		clear: func(int) error { return nil },
	}
	globalResponsesWSBreakerManager = manager
	t.Cleanup(func() { globalResponsesWSBreakerManager = previousManager })

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Request.Header.Set("Content-Type", "application/json")
	bodyBytes := []byte(`{"model":"gpt-test","stream":true}`)
	storage, err := rootcommon.CreateBodyStorage(bodyBytes)
	require.NoError(t, err)
	defer storage.Close()
	body := rootcommon.NewReplayableBodyReader(storage)

	info := &relaycommon.RelayInfo{
		IsStream:       true,
		RelayMode:      relayconstant.RelayModeResponses,
		RequestURLPath: "/v1/responses",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelId:      7,
			ChannelType:    constant.ChannelTypeSub2API,
			ChannelBaseUrl: server.URL,
			ApiKey:         "upstream-key",
			ChannelSetting: dto.ChannelSettings{ResponsesWSUpstreamEnabled: true},
		},
	}
	adaptor := &sub2api.Adaptor{}
	adaptor.Init(info)

	resp, probe, apiErr := tryResponsesWSUpstream(c, info, adaptor, body)
	require.Nil(t, apiErr)
	require.Nil(t, resp, "explicit rejection falls back to HTTP")
	require.False(t, probe)
	remaining, err := io.ReadAll(body)
	require.NoError(t, err)
	require.Equal(t, bodyBytes, remaining, "the existing HTTP body remains untouched")
	allowed, _, disabledUntil := manager.begin(7, time.Now())
	require.False(t, allowed)
	require.Greater(t, disabledUntil, time.Now().Unix())
}
