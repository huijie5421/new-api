package controller

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

type captureResponseWriter struct {
	gin.ResponseWriter
	body bytes.Buffer
}

func (w *captureResponseWriter) Write(data []byte) (int, error) {
	w.body.Write(data)
	return w.ResponseWriter.Write(data)
}

type aigcAsset struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Status    string `json:"status"`
	Title     string `json:"title"`
	Prompt    string `json:"prompt"`
	Model     string `json:"model"`
	URL       string `json:"url,omitempty"`
	TaskID    string `json:"task_id,omitempty"`
	Quota     int    `json:"quota"`
	CreatedAt int64  `json:"created_at"`
	Meta      string `json:"meta,omitempty"`
}

type aigcAssetBatchRequest struct {
	Action string   `json:"action"`
	IDs    []string `json:"ids"`
}

type aigcWorkshopKind string

const (
	aigcWorkshopKindImage aigcWorkshopKind = "image"
	aigcWorkshopKindVideo aigcWorkshopKind = "video"
	aigcWorkshopKindText  aigcWorkshopKind = "text"
)

type aigcWorkshopModelConfig struct {
	ImageGroups []string `json:"image_groups"`
	VideoGroups []string `json:"video_groups"`
	TextGroups  []string `json:"text_groups"`
}

type aigcWorkshopModelRequest struct {
	Model string `json:"model"`
}

type aigcWorkshopEstimateRequest struct {
	Module             string   `json:"module"`
	Model              string   `json:"model"`
	Group              string   `json:"group,omitempty"`
	Prompt             string   `json:"prompt,omitempty"`
	N                  int      `json:"n,omitempty"`
	Count              int      `json:"count,omitempty"`
	Size               string   `json:"size,omitempty"`
	AspectRatio        string   `json:"aspect_ratio,omitempty"`
	Resolution         string   `json:"resolution,omitempty"`
	Quality            string   `json:"quality,omitempty"`
	Seconds            string   `json:"seconds,omitempty"`
	MySeconds          string   `json:"mySeconds,omitempty"`
	InputReference     string   `json:"input_reference,omitempty"`
	ReferenceImageURLs []string `json:"reference_image_urls,omitempty"`
	ReferenceVideos    []string `json:"reference_videos,omitempty"`
	ReferenceAudios    []string `json:"reference_audios,omitempty"`
}

type aigcWorkshopEstimateResponse struct {
	Module string `json:"module"`
	Model  string `json:"model"`
	Group  string `json:"group"`
	Quota  int    `json:"quota"`
	Count  int    `json:"count"`
}

type aigcWorkshopModelOption struct {
	Model                            string  `json:"model"`
	Group                            string  `json:"group"`
	Label                            string  `json:"label"`
	Resolution                       string  `json:"resolution,omitempty"`
	DurationControlled               bool    `json:"duration_controlled,omitempty"`
	FixedSeconds                     bool    `json:"fixed_seconds,omitempty"`
	FixedPrice                       bool    `json:"fixed_price,omitempty"`
	FixedDurationSeconds             int     `json:"fixed_duration_seconds,omitempty"`
	MaxDurationSeconds               int     `json:"max_duration_seconds,omitempty"`
	RequiredImageCount               int     `json:"required_image_count,omitempty"`
	MaxReferenceImages               int     `json:"max_reference_images,omitempty"`
	MaxReferenceVideos               int     `json:"max_reference_videos,omitempty"`
	MaxReferenceAudios               int     `json:"max_reference_audios,omitempty"`
	MaxReferenceVideoDurationSeconds int     `json:"max_reference_video_duration_seconds,omitempty"`
	VideoReferencesDisabled          bool    `json:"video_references_disabled,omitempty"`
	AudioReferencesDisabled          bool    `json:"audio_references_disabled,omitempty"`
	GroupRatio                       float64 `json:"group_ratio"`
	QuotaType                        int     `json:"quota_type"`
	BillingMode                      string  `json:"billing_mode"`
	PriceUnit                        string  `json:"price_unit"`
	UnitPrice                        float64 `json:"unit_price"`
	InputPrice                       float64 `json:"input_price"`
	OutputPrice                      float64 `json:"output_price"`
}

type aigcWorkshopModels struct {
	Image []aigcWorkshopModelOption `json:"image"`
	Video []aigcWorkshopModelOption `json:"video"`
	Text  []aigcWorkshopModelOption `json:"text"`
}

const aigcAssetRetentionSeconds int64 = 30 * 24 * 60 * 60
const aigcAssetMaxMetaBytes = 512
const aigcWorkshopModelConfigOptionKey = "AigcWorkshopModelGroups"
const aigcWorkshopGroupHeader = "X-AIGC-Group"
const aigcWorkshopEncodedGroupPrefix = "uri:"

var defaultAigcWorkshopModelConfig = aigcWorkshopModelConfig{
	ImageGroups: []string{"GPT生图专用", "AzGPT生图", "abobe渠道生图"},
	VideoGroups: []string{"即梦", "MiniMax/可灵视频"},
	TextGroups:  []string{"GPT PLUS号池", "GPT PRO号池", "CCMAX极速版"},
}

func AigcWorkshopModelBinding() gin.HandlerFunc {
	return func(c *gin.Context) {
		kind, ok := aigcWorkshopKindFromPath(c.Request.URL.Path)
		if !ok {
			c.Next()
			return
		}

		var request aigcWorkshopModelRequest
		if err := common.UnmarshalBodyReusable(c, &request); err != nil {
			abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
			return
		}
		modelName := strings.TrimSpace(request.Model)
		if modelName == "" {
			abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, errors.New("model is required"))
			return
		}

		userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
		if userGroup == "" {
			userGroup = c.GetString("group")
		}
		requestedGroup, err := decodeAigcWorkshopGroupHeader(c.GetHeader(aigcWorkshopGroupHeader))
		if err != nil {
			abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
			return
		}
		option, err := resolveAigcWorkshopModelOption(kind, userGroup, modelName, requestedGroup)
		if err != nil {
			abortAigcWorkshopOpenAIError(c, http.StatusForbidden, err)
			return
		}

		common.SetContextKey(c, constant.ContextKeyUsingGroup, option.Group)
		common.SetContextKey(c, constant.ContextKeyTokenGroup, option.Group)
		c.Set("aigc_model_group", option.Group)
		c.Set("aigc_model_kind", string(kind))
		c.Next()
	}
}

func GetAigcWorkshopModels(c *gin.Context) {
	userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
	if userGroup == "" {
		userGroup = c.GetString("group")
	}
	common.ApiSuccess(c, aigcWorkshopModels{
		Image: buildAigcWorkshopModelOptions(aigcWorkshopKindImage, userGroup),
		Video: buildAigcWorkshopModelOptions(aigcWorkshopKindVideo, userGroup),
		Text:  buildAigcWorkshopModelOptions(aigcWorkshopKindText, userGroup),
	})
}

func AigcEstimate(c *gin.Context) {
	var request aigcWorkshopEstimateRequest
	if err := common.UnmarshalBodyReusable(c, &request); err != nil {
		common.ApiError(c, err)
		return
	}

	kind, err := aigcWorkshopKindFromModule(request.Module)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	modelName := strings.TrimSpace(request.Model)
	if modelName == "" {
		common.ApiErrorMsg(c, "model is required")
		return
	}

	userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
	if userGroup == "" {
		userGroup = c.GetString("group")
	}
	requestedGroup, err := decodeAigcWorkshopGroupHeader(c.GetHeader(aigcWorkshopGroupHeader))
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if requestedGroup == "" {
		requestedGroup = strings.TrimSpace(request.Group)
	}

	option, err := resolveAigcWorkshopModelOption(kind, userGroup, modelName, requestedGroup)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	common.SetContextKey(c, constant.ContextKeyUsingGroup, option.Group)
	common.SetContextKey(c, constant.ContextKeyTokenGroup, option.Group)

	var quota int
	switch kind {
	case aigcWorkshopKindImage:
		quota, err = estimateAigcImageQuota(c, option.Model, request)
	case aigcWorkshopKindVideo:
		quota, err = estimateAigcVideoQuota(c, option.Model, option.Group, request)
	default:
		err = fmt.Errorf("unsupported module %s", request.Module)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, aigcWorkshopEstimateResponse{
		Module: string(kind),
		Model:  option.Model,
		Group:  option.Group,
		Quota:  quota,
		Count:  estimateAigcWorkshopCount(kind, request),
	})
}

func AigcImageGenerations(c *gin.Context) {
	if !c.GetBool("aigc_image_async_worker") {
		enqueueAigcImageGeneration(c)
		return
	}
	relayAigcImageGeneration(c)
}

func relayAigcImageGeneration(c *gin.Context) *captureResponseWriter {
	if !prepareAigcWorkshopRelay(c, "aigc-image") {
		return nil
	}
	capture := &captureResponseWriter{ResponseWriter: c.Writer}
	c.Writer = capture
	if aigcImageRequestUsesEdit(c) {
		c.Request.URL.Path = "/v1/images/edits"
		restoreRequest, err := installAigcWorkshopImageEditMultipart(c)
		if err != nil {
			abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
			return capture
		}
		Relay(c, types.RelayFormatOpenAIImage)
		restoreRequest()
	} else {
		c.Request.URL.Path = "/v1/images/generations"
		Relay(c, types.RelayFormatOpenAIImage)
	}
	if c.Writer.Status() < http.StatusBadRequest {
		logID := attachAigcImageAssetsToLog(c, capture.body.Bytes())
		if logID > 0 {
			rewritten, err := rewriteAigcImageTaskResponse(capture.body.Bytes(), logID)
			if err != nil {
				common.SysLog("failed to rewrite aigc image task response: " + err.Error())
			} else {
				capture.body.Reset()
				_, _ = capture.body.Write(rewritten)
			}
		}
	}
	return capture
}

func aigcImageRequestUsesEdit(c *gin.Context) bool {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return false
	}
	body, err := storage.Bytes()
	if err != nil {
		return false
	}
	var request struct {
		Image  json.RawMessage `json:"image"`
		Images json.RawMessage `json:"images"`
		Mask   json.RawMessage `json:"mask"`
	}
	if err = common.Unmarshal(body, &request); err != nil {
		return false
	}
	return hasAigcImageValue(request.Image) ||
		hasAigcImageValue(request.Images) ||
		hasAigcImageValue(request.Mask)
}

func hasAigcImageValue(raw json.RawMessage) bool {
	value := bytes.TrimSpace(raw)
	switch string(value) {
	case "", "null", "\"\"", "[]", "{}":
		return false
	default:
		return true
	}
}

func enqueueAigcImageGeneration(c *gin.Context) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
		return
	}
	body, err := storage.Bytes()
	if err != nil {
		abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
		return
	}
	body, err = normalizeAigcWorkshopImageRequest(body)
	if err != nil {
		abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
		return
	}

	var request aigcWorkshopImageRequest
	if err = common.Unmarshal(body, &request); err != nil {
		abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
		return
	}
	task := &model.Task{
		TaskID:     model.GenerateTaskID(),
		Platform:   constant.TaskPlatform("aigc-image"),
		UserId:     c.GetInt("id"),
		Group:      c.GetString("aigc_model_group"),
		ChannelId:  common.GetContextKeyInt(c, constant.ContextKeyChannelId),
		Action:     "aigc-image",
		Status:     model.TaskStatusSubmitted,
		Progress:   "0%",
		SubmitTime: time.Now().Unix(),
		Properties: model.Properties{
			Input:             strings.TrimSpace(request.Prompt),
			OriginModelName:   strings.TrimSpace(request.Model),
			UpstreamModelName: strings.TrimSpace(request.Model),
		},
	}
	if err = task.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}

	workerStorage, err := common.CreateBodyStorage(body)
	if err != nil {
		markAigcImageTaskFailure(task, err.Error())
		common.ApiError(c, err)
		return
	}
	worker := c.Copy()
	worker.Request = c.Request.Clone(context.Background())
	worker.Request.Body = io.NopCloser(workerStorage)
	worker.Request.ContentLength = int64(len(body))
	worker.Set(common.KeyBodyStorage, workerStorage)
	worker.Set("aigc_image_async_worker", true)
	recorder := httptest.NewRecorder()
	workerContext, _ := gin.CreateTestContext(recorder)
	worker.Writer = workerContext.Writer

	gopool.Go(func() {
		defer workerStorage.Close()
		capture := relayAigcImageGeneration(worker)
		if capture == nil {
			markAigcImageTaskFailure(task, "图片任务初始化失败")
			return
		}
		responseBody := append([]byte(nil), capture.body.Bytes()...)
		if capture.Status() >= http.StatusBadRequest {
			markAigcImageTaskFailure(task, aigcImageTaskError(responseBody))
			return
		}
		task.Status = model.TaskStatusSuccess
		task.Progress = "100%"
		task.FinishTime = time.Now().Unix()
		task.Data = responseBody
		if err := task.Update(); err != nil {
			common.SysError("failed to update aigc image task: " + err.Error())
		}
	})

	c.JSON(http.StatusAccepted, gin.H{
		"id":      task.TaskID,
		"task_id": task.TaskID,
		"status":  "processing",
	})
}

type aigcWorkshopImageRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

func markAigcImageTaskFailure(task *model.Task, reason string) {
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"
	task.FinishTime = time.Now().Unix()
	task.FailReason = reason
	if err := task.Update(); err != nil {
		common.SysError("failed to update failed aigc image task: " + err.Error())
	}
}

func aigcImageTaskError(body []byte) string {
	var response struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := common.Unmarshal(body, &response); err == nil && response.Error.Message != "" {
		return response.Error.Message
	}
	if message := strings.TrimSpace(string(body)); message != "" {
		return message
	}
	return "图片生成失败"
}

func markAigcVideoTaskFailure(task *model.Task, reason string) {
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"
	task.FinishTime = time.Now().Unix()
	task.FailReason = reason
	if err := task.Update(); err != nil {
		common.SysError("failed to update failed aigc video task: " + err.Error())
	}
}

func aigcVideoTaskError(body []byte) string {
	var response struct {
		Message string `json:"message"`
		Error   struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := common.Unmarshal(body, &response); err == nil {
		if response.Error.Message != "" {
			return response.Error.Message
		}
		if response.Message != "" {
			return response.Message
		}
	}
	if message := strings.TrimSpace(string(body)); message != "" {
		return message
	}
	return "视频生成失败"
}

func AigcImageGenerationFetch(c *gin.Context) {
	task, exist, err := model.GetByTaskId(c.GetInt("id"), c.Param("task_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !exist || task.Platform != constant.TaskPlatform("aigc-image") {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "task not found"}})
		return
	}
	status := "processing"
	switch task.Status {
	case model.TaskStatusSuccess:
		status = "succeeded"
	case model.TaskStatusFailure:
		status = "failed"
	}
	if len(task.Data) == 0 {
		c.JSON(http.StatusOK, gin.H{"id": task.TaskID, "task_id": task.TaskID, "status": status, "error": gin.H{"message": task.FailReason}})
		return
	}
	var response map[string]any
	if err := common.Unmarshal(task.Data, &response); err != nil {
		common.ApiError(c, err)
		return
	}
	response["id"] = task.TaskID
	response["task_id"] = task.TaskID
	response["status"] = status
	c.JSON(http.StatusOK, response)
}

func AigcChatCompletions(c *gin.Context) {
	if !prepareAigcWorkshopRelay(c, "aigc-chat") {
		return
	}
	c.Request.URL.Path = "/v1/chat/completions"
	Relay(c, types.RelayFormatOpenAI)
}

func AigcVideoGenerations(c *gin.Context) {
	if !prepareAigcWorkshopRelay(c, "aigc-video") {
		return
	}
	enqueueAigcVideoGeneration(c)
}

func enqueueAigcVideoGeneration(c *gin.Context) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
		return
	}
	body, err := storage.Bytes()
	if err != nil {
		abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
		return
	}

	var request relaycommon.TaskSubmitReq
	if err = common.Unmarshal(body, &request); err != nil {
		abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
		return
	}
	if err = request.NormalizeVideoRequest(); err != nil {
		abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
		return
	}
	if taskErr := reviewTaskPrompt(c, request.Model); taskErr != nil {
		abortAigcWorkshopOpenAIError(c, taskErr.StatusCode, taskErr.Error)
		return
	}
	if err = validateAigcWorkshopVideoReferenceURLs(request); err != nil {
		abortAigcWorkshopOpenAIError(c, http.StatusBadRequest, err)
		return
	}
	task := &model.Task{
		TaskID:     model.GenerateTaskID(),
		Platform:   constant.TaskPlatformAigcVideo,
		UserId:     c.GetInt("id"),
		Group:      c.GetString("aigc_model_group"),
		ChannelId:  common.GetContextKeyInt(c, constant.ContextKeyChannelId),
		Action:     "aigc-video",
		Status:     model.TaskStatusSubmitted,
		Progress:   "0%",
		SubmitTime: time.Now().Unix(),
		Properties: model.Properties{
			Input:             strings.TrimSpace(request.Prompt),
			OriginModelName:   strings.TrimSpace(request.Model),
			UpstreamModelName: strings.TrimSpace(request.Model),
			ChannelType:       common.GetContextKeyInt(c, constant.ContextKeyChannelType),
		},
	}
	if err = task.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}

	workerStorage, err := common.CreateBodyStorage(body)
	if err != nil {
		markAigcVideoTaskFailure(task, err.Error())
		common.ApiError(c, err)
		return
	}
	worker := c.Copy()
	worker.Request = c.Request.Clone(context.Background())
	worker.Request.Body = io.NopCloser(workerStorage)
	worker.Set(common.KeyBodyStorage, workerStorage)
	worker.Set("aigc_video_task_id", task.TaskID)
	recorder := httptest.NewRecorder()
	workerContext, _ := gin.CreateTestContext(recorder)
	worker.Writer = workerContext.Writer

	gopool.Go(func() {
		defer workerStorage.Close()
		capture := relayAigcVideoGeneration(worker)
		if capture == nil {
			markAigcVideoTaskFailure(task, "视频任务初始化失败")
			return
		}
		if capture.Status() >= http.StatusBadRequest {
			markAigcVideoTaskFailure(task, aigcVideoTaskError(capture.body.Bytes()))
		}
	})

	c.JSON(http.StatusAccepted, gin.H{
		"id":      task.TaskID,
		"task_id": task.TaskID,
		"status":  "processing",
	})
}

func validateAigcWorkshopVideoReferenceURLs(request relaycommon.TaskSubmitReq) error {
	fields := []struct {
		name   string
		values []string
	}{
		{name: "reference_image_urls", values: request.ReferenceImageURLs},
		{name: "reference_videos", values: request.ReferenceVideos},
		{name: "reference_audios", values: request.ReferenceAudios},
	}
	for _, field := range fields {
		for index, value := range field.values {
			parsed, err := url.Parse(strings.TrimSpace(value))
			if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
				return fmt.Errorf("%s[%d] must use a public http/https URL", field.name, index)
			}
		}
	}
	return nil
}

func relayAigcVideoGeneration(c *gin.Context) *captureResponseWriter {
	if !prepareAigcWorkshopRelay(c, "aigc-video") {
		return nil
	}
	capture := &captureResponseWriter{ResponseWriter: c.Writer}
	c.Writer = capture
	c.Request.URL.Path = "/v1/videos"
	RelayTask(c)
	return capture
}

func aigcVideoContentURL(taskID string) string {
	return "/api/aigc/videos/" + taskID + "/content"
}

func AigcVideoGenerationFetch(c *gin.Context) {
	task, exist, err := model.GetByTaskId(c.GetInt("id"), c.Param("task_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !exist {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "task not found"}})
		return
	}
	status := "processing"
	switch task.Status {
	case model.TaskStatusSuccess:
		status = "succeeded"
	case model.TaskStatusFailure:
		status = "failed"
	}
	response := gin.H{
		"id":      task.TaskID,
		"task_id": task.TaskID,
		"status":  status,
	}
	if status == "succeeded" {
		response["url"] = aigcVideoContentURL(task.TaskID)
	}
	if status == "failed" {
		message := task.FailReason
		if message == "" {
			message = "视频生成失败"
		}
		response["error"] = gin.H{"message": message}
	}
	c.JSON(http.StatusOK, response)
}

func GetAigcAssets(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	assetType := strings.ToLower(strings.TrimSpace(c.DefaultQuery("type", "all")))
	userId := c.GetInt("id")

	var (
		items []aigcAsset
		total int64
		err   error
	)
	switch assetType {
	case "image":
		items, total, err = getAigcImageAssets(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	case "video":
		items, total, err = getAigcVideoAssets(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	default:
		items, total, err = getAigcMixedAssets(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func GetAigcImageAssetContent(c *gin.Context) {
	var logID int
	var assetIndex int
	if _, err := fmt.Sscanf(c.Param("asset_id"), "image-%d-%d", &logID, &assetIndex); err != nil || assetIndex < 1 {
		c.Status(http.StatusNotFound)
		return
	}

	var log model.Log
	if err := model.LOG_DB.Select("id", "other").Where("id = ? AND user_id = ?", logID, c.GetInt("id")).First(&log).Error; err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	var other struct {
		Assets []struct {
			URL    string `json:"url"`
			Hidden bool   `json:"hidden"`
		} `json:"aigc_assets"`
	}
	if err := common.UnmarshalJsonStr(log.Other, &other); err != nil || assetIndex > len(other.Assets) || other.Assets[assetIndex-1].Hidden {
		c.Status(http.StatusNotFound)
		return
	}

	dataURL := other.Assets[assetIndex-1].URL
	comma := strings.IndexByte(dataURL, ',')
	if comma < 0 {
		c.Status(http.StatusNotFound)
		return
	}
	header := strings.ToLower(dataURL[:comma])
	if !strings.HasPrefix(header, "data:image/") || !strings.HasSuffix(header, ";base64") {
		c.Status(http.StatusNotFound)
		return
	}
	mimeType := strings.TrimSuffix(strings.TrimPrefix(header, "data:"), ";base64")
	if mimeType != "image/png" && mimeType != "image/jpeg" && mimeType != "image/webp" && mimeType != "image/gif" {
		c.Status(http.StatusNotFound)
		return
	}
	content, err := base64.StdEncoding.DecodeString(dataURL[comma+1:])
	if err != nil {
		content, err = base64.RawStdEncoding.DecodeString(dataURL[comma+1:])
	}
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", "private, max-age=86400")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, mimeType, content)
}

func DeleteAigcAsset(c *gin.Context) {
	if err := hideAigcAsset(c.GetInt("id"), c.Param("asset_id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func BatchManageAigcAssets(c *gin.Context) {
	var request aigcAssetBatchRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiError(c, err)
		return
	}
	if len(request.IDs) == 0 {
		common.ApiErrorMsg(c, "ids is required")
		return
	}

	for _, assetID := range request.IDs {
		switch request.Action {
		case "delete":
			if err := hideAigcAsset(c.GetInt("id"), assetID); err != nil {
				common.ApiError(c, err)
				return
			}
		default:
			common.ApiErrorMsg(c, "invalid action")
			return
		}
	}
	common.ApiSuccess(c, nil)
}

func prepareAigcWorkshopRelay(c *gin.Context, tokenName string) bool {
	useAccessToken := c.GetBool("use_access_token")
	if useAccessToken {
		c.JSON(http.StatusForbidden, gin.H{
			"error": types.NewError(
				errors.New("暂不支持使用 access token"),
				types.ErrorCodeAccessDenied,
				types.ErrOptionWithSkipRetry(),
			).ToOpenAIError(),
		})
		return false
	}

	userId := c.GetInt("id")
	userCache, err := model.GetUserCache(userId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": types.NewError(
				err,
				types.ErrorCodeQueryDataError,
				types.ErrOptionWithSkipRetry(),
			).ToOpenAIError(),
		})
		return false
	}
	userCache.WriteContext(c)

	usingGroup := c.GetString("aigc_model_group")
	if usingGroup == "" {
		usingGroup = common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	}
	if usingGroup == "" {
		usingGroup = userCache.Group
	}
	common.SetContextKey(c, constant.ContextKeyUsingGroup, usingGroup)
	common.SetContextKey(c, constant.ContextKeyTokenGroup, usingGroup)

	tempToken := newAigcWorkshopToken(userId, tokenName, usingGroup)
	if err = middleware.SetupContextForToken(c, tempToken); err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"error": types.NewError(
				err,
				types.ErrorCodeAccessDenied,
				types.ErrOptionWithSkipRetry(),
			).ToOpenAIError(),
		})
		return false
	}
	return true
}

func newAigcWorkshopToken(userID int, tokenName string, usingGroup string) *model.Token {
	return &model.Token{
		UserId:         userID,
		Name:           fmt.Sprintf("%s-%s", tokenName, usingGroup),
		Group:          usingGroup,
		UnlimitedQuota: true,
	}
}

func aigcWorkshopKindFromPath(path string) (aigcWorkshopKind, bool) {
	switch {
	case strings.Contains(path, "/api/aigc/images/generations"):
		return aigcWorkshopKindImage, true
	case strings.Contains(path, "/api/aigc/video/generations"):
		return aigcWorkshopKindVideo, true
	case strings.Contains(path, "/api/aigc/chat/completions"):
		return aigcWorkshopKindText, true
	default:
		return "", false
	}
}

func aigcWorkshopKindFromModule(module string) (aigcWorkshopKind, error) {
	switch strings.ToLower(strings.TrimSpace(module)) {
	case "image":
		return aigcWorkshopKindImage, nil
	case "video":
		return aigcWorkshopKindVideo, nil
	case "text":
		return aigcWorkshopKindText, nil
	default:
		return "", fmt.Errorf("unsupported module %s", module)
	}
}

func estimateAigcWorkshopCount(kind aigcWorkshopKind, request aigcWorkshopEstimateRequest) int {
	switch kind {
	case aigcWorkshopKindImage:
		if request.N > 0 {
			return request.N
		}
	case aigcWorkshopKindVideo:
		if request.Count > 0 {
			return request.Count
		}
	}
	return 1
}

func estimateAigcImageQuota(c *gin.Context, modelName string, request aigcWorkshopEstimateRequest) (int, error) {
	if request.N < 0 || request.N > aigcImageMaxCount {
		return 0, fmt.Errorf("n must be between 1 and %d", aigcImageMaxCount)
	}
	imageRequest := dto.ImageRequest{
		Model:   modelName,
		Prompt:  strings.TrimSpace(request.Prompt),
		Size:    strings.TrimSpace(request.Size),
		Quality: strings.TrimSpace(request.Quality),
	}
	if request.N > 0 {
		imageRequest.N = common.GetPointer(uint(request.N))
	}

	info, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAIImage, &imageRequest, nil)
	if err != nil {
		return 0, err
	}
	if err := serviceEstimateAigcModelMapping(c, info, &imageRequest); err != nil {
		return 0, err
	}

	meta := imageRequest.GetTokenCountMeta()
	tokens, err := service.EstimateRequestToken(c, meta, info)
	if err != nil {
		return 0, err
	}
	info.SetEstimatePromptTokens(tokens)

	priceData, err := helper.ModelPriceHelper(c, info, tokens, meta)
	if err != nil {
		return 0, err
	}

	return priceData.QuotaToPreConsume, nil
}

func estimateAigcVideoQuota(c *gin.Context, modelName string, group string, request aigcWorkshopEstimateRequest) (int, error) {
	info, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		return 0, err
	}

	taskRequest := relaycommon.TaskSubmitReq{
		Prompt:             strings.TrimSpace(request.Prompt),
		Model:              modelName,
		Size:               strings.TrimSpace(request.Size),
		AspectRatio:        strings.TrimSpace(request.AspectRatio),
		Resolution:         strings.TrimSpace(request.Resolution),
		Seconds:            strings.TrimSpace(request.Seconds),
		MySeconds:          strings.TrimSpace(request.MySeconds),
		InputReference:     strings.TrimSpace(request.InputReference),
		ReferenceImageURLs: append([]string(nil), request.ReferenceImageURLs...),
		ReferenceVideos:    append([]string(nil), request.ReferenceVideos...),
		ReferenceAudios:    append([]string(nil), request.ReferenceAudios...),
	}
	if err := taskRequest.NormalizeVideoRequest(); err != nil {
		return 0, err
	}
	if taskRequest.Seconds != "" {
		if seconds, parseErr := strconv.Atoi(taskRequest.Seconds); parseErr == nil {
			taskRequest.Duration = seconds
		}
	}
	c.Set("task_request", taskRequest)

	if taskRequest.HasReferenceMedia() {
		info.Action = constant.TaskActionGenerate
	} else {
		info.Action = constant.TaskActionTextGenerate
	}
	info.OriginModelName = modelName
	info.UpstreamModelName = modelName

	if err := serviceEstimateAigcModelMapping(c, info, nil); err != nil {
		return 0, err
	}

	platform, channelType, channelID, err := resolveAigcWorkshopTaskPlatform(modelName, group)
	if err != nil {
		return 0, err
	}
	adaptor := relay.GetTaskAdaptorForChannel(platform, channelID)
	if adaptor == nil {
		return 0, fmt.Errorf("video adaptor not found for model %s", modelName)
	}
	info.ChannelMeta = &relaycommon.ChannelMeta{ChannelType: channelType}
	adaptor.Init(info)

	priceData, err := helper.ModelPriceHelperPerCall(c, info)
	if err != nil {
		return 0, err
	}

	info.PriceData = priceData
	if estimatedRatios := adaptor.EstimateBilling(c, info); len(estimatedRatios) > 0 {
		for key, ratio := range estimatedRatios {
			info.PriceData.AddOtherRatio(key, ratio)
		}
	}

	quota := info.PriceData.Quota
	if !common.StringsContains(constant.TaskPricePatches, modelName) {
		quota = common.QuotaFromFloat(info.PriceData.ApplyOtherRatiosToFloat(float64(quota)))
	}

	count := estimateAigcWorkshopCount(aigcWorkshopKindVideo, request)
	quota = common.QuotaFromFloat(float64(quota) * float64(count))
	return quota, nil
}

func serviceEstimateAigcModelMapping(c *gin.Context, info *relaycommon.RelayInfo, request dto.Request) error {
	if err := helper.ModelMappedHelper(c, info, request); err != nil {
		return err
	}
	return nil
}

func resolveAigcWorkshopTaskPlatform(modelName string, group string) (constant.TaskPlatform, int, int, error) {
	channelTypes, err := model.GetPreferredModelOwnerChannelTypes([]string{modelName}, []string{group})
	if err != nil {
		return "", 0, 0, err
	}
	channelType, ok := channelTypes[modelName]
	if !ok {
		return "", 0, 0, fmt.Errorf("no enabled video channel found for model %s in group %s", modelName, group)
	}
	channelIDs, err := model.GetPreferredModelOwnerChannelIDs([]string{modelName}, []string{group})
	if err != nil {
		return "", 0, 0, err
	}
	return constant.TaskPlatform(strconv.Itoa(channelType)), channelType, channelIDs[modelName], nil
}

func getAigcWorkshopModelConfig() aigcWorkshopModelConfig {
	config := defaultAigcWorkshopModelConfig
	common.OptionMapRWMutex.RLock()
	raw := strings.TrimSpace(common.OptionMap[aigcWorkshopModelConfigOptionKey])
	common.OptionMapRWMutex.RUnlock()
	if raw == "" {
		return config
	}
	var custom aigcWorkshopModelConfig
	if err := common.UnmarshalJsonStr(raw, &custom); err != nil {
		common.SysLog("failed to parse AIGC workshop model config: " + err.Error())
		return config
	}
	if len(custom.ImageGroups) > 0 {
		config.ImageGroups = cleanStringList(custom.ImageGroups)
	}
	if len(custom.VideoGroups) > 0 {
		config.VideoGroups = cleanStringList(custom.VideoGroups)
	}
	if len(custom.TextGroups) > 0 {
		config.TextGroups = cleanStringList(custom.TextGroups)
	}
	return config
}

func buildAigcWorkshopModelOptions(kind aigcWorkshopKind, userGroup string) []aigcWorkshopModelOption {
	groups := aigcWorkshopGroupsForKind(getAigcWorkshopModelConfig(), kind)
	options := make([]aigcWorkshopModelOption, 0)
	seen := make(map[string]bool)
	for _, group := range groups {
		if !canUseAigcWorkshopGroup(userGroup, group) {
			continue
		}
		models := model.GetGroupEnabledModels(group)
		sort.Strings(models)
		for _, modelName := range models {
			modelName = strings.TrimSpace(modelName)
			if modelName == "" || !includeAigcWorkshopModel(kind, modelName) {
				continue
			}
			key := group + "\n" + modelName
			if seen[key] {
				continue
			}
			seen[key] = true
			option := aigcWorkshopModelOption{
				Model:      modelName,
				Group:      group,
				Label:      fmt.Sprintf("%s · %s", modelName, group),
				GroupRatio: service.GetUserGroupRatio(userGroup, group),
			}
			fixedPrice := false
			if kind == aigcWorkshopKindVideo {
				constraints := relaycommon.ParseVideoModelConstraints(modelName)
				option.Resolution = strings.ToUpper(constraints.Resolution)
				option.DurationControlled = constraints.HasDurationSuffix
				option.FixedSeconds = constraints.FixedSeconds && constraints.HasDurationSuffix
				option.FixedPrice = constraints.FixedPrice
				fixedPrice = constraints.FixedPrice
				option.MaxDurationSeconds = constraints.MaxSeconds
				if !constraints.HasDurationSuffix {
					option.MaxDurationSeconds = constraints.MaxDirectSeconds
				}
				option.RequiredImageCount = constraints.RequiredImages
				option.MaxReferenceImages = constraints.MaxReferenceImages
				option.MaxReferenceVideos = constraints.MaxReferenceVideos
				option.MaxReferenceAudios = constraints.MaxReferenceAudios
				option.MaxReferenceVideoDurationSeconds = constraints.MaxReferenceVideoDurationSeconds
				option.VideoReferencesDisabled = constraints.DisableVideoReferences
				option.AudioReferencesDisabled = constraints.DisableAudioReferences
				if option.FixedSeconds {
					option.FixedDurationSeconds = constraints.MaxSeconds
				}
			}
			applyAigcWorkshopModelPricing(&option, kind, fixedPrice)
			options = append(options, option)
		}
	}
	return options
}

func includeAigcWorkshopModel(kind aigcWorkshopKind, modelName string) bool {
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	isImageModel := strings.Contains(normalized, "image") ||
		strings.Contains(normalized, "imagine") ||
		strings.Contains(normalized, "seedream") ||
		strings.Contains(normalized, "dall-e") ||
		strings.Contains(normalized, "dalle") ||
		strings.Contains(normalized, "imagen") ||
		strings.Contains(normalized, "flux") ||
		strings.Contains(normalized, "sdxl") ||
		strings.Contains(normalized, "stable-diffusion") ||
		strings.Contains(normalized, "midjourney")
	isVideoModel := strings.Contains(normalized, "seedance") ||
		strings.Contains(normalized, "veo") ||
		strings.Contains(normalized, "video") ||
		strings.Contains(normalized, "sora") ||
		strings.Contains(normalized, "kling") ||
		strings.Contains(normalized, "hailuo") ||
		strings.Contains(normalized, "runway") ||
		strings.Contains(normalized, "luma") ||
		strings.Contains(normalized, "pika") ||
		strings.Contains(normalized, "vidu") ||
		strings.Contains(normalized, "wan2")
	if strings.Contains(normalized, "minimax-h") {
		isVideoModel = true
	}
	switch kind {
	case aigcWorkshopKindImage:
		return normalized == "image-2" || normalized == "gpt-image-2" || strings.HasPrefix(normalized, "gpt-image-2-")
	case aigcWorkshopKindVideo:
		return isVideoModel
	case aigcWorkshopKindText:
		return !isImageModel && !isVideoModel && !strings.Contains(normalized, "codex-auto-review")
	default:
		return false
	}
}

func resolveAigcWorkshopModelOption(kind aigcWorkshopKind, userGroup string, modelName string, requestedGroup string) (aigcWorkshopModelOption, error) {
	modelName = strings.TrimSpace(modelName)
	requestedGroup = strings.TrimSpace(requestedGroup)
	options := buildAigcWorkshopModelOptions(kind, userGroup)
	for _, option := range options {
		if option.Model != modelName {
			continue
		}
		if requestedGroup == "" || option.Group == requestedGroup {
			return option, nil
		}
	}
	if requestedGroup != "" {
		return aigcWorkshopModelOption{}, fmt.Errorf("模型 %s 不属于可用 AIGC 分组 %s", modelName, requestedGroup)
	}
	return aigcWorkshopModelOption{}, fmt.Errorf("模型 %s 不在当前 AIGC 工坊可用分组中", modelName)
}

func decodeAigcWorkshopGroupHeader(value string) (string, error) {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, aigcWorkshopEncodedGroupPrefix) {
		return value, nil
	}
	decoded, err := url.PathUnescape(strings.TrimPrefix(value, aigcWorkshopEncodedGroupPrefix))
	if err != nil {
		return "", errors.New("invalid AIGC group header")
	}
	return strings.TrimSpace(decoded), nil
}

func aigcWorkshopGroupsForKind(config aigcWorkshopModelConfig, kind aigcWorkshopKind) []string {
	switch kind {
	case aigcWorkshopKindImage:
		return config.ImageGroups
	case aigcWorkshopKindVideo:
		return config.VideoGroups
	case aigcWorkshopKindText:
		return config.TextGroups
	default:
		return nil
	}
}

func canUseAigcWorkshopGroup(userGroup string, group string) bool {
	group = strings.TrimSpace(group)
	if group == "" {
		return false
	}
	if userGroup == group {
		return true
	}
	return service.GroupInUserUsableGroups(userGroup, group)
}

func cleanStringList(values []string) []string {
	cleaned := make([]string, 0, len(values))
	seen := make(map[string]bool)
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		cleaned = append(cleaned, value)
	}
	return cleaned
}

func detectFixedVideoDurationSeconds(modelName string) (bool, int) {
	constraints := relaycommon.ParseVideoModelConstraints(modelName)
	if constraints.FixedSeconds && constraints.HasDurationSuffix {
		return true, constraints.MaxSeconds
	}
	return false, 0
}

func detectVideoResolution(modelName string) string {
	return strings.ToUpper(relaycommon.ParseVideoModelConstraints(modelName).Resolution)
}

func abortAigcWorkshopOpenAIError(c *gin.Context, status int, err error) {
	c.JSON(status, gin.H{
		"error": types.NewError(
			err,
			types.ErrorCodeInvalidRequest,
			types.ErrOptionWithSkipRetry(),
		).ToOpenAIError(),
	})
	c.Abort()
}

func attachAigcImageAssetsToLog(c *gin.Context, responseBody []byte) int {
	assets, prompt, modelName := buildAigcImageAssets(c, responseBody)
	if len(assets) == 0 {
		return 0
	}

	requestId := c.GetString(common.RequestIdKey)
	query := model.LOG_DB.Model(&model.Log{}).
		Where("user_id = ? AND type = ?", c.GetInt("id"), model.LogTypeConsume).
		Order("id desc")
	if requestId != "" {
		query = query.Where("request_id = ?", requestId)
	}

	var log model.Log
	if err := query.First(&log).Error; err != nil {
		common.SysLog("failed to find aigc image consume log: " + err.Error())
		return 0
	}

	other, _ := common.StrToMap(log.Other)
	if other == nil {
		other = map[string]interface{}{}
	}
	other["aigc_workshop"] = true
	other["aigc_type"] = "image"
	other["aigc_assets"] = assets
	if prompt != "" {
		other["aigc_prompt"] = prompt
	}
	if modelName != "" {
		other["aigc_model"] = modelName
	}

	if err := model.LOG_DB.Model(&model.Log{}).Where("id = ?", log.Id).Update("other", common.MapToJsonStr(other)).Error; err != nil {
		common.SysLog("failed to attach aigc image assets: " + err.Error())
		return 0
	}
	return log.Id
}

func buildAigcImageAssets(c *gin.Context, responseBody []byte) ([]map[string]interface{}, string, string) {
	var response dto.ImageResponse
	if err := common.Unmarshal(responseBody, &response); err != nil {
		return nil, "", ""
	}

	prompt, modelName := aigcPromptAndModelFromRequest(c)
	outputMIMEType := "image/png"
	if storage, err := common.GetBodyStorage(c); err == nil {
		if body, err := storage.Bytes(); err == nil {
			outputMIMEType = aigcImageOutputMIMEType(body)
		}
	}
	assets := make([]map[string]interface{}, 0, len(response.Data))
	for idx, item := range response.Data {
		assetURL := item.Url
		if assetURL == "" && item.B64Json != "" {
			assetURL = "data:" + outputMIMEType + ";base64," + item.B64Json
		}
		if assetURL == "" {
			continue
		}
		assetPrompt := item.RevisedPrompt
		if assetPrompt == "" {
			assetPrompt = prompt
		}
		assets = append(assets, map[string]interface{}{
			"url":    assetURL,
			"prompt": assetPrompt,
			"index":  idx + 1,
		})
	}
	return assets, prompt, modelName
}

func rewriteAigcImageTaskResponse(responseBody []byte, logID int) ([]byte, error) {
	if logID <= 0 {
		return append([]byte(nil), responseBody...), nil
	}
	var envelope map[string]json.RawMessage
	if err := common.Unmarshal(responseBody, &envelope); err != nil {
		return nil, err
	}
	var items []map[string]json.RawMessage
	if err := common.Unmarshal(envelope["data"], &items); err != nil {
		return nil, err
	}

	assetPosition := 0
	changed := false
	for _, item := range items {
		var itemURL string
		var base64JSON string
		_ = common.Unmarshal(item["url"], &itemURL)
		_ = common.Unmarshal(item["b64_json"], &base64JSON)
		if itemURL == "" && base64JSON == "" {
			continue
		}
		assetPosition++
		if itemURL != "" || base64JSON == "" {
			continue
		}
		encodedURL, err := json.Marshal(fmt.Sprintf(
			"/api/aigc/assets/image-%d-%d/content",
			logID,
			assetPosition,
		))
		if err != nil {
			return nil, err
		}
		item["url"] = encodedURL
		delete(item, "b64_json")
		changed = true
	}
	if !changed {
		return append([]byte(nil), responseBody...), nil
	}
	encodedItems, err := json.Marshal(items)
	if err != nil {
		return nil, err
	}
	envelope["data"] = encodedItems
	return json.Marshal(envelope)
}

func attachAigcVideoPromptToTask(c *gin.Context, responseBody []byte) {
	prompt, _ := aigcPromptAndModelFromRequest(c)
	if prompt == "" {
		return
	}

	taskID := aigcTaskIDFromResponse(responseBody)
	if taskID == "" {
		return
	}

	task, exist, err := model.GetByTaskId(c.GetInt("id"), taskID)
	if err != nil || !exist {
		if err != nil {
			common.SysLog("failed to find aigc video task: " + err.Error())
		}
		return
	}

	task.Properties.Input = prompt
	if err = model.DB.Model(&model.Task{}).Where("id = ?", task.ID).Update("properties", task.Properties).Error; err != nil {
		common.SysLog("failed to attach aigc video prompt: " + err.Error())
	}
}

func aigcTaskIDFromResponse(responseBody []byte) string {
	var response struct {
		TaskID string `json:"task_id"`
		ID     string `json:"id"`
	}
	if err := common.Unmarshal(responseBody, &response); err != nil {
		return ""
	}
	if response.TaskID != "" {
		return response.TaskID
	}
	return response.ID
}

func aigcPromptAndModelFromRequest(c *gin.Context) (string, string) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return "", ""
	}
	var request struct {
		Prompt string `json:"prompt"`
		Model  string `json:"model"`
	}
	body, err := storage.Bytes()
	if err != nil {
		return "", ""
	}
	if err = common.Unmarshal(body, &request); err != nil {
		return "", ""
	}
	return request.Prompt, request.Model
}

func getAigcImageAssets(userId int, startIdx int, pageSize int) ([]aigcAsset, int64, error) {
	cutoff := common.GetTimestamp() - aigcAssetRetentionSeconds
	target := startIdx + pageSize + 1
	batchSize := aigcAssetBatchSize(pageSize)
	allItems := make([]aigcAsset, 0, target)
	lastID := 0
	for len(allItems) < target {
		query := model.LOG_DB.Model(&model.Log{}).
			Select("id", "created_at", "content", "quota", "other").
			Where("user_id = ? AND type = ? AND created_at >= ? AND other LIKE ?", userId, model.LogTypeConsume, cutoff, "%aigc_assets%")
		if lastID > 0 {
			query = query.Where("id < ?", lastID)
		}
		rows, err := query.Order("id desc").Limit(batchSize).Rows()
		if err != nil {
			return nil, 0, err
		}
		batchCount := 0
		for rows.Next() {
			var log model.Log
			if err = model.LOG_DB.ScanRows(rows, &log); err != nil {
				_ = rows.Close()
				return nil, 0, err
			}
			batchCount++
			lastID = log.Id
			allItems = append(allItems, assetsFromAigcImageLog(log)...)
			if len(allItems) >= target {
				break
			}
		}
		rowErr := rows.Err()
		_ = rows.Close()
		if rowErr != nil {
			return nil, 0, rowErr
		}
		if batchCount == 0 || batchCount < batchSize {
			break
		}
	}
	if startIdx >= len(allItems) {
		return []aigcAsset{}, int64(len(allItems)), nil
	}
	end := startIdx + pageSize
	if end > len(allItems) {
		end = len(allItems)
	}
	return allItems[startIdx:end], int64(len(allItems)), nil
}

func assetsFromAigcImageLog(log model.Log) []aigcAsset {
	other, _ := common.StrToMap(log.Other)
	if other == nil {
		return nil
	}
	rawAssets, ok := other["aigc_assets"].([]interface{})
	if !ok {
		return nil
	}
	modelName, _ := other["aigc_model"].(string)
	fallbackPrompt, _ := other["aigc_prompt"].(string)

	items := make([]aigcAsset, 0, len(rawAssets))
	for index, raw := range rawAssets {
		assetMap, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if hidden, _ := assetMap["hidden"].(bool); hidden {
			continue
		}
		url, _ := assetMap["url"].(string)
		if url == "" {
			continue
		}
		assetID := fmt.Sprintf("image-%d-%d", log.Id, index+1)
		if strings.HasPrefix(strings.ToLower(url), "data:image/") {
			url = "/api/aigc/assets/" + assetID + "/content"
		}
		prompt, _ := assetMap["prompt"].(string)
		if prompt == "" {
			prompt = fallbackPrompt
		}
		items = append(items, aigcAsset{
			ID:        assetID,
			Type:      "image",
			Status:    "succeeded",
			Title:     "Image Generation",
			Prompt:    prompt,
			Model:     modelName,
			URL:       url,
			Quota:     log.Quota,
			CreatedAt: log.CreatedAt,
			Meta:      truncateAigcAssetMeta(log.Content),
		})
	}
	return items
}

func getAigcVideoAssets(userId int, startIdx int, pageSize int) ([]aigcAsset, int64, error) {
	cutoff := common.GetTimestamp() - aigcAssetRetentionSeconds
	target := startIdx + pageSize + 1
	batchSize := aigcAssetBatchSize(pageSize)
	allItems := make([]aigcAsset, 0, target)
	var lastID int64
	for len(allItems) < target {
		query := model.DB.Model(&model.Task{}).
			Select("id", "task_id", "quota", "status", "fail_reason", "submit_time", "progress", "properties").
			Where("user_id = ? AND platform = ? AND submit_time >= ?", userId, constant.TaskPlatformAigcVideo, cutoff)
		if lastID > 0 {
			query = query.Where("id < ?", lastID)
		}
		var tasks []model.Task
		if err := query.Order("id desc").Limit(batchSize).Find(&tasks).Error; err != nil {
			return nil, 0, err
		}
		if len(tasks) == 0 {
			break
		}
		for index := range tasks {
			if tasks[index].Properties.AigcHidden {
				continue
			}
			allItems = append(allItems, assetFromAigcVideoTask(tasks[index]))
			if len(allItems) >= target {
				break
			}
		}
		lastID = tasks[len(tasks)-1].ID
		if len(tasks) < batchSize {
			break
		}
	}
	if startIdx >= len(allItems) {
		return []aigcAsset{}, int64(len(allItems)), nil
	}
	end := startIdx + pageSize
	if end > len(allItems) {
		end = len(allItems)
	}
	return allItems[startIdx:end], int64(len(allItems)), nil
}

func aigcAssetBatchSize(pageSize int) int {
	size := pageSize * 2
	if size < 32 {
		return 32
	}
	if size > 100 {
		return 100
	}
	return size
}

func truncateAigcAssetMeta(value string) string {
	if len(value) <= aigcAssetMaxMetaBytes {
		return value
	}
	end := aigcAssetMaxMetaBytes
	for end > 0 && !utf8.RuneStart(value[end]) {
		end--
	}
	return value[:end] + "..."
}

func assetFromAigcVideoTask(task model.Task) aigcAsset {
	modelName := task.Properties.OriginModelName
	if modelName == "" && task.PrivateData.BillingContext != nil {
		modelName = task.PrivateData.BillingContext.OriginModelName
	}
	url := ""
	if task.Status == model.TaskStatusSuccess {
		url = aigcVideoContentURL(task.TaskID)
	}
	return aigcAsset{
		ID:        fmt.Sprintf("video-%d", task.ID),
		Type:      "video",
		Status:    string(task.Status),
		Title:     "Video Generation",
		Prompt:    task.Properties.Input,
		Model:     modelName,
		URL:       url,
		TaskID:    task.TaskID,
		Quota:     task.Quota,
		CreatedAt: task.SubmitTime,
		Meta:      task.Progress,
	}
}

func getAigcMixedAssets(userId int, startIdx int, pageSize int) ([]aigcAsset, int64, error) {
	imageItems, imageTotal, err := getAigcImageAssets(userId, 0, startIdx+pageSize)
	if err != nil {
		return nil, 0, err
	}
	videoItems, videoTotal, err := getAigcVideoAssets(userId, 0, startIdx+pageSize)
	if err != nil {
		return nil, 0, err
	}
	items := append(imageItems, videoItems...)
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].CreatedAt > items[j].CreatedAt
	})
	if startIdx >= len(items) {
		return []aigcAsset{}, imageTotal + videoTotal, nil
	}
	end := startIdx + pageSize
	if end > len(items) {
		end = len(items)
	}
	return items[startIdx:end], imageTotal + videoTotal, nil
}

func hideAigcAsset(userId int, assetID string) error {
	if strings.HasPrefix(assetID, "image-") {
		return updateAigcImageAsset(userId, assetID, func(asset map[string]interface{}) {
			asset["hidden"] = true
		})
	}
	return updateAigcVideoAsset(userId, assetID, func(task *model.Task) {
		task.Properties.AigcHidden = true
	})
}

func updateAigcImageAsset(userId int, assetID string, mutate func(map[string]interface{})) error {
	var logID int
	var assetIndex int
	if _, err := fmt.Sscanf(assetID, "image-%d-%d", &logID, &assetIndex); err != nil {
		return err
	}
	if assetIndex < 1 {
		return fmt.Errorf("invalid asset index")
	}

	var log model.Log
	if err := model.LOG_DB.Where("id = ? AND user_id = ?", logID, userId).First(&log).Error; err != nil {
		return err
	}
	other, _ := common.StrToMap(log.Other)
	rawAssets, ok := other["aigc_assets"].([]interface{})
	if !ok || assetIndex > len(rawAssets) {
		return fmt.Errorf("asset not found")
	}
	asset, ok := rawAssets[assetIndex-1].(map[string]interface{})
	if !ok {
		return fmt.Errorf("asset not found")
	}
	mutate(asset)
	rawAssets[assetIndex-1] = asset
	other["aigc_assets"] = rawAssets
	return model.LOG_DB.Model(&model.Log{}).Where("id = ?", log.Id).Update("other", common.MapToJsonStr(other)).Error
}

func updateAigcVideoAsset(userId int, assetID string, mutate func(*model.Task)) error {
	var taskID int64
	if _, err := fmt.Sscanf(assetID, "video-%d", &taskID); err != nil {
		return err
	}
	var task model.Task
	if err := model.DB.Where("id = ? AND user_id = ?", taskID, userId).First(&task).Error; err != nil {
		return err
	}
	mutate(&task)
	return model.DB.Model(&model.Task{}).Where("id = ?", task.ID).Update("properties", task.Properties).Error
}
