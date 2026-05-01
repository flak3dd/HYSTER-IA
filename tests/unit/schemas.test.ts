/**
 * Unit tests for all Zod schemas defined in lib/db/schema.ts
 */

import {
  ClientUserStatus,
  ClientUser,
  ClientUserCreate,
  ClientUserUpdate,
  NodeStatus,
  Node,
  NodeCreate,
  NodeUpdate,
  TlsConfig,
  ObfsConfig,
  BandwidthConfig,
  MasqueradeConfig,
  TrafficStatsApiConfig,
  ServerConfig,
  UsageRecord,
  ImplantStatus,
  Implant,
  ImplantCreate,
  ImplantUpdate,
  ImplantTaskStatus,
  ImplantTask,
  ImplantTaskCreate,
  PayloadBuildStatus,
  PayloadBuild,
  PayloadBuildCreate,
  PayloadBuildUpdate,
} from "@/lib/db/schema"

const NOW = Date.now()

/* ------------------------------------------------------------------ */
/*  ClientUserStatus                                                   */
/* ------------------------------------------------------------------ */
describe("ClientUserStatus", () => {
  it("accepts valid statuses", () => {
    expect(ClientUserStatus.parse("active")).toBe("active")
    expect(ClientUserStatus.parse("disabled")).toBe("disabled")
    expect(ClientUserStatus.parse("expired")).toBe("expired")
  })
  it("rejects unknown status", () => {
    expect(ClientUserStatus.safeParse("unknown").success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  ClientUser                                                         */
/* ------------------------------------------------------------------ */
describe("ClientUser", () => {
  const valid = {
    id: "u1",
    displayName: "Alice",
    authToken: "secret1234",
    status: "active",
    quotaBytes: null,
    usedBytes: 0,
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  }

  it("parses a valid user", () => {
    const result = ClientUser.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("applies default status", () => {
    const { status, ...rest } = valid
    const result = ClientUser.safeParse(rest)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.status).toBe("active")
  })

  it("rejects empty id", () => {
    expect(ClientUser.safeParse({ ...valid, id: "" }).success).toBe(false)
  })

  it("rejects authToken shorter than 8 chars", () => {
    expect(ClientUser.safeParse({ ...valid, authToken: "short" }).success).toBe(false)
  })

  it("rejects notes over 1000 chars", () => {
    expect(
      ClientUser.safeParse({ ...valid, notes: "x".repeat(1001) }).success,
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  ClientUserCreate                                                   */
/* ------------------------------------------------------------------ */
describe("ClientUserCreate", () => {
  it("parses minimal create input", () => {
    const result = ClientUserCreate.safeParse({
      displayName: "Bob",
      authToken: "mytoken1",
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing displayName", () => {
    expect(ClientUserCreate.safeParse({ authToken: "mytoken1" }).success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  ClientUserUpdate                                                   */
/* ------------------------------------------------------------------ */
describe("ClientUserUpdate", () => {
  it("accepts empty object (all optional)", () => {
    expect(ClientUserUpdate.safeParse({}).success).toBe(true)
  })

  it("accepts partial fields", () => {
    expect(ClientUserUpdate.safeParse({ displayName: "Updated" }).success).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/*  NodeStatus                                                         */
/* ------------------------------------------------------------------ */
describe("NodeStatus", () => {
  const statuses = ["stopped", "starting", "running", "stopping", "errored"]
  statuses.forEach((s) => {
    it(`accepts '${s}'`, () => expect(NodeStatus.parse(s)).toBe(s))
  })
  it("rejects unknown", () => expect(NodeStatus.safeParse("dead").success).toBe(false))
})

/* ------------------------------------------------------------------ */
/*  Node                                                               */
/* ------------------------------------------------------------------ */
describe("Node", () => {
  const valid = {
    id: "n1",
    name: "node-1",
    hostname: "10.0.0.1",
    listenAddr: ":443",
    status: "stopped",
    tags: [],
    profileId: null,
    lastHeartbeatAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  }

  it("parses a valid node", () => {
    expect(Node.safeParse(valid).success).toBe(true)
  })

  it("applies default listenAddr", () => {
    const { listenAddr, ...rest } = valid
    const result = Node.safeParse(rest)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.listenAddr).toBe(":443")
  })

  it("rejects missing hostname", () => {
    const { hostname, ...rest } = valid
    expect(Node.safeParse(rest).success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  NodeCreate                                                         */
/* ------------------------------------------------------------------ */
describe("NodeCreate", () => {
  it("parses minimal input", () => {
    expect(NodeCreate.safeParse({ name: "n1", hostname: "1.2.3.4" }).success).toBe(true)
  })

  it("rejects missing name", () => {
    expect(NodeCreate.safeParse({ hostname: "1.2.3.4" }).success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  NodeUpdate                                                         */
/* ------------------------------------------------------------------ */
describe("NodeUpdate", () => {
  it("accepts all-optional update", () => {
    expect(NodeUpdate.safeParse({}).success).toBe(true)
  })

  it("accepts status field", () => {
    expect(NodeUpdate.safeParse({ status: "running" }).success).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/*  TlsConfig                                                          */
/* ------------------------------------------------------------------ */
describe("TlsConfig", () => {
  it("parses manual mode", () => {
    const result = TlsConfig.safeParse({
      mode: "manual",
      certPath: "/etc/cert.pem",
      keyPath: "/etc/key.pem",
    })
    expect(result.success).toBe(true)
  })

  it("parses acme mode", () => {
    const result = TlsConfig.safeParse({
      mode: "acme",
      domains: ["example.com"],
      email: "admin@example.com",
    })
    expect(result.success).toBe(true)
  })

  it("rejects acme with invalid email", () => {
    expect(
      TlsConfig.safeParse({ mode: "acme", domains: ["x.com"], email: "not-email" }).success,
    ).toBe(false)
  })

  it("rejects acme with empty domains", () => {
    expect(
      TlsConfig.safeParse({ mode: "acme", domains: [], email: "a@b.com" }).success,
    ).toBe(false)
  })

  it("rejects unknown mode", () => {
    expect(TlsConfig.safeParse({ mode: "letsencrypt" }).success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  ObfsConfig                                                         */
/* ------------------------------------------------------------------ */
describe("ObfsConfig", () => {
  it("accepts undefined (optional)", () => {
    expect(ObfsConfig.safeParse(undefined).success).toBe(true)
  })

  it("parses salamander config", () => {
    expect(
      ObfsConfig.safeParse({ type: "salamander", password: "strongpassword" }).success,
    ).toBe(true)
  })

  it("rejects password shorter than 8", () => {
    expect(
      ObfsConfig.safeParse({ type: "salamander", password: "short" }).success,
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  BandwidthConfig                                                    */
/* ------------------------------------------------------------------ */
describe("BandwidthConfig", () => {
  it("accepts undefined", () => {
    expect(BandwidthConfig.safeParse(undefined).success).toBe(true)
  })

  it("parses up/down", () => {
    expect(BandwidthConfig.safeParse({ up: "100mbps", down: "200mbps" }).success).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/*  MasqueradeConfig                                                   */
/* ------------------------------------------------------------------ */
describe("MasqueradeConfig", () => {
  it("accepts undefined", () => {
    expect(MasqueradeConfig.safeParse(undefined).success).toBe(true)
  })

  it("parses proxy type", () => {
    const result = MasqueradeConfig.safeParse({
      type: "proxy",
      proxy: { url: "https://example.com", rewriteHost: true },
    })
    expect(result.success).toBe(true)
  })

  it("rejects proxy url without https/http scheme", () => {
    const result = MasqueradeConfig.safeParse({
      type: "proxy",
      proxy: { url: "not-a-url", rewriteHost: true },
    })
    expect(result.success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  TrafficStatsApiConfig                                              */
/* ------------------------------------------------------------------ */
describe("TrafficStatsApiConfig", () => {
  it("parses valid config", () => {
    expect(
      TrafficStatsApiConfig.safeParse({ listen: ":25000", secret: "1234567890123456" }).success,
    ).toBe(true)
  })

  it("rejects short secret (< 16 chars)", () => {
    expect(
      TrafficStatsApiConfig.safeParse({ listen: ":25000", secret: "short" }).success,
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  UsageRecord                                                        */
/* ------------------------------------------------------------------ */
describe("UsageRecord", () => {
  it("parses valid record", () => {
    expect(
      UsageRecord.safeParse({
        userId: "u1",
        nodeId: "n1",
        tx: 1024,
        rx: 2048,
        capturedAt: NOW,
      }).success,
    ).toBe(true)
  })

  it("rejects negative tx", () => {
    expect(
      UsageRecord.safeParse({ userId: "u1", nodeId: "n1", tx: -1, rx: 0, capturedAt: NOW }).success,
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  ImplantStatus                                                      */
/* ------------------------------------------------------------------ */
describe("ImplantStatus", () => {
  const statuses = ["active", "inactive", "compromised", "exited"]
  statuses.forEach((s) => it(`accepts '${s}'`, () => expect(ImplantStatus.parse(s)).toBe(s)))
  it("rejects unknown", () => expect(ImplantStatus.safeParse("dead").success).toBe(false))
})

/* ------------------------------------------------------------------ */
/*  Implant                                                            */
/* ------------------------------------------------------------------ */
describe("Implant", () => {
  const valid = {
    id: "i1",
    implantId: "imp-uuid",
    name: "implant-1",
    type: "shell",
    architecture: "x86_64",
    status: "active",
    firstSeen: NOW,
    config: {},
    transportConfig: {},
    createdAt: NOW,
    updatedAt: NOW,
  }

  it("parses a valid implant", () => {
    expect(Implant.safeParse(valid).success).toBe(true)
  })

  it("rejects missing type", () => {
    const { type, ...rest } = valid
    expect(Implant.safeParse(rest).success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  ImplantCreate                                                      */
/* ------------------------------------------------------------------ */
describe("ImplantCreate", () => {
  it("parses valid create", () => {
    expect(
      ImplantCreate.safeParse({
        name: "imp",
        type: "shell",
        architecture: "arm64",
        config: {},
        transportConfig: {},
      }).success,
    ).toBe(true)
  })

  it("rejects missing architecture", () => {
    expect(
      ImplantCreate.safeParse({ name: "imp", type: "shell", config: {}, transportConfig: {} }).success,
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  ImplantUpdate                                                      */
/* ------------------------------------------------------------------ */
describe("ImplantUpdate", () => {
  it("accepts empty object", () => {
    expect(ImplantUpdate.safeParse({}).success).toBe(true)
  })

  it("accepts status field", () => {
    expect(ImplantUpdate.safeParse({ status: "inactive" }).success).toBe(true)
  })

  it("rejects invalid status", () => {
    expect(ImplantUpdate.safeParse({ status: "unknown" }).success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  ImplantTaskStatus                                                  */
/* ------------------------------------------------------------------ */
describe("ImplantTaskStatus", () => {
  ["pending", "running", "completed", "failed"].forEach((s) =>
    it(`accepts '${s}'`, () => expect(ImplantTaskStatus.parse(s)).toBe(s)),
  )
  it("rejects unknown", () => expect(ImplantTaskStatus.safeParse("queued").success).toBe(false))
})

/* ------------------------------------------------------------------ */
/*  ImplantTask                                                        */
/* ------------------------------------------------------------------ */
describe("ImplantTask", () => {
  const valid = {
    id: "t1",
    implantId: "imp-uuid",
    taskId: "task-uuid",
    type: "exec",
    args: { cmd: "whoami" },
    status: "pending",
    createdAt: NOW,
  }

  it("parses a valid task", () => {
    expect(ImplantTask.safeParse(valid).success).toBe(true)
  })

  it("rejects missing implantId", () => {
    const { implantId, ...rest } = valid
    expect(ImplantTask.safeParse(rest).success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  ImplantTaskCreate                                                  */
/* ------------------------------------------------------------------ */
describe("ImplantTaskCreate", () => {
  it("parses valid create", () => {
    expect(
      ImplantTaskCreate.safeParse({
        implantId: "imp-uuid",
        taskId: "task-uuid",
        type: "exec",
        args: {},
      }).success,
    ).toBe(true)
  })

  it("rejects missing taskId", () => {
    expect(
      ImplantTaskCreate.safeParse({ implantId: "i", type: "exec", args: {} }).success,
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  PayloadBuildStatus                                                 */
/* ------------------------------------------------------------------ */
describe("PayloadBuildStatus", () => {
  ["pending", "building", "ready", "failed"].forEach((s) =>
    it(`accepts '${s}'`, () => expect(PayloadBuildStatus.parse(s)).toBe(s)),
  )
  it("rejects unknown", () => expect(PayloadBuildStatus.safeParse("done").success).toBe(false))
})

/* ------------------------------------------------------------------ */
/*  PayloadBuild                                                       */
/* ------------------------------------------------------------------ */
describe("PayloadBuild", () => {
  const valid = {
    id: "pb1",
    name: "dropper-v1",
    type: "exe",
    status: "pending",
    config: {},
    buildLogs: [],
    createdAt: NOW,
    updatedAt: NOW,
  }

  it("parses a valid build", () => {
    expect(PayloadBuild.safeParse(valid).success).toBe(true)
  })

  it("rejects name over 120 chars", () => {
    expect(PayloadBuild.safeParse({ ...valid, name: "x".repeat(121) }).success).toBe(false)
  })

  it("rejects description over 500 chars", () => {
    expect(
      PayloadBuild.safeParse({ ...valid, description: "x".repeat(501) }).success,
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  PayloadBuildCreate                                                 */
/* ------------------------------------------------------------------ */
describe("PayloadBuildCreate", () => {
  it("parses valid create", () => {
    expect(
      PayloadBuildCreate.safeParse({ name: "dropper", type: "exe", config: {} }).success,
    ).toBe(true)
  })

  it("rejects missing config", () => {
    expect(PayloadBuildCreate.safeParse({ name: "dropper", type: "exe" }).success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  PayloadBuildUpdate                                                 */
/* ------------------------------------------------------------------ */
describe("PayloadBuildUpdate", () => {
  it("accepts empty update", () => {
    expect(PayloadBuildUpdate.safeParse({}).success).toBe(true)
  })

  it("accepts status + logs", () => {
    expect(
      PayloadBuildUpdate.safeParse({ status: "building", buildLogs: ["starting..."] }).success,
    ).toBe(true)
  })
})
