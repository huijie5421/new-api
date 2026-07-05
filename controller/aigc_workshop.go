package controller

import (
	"bytes"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

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

type aigcWorkshopModelOption struct {
	Model                string  `json:"model"`
	Group                string  `json:"group"`
	Label                string  `json:"label"`
	Resolution           string  `json:"resolution,omitempty"`
	FixedSeconds         bool    `json:"fixed_seconds,omitempty"`
	FixedDurationSeconds int     `json:"fixed_duration_seconds,omitempty"`
	GroupRatio           float64 `json:"group_ratio"`
}

type aigcWorkshopModels struct {
	Image []aigcWorkshopModelOption `json:"image"`
	Video []aigcWorkshopModelOption `json:"video"`
	Text  []aigcWorkshopModelOption `json:"text"`
}

const aigcAssetRetentionSeconds int64 = 24 * 60 * 60
const aigcWorkshopModelConfigOptionKey = "AigcWorkshopModelGroups"
const aigcWorkshopGroupHeader = "X-AIGC-Group"

var defaultAigcWorkshopModelConfig = aigcWorkshopModelConfig{
	ImageGroups: []string{"GPT生图专用", "AzGPT生图", "Gemini"},
	VideoGroups: []string{"即梦"},
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
		option, err := resolveAigcWorkshopModelOption(kind, userGroup, modelName, c.GetHeader(aigcWorkshopGroupHeader))
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

func AigcImageGenerations(c *gin.Context) {
	if !prepareAigcWorkshopRelay(c, "aigc-image") {
		return
	}
	capture := &captureResponseWriter{ResponseWriter: c.Writer}
	c.Writer = capture
	c.Request.URL.Path = "/v1/images/generations"
	Relay(c, types.RelayFormatOpenAIImage)
	if c.Writer.Status() < http.StatusBadRequest {
		attachAigcImageAssetsToLog(c, capture.body.Bytes())
	}
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
	capture := &captureResponseWriter{ResponseWriter: c.Writer}
	c.Writer = capture
	c.Request.URL.Path = "/v1/video/generations"
	RelayTask(c)
	if c.Writer.Status() < http.StatusBadRequest {
		attachAigcVideoPromptToTask(c, capture.body.Bytes())
	}
}

func AigcVideoGenerationFetch(c *gin.Context) {
	if !prepareAigcWorkshopRelay(c, "aigc-video-fetch") {
		return
	}
	c.Request.URL.Path = "/v1/video/generations/" + c.Param("task_id")
	RelayTaskFetch(c)
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

	tempToken := &model.Token{
		UserId: userId,
		Name:   fmt.Sprintf("%s-%s", tokenName, usingGroup),
		Group:  usingGroup,
	}
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
			if kind == aigcWorkshopKindVideo {
				option.Resolution = detectVideoResolution(modelName)
				option.FixedSeconds, option.FixedDurationSeconds = detectFixedVideoDurationSeconds(modelName)
			}
			options = append(options, option)
		}
	}
	return options
}

func includeAigcWorkshopModel(kind aigcWorkshopKind, modelName string) bool {
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	isImageModel := strings.Contains(normalized, "image") || strings.Contains(normalized, "imagine")
	isVideoModel := strings.Contains(normalized, "seedance") || strings.Contains(normalized, "veo") || strings.Contains(normalized, "video")
	switch kind {
	case aigcWorkshopKindImage:
		return isImageModel
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
	normalized := strings.ToLower(modelName)
	if strings.Contains(normalized, "15s") {
		return true, 15
	}
	return false, 0
}

func detectVideoResolution(modelName string) string {
	normalized := strings.ToLower(modelName)
	switch {
	case strings.Contains(normalized, "1080p"):
		return "1080P"
	case strings.Contains(normalized, "720p"):
		return "720P"
	case strings.Contains(normalized, "480p"):
		return "480P"
	default:
		return ""
	}
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

func attachAigcImageAssetsToLog(c *gin.Context, responseBody []byte) {
	assets, prompt, modelName := buildAigcImageAssets(c, responseBody)
	if len(assets) == 0 {
		return
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
		return
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
	}
}

func buildAigcImageAssets(c *gin.Context, responseBody []byte) ([]map[string]interface{}, string, string) {
	var response dto.ImageResponse
	if err := common.Unmarshal(responseBody, &response); err != nil {
		return nil, "", ""
	}

	prompt, modelName := aigcPromptAndModelFromRequest(c)
	assets := make([]map[string]interface{}, 0, len(response.Data))
	for idx, item := range response.Data {
		if item.Url == "" {
			continue
		}
		assetPrompt := item.RevisedPrompt
		if assetPrompt == "" {
			assetPrompt = prompt
		}
		assets = append(assets, map[string]interface{}{
			"url":    item.Url,
			"prompt": assetPrompt,
			"index":  idx + 1,
		})
	}
	return assets, prompt, modelName
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
	query := model.LOG_DB.Model(&model.Log{}).
		Where("user_id = ? AND type = ? AND created_at >= ? AND other LIKE ?", userId, model.LogTypeConsume, cutoff, "%aigc_assets%")

	var logs []model.Log
	if err := query.Order("created_at desc, id desc").Find(&logs).Error; err != nil {
		return nil, 0, err
	}

	allItems := make([]aigcAsset, 0, len(logs))
	for _, log := range logs {
		allItems = append(allItems, assetsFromAigcImageLog(log)...)
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
		prompt, _ := assetMap["prompt"].(string)
		if prompt == "" {
			prompt = fallbackPrompt
		}
		items = append(items, aigcAsset{
			ID:        fmt.Sprintf("image-%d-%d", log.Id, index+1),
			Type:      "image",
			Status:    "succeeded",
			Title:     "Image Generation",
			Prompt:    prompt,
			Model:     modelName,
			URL:       url,
			Quota:     log.Quota,
			CreatedAt: log.CreatedAt,
			Meta:      log.Content,
		})
	}
	return items
}

func getAigcVideoAssets(userId int, startIdx int, pageSize int) ([]aigcAsset, int64, error) {
	cutoff := common.GetTimestamp() - aigcAssetRetentionSeconds
	var tasks []model.Task
	if err := model.DB.Model(&model.Task{}).
		Where("user_id = ? AND submit_time >= ?", userId, cutoff).
		Order("submit_time desc, id desc").
		Find(&tasks).Error; err != nil {
		return nil, 0, err
	}

	allItems := make([]aigcAsset, 0, len(tasks))
	for _, task := range tasks {
		if task.Properties.AigcHidden {
			continue
		}
		allItems = append(allItems, assetFromAigcVideoTask(task))
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

func assetFromAigcVideoTask(task model.Task) aigcAsset {
	modelName := task.Properties.OriginModelName
	if modelName == "" && task.PrivateData.BillingContext != nil {
		modelName = task.PrivateData.BillingContext.OriginModelName
	}
	url := task.GetResultURL()
	if url == "" && task.Status == model.TaskStatusSuccess {
		url = "/v1/videos/" + task.TaskID + "/content"
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
