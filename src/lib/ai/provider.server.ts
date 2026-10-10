/**
 * OpenAI-compatible chat provider. Defaults to the Lovable AI gateway when LOVABLE_API_KEY
 * is present; set AI_BASE_URL / AI_API_KEY / AI_MODEL to use any other compatible provider.
 * AI output never determines a test verdict.
 */
export type AiConfig = { baseUrl: string; apiKey: string; model: string };

export function getAiConfig(): AiConfig | null {
  const key = process.env["AI_API_KEY"];
  if (key) {
    return {
      baseUrl: (process.env["AI_BASE_URL"] || "https://api.openai.com/v1").replace(/\/$/, ""),
      apiKey: key,
      model: process.env["AI_MODEL"] || "gpt-4o-mini",
    };
  }
  const lovable = process.env["LOVABLE_API_KEY"];
  if (lovable) {
    return {
      baseUrl: "https://ai.gateway.lovable.dev/v1",
      apiKey: lovable,
      model: process.env["AI_MODEL"] || "google/gemini-3-flash-preview",
    };
  }
  return null;
}

export class AiUnavailable extends Error {}

export async function chatJson<T>(system: string, user: string, timeoutMs = 25_000): Promise<T> {
  const cfg = getAiConfig();
  if (!cfg) throw new AiUnavailable("No AI provider configured");
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ac.signal,
    });
    if (res.status === 429) throw new AiUnavailable("AI rate limit reached, try again shortly");
    if (res.status === 402) throw new AiUnavailable("AI credits exhausted");
    if (!res.ok) throw new AiUnavailable(`AI request failed (${res.status})`);
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, "");
    return JSON.parse(cleaned) as T;
  } catch (e) {
    if (e instanceof AiUnavailable) throw e;
    throw new AiUnavailable(`AI request failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

export const PLAN_SYSTEM_PROMPT = `You convert a plain-English website test journey into a JSON test plan.
Return ONLY {"steps":[...]} using these step shapes (no other actions exist):
{"action":"goto","path":"/relative/path"}
{"action":"click","target":T}
{"action":"fill","target":T,"value":"synthetic test data"}
{"action":"select","target":T,"option":"visible option label"}
{"action":"press","key":"Enter"|"Tab"|"Escape"}
{"action":"waitFor","target":T}
{"action":"assertText","text":"exact visible text"}
{"action":"assertNoText","text":"..."}
{"action":"assertVisible","target":T}
{"action":"assertUrl","contains":"/path"}
Targets T: {"by":"role","role":"button|link|textbox|checkbox|radio|combobox|heading","name":"accessible name"} | {"by":"label","value":"field label"} | {"by":"text","value":"visible text"} | {"by":"placeholder","value":"..."}
Rules: start with a goto (path relative to the site root). Prefer label and role targets. Use clearly fake data (e.g. "QA Test", "qa+test@example.com"). Never include passwords, payments, purchases or deletions. End with at least one assertion that checks the user's expected outcome. Max 25 steps. Optional "timeoutMs" up to 15000 for slow steps.`;

export const ANALYSIS_SYSTEM_PROMPT = `You are a QA engineer explaining a browser test result to a developer.
You receive ONLY recorded observations from a real browser run. Do not invent facts.
Return JSON: {"observed":"1-3 sentences restating only what the evidence shows","hypotheses":["possible cause", "..."],"nextStep":"one concrete debugging step"}.
Hypotheses must be phrased as possibilities ("may", "could"). Never claim backend or database failures as fact. If a navigation/DNS/policy/infrastructure error occurred, say the app itself was not verified.`;
