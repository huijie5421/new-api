package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type topUpPaymentTestFixture struct {
	db        *gorm.DB
	user      model.User
	epayHits  atomic.Int32
	gmpayHits atomic.Int32
	epayURL   string
	gmpayURL  string
}

func setupTopUpPaymentTest(t *testing.T) *topUpPaymentTestFixture {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedisEnabled := common.RedisEnabled
	previousBatchUpdateEnabled := common.BatchUpdateEnabled
	previousRechargeRebateEnabled := common.RechargeRebateEnabled
	previousMainDatabaseType, previousLogDatabaseType := common.MainDatabaseType(), common.LogDatabaseType()
	previousServerAddress := system_setting.ServerAddress
	previousCallbackAddress := operation_setting.CustomCallbackAddress
	previousPrice := operation_setting.Price
	previousMinTopUp := operation_setting.MinTopUp
	previousPayAddress := operation_setting.PayAddress
	previousEpayID := operation_setting.EpayId
	previousEpayKey := operation_setting.EpayKey
	previousPayMethods := operation_setting.PayMethods
	previousGMPayAddress := operation_setting.GMPayAddress
	previousGMPayID := operation_setting.GMPayId
	previousGMPayKey := operation_setting.GMPayKey
	previousGMPayMethods := operation_setting.GMPayPayMethods

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}, &model.Log{}))
	model.DB, model.LOG_DB = db, db
	common.RedisEnabled = false
	common.BatchUpdateEnabled = false
	common.RechargeRebateEnabled = false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, model.InitLogDB())
	confirmPaymentComplianceForTest(t)

	fixture := &topUpPaymentTestFixture{db: db}
	epayServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fixture.epayHits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	gmpayServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fixture.gmpayHits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	fixture.epayURL = epayServer.URL
	fixture.gmpayURL = gmpayServer.URL

	system_setting.ServerAddress = "https://newapi.example.com"
	operation_setting.CustomCallbackAddress = "https://newapi.example.com"
	operation_setting.Price = 1
	operation_setting.MinTopUp = 1
	operation_setting.PayAddress = fixture.epayURL + "/epay"
	operation_setting.EpayId = "epay-merchant"
	operation_setting.EpayKey = "epay-secret"
	operation_setting.PayMethods = []map[string]string{{"name": "Alipay", "type": "alipay"}}
	operation_setting.GMPayAddress = fixture.gmpayURL + "/payments/epay/v1/order/create-transaction"
	operation_setting.GMPayId = "gmpay-merchant"
	operation_setting.GMPayKey = "gmpay-secret"
	operation_setting.GMPayPayMethods = []map[string]string{{"name": "USDT/USDC", "type": "usdt"}}
	fixture.user = model.User{
		Username: "gmpay-test",
		Password: "password",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}
	require.NoError(t, db.Create(&fixture.user).Error)

	t.Cleanup(func() {
		epayServer.Close()
		gmpayServer.Close()
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedisEnabled
		common.BatchUpdateEnabled = previousBatchUpdateEnabled
		common.RechargeRebateEnabled = previousRechargeRebateEnabled
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		system_setting.ServerAddress = previousServerAddress
		operation_setting.CustomCallbackAddress = previousCallbackAddress
		operation_setting.Price = previousPrice
		operation_setting.MinTopUp = previousMinTopUp
		operation_setting.PayAddress = previousPayAddress
		operation_setting.EpayId = previousEpayID
		operation_setting.EpayKey = previousEpayKey
		operation_setting.PayMethods = previousPayMethods
		operation_setting.GMPayAddress = previousGMPayAddress
		operation_setting.GMPayId = previousGMPayID
		operation_setting.GMPayKey = previousGMPayKey
		operation_setting.GMPayPayMethods = previousGMPayMethods
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return fixture
}

func TestRequestEpayRoutesNewGMPayOrderToGMPay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	fixture := setupTopUpPaymentTest(t)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/user/pay", strings.NewReader(`{"amount":5,"payment_method":"gmpay:usdt"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("id", fixture.user.Id)

	RequestEpay(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Message string            `json:"message"`
		Data    map[string]string `json:"data"`
		URL     string            `json:"url"`
		QRURL   string            `json:"qr_url"`
		TradeNo string            `json:"trade_no"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "success", response.Message)
	require.Equal(t, fixture.gmpayURL+"/payments/epay/v1/order/create-transaction/submit.php", response.URL)
	require.Equal(t, "gmpay-merchant", response.Data["pid"])
	require.Empty(t, response.Data["type"])
	require.Equal(t, "https://newapi.example.com/api/user/gmpay/notify", response.Data["notify_url"])
	require.Empty(t, response.QRURL)
	require.Zero(t, fixture.gmpayHits.Load())

	var topUp model.TopUp
	require.NoError(t, fixture.db.Where("trade_no = ?", response.TradeNo).First(&topUp).Error)
	require.Equal(t, "usdt", topUp.PaymentMethod)
	require.Equal(t, model.PaymentProviderGMPay, topUp.PaymentProvider)
}

func TestRequestEpayKeepsNewEpayOrderOnEpay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	fixture := setupTopUpPaymentTest(t)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/user/pay", strings.NewReader(`{"amount":5,"payment_method":"alipay"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("id", fixture.user.Id)

	RequestEpay(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Message string            `json:"message"`
		Data    map[string]string `json:"data"`
		URL     string            `json:"url"`
		TradeNo string            `json:"trade_no"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "success", response.Message)
	require.Equal(t, fixture.epayURL+"/epay/submit.php", response.URL)
	require.Equal(t, "epay-merchant", response.Data["pid"])
	require.Equal(t, "alipay", response.Data["type"])
	require.Equal(t, "https://newapi.example.com/api/user/epay/notify", response.Data["notify_url"])
	require.Positive(t, fixture.epayHits.Load())

	var topUp model.TopUp
	require.NoError(t, fixture.db.Where("trade_no = ?", response.TradeNo).First(&topUp).Error)
	require.Equal(t, "alipay", topUp.PaymentMethod)
	require.Equal(t, model.PaymentProviderEpay, topUp.PaymentProvider)
}
