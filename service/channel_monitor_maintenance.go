package service

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// StartChannelMonitorMaintenanceTask starts the daily maintenance task
func StartChannelMonitorMaintenanceTask() {
	go func() {
		// Run at 2 AM every day
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()

		for {
			now := time.Now()
			// Check if it's 2 AM (hour == 2)
			if now.Hour() == 2 {
				runMaintenanceTasks()
			}
			<-ticker.C
		}
	}()
}

func runMaintenanceTasks() {
	common.SysLog("Channel Monitor: Running daily maintenance tasks...")

	// Run aggregation
	stats, err := RunDailyAggregation()
	if err != nil {
		common.SysError("Channel Monitor: Failed to run aggregation: " + err.Error())
	} else {
		common.SysLog("Channel Monitor: Aggregation completed - processed " +
			strconv.Itoa(stats.ProcessedDays) + " days")
	}

	// Cleanup old data
	if err := CleanupOldData(); err != nil {
		common.SysError("Channel Monitor: Failed to cleanup old data: " + err.Error())
	} else {
		common.SysLog("Channel Monitor: Old data cleanup completed")
	}
}
