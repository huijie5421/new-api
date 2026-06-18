package model

import (
	"time"

	"gorm.io/gorm"
)

// ChannelMonitor represents a channel monitoring configuration
type ChannelMonitor struct {
	ID                 int       `json:"id" gorm:"primarykey"`
	Name               string    `json:"name" gorm:"type:varchar(255);not null;index"`
	Provider           string    `json:"provider" gorm:"type:varchar(50);not null;index"` // openai, anthropic, gemini
	APIMode            string    `json:"api_mode" gorm:"type:varchar(50);not null"`        // chat_completions, responses (OpenAI-specific)
	Endpoint           string    `json:"endpoint" gorm:"type:varchar(512);not null"`
	APIKey             string    `json:"api_key" gorm:"type:text;not null"` // Encrypted
	PrimaryModel       string    `json:"primary_model" gorm:"type:varchar(255);not null"`
	ExtraModels        string    `json:"extra_models" gorm:"type:text"` // JSON array of additional models
	Group              string    `json:"group" gorm:"type:varchar(64);default:'default';index"`
	IntervalSeconds    int       `json:"interval_seconds" gorm:"not null;default:300"` // Default 5 minutes
	TimeoutSeconds     int       `json:"timeout_seconds" gorm:"not null;default:10"`
	Enabled            bool      `json:"enabled" gorm:"not null;default:true;index"`
	Headers            string    `json:"headers" gorm:"type:text"`           // JSON object of custom headers
	Body               string    `json:"body" gorm:"type:text"`              // JSON object, full request body snapshot
	BodyMode           string    `json:"body_mode" gorm:"type:varchar(20)"`  // "auto", "minimal", "custom"
	TemplateID         *int      `json:"template_id" gorm:"index"`           // Optional reference to template
	TemplateSnapshot   string    `json:"template_snapshot" gorm:"type:text"` // JSON, copy of template at apply time
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
	LastCheckAt        *int64    `json:"last_check_at" gorm:"index"`    // Unix timestamp
	LastStatus         string    `json:"last_status" gorm:"type:varchar(20)"` // "success", "failure", "unknown"
	LastLatencyMs      *int      `json:"last_latency_ms"`
	AvailabilityRate7d *float64  `json:"availability_rate_7d"`  // 7-day rolling availability (0-1)
	AvailabilityRate15d *float64 `json:"availability_rate_15d"` // 15-day rolling availability (0-1)
	AvailabilityRate30d *float64 `json:"availability_rate_30d"` // 30-day rolling availability (0-1)
}

// ChannelMonitorHistory stores individual check results
type ChannelMonitorHistory struct {
	ID          int64     `json:"id" gorm:"primarykey"`
	MonitorID   int       `json:"monitor_id" gorm:"not null;index:idx_monitor_time"`
	Model       string    `json:"model" gorm:"type:varchar(255);not null;index:idx_model_time"`
	Status      string    `json:"status" gorm:"type:varchar(20);not null"` // "success", "failure"
	LatencyMs   int       `json:"latency_ms"`
	ErrorMsg    string    `json:"error_msg" gorm:"type:text"`
	CheckedAt   int64     `json:"checked_at" gorm:"not null;index:idx_monitor_time;index:idx_model_time"` // Unix timestamp
	ResponseOK  bool      `json:"response_ok" gorm:"not null"` // Whether response validation passed
	CreatedAt   time.Time `json:"created_at"`
}

// ChannelMonitorDailyRollup stores aggregated daily statistics
type ChannelMonitorDailyRollup struct {
	ID              int64     `json:"id" gorm:"primarykey"`
	MonitorID       int       `json:"monitor_id" gorm:"not null;uniqueIndex:idx_monitor_model_date"`
	Model           string    `json:"model" gorm:"type:varchar(255);not null;uniqueIndex:idx_monitor_model_date"`
	BucketDate      string    `json:"bucket_date" gorm:"type:varchar(10);not null;uniqueIndex:idx_monitor_model_date;index"` // YYYY-MM-DD
	TotalChecks     int       `json:"total_checks" gorm:"not null;default:0"`
	SuccessChecks   int       `json:"success_checks" gorm:"not null;default:0"`
	FailureChecks   int       `json:"failure_checks" gorm:"not null;default:0"`
	AvgLatencyMs    int       `json:"avg_latency_ms" gorm:"not null;default:0"`
	MinLatencyMs    int       `json:"min_latency_ms"`
	MaxLatencyMs    int       `json:"max_latency_ms"`
	P50LatencyMs    int       `json:"p50_latency_ms"`
	P95LatencyMs    int       `json:"p95_latency_ms"`
	P99LatencyMs    int       `json:"p99_latency_ms"`
	AvailabilityRate float64  `json:"availability_rate" gorm:"not null;default:0"` // success_checks / total_checks
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// ChannelMonitorRequestTemplate stores reusable request templates by provider
type ChannelMonitorRequestTemplate struct {
	ID          int       `json:"id" gorm:"primarykey"`
	Provider    string    `json:"provider" gorm:"type:varchar(50);not null;uniqueIndex:idx_provider_name"`
	Name        string    `json:"name" gorm:"type:varchar(255);not null;uniqueIndex:idx_provider_name"`
	APIMode     string    `json:"api_mode" gorm:"type:varchar(50);not null"`
	BodyMode    string    `json:"body_mode" gorm:"type:varchar(20);not null"` // "auto", "minimal", "custom"
	Headers     string    `json:"headers" gorm:"type:text"`                    // JSON object
	Body        string    `json:"body" gorm:"type:text"`                       // JSON object
	Description string    `json:"description" gorm:"type:text"`
	IsDefault   bool      `json:"is_default" gorm:"not null;default:false;index"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ChannelMonitorAggregationWatermark tracks the last aggregated timestamp
type ChannelMonitorAggregationWatermark struct {
	ID                int       `json:"id" gorm:"primarykey"`
	LastAggregatedAt  int64     `json:"last_aggregated_at" gorm:"not null"` // Unix timestamp
	UpdatedAt         time.Time `json:"updated_at"`
}

func GetChannelMonitor(id int) (*ChannelMonitor, error) {
	monitor := &ChannelMonitor{}
	err := DB.First(monitor, id).Error
	return monitor, err
}

func GetAllChannelMonitors(enabled *bool) ([]*ChannelMonitor, error) {
	var monitors []*ChannelMonitor
	query := DB.Order("id DESC")
	if enabled != nil {
		query = query.Where("enabled = ?", *enabled)
	}
	err := query.Find(&monitors).Error
	return monitors, err
}

func CreateChannelMonitor(monitor *ChannelMonitor) error {
	return DB.Create(monitor).Error
}

func UpdateChannelMonitor(monitor *ChannelMonitor) error {
	return DB.Save(monitor).Error
}

func DeleteChannelMonitor(id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		// Delete monitor
		if err := tx.Delete(&ChannelMonitor{}, id).Error; err != nil {
			return err
		}
		// Delete related history
		if err := tx.Where("monitor_id = ?", id).Delete(&ChannelMonitorHistory{}).Error; err != nil {
			return err
		}
		// Delete related rollups
		if err := tx.Where("monitor_id = ?", id).Delete(&ChannelMonitorDailyRollup{}).Error; err != nil {
			return err
		}
		return nil
	})
}

func GetChannelMonitorHistory(monitorID int, limit int, offset int) ([]*ChannelMonitorHistory, int64, error) {
	var histories []*ChannelMonitorHistory
	var total int64

	query := DB.Where("monitor_id = ?", monitorID).Order("checked_at DESC")

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := query.Limit(limit).Offset(offset).Find(&histories).Error; err != nil {
		return nil, 0, err
	}

	return histories, total, nil
}

func GetChannelMonitorTemplate(id int) (*ChannelMonitorRequestTemplate, error) {
	template := &ChannelMonitorRequestTemplate{}
	err := DB.First(template, id).Error
	return template, err
}

func GetAllChannelMonitorTemplates(provider string) ([]*ChannelMonitorRequestTemplate, error) {
	var templates []*ChannelMonitorRequestTemplate
	query := DB.Order("provider, name")
	if provider != "" {
		query = query.Where("provider = ?", provider)
	}
	err := query.Find(&templates).Error
	return templates, err
}

func CreateChannelMonitorTemplate(template *ChannelMonitorRequestTemplate) error {
	return DB.Create(template).Error
}

func UpdateChannelMonitorTemplate(template *ChannelMonitorRequestTemplate) error {
	return DB.Save(template).Error
}

func DeleteChannelMonitorTemplate(id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		// Clear template_id references in monitors
		if err := tx.Model(&ChannelMonitor{}).Where("template_id = ?", id).Update("template_id", nil).Error; err != nil {
			return err
		}
		// Delete template
		return tx.Delete(&ChannelMonitorRequestTemplate{}, id).Error
	})
}

func GetMonitorsByTemplateID(templateID int) ([]*ChannelMonitor, error) {
	var monitors []*ChannelMonitor
	err := DB.Where("template_id = ?", templateID).Find(&monitors).Error
	return monitors, err
}

func GetAggregationWatermark() (*ChannelMonitorAggregationWatermark, error) {
	watermark := &ChannelMonitorAggregationWatermark{}
	err := DB.First(watermark).Error
	if err == gorm.ErrRecordNotFound {
		// Create initial watermark (30 days ago)
		watermark.LastAggregatedAt = time.Now().AddDate(0, 0, -30).Unix()
		if err := DB.Create(watermark).Error; err != nil {
			return nil, err
		}
		return watermark, nil
	}
	return watermark, err
}

func UpdateAggregationWatermark(timestamp int64) error {
	watermark := &ChannelMonitorAggregationWatermark{}
	if err := DB.First(watermark).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			watermark.LastAggregatedAt = timestamp
			return DB.Create(watermark).Error
		}
		return err
	}
	watermark.LastAggregatedAt = timestamp
	return DB.Save(watermark).Error
}

// GetChannelMonitorRollups retrieves daily rollup data for a monitor within a time window
func GetChannelMonitorRollups(monitorID int, model string, startDate string, endDate string) ([]*ChannelMonitorDailyRollup, error) {
	var rollups []*ChannelMonitorDailyRollup
	query := DB.Where("monitor_id = ? AND bucket_date >= ? AND bucket_date <= ?", monitorID, startDate, endDate)
	if model != "" {
		query = query.Where("model = ?", model)
	}
	err := query.Order("bucket_date ASC").Find(&rollups).Error
	return rollups, err
}
