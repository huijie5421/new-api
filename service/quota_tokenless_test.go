package service

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

func TestPreConsumeTokenQuotaSkipsTokenlessLoginBridge(t *testing.T) {
	info := &relaycommon.RelayInfo{
		UserId:   1001,
		TokenId:  0,
		TokenKey: "",
	}

	if err := PreConsumeTokenQuota(info, 100); err != nil {
		t.Fatalf("tokenless login bridge should not require a persisted token: %v", err)
	}
}
