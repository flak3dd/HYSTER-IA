/**
 * Tests for the robust tool runner.
 *
 * Verifies:
 *  - Argument validation rejects bad input
 *  - Circuit breaker opens after repeated failures
 *  - Needs-input results are detected and not retried
 *  - Metrics are tracked per tool
 */

import {
  runAiToolRobust,
  resetToolBreakers,
  resetToolMetrics,
  getToolBreakerStatus,
  getToolMetrics,
} from "@/lib/ai/tool-runner"
import { isToolNeedsInput, needsInput, TOOL_ERROR_CODES, formatNeedsInputMessage } from "@/lib/ai/tool-result"

describe("Tool runner robustness", () => {
  beforeEach(() => {
    resetToolBreakers()
    resetToolMetrics()
  })

  describe("argument validation", () => {
    it("rejects unknown tool names", async () => {
      const result = await runAiToolRobust("does_not_exist", {}, {})
      expect(result.ok).toBe(false)
      expect(result.error).toContain("unknown tool")
      expect(result.shortCircuited).toBe(false)
    })

    it("rejects invalid args before executing the tool", async () => {
      const result = await runAiToolRobust(
        "get_deployment_status",
        { wrongField: "value" },
        {},
      )
      expect(result.ok).toBe(false)
      expect(result.error).toContain("invalid args")
    })
  })

  describe("needs-input detection", () => {
    it("returns ok=true and needsInput=true when a tool returns a needs-input result", async () => {
      // generate_config returns a needs-input result when description is missing
      const result = await runAiToolRobust("generate_config", {}, {})
      expect(result.ok).toBe(true)
      expect(result.needsInput).toBe(true)
      expect(isToolNeedsInput(result.result)).toBe(true)
    })

    it("preserves the prompt for the orchestrator to render", async () => {
      const result = await runAiToolRobust("generate_config", {}, {})
      expect(result.needsInput).toBe(true)
      if (isToolNeedsInput(result.result)) {
        expect(result.result.error).toBe(TOOL_ERROR_CODES.MISSING_DESCRIPTION)
        expect(result.result.errorMessage.length).toBeGreaterThan(0)
        expect(result.result.prompt?.options?.length ?? 0).toBeGreaterThanOrEqual(2)
      }
    })

    it("counts needs-input as a non-failure for the circuit breaker", async () => {
      // 10 needs-input calls should NOT open the circuit
      for (let i = 0; i < 10; i++) {
        await runAiToolRobust("generate_config", {}, {})
      }
      const breakers = getToolBreakerStatus()
      expect(breakers.generate_config?.state ?? "closed").toBe("closed")
    })
  })

  describe("metrics tracking", () => {
    it("counts needs-input separately from successes and failures", async () => {
      await runAiToolRobust("generate_config", {}, {})
      const metrics = getToolMetrics()
      expect(metrics.generate_config?.calls).toBe(1)
      expect(metrics.generate_config?.needsInput).toBe(1)
      expect(metrics.generate_config?.failures).toBe(0)
    })
  })

  describe("formatNeedsInputMessage", () => {
    it("formats a clarification message with prompt options", () => {
      const result = needsInput("Need more info", {
        code: TOOL_ERROR_CODES.MISSING_DESCRIPTION,
        prompt: {
          question: "Pick one:",
          options: [
            { label: "A", value: "a", description: "First option" },
            { label: "B", value: "b" },
          ],
        },
      })
      const msg = formatNeedsInputMessage(result)
      expect(msg).toContain("Need more info")
      expect(msg).toContain("Pick one:")
      expect(msg).toContain("A — First option")
      expect(msg).toContain("- B")
    })

    it("includes missing field names when provided", () => {
      const result = needsInput("Missing things", {
        missingFields: ["provider", "region"],
      })
      const msg = formatNeedsInputMessage(result)
      expect(msg).toContain("provider, region")
    })
  })

  describe("isToolNeedsInput", () => {
    it("recognizes a properly-formed needs-input result", () => {
      const r = needsInput("test")
      expect(isToolNeedsInput(r)).toBe(true)
    })

    it("rejects results missing required fields", () => {
      expect(isToolNeedsInput(null)).toBe(false)
      expect(isToolNeedsInput({})).toBe(false)
      expect(isToolNeedsInput({ error: "MISSING_DESCRIPTION" })).toBe(false)
      expect(isToolNeedsInput({ error: "OTHER_CODE", errorMessage: "msg" })).toBe(false)
    })

    it("recognizes all valid error codes", () => {
      expect(isToolNeedsInput({ error: TOOL_ERROR_CODES.MISSING_DESCRIPTION, errorMessage: "x" })).toBe(true)
      expect(isToolNeedsInput({ error: TOOL_ERROR_CODES.MISSING_REQUIRED_INPUT, errorMessage: "x" })).toBe(true)
      expect(isToolNeedsInput({ error: TOOL_ERROR_CODES.INVALID_INPUT, errorMessage: "x" })).toBe(true)
    })
  })
})
