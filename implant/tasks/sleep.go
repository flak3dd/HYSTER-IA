package tasks

import (
	"fmt"
	"h2-c2-implant/config"
	"time"
)

// SleepHandler changes the beacon interval dynamically
func SleepHandler(task *Task, tun interface{}) TaskResult {
	seconds, ok := task.Args["seconds"].(float64)
	if !ok {
		return TaskResult{
			TaskID:    task.ID,
			Status:    "error",
			Error:     "seconds argument required",
			Timestamp: time.Now().Unix(),
		}
	}
	
	// Try to update the config if the tunnel has access to it
	var oldInterval int = 45 // default fallback
	var newInterval int = int(seconds)
	var message string
	
	// Check if tun is a HysteriaTunnel with config access
	// This is a simplified approach - in production, you'd have a proper config manager
	if tunnel, ok := tun.(interface{ GetConfig() *config.Config }); ok {
		cfg := tunnel.GetConfig()
		if cfg != nil {
			oldInterval = cfg.BaseInterval
			cfg.BaseInterval = newInterval
			message = fmt.Sprintf("Beacon interval updated from %ds to %ds", oldInterval, newInterval)
		} else {
			message = fmt.Sprintf("Beacon interval set to %ds (config update failed)", newInterval)
		}
	} else {
		message = fmt.Sprintf("Beacon interval requested to be %ds (dynamic update not available)", newInterval)
	}
	
	result := map[string]interface{}{
		"old_interval": fmt.Sprintf("%ds", oldInterval),
		"new_interval": fmt.Sprintf("%ds", newInterval),
		"message":      message,
	}

	return TaskResult{
		TaskID:    task.ID,
		Status:    "success",
		Result:    result,
		Timestamp: time.Now().Unix(),
	}
}