package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// GetAllChannelMonitors returns all monitors (admin)
func GetAllChannelMonitors(c *gin.Context) {
	enabledParam := c.Query("enabled")
	var enabledFilter *bool
	if enabledParam != "" {
		enabled := enabledParam == "true" || enabledParam == "1"
		enabledFilter = &enabled
	}

	monitors, err := model.GetAllChannelMonitors(enabledFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to get monitors: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    monitors,
	})
}

// GetChannelMonitor returns a single monitor (admin)
func GetChannelMonitor(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid monitor ID",
		})
		return
	}

	monitor, err := model.GetChannelMonitor(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "Monitor not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    monitor,
	})
}

// CreateChannelMonitor creates a new monitor (admin)
func CreateChannelMonitor(c *gin.Context) {
	var monitor model.ChannelMonitor
	if err := c.ShouldBindJSON(&monitor); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}

	// Validate configuration
	if err := service.ValidateMonitorConfig(
		monitor.Provider,
		monitor.APIMode,
		monitor.Endpoint,
		monitor.APIKey,
		monitor.PrimaryModel,
		monitor.IntervalSeconds,
		monitor.TimeoutSeconds,
	); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	// Encrypt API key
	// For now, store as-is. In production, use common crypto functions
	// monitor.APIKey = encryptAPIKey(monitor.APIKey)

	// Build default body if not provided
	if monitor.Body == "" && monitor.BodyMode != "" {
		body, err := service.BuildRequestBodyFromMode(monitor.Provider, monitor.BodyMode, "")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": fmt.Sprintf("Failed to build body: %v", err),
			})
			return
		}
		monitor.Body = body
	}

	if err := model.CreateChannelMonitor(&monitor); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to create monitor: %v", err),
		})
		return
	}

	// Schedule in runner
	runner := service.GetChannelMonitorRunner()
	runner.Schedule(&monitor)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    monitor,
	})
}

// UpdateChannelMonitor updates an existing monitor (admin)
func UpdateChannelMonitor(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid monitor ID",
		})
		return
	}

	// Load the existing record so server-derived fields (last_status,
	// last_check_at, availability_rate_*, created_at) are preserved and the
	// primary key is taken from the URL, not the request body.
	existing, err := model.GetChannelMonitor(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "Monitor not found",
		})
		return
	}

	var payload model.ChannelMonitor
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}

	// An empty api_key on update means "keep the existing key unchanged".
	if strings.TrimSpace(payload.APIKey) == "" {
		payload.APIKey = existing.APIKey
	}

	// Validate configuration (after restoring the kept key).
	if err := service.ValidateMonitorConfig(
		payload.Provider,
		payload.APIMode,
		payload.Endpoint,
		payload.APIKey,
		payload.PrimaryModel,
		payload.IntervalSeconds,
		payload.TimeoutSeconds,
	); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	// Apply editable fields onto the existing record; statistics columns stay
	// as loaded so the monitor's history/availability are not wiped.
	existing.Name = payload.Name
	existing.Provider = payload.Provider
	existing.APIMode = payload.APIMode
	existing.Endpoint = payload.Endpoint
	existing.APIKey = payload.APIKey
	existing.PrimaryModel = payload.PrimaryModel
	existing.ExtraModels = payload.ExtraModels
	existing.Group = payload.Group
	existing.IntervalSeconds = payload.IntervalSeconds
	existing.TimeoutSeconds = payload.TimeoutSeconds
	existing.Enabled = payload.Enabled
	existing.Headers = payload.Headers
	existing.Body = payload.Body
	existing.BodyMode = payload.BodyMode
	existing.CCSpoofEnabled = payload.CCSpoofEnabled
	// template_id / template_snapshot are managed via the template apply
	// endpoint, not this form — keep the existing association untouched.

	if err := model.UpdateChannelMonitor(existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to update monitor: %v", err),
		})
		return
	}

	// Re-schedule in runner
	runner := service.GetChannelMonitorRunner()
	runner.Schedule(existing)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    existing,
	})
}

// DeleteChannelMonitor deletes a monitor (admin)
func DeleteChannelMonitor(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid monitor ID",
		})
		return
	}

	// Unschedule from runner
	runner := service.GetChannelMonitorRunner()
	runner.Unschedule(id)

	if err := model.DeleteChannelMonitor(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to delete monitor: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Monitor deleted successfully",
	})
}

// RunChannelMonitorNow manually triggers a monitor check (admin)
func RunChannelMonitorNow(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid monitor ID",
		})
		return
	}

	runner := service.GetChannelMonitorRunner()
	result, err := runner.RunNow(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to run monitor: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// GetChannelMonitorHistory returns history for a monitor (admin)
func GetChannelMonitorHistory(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid monitor ID",
		})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 50
	}

	offset := (page - 1) * pageSize
	histories, total, err := model.GetChannelMonitorHistory(id, pageSize, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to get history: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    histories,
		"total":   total,
		"page":    page,
	})
}

// Template Management

// GetAllChannelMonitorTemplates returns all templates (admin)
func GetAllChannelMonitorTemplates(c *gin.Context) {
	provider := c.Query("provider")

	templates, err := model.GetAllChannelMonitorTemplates(provider)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to get templates: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    templates,
	})
}

// GetChannelMonitorTemplate returns a single template (admin)
func GetChannelMonitorTemplate(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid template ID",
		})
		return
	}

	template, err := model.GetChannelMonitorTemplate(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "Template not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    template,
	})
}

// CreateChannelMonitorTemplate creates a new template (admin)
func CreateChannelMonitorTemplate(c *gin.Context) {
	var template model.ChannelMonitorRequestTemplate
	if err := c.ShouldBindJSON(&template); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}

	// Validate configuration
	if err := service.ValidateTemplateConfig(template.Provider, template.Name, template.BodyMode); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if err := model.CreateChannelMonitorTemplate(&template); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"message": "Template with this provider and name already exists",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to create template: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    template,
	})
}

// UpdateChannelMonitorTemplate updates an existing template (admin)
func UpdateChannelMonitorTemplate(c *gin.Context) {
	var template model.ChannelMonitorRequestTemplate
	if err := c.ShouldBindJSON(&template); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}

	// Validate configuration
	if err := service.ValidateTemplateConfig(template.Provider, template.Name, template.BodyMode); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if err := model.UpdateChannelMonitorTemplate(&template); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to update template: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    template,
	})
}

// DeleteChannelMonitorTemplate deletes a template (admin)
func DeleteChannelMonitorTemplate(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid template ID",
		})
		return
	}

	if err := model.DeleteChannelMonitorTemplate(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to delete template: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Template deleted successfully",
	})
}

// GetTemplateAssociatedMonitors returns monitors using a template (admin)
func GetTemplateAssociatedMonitors(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid template ID",
		})
		return
	}

	monitors, err := model.GetMonitorsByTemplateID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to get associated monitors: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    monitors,
	})
}

// ApplyChannelMonitorTemplate applies a template to monitors (admin)
func ApplyChannelMonitorTemplate(c *gin.Context) {
	var req service.TemplateApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}

	if err := service.ApplyTemplateToMonitors(req.TemplateID, req.MonitorIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to apply template: %v", err),
		})
		return
	}

	// Re-schedule affected monitors
	runner := service.GetChannelMonitorRunner()
	for _, monitorID := range req.MonitorIDs {
		monitor, err := model.GetChannelMonitor(monitorID)
		if err == nil {
			runner.Schedule(monitor)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Template applied successfully",
	})
}

// User endpoints (read-only status)

// userTimelinePoint is a sanitized history point exposed to users (no error_msg).
type userTimelinePoint struct {
	Status    string `json:"status"`
	LatencyMs int    `json:"latency_ms"`
	CheckedAt int64  `json:"checked_at"`
}

// userMonitorStatus is the sanitized monitor object exposed to users. It
// deliberately EXCLUDES secret/admin fields (api_key, endpoint, headers, body,
// template_snapshot, created_by).
type userMonitorStatus struct {
	ID                  int                 `json:"id"`
	Name                string              `json:"name"`
	Provider            string              `json:"provider"`
	APIMode             string              `json:"api_mode"`
	PrimaryModel        string              `json:"primary_model"`
	ExtraModels         string              `json:"extra_models"`
	Group               string              `json:"group"`
	Enabled             bool                `json:"enabled"`
	LastStatus          string              `json:"last_status"`
	LastLatencyMs       *int                `json:"last_latency_ms"`
	LastCheckAt         *int64              `json:"last_check_at"`
	AvailabilityRate7d  *float64            `json:"availability_rate_7d"`
	AvailabilityRate15d *float64            `json:"availability_rate_15d"`
	AvailabilityRate30d *float64            `json:"availability_rate_30d"`
	Timeline            []userTimelinePoint `json:"timeline"`
}

// GetChannelMonitorStatusList returns summary status for all enabled monitors (user)
func GetChannelMonitorStatusList(c *gin.Context) {
	enabled := true
	monitors, err := model.GetAllChannelMonitors(&enabled)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to get monitors: %v", err),
		})
		return
	}

	list := make([]userMonitorStatus, 0, len(monitors))
	for _, m := range monitors {
		item := userMonitorStatus{
			ID:                  m.ID,
			Name:                m.Name,
			Provider:            m.Provider,
			APIMode:             m.APIMode,
			PrimaryModel:        m.PrimaryModel,
			ExtraModels:         m.ExtraModels,
			Group:               m.Group,
			Enabled:             m.Enabled,
			LastStatus:          m.LastStatus,
			LastLatencyMs:       m.LastLatencyMs,
			LastCheckAt:         m.LastCheckAt,
			AvailabilityRate7d:  m.AvailabilityRate7d,
			AvailabilityRate15d: m.AvailabilityRate15d,
			AvailabilityRate30d: m.AvailabilityRate30d,
			Timeline:            []userTimelinePoint{},
		}

		histories, err := model.GetRecentHistoryForModel(m.ID, m.PrimaryModel, 60)
		if err == nil {
			for _, h := range histories {
				item.Timeline = append(item.Timeline, userTimelinePoint{
					Status:    h.Status,
					LatencyMs: h.LatencyMs,
					CheckedAt: h.CheckedAt,
				})
			}
		}

		list = append(list, item)
	}

	common.ApiSuccess(c, list)
}

// GetChannelMonitorStatus returns detailed status for a monitor with multi-window availability (user)
func GetChannelMonitorStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid monitor ID",
		})
		return
	}

	monitor, err := model.GetChannelMonitor(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "Monitor not found",
		})
		return
	}

	// Parse extra models
	var extraModels []string
	if monitor.ExtraModels != "" {
		common.Unmarshal([]byte(monitor.ExtraModels), &extraModels)
	}

	models := []string{monitor.PrimaryModel}
	models = append(models, extraModels...)

	// Get rollup data for each model and time window
	type ModelStatus struct {
		Model           string  `json:"model"`
		Availability7d  float64 `json:"availability_7d"`
		Availability15d float64 `json:"availability_15d"`
		Availability30d float64 `json:"availability_30d"`
		AvgLatency7d    int     `json:"avg_latency_7d"`
		AvgLatency15d   int     `json:"avg_latency_15d"`
		AvgLatency30d   int     `json:"avg_latency_30d"`
	}

	modelStatuses := make([]ModelStatus, 0, len(models))

	now := time.Now()
	since7d := now.AddDate(0, 0, -7).Unix()
	since15d := now.AddDate(0, 0, -15).Unix()
	since30d := now.AddDate(0, 0, -30).Unix()

	for _, modelName := range models {
		status := ModelStatus{Model: modelName}

		// Compute each window directly from history so today's checks and
		// freshly-created monitors are reflected (daily rollups only cover
		// completed days and would otherwise show 0% until the next 2 AM run).
		if s, err := model.GetMonitorModelWindowStats(id, modelName, since7d); err == nil && s.TotalChecks > 0 {
			status.Availability7d = float64(s.SuccessChecks) / float64(s.TotalChecks)
			status.AvgLatency7d = s.AvgLatencyMs
		}
		if s, err := model.GetMonitorModelWindowStats(id, modelName, since15d); err == nil && s.TotalChecks > 0 {
			status.Availability15d = float64(s.SuccessChecks) / float64(s.TotalChecks)
			status.AvgLatency15d = s.AvgLatencyMs
		}
		if s, err := model.GetMonitorModelWindowStats(id, modelName, since30d); err == nil && s.TotalChecks > 0 {
			status.Availability30d = float64(s.SuccessChecks) / float64(s.TotalChecks)
			status.AvgLatency30d = s.AvgLatencyMs
		}

		modelStatuses = append(modelStatuses, status)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"monitor": userMonitorStatus{
				ID:                  monitor.ID,
				Name:                monitor.Name,
				Provider:            monitor.Provider,
				APIMode:             monitor.APIMode,
				PrimaryModel:        monitor.PrimaryModel,
				ExtraModels:         monitor.ExtraModels,
				Group:               monitor.Group,
				Enabled:             monitor.Enabled,
				LastStatus:          monitor.LastStatus,
				LastLatencyMs:       monitor.LastLatencyMs,
				LastCheckAt:         monitor.LastCheckAt,
				AvailabilityRate7d:  monitor.AvailabilityRate7d,
				AvailabilityRate15d: monitor.AvailabilityRate15d,
				AvailabilityRate30d: monitor.AvailabilityRate30d,
				Timeline:            []userTimelinePoint{},
			},
			"models": modelStatuses,
		},
	})
}
