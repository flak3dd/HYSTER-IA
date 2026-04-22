package tasks

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"time"
)

// ExecHandler executes system commands
func ExecHandler(task *Task, tun interface{}) TaskResult {
	command, ok := task.Args["command"].(string)
	if !ok {
		return TaskResult{
			TaskID:    task.ID,
			Status:    "error",
			Error:     "command argument required",
			Timestamp: time.Now().Unix(),
		}
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/c", command)
	} else {
		cmd = exec.Command("sh", "-c", command)
	}

	// Set timeout if specified
	if task.Timeout > 0 {
		cmd = exec.CommandContext(context.Background(), cmd.Args[0], cmd.Args[1:]...)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return TaskResult{
			TaskID:    task.ID,
			Status:    "error",
			Error:     fmt.Sprintf("command failed: %v\nStderr: %s", err, stderr.String()),
			Timestamp: time.Now().Unix(),
		}
	}

	result := map[string]interface{}{
		"stdout": stdout.String(),
		"stderr": stderr.String(),
		"command": command,
	}

	return TaskResult{
		TaskID:    task.ID,
		Status:    "success",
		Result:    result,
		Timestamp: time.Now().Unix(),
	}
}