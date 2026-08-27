package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGetSelfUsesLiveInviteRelationshipCount(t *testing.T) {
	db := setupManageUserTestDB(t)
	require.NoError(t, authz.Init(db))

	inviter := model.User{
		Username: "get-self-inviter", Password: "password", AffCode: "get-self-inviter",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCount: 1,
	}
	require.NoError(t, db.Create(&inviter).Error)
	for _, suffix := range []string{"one", "two"} {
		require.NoError(t, db.Create(&model.User{
			Username: "get-self-invitee-" + suffix, Password: "password",
			AffCode: "get-self-invitee-" + suffix, InviterId: inviter.Id,
		}).Error)
	}

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/user/self", nil)
	context.Set("id", inviter.Id)
	context.Set("role", inviter.Role)
	GetSelf(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			AffCount int64 `json:"aff_count"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Equal(t, int64(2), response.Data.AffCount)
}

func TestSelfAffiliateHistoryEndpointsReturnPaginatedData(t *testing.T) {
	db := setupManageUserTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.AffiliateRebateRecord{}))

	inviter := model.User{Username: "history-inviter", Password: "password", AffCode: "history-inviter"}
	require.NoError(t, db.Create(&inviter).Error)
	require.NoError(t, db.Create(&model.User{
		Username: "history-invitee", Password: "password", AffCode: "history-invitee", InviterId: inviter.Id,
	}).Error)
	require.NoError(t, db.Create(&model.AffiliateRebateRecord{
		InviterId: inviter.Id, SourceUserId: inviter.Id + 1, SourceUsername: "history-invitee",
		Quota: 100, RechargedQuota: 1000, Ratio: 10, TradeNo: "history-trade",
	}).Error)

	for _, endpoint := range []struct {
		path    string
		handler gin.HandlerFunc
		needle  string
	}{
		{path: "/api/user/aff/rebate?p=1&page_size=10", handler: GetSelfRebateRecords, needle: "history-trade"},
		{path: "/api/user/aff/invitees?p=1&page_size=10", handler: GetSelfInvitees, needle: "history-invitee"},
	} {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodGet, endpoint.path, nil)
		context.Set("id", inviter.Id)
		endpoint.handler(context)
		require.Equal(t, http.StatusOK, recorder.Code, endpoint.path)
		require.Contains(t, recorder.Body.String(), endpoint.needle, endpoint.path)
		require.Contains(t, recorder.Body.String(), `"total":1`, endpoint.path)
	}
}
