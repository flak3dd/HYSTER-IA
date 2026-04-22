package tasks

import "time"

type TaskType string

const (
	TaskExec         TaskType = "exec"
	TaskDownload     TaskType = "download"
	TaskUpload       TaskType = "upload"
	TaskScreenshot   TaskType = "screenshot"
	TaskKeylogger    TaskType = "keylogger"
	TaskPersist      TaskType = "persist"
	TaskInject       TaskType = "inject"
	TaskLateral      TaskType = "lateral"
	TaskSleep        TaskType = "sleep"
	TaskSelfDestruct TaskType = "selfdestruct"
)

type Task struct {
	ID        string          `json:"id"`
	Type      TaskType        `json:"type"`
	Params    json.RawMessage `json:"params"` // flexible per-task params
	Timeout   time.Duration   `json:"timeout"`
}

type TaskResult struct {
	TaskID    string `json:"task_id"`
	Success   bool   `json:"success"`
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
	Data      []byte `json:"data,omitempty"` // binary data (screenshots, files)
	Timestamp time.Time `json:"timestamp"`
}