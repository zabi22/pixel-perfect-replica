import { describe, it, expect } from "vitest";
import { redactText, redactDeep } from "./redact";

describe("evidence redaction", () => {
  it("removes URL credentials", () => {
    expect(redactText("GET https://bob:hunter2@site.se/x")).toBe("GET https://[REDACTED]@site.se/x");
  });
  it("removes token query params but keeps others", () => {
    expect(redactText("https://a.se/p?id=5&token=abc123&x=1")).toBe("https://a.se/p?id=5&token=[REDACTED]&x=1");
  });
  it("removes bearer tokens, cookies and JWTs", () => {
    expect(redactText("Authorization: Bearer abcdefghijkl")).toBe("Authorization: [REDACTED]");
    expect(redactText("cookie=sid=1; a=2")).toBe("cookie: [REDACTED]");
    expect(redactText("t eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abcdefgh")).toBe("t [REDACTED_JWT]");
  });
  it("redacts nested values", () => {
    expect(redactDeep({ a: ["https://x.se/?password=p"] })).toEqual({ a: ["https://x.se/?password=[REDACTED]"] });
  });
});
