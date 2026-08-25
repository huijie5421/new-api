package service

import (
	"fmt"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

// RunDailyAggregation performs daily aggregation of history into rollups
func RunDailyAggregation() (*AggregationStats, error) {
	// Get watermark
	watermark, err := model.GetAggregationWatermark()
	if err != nil {
		return nil, fmt.Errorf("failed to get watermark: %w", err)
	}

	now := time.Now()
	lastAggregated := time.Unix(watermark.LastAggregatedAt, 0)

	// Start from the day after last aggregated
	startDate := lastAggregated.AddDate(0, 0, 1).Truncate(24 * time.Hour)
	// Aggregate up to yesterday (don't aggregate today's incomplete data)
	endDate := now.AddDate(0, 0, -1).Truncate(24 * time.Hour)

	if startDate.After(endDate) {
		// Nothing to aggregate
		return &AggregationStats{
			StartDate:     startDate.Format("2006-01-02"),
			EndDate:       endDate.Format("2006-01-02"),
			ProcessedDays: 0,
		}, nil
	}

	// Limit processing to MaxAggregationDaysPerRun days
	daysDiff := int(endDate.Sub(startDate).Hours() / 24)
	if daysDiff > MaxAggregationDaysPerRun {
		endDate = startDate.AddDate(0, 0, MaxAggregationDaysPerRun-1)
	}

	stats := &AggregationStats{
		StartDate: startDate.Format("2006-01-02"),
		EndDate:   endDate.Format("2006-01-02"),
	}

	// Process each day
	currentDate := startDate
	for !currentDate.After(endDate) {
		dateStr := currentDate.Format("2006-01-02")

		if err := aggregateDay(dateStr); err != nil {
			return stats, fmt.Errorf("failed to aggregate day %s: %w", dateStr, err)
		}

		stats.ProcessedDays++
		currentDate = currentDate.AddDate(0, 0, 1)
	}

	// Update watermark
	if err := model.UpdateAggregationWatermark(endDate.Unix()); err != nil {
		return stats, fmt.Errorf("failed to update watermark: %w", err)
	}

	return stats, nil
}

// aggregateDay aggregates all history records for a specific day
func aggregateDay(dateStr string) error {
	dayStart := mustParseDate(dateStr).Unix()
	dayEnd := mustParseDate(dateStr).AddDate(0, 0, 1).Unix()

	// Get all history records for this day
	var histories []*model.ChannelMonitorHistory
	err := model.DB.Where("checked_at >= ? AND checked_at < ?", dayStart, dayEnd).Find(&histories).Error
	if err != nil {
		return err
	}

	if len(histories) == 0 {
		return nil
	}

	// Group by monitor_id and model
	type GroupKey struct {
		MonitorID int
		Model     string
	}

	groups := make(map[GroupKey][]*model.ChannelMonitorHistory)
	for _, h := range histories {
		key := GroupKey{MonitorID: h.MonitorID, Model: h.Model}
		groups[key] = append(groups[key], h)
	}

	// Create or update rollups for each group
	for key, records := range groups {
		if err := createOrUpdateRollup(key.MonitorID, key.Model, dateStr, records); err != nil {
			return err
		}
	}

	return nil
}

// createOrUpdateRollup creates or updates a daily rollup
func createOrUpdateRollup(monitorID int, modelName string, dateStr string, records []*model.ChannelMonitorHistory) error {
	totalChecks := len(records)
	successChecks := 0
	failureChecks := 0
	var latencies []int

	for _, r := range records {
		if r.Status == StatusSuccess {
			successChecks++
		} else {
			failureChecks++
		}
		if r.LatencyMs > 0 {
			latencies = append(latencies, r.LatencyMs)
		}
	}

	availabilityRate := 0.0
	if totalChecks > 0 {
		availabilityRate = float64(successChecks) / float64(totalChecks)
	}

	avgLatency := 0
	minLatency := 0
	maxLatency := 0
	p50Latency := 0
	p95Latency := 0
	p99Latency := 0

	if len(latencies) > 0 {
		sort.Ints(latencies)
		sum := 0
		for _, l := range latencies {
			sum += l
		}
		avgLatency = sum / len(latencies)
		minLatency = latencies[0]
		maxLatency = latencies[len(latencies)-1]
		p50Latency = percentile(latencies, 0.50)
		p95Latency = percentile(latencies, 0.95)
		p99Latency = percentile(latencies, 0.99)
	}

	// Find existing rollup
	var rollup model.ChannelMonitorDailyRollup
	err := model.DB.Where("monitor_id = ? AND model = ? AND bucket_date = ?", monitorID, modelName, dateStr).First(&rollup).Error

	if err == gorm.ErrRecordNotFound {
		// Create new rollup
		rollup = model.ChannelMonitorDailyRollup{
			MonitorID:        monitorID,
			Model:            modelName,
			BucketDate:       dateStr,
			TotalChecks:      totalChecks,
			SuccessChecks:    successChecks,
			FailureChecks:    failureChecks,
			AvgLatencyMs:     avgLatency,
			MinLatencyMs:     minLatency,
			MaxLatencyMs:     maxLatency,
			P50LatencyMs:     p50Latency,
			P95LatencyMs:     p95Latency,
			P99LatencyMs:     p99Latency,
			AvailabilityRate: availabilityRate,
		}
		return model.DB.Create(&rollup).Error
	} else if err != nil {
		return err
	}

	// Update existing rollup
	rollup.TotalChecks = totalChecks
	rollup.SuccessChecks = successChecks
	rollup.FailureChecks = failureChecks
	rollup.AvgLatencyMs = avgLatency
	rollup.MinLatencyMs = minLatency
	rollup.MaxLatencyMs = maxLatency
	rollup.P50LatencyMs = p50Latency
	rollup.P95LatencyMs = p95Latency
	rollup.P99LatencyMs = p99Latency
	rollup.AvailabilityRate = availabilityRate

	return model.DB.Save(&rollup).Error
}

// percentile calculates the percentile of a sorted slice
func percentile(sorted []int, p float64) int {
	if len(sorted) == 0 {
		return 0
	}
	index := int(float64(len(sorted)-1) * p)
	return sorted[index]
}

// mustParseDate parses a date string (YYYY-MM-DD) and panics on error
func mustParseDate(dateStr string) time.Time {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		panic(err)
	}
	return t
}

// CleanupOldData removes old history and rollup records
func CleanupOldData() error {
	cutoffTime := time.Now().AddDate(0, 0, -HistoryRetentionDays).Unix()

	// Delete old history
	if err := model.DB.Where("checked_at < ?", cutoffTime).Delete(&model.ChannelMonitorHistory{}).Error; err != nil {
		return fmt.Errorf("failed to delete old history: %w", err)
	}

	// Delete old rollups
	cutoffDate := time.Now().AddDate(0, 0, -AggregationRetentionDays).Format("2006-01-02")
	if err := model.DB.Where("bucket_date < ?", cutoffDate).Delete(&model.ChannelMonitorDailyRollup{}).Error; err != nil {
		return fmt.Errorf("failed to delete old rollups: %w", err)
	}

	return nil
}

// UpdateMonitorAvailability updates the rolling availability rates for a monitor
func UpdateMonitorAvailability(monitorID int) error {
	monitor, err := model.GetChannelMonitor(monitorID)
	if err != nil {
		return err
	}

	now := time.Now()

	// Calculate 7-day availability
	availability7d, err := calculateAvailability(monitorID, now.AddDate(0, 0, -7), now)
	if err != nil {
		return err
	}

	// Calculate 15-day availability
	availability15d, err := calculateAvailability(monitorID, now.AddDate(0, 0, -15), now)
	if err != nil {
		return err
	}

	// Calculate 30-day availability
	availability30d, err := calculateAvailability(monitorID, now.AddDate(0, 0, -30), now)
	if err != nil {
		return err
	}

	monitor.AvailabilityRate7d = &availability7d
	monitor.AvailabilityRate15d = &availability15d
	monitor.AvailabilityRate30d = &availability30d

	return model.UpdateChannelMonitor(monitor)
}

// calculateAvailability calculates the availability rate for a monitor in a time range
func calculateAvailability(monitorID int, start time.Time, end time.Time) (float64, error) {
	var histories []*model.ChannelMonitorHistory
	err := model.DB.Where("monitor_id = ? AND checked_at >= ? AND checked_at < ?", monitorID, start.Unix(), end.Unix()).Find(&histories).Error
	if err != nil {
		return 0, err
	}

	if len(histories) == 0 {
		return 0, nil
	}

	successCount := 0
	for _, h := range histories {
		if h.Status == StatusSuccess {
			successCount++
		}
	}

	return float64(successCount) / float64(len(histories)), nil
}
