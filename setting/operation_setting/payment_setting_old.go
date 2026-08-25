/**
此文件为旧版支付设置文件，如需增加新的参数、变量等，请在 payment_setting.go 中添加
This file is the old version of the payment settings file. If you need to add new parameters, variables, etc., please add them in payment_setting.go
*/

package operation_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

var PayAddress = ""
var CustomCallbackAddress = ""
var EpayId = ""
var EpayKey = ""
var GMPayAddress = ""
var GMPayId = ""
var GMPayKey = ""
var Price = 7.3
var MinTopUp = 1
var USDExchangeRate = 7.3

const (
	PaymentGatewayEpay       = "epay"
	PaymentGatewayGMPay      = "gmpay"
	GMPayMethodPrefix        = "gmpay:"
	GMPayCashierSelectMethod = "usdt"
)

var PayMethods = []map[string]string{
	{
		"name": "支付宝",
		"icon": "SiAlipay",
		"type": "alipay",
	},
	{
		"name": "微信",
		"icon": "SiWechat",
		"type": "wxpay",
	},
	{
		"name":      "自定义1",
		"icon":      "LuCreditCard",
		"type":      "custom1",
		"min_topup": "50",
	},
}

var GMPayPayMethods = []map[string]string{}

func UpdatePayMethodsByJsonString(jsonString string) error {
	PayMethods = make([]map[string]string, 0)
	return common.Unmarshal([]byte(jsonString), &PayMethods)
}

func PayMethods2JsonString() string {
	jsonBytes, err := common.Marshal(PayMethods)
	if err != nil {
		return "[]"
	}
	return string(jsonBytes)
}

func UpdateGMPayPayMethodsByJsonString(jsonString string) error {
	GMPayPayMethods = make([]map[string]string, 0)
	return common.Unmarshal([]byte(jsonString), &GMPayPayMethods)
}

func GMPayPayMethods2JsonString() string {
	jsonBytes, err := common.Marshal(GMPayPayMethods)
	if err != nil {
		return "[]"
	}
	return string(jsonBytes)
}

func GetGMPayPayMethodsForClient() []map[string]string {
	methods := make([]map[string]string, 0, len(GMPayPayMethods))
	for _, method := range GMPayPayMethods {
		rawType := strings.TrimPrefix(strings.TrimSpace(method["type"]), GMPayMethodPrefix)
		if rawType == "" {
			continue
		}
		copyMethod := make(map[string]string, len(method)+1)
		for key, value := range method {
			copyMethod[key] = value
		}
		copyMethod["type"] = GMPayMethodPrefix + rawType
		copyMethod["gateway"] = PaymentGatewayGMPay
		methods = append(methods, copyMethod)
	}
	return methods
}

func ResolveEpayPaymentMethod(method string) (gateway string, rawMethod string, ok bool) {
	method = strings.TrimSpace(method)
	if strings.HasPrefix(method, GMPayMethodPrefix) {
		rawMethod = strings.TrimPrefix(method, GMPayMethodPrefix)
		for _, payMethod := range GMPayPayMethods {
			configuredType := strings.TrimPrefix(strings.TrimSpace(payMethod["type"]), GMPayMethodPrefix)
			if configuredType == rawMethod {
				if rawMethod == GMPayCashierSelectMethod {
					return PaymentGatewayGMPay, "", true
				}
				return PaymentGatewayGMPay, rawMethod, true
			}
		}
		return "", "", false
	}

	for _, payMethod := range PayMethods {
		if strings.TrimSpace(payMethod["type"]) == method {
			return PaymentGatewayEpay, method, true
		}
	}
	return "", "", false
}

func ContainsPayMethod(method string) bool {
	_, _, ok := ResolveEpayPaymentMethod(method)
	return ok
}
