/**
 * OpenRouter stack: provider ordering + model resolution (pure helpers).
 */

import {
  PROVIDER_FALLBACK_SEQUENCE,
  buildConfiguredProviderOrder,
  getOpenRouterModelId,
} from "@/lib/ai/openrouter/stack"

describe("PROVIDER_FALLBACK_SEQUENCE", () => {
  it("puts openrouter ahead of anthropic", () => {
    const iOr = PROVIDER_FALLBACK_SEQUENCE.indexOf("openrouter")
    const iAnth = PROVIDER_FALLBACK_SEQUENCE.indexOf("anthropic")
    expect(iOr).toBeGreaterThan(-1)
    expect(iAnth).toBeGreaterThan(-1)
    expect(iOr).toBeLessThan(iAnth)
  })
})

describe("getOpenRouterModelId", () => {
  const base = {
    OPENROUTER_MODEL: "org/base-model",
    OPENROUTER_MODEL_CHAT_DEFAULT: "",
    OPENROUTER_MODEL_REASONING_JSON: "",
    OPENROUTER_MODEL_CHEAP: "",
  }

  it("uses OPENROUTER_MODEL for chat_tooling when chat default unset", () => {
    expect(getOpenRouterModelId(base, "chat_tooling")).toBe("org/base-model")
  })

  it("uses OPENROUTER_MODEL_CHAT_DEFAULT when set", () => {
    expect(
      getOpenRouterModelId({ ...base, OPENROUTER_MODEL_CHAT_DEFAULT: "openai/gpt-4o" }, "chat_tooling")
    ).toBe("openai/gpt-4o")
  })

  it("uses OPENROUTER_MODEL_REASONING_JSON when set", () => {
    expect(
      getOpenRouterModelId({ ...base, OPENROUTER_MODEL_REASONING_JSON: "anthropic/claude-sonnet-4" }, "reasoning_json")
    ).toBe("anthropic/claude-sonnet-4")
  })

  it("cheap falls back chat then canonical when cheap unset", () => {
    expect(
      getOpenRouterModelId({ ...base, OPENROUTER_MODEL_CHAT_DEFAULT: "chat/small" }, "cheap")
    ).toBe("chat/small")

    expect(getOpenRouterModelId(base, "cheap")).toBe("org/base-model")
  })

  it("cheap prefers OPENROUTER_MODEL_CHEAP when set", () => {
    expect(
      getOpenRouterModelId(
        {
          ...base,
          OPENROUTER_MODEL_CHAT_DEFAULT: "chat/small",
          OPENROUTER_MODEL_CHEAP: "meta/llama-3.3-70b-instruct",
        },
        "cheap"
      )
    ).toBe("meta/llama-3.3-70b-instruct")
  })
})

describe("buildConfiguredProviderOrder", () => {
  const emptyLike = {
    OPENROUTER_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    GOOGLE_API_KEY: "",
    AZURE_OPENAI_ENDPOINT: "",
    AZURE_OPENAI_API_KEY: "",
    LLM_PROVIDER_API_KEY: "",
    XAI_API_KEY: "",
    SHADOWGROK_ENABLED: false,
  }

  it("orders openrouter before anthropic when both keys exist", () => {
    const order = buildConfiguredProviderOrder(
      {
        ...emptyLike,
        OPENROUTER_API_KEY: "sk-or-test",
        ANTHROPIC_API_KEY: "sk-ant-test",
      },
      { useShadowGrok: false }
    )
    expect(order.indexOf("openrouter")).toBeLessThan(order.indexOf("anthropic"))
  })

  it("omits anthropic when key missing but keeps openrouter", () => {
    const order = buildConfiguredProviderOrder(
      { ...emptyLike, OPENROUTER_API_KEY: "sk-or" },
      { useShadowGrok: false }
    )
    expect(order).toContain("openrouter")
    expect(order).not.toContain("anthropic")
  })

  it("respects omitPreferred", () => {
    const full = buildConfiguredProviderOrder(
      {
        ...emptyLike,
        OPENROUTER_API_KEY: "or",
        ANTHROPIC_API_KEY: "ant",
        OPENAI_API_KEY: "oai",
      },
      { useShadowGrok: false, omitPreferred: "openrouter" }
    )
    expect(full).not.toContain("openrouter")
    expect(full).toContain("anthropic")
  })

  it("includes xai only when ShadowGrok flags and key allow", () => {
    const withXai = buildConfiguredProviderOrder(
      {
        ...emptyLike,
        XAI_API_KEY: "xai-key",
        SHADOWGROK_ENABLED: true,
      },
      { useShadowGrok: true }
    )
    expect(withXai).toContain("xai")

    const withoutUseFlag = buildConfiguredProviderOrder(
      {
        ...emptyLike,
        XAI_API_KEY: "xai-key",
        SHADOWGROK_ENABLED: true,
      },
      { useShadowGrok: false }
    )
    expect(withoutUseFlag).not.toContain("xai")
  })
})
