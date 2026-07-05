package controller

import "testing"

func TestDetectFixedVideoDurationSeconds(t *testing.T) {
	cases := []struct {
		name       string
		modelName  string
		wantFixed  bool
		wantSecond int
	}{
		{name: "fixed 15s suffix", modelName: "mg-seedance2.0 -720p fast-15s", wantFixed: true, wantSecond: 15},
		{name: "fixed nv 15s", modelName: "sh-seedance2.0-pro 720p-nv-15s", wantFixed: true, wantSecond: 15},
		{name: "selectable seconds", modelName: "seedance2.0 720p-fast-sr", wantFixed: false, wantSecond: 0},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			gotFixed, gotSecond := detectFixedVideoDurationSeconds(tt.modelName)
			if gotFixed != tt.wantFixed || gotSecond != tt.wantSecond {
				t.Fatalf("detectFixedVideoDurationSeconds(%q) = (%v, %d), want (%v, %d)", tt.modelName, gotFixed, gotSecond, tt.wantFixed, tt.wantSecond)
			}
		})
	}
}

func TestDetectVideoResolution(t *testing.T) {
	cases := []struct {
		name      string
		modelName string
		want      string
	}{
		{name: "480p", modelName: "mg-seedance2.0 -480p fast-15s", want: "480P"},
		{name: "720p", modelName: "sh-seedance2.0-pro 720p-nv-15s", want: "720P"},
		{name: "1080p", modelName: "mg-seedance2.0 -1080p-15s", want: "1080P"},
		{name: "unmarked", modelName: "seedance2.0 fast", want: ""},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			if got := detectVideoResolution(tt.modelName); got != tt.want {
				t.Fatalf("detectVideoResolution(%q) = %q, want %q", tt.modelName, got, tt.want)
			}
		})
	}
}
