package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type topUpInfoResponse struct {
	Success bool `json:"success"`
	Data    struct {
		EnableGMPayTopUp bool                `json:"enable_gmpay_topup"`
		PayMethods       []map[string]string `json:"pay_methods"`
	} `json:"data"`
}

func requestTopUpInfo(t *testing.T) topUpInfoResponse {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/user/topup/info", nil)

	GetTopUpInfo(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response topUpInfoResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	return response
}

func TestGetTopUpInfoIncludesConfiguredGMPayMethods(t *testing.T) {
	gin.SetMode(gin.TestMode)
	confirmPaymentComplianceForTest(t)

	originalAddress := operation_setting.GMPayAddress
	originalID := operation_setting.GMPayId
	originalKey := operation_setting.GMPayKey
	originalMethods := operation_setting.GMPayPayMethods
	originalPayMethods := operation_setting.PayMethods
	t.Cleanup(func() {
		operation_setting.GMPayAddress = originalAddress
		operation_setting.GMPayId = originalID
		operation_setting.GMPayKey = originalKey
		operation_setting.GMPayPayMethods = originalMethods
		operation_setting.PayMethods = originalPayMethods
	})

	operation_setting.GMPayAddress = "https://pay.example.com/payments/epay/v1/order/create-transaction"
	operation_setting.GMPayId = "10001"
	operation_setting.GMPayKey = "secret"
	operation_setting.PayMethods = []map[string]string{{"name": "Existing USDT", "type": "gmpay:usdt"}}
	operation_setting.GMPayPayMethods = []map[string]string{
		{"name": "USDT", "type": "usdt"},
		{"name": "USDC", "type": "usdc"},
	}

	response := requestTopUpInfo(t)
	require.True(t, response.Data.EnableGMPayTopUp)

	methodCounts := map[string]int{}
	methodGateways := map[string]string{}
	for _, method := range response.Data.PayMethods {
		methodCounts[method["type"]]++
		methodGateways[method["type"]] = method["gateway"]
	}
	require.Equal(t, 1, methodCounts["gmpay:usdt"])
	require.Equal(t, 1, methodCounts["gmpay:usdc"])
	require.Equal(t, "gmpay", methodGateways["gmpay:usdc"])
}

func TestGetTopUpInfoOmitsGMPayMethodsWhenGatewayIsNotConfigured(t *testing.T) {
	gin.SetMode(gin.TestMode)
	confirmPaymentComplianceForTest(t)

	originalAddress := operation_setting.GMPayAddress
	originalID := operation_setting.GMPayId
	originalKey := operation_setting.GMPayKey
	originalMethods := operation_setting.GMPayPayMethods
	originalPayMethods := operation_setting.PayMethods
	t.Cleanup(func() {
		operation_setting.GMPayAddress = originalAddress
		operation_setting.GMPayId = originalID
		operation_setting.GMPayKey = originalKey
		operation_setting.GMPayPayMethods = originalMethods
		operation_setting.PayMethods = originalPayMethods
	})

	operation_setting.GMPayAddress = "https://pay.example.com/payments/epay/v1/order/create-transaction"
	operation_setting.GMPayId = "10001"
	operation_setting.GMPayKey = ""
	operation_setting.PayMethods = nil
	operation_setting.GMPayPayMethods = []map[string]string{
		{"name": "USDT", "type": "usdt"},
		{"name": "USDC", "type": "usdc"},
	}

	response := requestTopUpInfo(t)
	require.False(t, response.Data.EnableGMPayTopUp)
	require.Empty(t, response.Data.PayMethods)
}
