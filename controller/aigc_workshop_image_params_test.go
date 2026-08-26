package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestNormalizeAigcWorkshopImageRequestOmitsGptImage2InputFidelity(t *testing.T) {
	body := []byte(`{"model":"gpt-image-2","prompt":"keep the subject","image":"data:image/png;base64,AAAA","input_fidelity":"low"}`)

	normalized, err := normalizeAigcWorkshopImageRequest(body)
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, common.Unmarshal(normalized, &payload))
	require.Equal(t, "data:image/png;base64,AAAA", payload["image"])
	require.NotContains(t, payload, "input_fidelity")
}

func TestNormalizeAigcWorkshopImageRequestPreservesLegacyInputFidelity(t *testing.T) {
	body := []byte(`{"model":"gpt-image-1","prompt":"keep the subject","image":"data:image/png;base64,AAAA","input_fidelity":"high"}`)

	normalized, err := normalizeAigcWorkshopImageRequest(body)
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, common.Unmarshal(normalized, &payload))
	require.Equal(t, "high", payload["input_fidelity"])
}
