package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

func quotaToBillingAmount(quota int) float64 {
	amount := float64(quota)
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		return amount / common.QuotaPerUnit * operation_setting.USDExchangeRate
	case operation_setting.QuotaDisplayTypeTokens:
		return amount
	default:
		return amount / common.QuotaPerUnit
	}
}

// quotaToUSD converts new-api's internal quota units to the monetary unit
// required by OpenAI-compatible billing responses. The site's display mode is
// intentionally ignored here: API consumers expect these fields to be USD,
// while the display mode only controls the web UI.
func quotaToUSD(quota int) float64 {
	if common.QuotaPerUnit <= 0 {
		return 0
	}
	return float64(quota) / common.QuotaPerUnit
}

func buildCreditGrants(remainQuota, usedQuota int, unlimitedQuota bool) OpenAICreditGrants {
	if unlimitedQuota {
		return OpenAICreditGrants{
			Object:         "credit_summary",
			TotalGranted:   100000000,
			TotalUsed:      quotaToUSD(usedQuota),
			TotalAvailable: 100000000,
		}
	}

	return OpenAICreditGrants{
		Object:         "credit_summary",
		TotalGranted:   quotaToUSD(remainQuota + usedQuota),
		TotalUsed:      quotaToUSD(usedQuota),
		TotalAvailable: quotaToUSD(remainQuota),
	}
}

func GetSubscription(c *gin.Context) {
	var remainQuota int
	var usedQuota int
	var err error
	var token *model.Token
	var expiredTime int64
	if common.DisplayTokenStatEnabled {
		tokenId := c.GetInt("token_id")
		token, err = model.GetTokenById(tokenId)
		expiredTime = token.ExpiredTime
		remainQuota = token.RemainQuota
		usedQuota = token.UsedQuota
	} else {
		userId := c.GetInt("id")
		remainQuota, err = model.GetUserQuota(userId, false)
		usedQuota, err = model.GetUserUsedQuota(userId)
	}
	if expiredTime <= 0 {
		expiredTime = 0
	}
	if err != nil {
		openAIError := types.OpenAIError{
			Message: err.Error(),
			Type:    "upstream_error",
		}
		c.JSON(200, gin.H{
			"error": openAIError,
		})
		return
	}
	quota := remainQuota + usedQuota
	amount := float64(quota)
	// OpenAI 兼容接口中的 *_USD 字段含义保持“额度单位”对应值：
	// 我们将其解释为以“站点展示类型”为准：
	// - USD: 直接除以 QuotaPerUnit
	// - CNY: 先转 USD 再乘汇率
	// - TOKENS: 直接使用 tokens 数量
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		amount = amount / common.QuotaPerUnit * operation_setting.USDExchangeRate
	case operation_setting.QuotaDisplayTypeTokens:
		// amount 保持 tokens 数值
	default:
		amount = amount / common.QuotaPerUnit
	}
	if token != nil && token.UnlimitedQuota {
		amount = 100000000
	}
	subscription := OpenAISubscriptionResponse{
		Object:             "billing_subscription",
		HasPaymentMethod:   true,
		SoftLimitUSD:       amount,
		HardLimitUSD:       amount,
		SystemHardLimitUSD: amount,
		AccessUntil:        expiredTime,
	}
	c.JSON(200, subscription)
	return
}

func GetUsage(c *gin.Context) {
	var quota int
	var err error
	var token *model.Token
	if common.DisplayTokenStatEnabled {
		tokenId := c.GetInt("token_id")
		token, err = model.GetTokenById(tokenId)
		quota = token.UsedQuota
	} else {
		userId := c.GetInt("id")
		quota, err = model.GetUserUsedQuota(userId)
	}
	if err != nil {
		openAIError := types.OpenAIError{
			Message: err.Error(),
			Type:    "new_api_error",
		}
		c.JSON(200, gin.H{
			"error": openAIError,
		})
		return
	}
	amount := float64(quota)
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		amount = amount / common.QuotaPerUnit * operation_setting.USDExchangeRate
	case operation_setting.QuotaDisplayTypeTokens:
		// tokens 保持原值
	default:
		amount = amount / common.QuotaPerUnit
	}
	usage := OpenAIUsageResponse{
		Object:     "list",
		TotalUsage: amount * 100,
	}
	c.JSON(200, usage)
	return
}

// GetCreditGrants exposes the OpenAI-compatible credit summary for the
// authenticated API token. Unlike OpenAI's organization Costs API, this is a
// local wallet balance and therefore works with regular user API keys.
func GetCreditGrants(c *gin.Context) {
	var remainQuota int
	var usedQuota int
	var unlimitedQuota bool
	var err error

	if common.DisplayTokenStatEnabled {
		token, tokenErr := model.GetTokenById(c.GetInt("token_id"))
		if tokenErr != nil {
			err = tokenErr
		} else {
			remainQuota = token.RemainQuota
			usedQuota = token.UsedQuota
			unlimitedQuota = token.UnlimitedQuota
		}
	} else {
		remainQuota, err = model.GetUserQuota(c.GetInt("id"), false)
		if err == nil {
			usedQuota, err = model.GetUserUsedQuota(c.GetInt("id"))
		}
	}

	if err != nil {
		openAIError := types.OpenAIError{
			Message: err.Error(),
			Type:    "upstream_error",
		}
		c.JSON(200, gin.H{"error": openAIError})
		return
	}

	c.JSON(200, buildCreditGrants(remainQuota, usedQuota, unlimitedQuota))
}
