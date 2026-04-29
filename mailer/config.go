package main

import (
	"bufio"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/emersion/go-imap"
	"github.com/emersion/go-imap/client"
	"github.com/jhillyerd/enmime"
)

// ───── TYPES ─────

type Config struct {
	Workers int `json:"workers"`
	DelayMs int `json:"delay_ms"`
	MaxMsgs int `json:"max_msgs_per_account"`
}

type Account struct {
	Email    string
	Password string
}

type Result struct {
	Email       string
	Status      string // SUCCESS / FAIL
	Platform    string
	Attachments int
	Error       string
	Folders     string
}

// ───── FLAGS ─────

var (
	configFile   = flag.String("config", "config.json", "Config file")
	accountsFile = flag.String("accounts", "accounts.txt", "Accounts file: email:password")
	outDir       = flag.String("out", "migrated_attachments", "Directory for downloaded attachments")
	foldersFlag  = flag.String("folders", "INBOX", "Comma-separated folders to scan (e.g. INBOX,Sent,Archive)")
)

// ───── MAIN ─────

func main() {
	flag.Parse()

	os.MkdirAll(*outDir, 0755)

	cfg := loadConfig(*configFile)
	accounts := loadAccounts(*accountsFile)
	folders := parseFolders(*foldersFlag)

	log.Printf("IMAP Migrator — %d accounts | Folders: %v | Workers: %d", len(accounts), folders, cfg.Workers)

	var wg sync.WaitGroup
	sem := make(chan struct{}, cfg.Workers)
	results := make(chan Result, len(accounts))

	for _, acc := range accounts {
		wg.Add(1)
		go func(acc Account) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			time.Sleep(time.Duration(cfg.DelayMs) * time.Millisecond)

			res := processAccount(acc, cfg, folders)
			results <- res

			if res.Status == "SUCCESS" {
				log.Printf("OK %s (%s) — %d attachments from folders: %s", res.Email, res.Platform, res.Attachments, res.Folders)
			} else {
				log.Printf("FAIL %s — %s", res.Email, res.Error)
			}
		}(acc)
	}

	wg.Wait()
	close(results)
	writeReport(results)

	log.Println("Finished. Attachments saved in " + *outDir)
}

// ───── CONFIG & ACCOUNTS ─────

func parseFolders(flagValue string) []string {
	if flagValue == "" {
		return []string{"INBOX"}
	}
	parts := strings.Split(flagValue, ",")
	var clean []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			clean = append(clean, p)
		}
	}
	return clean
}

func loadConfig(path string) Config {
	data, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("Failed to read config: %v", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		log.Fatalf("Invalid config.json: %v", err)
	}
	if cfg.Workers == 0 {
		cfg.Workers = 3
	}
	if cfg.DelayMs == 0 {
		cfg.DelayMs = 1500
	}
	if cfg.MaxMsgs == 0 {
		cfg.MaxMsgs = 500
	}
	return cfg
}

func loadAccounts(path string) []Account {
	f, err := os.Open(path)
	if err != nil {
		log.Fatalf("Failed to open accounts file: %v", err)
	}
	defer f.Close()

	var accounts []Account
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 || strings.TrimSpace(parts[1]) == "" {
			log.Printf("Skipping line (no password): %s", line)
			continue
		}
		accounts = append(accounts, Account{
			Email:    strings.TrimSpace(parts[0]),
			Password: strings.TrimSpace(parts[1]),
		})
	}
	return accounts
}

// ───── ACCOUNT PROCESSING ─────

func processAccount(acc Account, cfg Config, folders []string) Result {
	platform := detectPlatform(acc.Email)
	res := Result{Email: acc.Email, Platform: platform}

	totalAttach := 0
	var processed []string

	for _, folder := range folders {
		count, err := processFolder(acc, folder)
		if err != nil {
			log.Printf("Warning: folder %s failed for %s: %v", folder, acc.Email, err)
			continue
		}
		processed = append(processed, folder)
		totalAttach += count
	}

	res.Attachments = totalAttach
	res.Folders = strings.Join(processed, ";")
	if len(processed) == 0 {
		res.Status = "FAIL"
		res.Error = "all folders failed"
	} else {
		res.Status = "SUCCESS"
	}
	return res
}

func processFolder(acc Account, folder string) (int, error) {
	host := getIMAPHost(acc.Email)
	addr := host + ":993"

	c, err := client.DialTLS(addr, &tls.Config{ServerName: host})
	if err != nil {
		return 0, fmt.Errorf("dial %s: %w", addr, err)
	}
	defer c.Logout()

	// Plain IMAP LOGIN — works with app passwords for Gmail/Microsoft
	if err := c.Login(acc.Email, acc.Password); err != nil {
		return 0, fmt.Errorf("login: %w", err)
	}

	// Select folder
	_, err = c.Select(folder, true) // read-only
	if err != nil {
		// Try common variations
		if folder == "Sent" {
			_, err = c.Select("Sent Items", true)
		} else if folder == "Trash" {
			_, err = c.Select("[Gmail]/Trash", true)
		}
		if err != nil {
			return 0, fmt.Errorf("select %s: %w", folder, err)
		}
	}

	return downloadAttachments(c, acc.Email, folder)
}

// ───── ATTACHMENT DOWNLOAD ─────

func downloadAttachments(c *client.Client, email, folder string) (int, error) {
	seqSet := new(imap.SeqSet)
	seqSet.AddRange(1, 500)

	section := &imap.BodySectionName{}
	items := []imap.FetchItem{section.FetchItem()}
	msgs := make(chan *imap.Message, 20)
	done := make(chan error, 1)

	go func() { done <- c.Fetch(seqSet, items, msgs) }()

	count := 0
	for msg := range msgs {
		if msg == nil {
			continue
		}
		body := msg.GetBody(section)
		if body == nil {
			continue
		}

		env, err := enmime.ReadEnvelope(body)
		if err != nil {
			continue
		}

		for _, att := range append(env.Attachments, env.Inlines...) {
			if len(att.Content) > 0 {
				saveAttachment(email, folder, att)
				count++
			}
		}
	}
	<-done
	return count, nil
}

func saveAttachment(email, folder string, att *enmime.Part) {
	safeEmail := strings.ReplaceAll(strings.ReplaceAll(email, "@", "_at_"), ".", "_")
	folderPath := filepath.Join(*outDir, safeEmail, folder)
	os.MkdirAll(folderPath, 0755)

	fname := att.FileName
	if fname == "" {
		fname = fmt.Sprintf("attachment_%s", time.Now().Format("20060102_150405"))
	}
	path := filepath.Join(folderPath, fname)
	_ = os.WriteFile(path, att.Content, 0644)
}

// ───── HELPERS ─────

func getIMAPHost(email string) string {
	domain := strings.ToLower(strings.Split(email, "@")[1])
	switch {
	case strings.Contains(domain, "gmail") || strings.Contains(domain, "google"):
		return "imap.gmail.com"
	case strings.Contains(domain, "outlook") || strings.Contains(domain, "office365") || strings.Contains(domain, "microsoft") || strings.Contains(domain, "hotmail") || strings.Contains(domain, "live"):
		return "outlook.office365.com"
	case strings.Contains(domain, "yahoo"):
		return "imap.mail.yahoo.com"
	default:
		return "imap." + domain
	}
}

func detectPlatform(email string) string {
	domain := strings.ToLower(strings.Split(email, "@")[1])
	switch {
	case strings.Contains(domain, "gmail") || strings.Contains(domain, "google"):
		return "gmail"
	case strings.Contains(domain, "outlook") || strings.Contains(domain, "office365") || strings.Contains(domain, "microsoft") || strings.Contains(domain, "hotmail") || strings.Contains(domain, "live"):
		return "microsoft"
	case strings.Contains(domain, "yahoo"):
		return "yahoo"
	default:
		return "other"
	}
}

func writeReport(results chan Result) {
	f, _ := os.Create("migration-report.csv")
	defer f.Close()
	fmt.Fprintln(f, "email,status,platform,attachments,folders,error")
	for r := range results {
		fmt.Fprintf(f, "%s,%s,%s,%d,%s,%s\n", r.Email, r.Status, r.Platform, r.Attachments, r.Folders, r.Error)
	}
}
