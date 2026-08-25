package controller

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
)

func newVideoContentRequest(ctx context.Context, incoming *http.Request, videoURL string, baseURL string, bearerKey string, googleKey string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, videoURL, nil)
	if err != nil {
		return nil, err
	}
	if incoming != nil {
		if value := incoming.Header.Get("Range"); value != "" {
			req.Header.Set("Range", value)
		}
		if value := incoming.Header.Get("If-Range"); value != "" {
			req.Header.Set("If-Range", value)
		}
	}
	if googleKey != "" {
		req.Header.Set("x-goog-api-key", googleKey)
	}
	if bearerKey != "" && sameURLOrigin(videoURL, baseURL) {
		req.Header.Set("Authorization", "Bearer "+bearerKey)
	}
	return req, nil
}

func sameURLOrigin(left string, right string) bool {
	leftURL, leftErr := url.Parse(left)
	rightURL, rightErr := url.Parse(right)
	if leftErr != nil || rightErr != nil {
		return false
	}
	return strings.EqualFold(leftURL.Scheme, rightURL.Scheme) && strings.EqualFold(leftURL.Host, rightURL.Host)
}

func shouldRefreshVideoURL(statusCode int) bool {
	switch statusCode {
	case http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusGone:
		return true
	default:
		return false
	}
}

func refreshVideoResultURL(channel *model.Channel, task *model.Task) (string, error) {
	if channel == nil || task == nil {
		return "", fmt.Errorf("invalid channel or task")
	}
	adaptor := relay.GetTaskAdaptorForChannel(task.Platform, task.ChannelId)
	if adaptor == nil {
		return "", fmt.Errorf("video task adaptor not found")
	}
	baseURL := channel.GetBaseURL()
	if baseURL == "" {
		baseURL = constant.ChannelBaseURLs[channel.Type]
	}
	key := channel.Key
	if task.PrivateData.Key != "" {
		key = task.PrivateData.Key
	}
	resp, err := adaptor.FetchTask(baseURL, key, map[string]any{
		"task_id": task.GetUpstreamTaskID(),
		"action":  task.Action,
	}, channel.GetSetting().Proxy)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("video status upstream returned %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return "", err
	}
	taskInfo, err := adaptor.ParseTaskResult(body)
	if err != nil {
		return "", err
	}
	if taskInfo == nil || strings.TrimSpace(taskInfo.Url) == "" {
		return "", fmt.Errorf("video status response contains no result URL")
	}

	refreshedURL := strings.TrimSpace(taskInfo.Url)
	task.PrivateData.ResultURL = refreshedURL
	if task.ID > 0 && model.DB != nil {
		if err := model.DB.Model(&model.Task{}).Where("id = ?", task.ID).Update("private_data", task.PrivateData).Error; err != nil {
			logger.LogError(context.Background(), fmt.Sprintf("Failed to persist refreshed video URL for task %s: %s", task.TaskID, err.Error()))
		}
	}
	return refreshedURL, nil
}

func videoURLForLog(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "[invalid video URL]"
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}
