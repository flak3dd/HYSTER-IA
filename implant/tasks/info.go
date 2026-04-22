package tasks

import (
	"os"
	"runtime"
	"time"
)

// InfoHandler gathers system information
func InfoHandler(task *Task, tun interface{}) TaskResult {
	info := map[string]interface{}{
		"os":           runtime.GOOS,
		"arch":         runtime.GOARCH,
		"hostname":     getHostname(),
		"username":     getUsername(),
		"pid":          getCurrentPID(),
		"uptime":       getUptime(),
		"timestamp":    time.Now().Unix(),
		"implant_info": map[string]interface{}{
			"version":    "0.1",
			"go_version": runtime.Version(),
			"cpu_count":  runtime.NumCPU(),
		},
	}

	return TaskResult{
		TaskID:    task.ID,
		Status:    "success",
		Result:    info,
		Timestamp: time.Now().Unix(),
	}
}

func getHostname() string {
	hostname, _ := os.Hostname()
	if hostname == "" {
		return "unknown"
	}
	return hostname
}

func getUsername() string {
	if runtime.GOOS == "windows" {
		return os.Getenv("USERNAME")
	}
	return os.Getenv("USER")
}

func getCurrentPID() int {
	return os.Getpid()
}

func getUptime() int64 {
	// Return process uptime in seconds
	return int64(time.Since(time.Now().Add(-time.Hour * 24 * 30)).Seconds()) // Placeholder
}