package controller

import "testing"

func TestNewAigcWorkshopTokenDoesNotApplyAnIndependentZeroQuota(t *testing.T) {
	token := newAigcWorkshopToken(1830, "aigc-image", "GPT生图专用")

	if token.UserId != 1830 {
		t.Fatalf("UserId = %d, want 1830", token.UserId)
	}
	if !token.UnlimitedQuota {
		t.Fatal("workshop session token must defer quota enforcement to the owning user wallet")
	}
	if token.Group != "GPT生图专用" {
		t.Fatalf("Group = %q, want GPT生图专用", token.Group)
	}
}
