import type {
  HysteriaOnlineMap,
  HysteriaStreamDump,
  HysteriaTrafficMap,
} from "@/lib/hysteria/types"

// Simulated traffic data for demonstration
function generateMockTrafficData(): HysteriaTrafficMap {
  return {
    "token-abc123": { tx: 1024 * 1024 * 100, rx: 1024 * 1024 * 150 }, // 100MB tx, 150MB rx
    "token-def456": { tx: 1024 * 1024 * 50, rx: 1024 * 1024 * 75 },   // 50MB tx, 75MB rx
    "token-ghi789": { tx: 0, rx: 0 },                                   // No traffic
  }
}

function generateMockOnlineData(): HysteriaOnlineMap {
  return {
    "token-abc123": 2, // 2 connections
    "token-def456": 1, // 1 connection
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchTraffic(_clear = false): Promise<HysteriaTrafficMap> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100))
  
  // In a real implementation, this would call the actual Hysteria2 traffic API
  // For now, we return simulated data that updates over time
  const data = generateMockTrafficData()
  
  // Add some random variation to simulate real traffic
  for (const token in data) {
    data[token].tx += Math.floor(Math.random() * 1024 * 10) // Add random 0-10KB
    data[token].rx += Math.floor(Math.random() * 1024 * 15) // Add random 0-15KB
  }
  
  return data
}

export async function fetchOnline(): Promise<HysteriaOnlineMap> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50))
  
  // In a real implementation, this would call the actual Hysteria2 online API
  return generateMockOnlineData()
}

export async function kickUsers(ids: string[]): Promise<void> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200))
  
  // In a real implementation, this would call the actual Hysteria2 kick API
  console.log(`Kicking users: ${ids.join(', ')}`)
}

export async function dumpStreams(): Promise<HysteriaStreamDump> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 150))
  
  // In a real implementation, this would call the actual Hysteria2 dump API
  return {
    streams: [
      {
        state: "active",
        auth: "token-abc123",
        connection: 1,
        stream: 1,
        req_addr: "192.168.1.100:12345",
        hooked_req_addr: "192.168.1.100:12345",
        tx: 1024 * 1024 * 10,
        rx: 1024 * 1024 * 15,
        initial_at: new Date(Date.now() - 300000).toISOString(),
        last_active_at: new Date().toISOString()
      },
      {
        state: "active",
        auth: "token-def456",
        connection: 2,
        stream: 1,
        req_addr: "192.168.1.101:54321",
        hooked_req_addr: "192.168.1.101:54321",
        tx: 1024 * 1024 * 5,
        rx: 1024 * 1024 * 8,
        initial_at: new Date(Date.now() - 180000).toISOString(),
        last_active_at: new Date().toISOString()
      }
    ]
  }
}
