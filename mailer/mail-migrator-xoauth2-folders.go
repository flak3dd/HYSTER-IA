package mailer
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/client"
	"github.com/jhillyerd/enmime"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"golang.org/x/oauth2/microsoft"
)

type Config struct {
	GmailClientID     string `json:"gmail_client_id"`
	GmailClientSecret string `json:"gmail_client_secret"`
	MSClientID        string `json:"ms_client_id"`
	MSClientSecret    string `json:"ms_client_secret"`
	Workers           int    `json:"workers"`
	DelayMs           int    `json:"delay_ms"`
	MaxMsgs           int    `json:"max_msgs_per_account"`
}

type Account struct {
	Email    string `json:"email"`
	Password string `json:"password,omitempty"`
}

type Result struct {
	Email       string
	Status      string
	Platform    string
	Attachments int
	Error       string
	Folders     string // summary of processed folders
}

var (
	configFile   = flag.String("config", "config.json", "Config file")
	accountsFile = flag.String("accounts", "accounts.txt", "Accounts file")
	outDir       = flag.String("out", "migrated_attachments", "Output base directory")
	foldersFlag  = flag.String("folders", "INBOX", "Comma-separated folders to scan (e.g. INBOX,Sent,Archive)")
	tokensDir    = "tokens"
)

var tokenMu sync.Map

func main() {
	flag.Parse()

	os.MkdirAll(*outDir, 0755)
	os.MkdirAll(tokensDir, 0700)

	cfg := loadConfig(*configFile)
	accounts := loadAccounts(*accountsFile)
	folders := parseFolders(*foldersFlag)

	log.Printf("🚀 IMAP XOAUTH2 Migrator with Folder Support — %d accounts | Folders: %v", len(accounts), folders)

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

			res := processAccountWithFolders(acc, cfg, folders)
			results <- res

			if res.Status == "SUCCESS" {
				log.Printf("✅ %s (%s) — %d attachments from folders: %s", res.Email, res.Platform, res.Attachments, res.Folders)
			} else {
				log.Printf("❌ %s: %s", res.Email, res.Error)
			}
		}(acc)
	}

	wg.Wait()
	close(results)
	writeReport(results)

	log.Println("✅ Finished. Tokens cached in ./tokens/ | Attachments saved in " + *outDir)
}

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

// ───── TOKEN CACHING (unchanged from previous full version) ─────
func loadCachedToken(email string) (*oauth2.Token, error) {
	// ... (same as before)
	path := filepath.Join(tokensDir, sanitizeEmail(email)+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var ct CachedToken
	json.Unmarshal(data, &ct)
	return &oauth2.Token{AccessToken: ct.AccessToken, RefreshToken: ct.RefreshToken, Expiry: ct.Expiry, TokenType: ct.TokenType}, nil
}

func saveToken(email string, token *oauth2.Token) error {
	// ... (same as before)
	ct := CachedToken{AccessToken: token.AccessToken, RefreshToken: token.RefreshToken, Expiry: token.Expiry, TokenType: token.TokenType}
	data, _ := json.MarshalIndent(ct, "", "  ")
	return os.WriteFile(filepath.Join(tokensDir, sanitizeEmail(email)+".json"), data, 0600)
}

func sanitizeEmail(email string) string {
	return strings.ReplaceAll(strings.ReplaceAll(email, "@", "_at_"), ".", "_")
}

// (SavingTokenSource, getTokenWithCache, performDeviceCodeFlow remain the same as previous version — copy them in if needed)

// ───── PROCESSING WITH FOLDERS ─────
func processAccountWithFolders(acc Account, cfg Config, folders []string) Result {
	domain := strings.Split(acc.Email, "@")[1]
	platform := detectPlatform(domain)
	res := Result{Email: acc.Email, Platform: platform}

	if platform == "selfhosted" {
		return doIMAPBasicWithFolders(acc, folders, res)
	}

	token, err := getTokenWithCache(acc.Email, platform, cfg)
	if err != nil {
		res.Status = "FAIL"
		res.Error = "Token: " + err.Error()
		return res
	}

	totalAttach := 0
	processed := []string{}

	for _, folder := range folders {
		err := doIMAPXOAuthFolder(acc.Email, token.AccessToken, platform, folder, &res)
		if err != nil {
			log.Printf("Warning: Folder %s failed for %s: %v", folder, acc.Email, err)
			continue
		}
		processed = append(processed, folder)
		totalAttach += res.Attachments // accumulate (res.Attachments updated per folder)
	}

	res.Attachments = totalAttach
	res.Folders = strings.Join(processed, ";")
	res.Status = "SUCCESS"
	return res
}

func doIMAPXOAuthFolder(email, accessToken, platform, folder string, res *Result) error {
	host := getIMAPHost(email)

	c, err := client.DialTLS(host+":993", &tls.Config{ServerName: host})
	if err != nil {
		return err
	}
	defer c.Logout()

	xoauth := &xoauth2Client{user: email, token: accessToken}
	if err := c.Authenticate(xoauth); err != nil {
		return err
	}

	// Select the specific folder
	_, err = c.Select(folder, false)
	if err != nil {
		// Try common variations (e.g. "Sent Items" vs "Sent")
		if folder == "Sent" {
			_, err = c.Select("Sent Items", false)
		}
		if err != nil {
			return fmt.Errorf("select folder %s: %w", folder, err)
		}
	}

	return downloadAttachmentsFromFolder(c, email, folder, res)
}

func downloadAttachmentsFromFolder(c *client.Client, email, folder string, res *Result) error {
	seqSet := &imap.SeqSet{}
	seqSet.AddRange(1, 500) // safety limit per folder

	fetch := []imap.FetchItem{imap.FetchRFC822}
	msgs := make(chan *imap.Message, 20)
	done := make(chan error, 1)

	go func() { done <- c.Fetch(seqSet, fetch, msgs) }()

	count := 0
	for msg := range msgs {
		if msg == nil {
			continue
		}
		body := msg.GetBody(imap.FetchRFC822)
		if body == nil {
			continue
		}

		env, err := enmime.ReadEnvelope(body)
		if err != nil {
			continue
		}

		for _, att := range append(env.Attachments, env.Inlines...) {
			if len(att.Content) > 0 {
				saveAttachmentWithFolder(email, folder, env.GetHeader("Subject"), att)
				count++
			}
		}
	}
	<-done
	res.Attachments = count // per-folder count (caller accumulates)
	return nil
}

func saveAttachmentWithFolder(email, folder, subject string, att *enmime.Part) {
	safeEmail := sanitizeEmail(email)
	folderPath := filepath.Join(*outDir, safeEmail, folder)
	os.MkdirAll(folderPath, 0755)

	fname := att.FileName
	if fname == "" {
		fname = fmt.Sprintf("attachment_%s", time.Now().Format("20060102_150405"))
	}
	path := filepath.Join(folderPath, fname)
	_ = os.WriteFile(path, att.Content, 0644)
}

// XOAUTH2 client (unchanged)
type xoauth2Client struct {
	user  string
	token string
}

func (a *xoauth2Client) Start() (string, []byte, error) {
	resp := fmt.Sprintf("user=%s\x01auth=Bearer %s\x01\x01", a.user, a.token)
	return "XOAUTH2", []byte(resp), nil
}

func (a *xoauth2Client) Next([]byte) ([]byte, error) { return nil, nil }

// Other helpers: detectPlatform, getIMAPHost, loadConfig, loadAccounts, writeReport, doIMAPBasicWithFolders (stub), etc. remain the same as previous version.

func detectPlatform(domain string) string {
	domain = strings.ToLower(domain)
	if strings.Contains(domain, "gmail") || strings.Contains(domain, "google") {
		return "gmail"
	}
	if strings.Contains(domain, "outlook") || strings.Contains(domain, "office365") || strings.Contains(domain, "microsoft") {
		return "microsoft"
	}
	return "selfhosted"
}

func getIMAPHost(email string) string {
	// same as before
	domain := strings.ToLower(strings.Split(email, "@")[1])
	switch {
	case strings.Contains(domain, "gmail") || strings.Contains(domain, "google"):
		return "imap.gmail.com"
	case strings.Contains(domain, "outlook") || strings.Contains(domain, "office365") || strings.Contains(domain, "microsoft"):
		return "outlook.office365.com"
	default:
		return "imap." + domain
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

