package controller

import (
	"strings"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

type epayGatewayConfig struct {
	Name                   string
	Address                string
	MerchantID             string
	SecretKey              string
	PaymentProvider        string
	TopUpNotifyPath        string
	SubscriptionNotifyPath string
	SubscriptionReturnPath string
}

func getEpayGatewayConfig(gateway string) epayGatewayConfig {
	if gateway == operation_setting.PaymentGatewayGMPay {
		return epayGatewayConfig{
			Name:                   "GMPay",
			Address:                operation_setting.GMPayAddress,
			MerchantID:             operation_setting.GMPayId,
			SecretKey:              operation_setting.GMPayKey,
			PaymentProvider:        model.PaymentProviderGMPay,
			TopUpNotifyPath:        "/api/user/gmpay/notify",
			SubscriptionNotifyPath: "/api/subscription/gmpay/notify",
			SubscriptionReturnPath: "/api/subscription/gmpay/return",
		}
	}

	return epayGatewayConfig{
		Name:                   "Epay",
		Address:                operation_setting.PayAddress,
		MerchantID:             operation_setting.EpayId,
		SecretKey:              operation_setting.EpayKey,
		PaymentProvider:        model.PaymentProviderEpay,
		TopUpNotifyPath:        "/api/user/epay/notify",
		SubscriptionNotifyPath: "/api/subscription/epay/notify",
		SubscriptionReturnPath: "/api/subscription/epay/return",
	}
}

func (config epayGatewayConfig) client() *epay.Client {
	if strings.TrimSpace(config.Address) == "" ||
		strings.TrimSpace(config.MerchantID) == "" ||
		strings.TrimSpace(config.SecretKey) == "" {
		return nil
	}
	client, err := epay.NewClient(&epay.Config{
		PartnerID: config.MerchantID,
		Key:       config.SecretKey,
	}, config.Address)
	if err != nil {
		return nil
	}
	return client
}

func (config epayGatewayConfig) webhookEnabled() bool {
	if config.PaymentProvider == model.PaymentProviderGMPay {
		return isGMPayWebhookEnabled()
	}
	return isEpayWebhookEnabled()
}

func (config epayGatewayConfig) storedPaymentMethod(requestedMethod, providerMethod string) string {
	if config.PaymentProvider == model.PaymentProviderGMPay {
		return strings.TrimPrefix(strings.TrimSpace(requestedMethod), operation_setting.GMPayMethodPrefix)
	}
	return providerMethod
}

func (config epayGatewayConfig) callbackPaymentMethod(providerMethod string) string {
	if config.PaymentProvider == model.PaymentProviderGMPay {
		return ""
	}
	return providerMethod
}

func resolveEpayGateway(paymentMethod string) (epayGatewayConfig, string, bool) {
	gateway, rawMethod, ok := operation_setting.ResolveEpayPaymentMethod(paymentMethod)
	if !ok {
		return epayGatewayConfig{}, "", false
	}
	return getEpayGatewayConfig(gateway), rawMethod, true
}

func GetEpayClient() *epay.Client {
	return getEpayGatewayConfig(operation_setting.PaymentGatewayEpay).client()
}

func GetGMPayClient() *epay.Client {
	return getEpayGatewayConfig(operation_setting.PaymentGatewayGMPay).client()
}
