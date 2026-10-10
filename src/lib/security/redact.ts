/** Redacts credentials, tokens and sensitive values from evidence text before it is stored. */
const SENSITIVE_PARAM = /([?&#;](?:token|access_token|id_token|refresh_token|code|key|api_key|apikey|secret|password|passwd|pwd|auth|session|sid|signature|sig)=)[^&#\s"']*/gi;

export function redactText(input: string): string {
  return String(input ?? "")
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:"']+:[^\s/@"']+@/gi, "$1[REDACTED]@")
    .replace(SENSITIVE_PARAM, "$1[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 [REDACTED]")
    .replace(/\b(cookie|set-cookie|authorization)\s*[:=]\s*[^\n]*/gi, "$1: [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "[REDACTED_JWT]");
}

/** Deep-redacts every string inside a JSON-like value. */
export function redactDeep<T>(v: T): T {
  if (typeof v === "string") return redactText(v) as T;
  if (Array.isArray(v)) return v.map(redactDeep) as T;
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) o[k] = redactDeep(val);
    return o as T;
  }
  return v;
}
