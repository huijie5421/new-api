package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
)

func TestBuildCreditGrantsUsesDisplayCurrency(t *testing.T) {
	originalDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	t.Cleanup(func() {
		operation_setting.GetGeneralSetting().QuotaDisplayType = originalDisplayType
	})

	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	response := buildCreditGrants(2*int(common.QuotaPerUnit), int(common.QuotaPerUnit), false)

	require.Equal(t, "credit_summary", response.Object)
	require.Equal(t, 3.0, response.TotalGranted)
	require.Equal(t, 1.0, response.TotalUsed)
	require.Equal(t, 2.0, response.TotalAvailable)
}

func TestBuildCreditGrantsUsesLargeSentinelForUnlimitedQuota(t *testing.T) {
	response := buildCreditGrants(0, 0, true)

	require.Equal(t, 100000000.0, response.TotalGranted)
	require.Equal(t, 0.0, response.TotalUsed)
	require.Equal(t, 100000000.0, response.TotalAvailable)
}
