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

	if err := model.UpdateChannelMonitor(&monitor); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Failed to update monitor: %v", err),
		})
		return
	}

	// Re-schedule in runner
	runner := service.GetChannelMonitorRunner()
	runner.Schedule(&monitor)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    monitor,
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

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    monitors,
	})
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
		Model              string  `json:"model"`
		Availability7d     float64 `json:"availability_7d"`
		Availability15d    float64 `json:"availability_15d"`
		Availability30d    float64 `json:"availability_30d"`
		AvgLatency7d       int     `json:"avg_latency_7d"`
		AvgLatency15d      int     `json:"avg_latency_15d"`
		AvgLatency30d      int     `json:"avg_latency_30d"`
	}

	modelStatuses := make([]ModelStatus, 0, len(models))

	for _, modelName := range models {
		status := ModelStatus{Model: modelName}

		// Calculate 7-day stats
		rollups7d, _ := model.GetChannelMonitorRollups(id, modelName,
			time.Now().AddDate(0, 0, -7).Format("2006-01-02"), time.Now().Format("2006-01-02"))
		if len(rollups7d) > 0 {
			totalChecks := 0
			successChecks := 0
			totalLatency := 0
			for _, r := range rollups7d {
				totalChecks += r.TotalChecks
				successChecks += r.SuccessChecks
				totalLatency += r.AvgLatencyMs * r.TotalChecks
			}
			if totalChecks > 0 {
				status.Availability7d = float64(successChecks) / float64(totalChecks)
				status.AvgLatency7d = totalLatency / totalChecks
			}
		}

		// Calculate 15-day stats
		rollups15d, _ := model.GetChannelMonitorRollups(id, modelName,
			time.Now().AddDate(0, 0, -15).Format("2006-01-02"), time.Now().Format("2006-01-02"))
		if len(rollups15d) > 0 {
			totalChecks := 0
			successChecks := 0
			totalLatency := 0
			for _, r := range rollups15d {
				totalChecks += r.TotalChecks
				successChecks += r.SuccessChecks
				totalLatency += r.AvgLatencyMs * r.TotalChecks
			}
			if totalChecks > 0 {
				status.Availability15d = float64(successChecks) / float64(totalChecks)
				status.AvgLatency15d = totalLatency / totalChecks
			}
		}

		// Calculate 30-day stats
		rollups30d, _ := model.GetChannelMonitorRollups(id, modelName,
			time.Now().AddDate(0, 0, -30).Format("2006-01-02"), time.Now().Format("2006-01-02"))
		if len(rollups30d) > 0 {
			totalChecks := 0
			successChecks := 0
			totalLatency := 0
			for _, r := range rollups30d {
				totalChecks += r.TotalChecks
				successChecks += r.SuccessChecks
				totalLatency += r.AvgLatencyMs * r.TotalChecks
			}
			if totalChecks > 0 {
				status.Availability30d = float64(successChecks) / float64(totalChecks)
				status.AvgLatency30d = totalLatency / totalChecks
			}
		}

		modelStatuses = append(modelStatuses, status)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"monitor": monitor,
			"models":  modelStatuses,
		},
	})
}
