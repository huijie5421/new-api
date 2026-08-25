package controller

import (
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

const (
	aigcQuotaTypeToken   = 0
	aigcQuotaTypeRequest = 1

	aigcPriceUnitDynamic          = "dynamic"
	aigcPriceUnitFixedTotal       = "fixed_total"
	aigcPriceUnitPerRequest       = "per_request"
	aigcPriceUnitPerSecond        = "per_second"
	aigcPriceUnitPerMillionTokens = "per_million_tokens"
)

func applyAigcWorkshopModelPricing(option *aigcWorkshopModelOption, kind aigcWorkshopKind, fixedPrice bool) {
	if option == nil {
		return
	}

	option.BillingMode = billing_setting.GetBillingMode(option.Model)
	if option.BillingMode == billing_setting.BillingModeTieredExpr {
		option.QuotaType = aigcQuotaTypeToken
		option.PriceUnit = aigcPriceUnitDynamic
		return
	}
	if modelPrice, usePrice := ratio_setting.GetModelPrice(option.Model, false); usePrice {
		option.QuotaType = aigcQuotaTypeRequest
		option.PriceUnit = resolveAigcWorkshopPriceUnit(kind, option.QuotaType, fixedPrice)
		option.UnitPrice, option.InputPrice, option.OutputPrice = calculateAigcWorkshopPrices(
			option.QuotaType,
			modelPrice,
			0,
			0,
			option.GroupRatio,
		)
		return
	}

	modelRatio, _, _ := ratio_setting.GetModelRatio(option.Model)
	option.QuotaType = aigcQuotaTypeToken
	option.PriceUnit = resolveAigcWorkshopPriceUnit(kind, option.QuotaType, fixedPrice)
	option.UnitPrice, option.InputPrice, option.OutputPrice = calculateAigcWorkshopPrices(
		option.QuotaType,
		0,
		modelRatio,
		ratio_setting.GetCompletionRatio(option.Model),
		option.GroupRatio,
	)
}

func resolveAigcWorkshopPriceUnit(kind aigcWorkshopKind, quotaType int, fixedPrice bool) string {
	if quotaType == aigcQuotaTypeToken {
		return aigcPriceUnitPerMillionTokens
	}
	if kind != aigcWorkshopKindVideo {
		return aigcPriceUnitPerRequest
	}
	if fixedPrice {
		return aigcPriceUnitFixedTotal
	}
	return aigcPriceUnitPerSecond
}

func calculateAigcWorkshopPrices(
	quotaType int,
	modelPrice float64,
	modelRatio float64,
	completionRatio float64,
	groupRatio float64,
) (unitPrice float64, inputPrice float64, outputPrice float64) {
	if quotaType == aigcQuotaTypeRequest {
		return modelPrice * groupRatio, 0, 0
	}
	inputPrice = modelRatio * 2 * groupRatio
	return 0, inputPrice, inputPrice * completionRatio
}
