package service

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/bytedance/gopkg/util/gopool"
)

// ChannelMonitorRunner manages all monitor goroutines
type ChannelMonitorRunner struct {
	monitors      map[int]*monitorTask
	monitorsMutex sync.RWMutex
	workerPool    gopool.Pool
	stopChan      chan struct{}
	wg            sync.WaitGroup
	running       bool
}

// monitorTask represents a running monitor task
type monitorTask struct {
	monitor    *model.ChannelMonitor
	ticker     *time.Ticker
	cancelFunc context.CancelFunc
}

var globalRunner *ChannelMonitorRunner
var runnerOnce sync.Once

// GetChannelMonitorRunner returns the global runner instance
func GetChannelMonitorRunner() *ChannelMonitorRunner {
	runnerOnce.Do(func() {
		globalRunner = &ChannelMonitorRunner{
			monitors:   make(map[int]*monitorTask),
			workerPool: gopool.NewPool("ChannelMonitorPool", 1000, gopool.NewConfig()),
			stopChan:   make(chan struct{}),
		}
	})
	return globalRunner
}

// Start initializes and starts the runner
func (r *ChannelMonitorRunner) Start() error {
	r.monitorsMutex.Lock()
	defer r.monitorsMutex.Unlock()

	if r.running {
		return fmt.Errorf("runner is already running")
	}

	common.SysLog("Channel Monitor Runner: Starting...")

	// Load all enabled monitors
	monitors, err := model.GetAllChannelMonitors(boolPtr(true))
	if err != nil {
		return fmt.Errorf("failed to load monitors: %w", err)
	}

	// Schedule each monitor
	for _, mon := range monitors {
		r.scheduleMonitorLocked(mon)
	}

	r.running = true
	common.SysLog(fmt.Sprintf("Channel Monitor Runner: Started with %d monitors", len(monitors)))

	return nil
}

// Stop gracefully shuts down the runner
func (r *ChannelMonitorRunner) Stop() {
	r.monitorsMutex.Lock()
	defer r.monitorsMutex.Unlock()

	if !r.running {
		return
	}

	common.SysLog("Channel Monitor Runner: Stopping...")
	close(r.stopChan)

	// Cancel all monitor tasks
	for id, task := range r.monitors {
		task.ticker.Stop()
		task.cancelFunc()
		delete(r.monitors, id)
	}

	// Wait for all goroutines to finish
	r.wg.Wait()

	r.running = false
	common.SysLog("Channel Monitor Runner: Stopped")
}

// Schedule adds or updates a monitor in the runner
func (r *ChannelMonitorRunner) Schedule(monitor *model.ChannelMonitor) {
	r.monitorsMutex.Lock()
	defer r.monitorsMutex.Unlock()

	if !r.running {
		return
	}

	// Unschedule existing task if present
	if task, exists := r.monitors[monitor.ID]; exists {
		task.ticker.Stop()
		task.cancelFunc()
		delete(r.monitors, monitor.ID)
	}

	// Schedule new task if enabled
	if monitor.Enabled {
		r.scheduleMonitorLocked(monitor)
	}
}

// Unschedule removes a monitor from the runner
func (r *ChannelMonitorRunner) Unschedule(monitorID int) {
	r.monitorsMutex.Lock()
	defer r.monitorsMutex.Unlock()

	if task, exists := r.monitors[monitorID]; exists {
		task.ticker.Stop()
		task.cancelFunc()
		delete(r.monitors, monitorID)
	}
}

// scheduleMonitorLocked schedules a monitor (caller must hold lock)
func (r *ChannelMonitorRunner) scheduleMonitorLocked(monitor *model.ChannelMonitor) {
	ctx, cancel := context.WithCancel(context.Background())
	interval := time.Duration(monitor.IntervalSeconds) * time.Second
	ticker := time.NewTicker(interval)

	task := &monitorTask{
		monitor:    monitor,
		ticker:     ticker,
		cancelFunc: cancel,
	}

	r.monitors[monitor.ID] = task

	// Start goroutine for this monitor
	r.wg.Add(1)
	go r.runMonitor(ctx, task)
}

// runMonitor runs a monitor task in a goroutine
func (r *ChannelMonitorRunner) runMonitor(ctx context.Context, task *monitorTask) {
	defer r.wg.Done()

	monitorID := task.monitor.ID

	// Run initial check immediately
	r.executeCheck(ctx, task.monitor)

	for {
		select {
		case <-ctx.Done():
			return
		case <-r.stopChan:
			return
		case <-task.ticker.C:
			// Reload monitor config to pick up any changes
			monitor, err := model.GetChannelMonitor(monitorID)
			if err != nil {
				common.SysError(fmt.Sprintf("Channel Monitor %d: Failed to reload config: %v", monitorID, err))
				continue
			}

			// Update task monitor reference
			task.monitor = monitor

			// Execute check
			r.executeCheck(ctx, monitor)
		}
	}
}

// executeCheck performs the actual check for all models
func (r *ChannelMonitorRunner) executeCheck(ctx context.Context, monitor *model.ChannelMonitor) {
	// Parse extra models
	var extraModels []string
	if monitor.ExtraModels != "" {
		if err := common.Unmarshal([]byte(monitor.ExtraModels), &extraModels); err != nil {
			common.SysError(fmt.Sprintf("Channel Monitor %d: Failed to parse extra_models: %v", monitor.ID, err))
			extraModels = []string{}
		}
	}

	// Build model list (primary + extra)
	models := []string{monitor.PrimaryModel}
	models = append(models, extraModels...)

	// Submit checks to worker pool
	var wg sync.WaitGroup
	results := make([]*CheckResult, 0, len(models))
	resultsMutex := sync.Mutex{}

	for _, modelName := range models {
		wg.Add(1)
		model := modelName // Capture for closure

		r.workerPool.Go(func() {
			defer wg.Done()

			result := PerformCheck(ctx, monitor, model)

			resultsMutex.Lock()
			results = append(results, result)
			resultsMutex.Unlock()
		})
	}

	wg.Wait()

	// Save results to database
	for _, result := range results {
		history := &model.ChannelMonitorHistory{
			MonitorID:  result.MonitorID,
			Model:      result.Model,
			Status:     result.Status,
			LatencyMs:  result.LatencyMs,
			ErrorMsg:   result.ErrorMsg,
			CheckedAt:  result.CheckedAt,
			ResponseOK: result.ResponseOK,
		}

		if err := model.DB.Create(history).Error; err != nil {
			common.SysError(fmt.Sprintf("Channel Monitor %d: Failed to save history: %v", monitor.ID, err))
		}
	}

	// Update monitor last check info (use primary model result)
	if len(results) > 0 {
		primaryResult := results[0]
		now := time.Now().Unix()
		monitor.LastCheckAt = &now
		monitor.LastStatus = primaryResult.Status
		monitor.LastLatencyMs = &primaryResult.LatencyMs

		if err := model.UpdateChannelMonitor(monitor); err != nil {
			common.SysError(fmt.Sprintf("Channel Monitor %d: Failed to update monitor: %v", monitor.ID, err))
		}

		// Update availability rates
		if err := UpdateMonitorAvailability(monitor.ID); err != nil {
			common.SysError(fmt.Sprintf("Channel Monitor %d: Failed to update availability: %v", monitor.ID, err))
		}
	}
}

// RunNow executes a manual check for a monitor and returns results
func (r *ChannelMonitorRunner) RunNow(monitorID int) (*MonitorRunResult, error) {
	monitor, err := model.GetChannelMonitor(monitorID)
	if err != nil {
		return nil, fmt.Errorf("failed to get monitor: %w", err)
	}

	// Parse extra models
	var extraModels []string
	if monitor.ExtraModels != "" {
		if err := common.Unmarshal([]byte(monitor.ExtraModels), &extraModels); err != nil {
			return nil, fmt.Errorf("failed to parse extra_models: %w", err)
		}
	}

	// Build model list
	models := []string{monitor.PrimaryModel}
	models = append(models, extraModels...)

	// Execute checks in parallel
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(monitor.TimeoutSeconds+5)*time.Second)
	defer cancel()

	results := make([]ModelCheckResult, 0, len(models))
	resultsMutex := sync.Mutex{}
	var wg sync.WaitGroup

	for _, modelName := range models {
		wg.Add(1)
		mName := modelName

		r.workerPool.Go(func() {
			defer wg.Done()

			checkResult := PerformCheck(ctx, monitor, mName)

			modelResult := ModelCheckResult{
				Model:      checkResult.Model,
				Status:     checkResult.Status,
				LatencyMs:  checkResult.LatencyMs,
				ErrorMsg:   checkResult.ErrorMsg,
				ResponseOK: checkResult.ResponseOK,
			}

			resultsMutex.Lock()
			results = append(results, modelResult)
			resultsMutex.Unlock()

			// Save to history
			history := &model.ChannelMonitorHistory{
				MonitorID:  checkResult.MonitorID,
				Model:      checkResult.Model,
				Status:     checkResult.Status,
				LatencyMs:  checkResult.LatencyMs,
				ErrorMsg:   checkResult.ErrorMsg,
				CheckedAt:  checkResult.CheckedAt,
				ResponseOK: checkResult.ResponseOK,
			}
			model.DB.Create(history)
		})
	}

	wg.Wait()

	// Update monitor last check info
	if len(results) > 0 {
		now := time.Now().Unix()
		monitor.LastCheckAt = &now
		monitor.LastStatus = results[0].Status
		monitor.LastLatencyMs = &results[0].LatencyMs
		model.UpdateChannelMonitor(monitor)

		// Update availability
		UpdateMonitorAvailability(monitor.ID)
	}

	return &MonitorRunResult{
		MonitorID: monitorID,
		Results:   results,
	}, nil
}

func boolPtr(b bool) *bool {
	return &b
}
