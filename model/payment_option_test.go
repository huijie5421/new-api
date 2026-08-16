package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
)

func TestUpdateOptionMapLoadsGMPaySettingsIntoRuntime(t *testing.T) {
	originalOptionMap := common.OptionMap
	originalAddress := operation_setting.GMPayAddress
	originalID := operation_setting.GMPayId
	originalKey := operation_setting.GMPayKey
	originalMethods := operation_setting.GMPayPayMethods
	t.Cleanup(func() {
		common.OptionMap = originalOptionMap
		operation_setting.GMPayAddress = originalAddress
		operation_setting.GMPayId = originalID
		operation_setting.GMPayKey = originalKey
		operation_setting.GMPayPayMethods = originalMethods
	})

	common.OptionMap = map[string]string{}
	require.NoError(t, updateOptionMap("GMPayAddress", "https://pay.example.com"))
	require.NoError(t, updateOptionMap("GMPayId", "10001"))
	require.NoError(t, updateOptionMap("GMPayKey", "secret"))
	require.NoError(t, updateOptionMap("GMPayPayMethods", `[{"name":"USDT/USDC","type":"usdt"}]`))

	require.Equal(t, "https://pay.example.com", operation_setting.GMPayAddress)
	require.Equal(t, "10001", operation_setting.GMPayId)
	require.Equal(t, "secret", operation_setting.GMPayKey)
	require.Equal(t, []map[string]string{{"name": "USDT/USDC", "type": "usdt"}}, operation_setting.GMPayPayMethods)
}

func TestInitOptionMapPublishesGMPaySettings(t *testing.T) {
	originalOptionMap := common.OptionMap
	t.Cleanup(func() { common.OptionMap = originalOptionMap })

	common.OptionMap = map[string]string{}
	InitOptionMap()

	for _, key := range []string{"GMPayAddress", "GMPayId", "GMPayKey", "GMPayPayMethods"} {
		_, exists := common.OptionMap[key]
		require.Truef(t, exists, "expected %s in option map", key)
	}
}
