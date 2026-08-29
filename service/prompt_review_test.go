/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package service

import (
	"context"
	"testing"

	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/require"
)

func TestParsePromptReviewResult(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		want      PromptReviewResult
		wantError bool
	}{
		{
			name:    "plain json",
			content: `{"decision":"allow","categories":[],"confidence":0.99,"reason_code":"benign"}`,
			want:    PromptReviewResult{Decision: "allow", Categories: []string{}, Confidence: 0.99, ReasonCode: "benign"},
		},
		{
			name:    "markdown wrapper",
			content: "```json\n{\"decision\":\"block\",\"categories\":[\"fraud\"],\"confidence\":0.91,\"reason_code\":\"payment_theft\"}\n```",
			want:    PromptReviewResult{Decision: "block", Categories: []string{"fraud"}, Confidence: 0.91, ReasonCode: "payment_theft"},
		},
		{
			name:      "invalid decision",
			content:   `{"decision":"maybe","confidence":0.5}`,
			wantError: true,
		},
		{
			name:      "invalid confidence",
			content:   `{"decision":"review","confidence":2}`,
			wantError: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := parsePromptReviewResult(test.content)
			if test.wantError {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, test.want.Decision, got.Decision)
			require.Equal(t, test.want.Confidence, got.Confidence)
			require.Equal(t, test.want.ReasonCode, got.ReasonCode)
			require.Equal(t, test.want.Categories, got.Categories)
		})
	}
}

func TestPromptReviewAllowsHonorsThreshold(t *testing.T) {
	original := setting.PromptReviewBlockThreshold
	t.Cleanup(func() { setting.PromptReviewBlockThreshold = original })

	setting.PromptReviewBlockThreshold = 0.85
	require.True(t, PromptReviewAllows(PromptReviewResult{Decision: "allow", Confidence: 0.1}))
	require.True(t, PromptReviewAllows(PromptReviewResult{Decision: "block", Confidence: 0.84}))
	require.False(t, PromptReviewAllows(PromptReviewResult{Decision: "block", Confidence: 0.85}))
	require.False(t, PromptReviewAllows(PromptReviewResult{Decision: "review", Confidence: 0.99}))
}

func TestReviewPromptAfterKeywordUsesKeywordGate(t *testing.T) {
	originalEnabled := setting.PromptReviewEnabled
	originalWords := setting.SensitiveWords
	t.Cleanup(func() {
		setting.PromptReviewEnabled = originalEnabled
		setting.SensitiveWords = originalWords
	})

	setting.PromptReviewEnabled = false
	setting.SensitiveWords = []string{"fixture_keyword"}

	result, words, blocked, err := ReviewPromptAfterKeyword(context.Background(), "ordinary text")
	require.NoError(t, err)
	require.False(t, blocked)
	require.Empty(t, words)
	require.Equal(t, "keyword_miss", result.ReasonCode)
}

func TestReviewPromptAfterKeywordReviewsTextWhenEnabled(t *testing.T) {
	originalEnabled := setting.PromptReviewEnabled
	originalToken := setting.PromptReviewToken
	originalWords := setting.SensitiveWords
	t.Cleanup(func() {
		setting.PromptReviewEnabled = originalEnabled
		setting.PromptReviewToken = originalToken
		setting.SensitiveWords = originalWords
	})

	setting.PromptReviewEnabled = true
	setting.PromptReviewToken = ""
	setting.SensitiveWords = nil
	_, words, blocked, err := ReviewPromptAfterKeyword(context.Background(), "ordinary text")
	require.Error(t, err)
	require.True(t, blocked)
	require.Empty(t, words)
}
