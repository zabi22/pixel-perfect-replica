import { afterEach, describe, expect, it } from "vitest";
import { getAiConfig, providerError } from "./provider.server";

const KEY = "AIzaSyTESTONLY_0123456789abcdefghij";
afterEach(() => {
  delete process.env["AI_API_KEY"];
  delete process.env["AI_BASE_URL"];
  delete process.env["AI_MODEL"];
});

describe("AI provider config", () => {
  it("routes a Gemini API key to Google's endpoint, not OpenAI", () => {
    process.env["AI_API_KEY"] = KEY;
    const c = getAiConfig()!;
    expect(c.gemini).toBe(true);
    expect(c.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(c.model).toBe("gemini-2.5-flash");
  });
  it("keeps OpenAI defaults for non-Gemini keys", () => {
    process.env["AI_API_KEY"] = "sk-test";
    expect(getAiConfig()!.baseUrl).toBe("https://api.openai.com/v1");
  });
  it("never echoes the key in provider errors", async () => {
    const res = new Response(JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: `API key not valid: ${KEY}` } }), { status: 400 });
    const msg = await providerError(res, KEY);
    expect(msg).toContain("INVALID_ARGUMENT");
    expect(msg).not.toContain(KEY);
  });
});
