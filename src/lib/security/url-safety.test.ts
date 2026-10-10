import { describe, it, expect } from "vitest";
import { checkUrlStatic, checkUrlResolved, isBlockedIp, type Resolver } from "./url-safety";

const blocked = (u: string) => expect(checkUrlStatic(u).ok, u).toBe(false);
const allowed = (u: string) => expect(checkUrlStatic(u).ok, u).toBe(true);

describe("scheme, credentials, ports", () => {
  it("rejects non-http schemes", () => {
    ["file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "data:text/html,hi", "gopher://x.com"].forEach(blocked);
  });
  it("rejects credentials and odd ports", () => {
    blocked("https://user:pw@example.com");
    blocked("http://example.com:22");
    blocked("http://example.com:6379");
    allowed("https://example.com:8443/x");
  });
  it("allows normal public sites", () => {
    allowed("https://example.com");
    allowed("http://8.8.8.8/");
    allowed("http://[2606:4700:4700::1111]/");
  });
});

describe("IPv4 internal ranges and encodings", () => {
  it("blocks loopback, private, link-local, metadata, CGNAT", () => {
    ["http://127.0.0.1", "http://127.1", "http://10.0.0.5", "http://172.16.0.1", "http://172.31.255.255",
     "http://192.168.1.1", "http://169.254.169.254/latest/meta-data", "http://100.64.0.1", "http://0.0.0.0",
     "http://255.255.255.255", "http://224.0.0.1"].forEach(blocked);
  });
  it("blocks decimal, hex and octal encodings of loopback/metadata", () => {
    ["http://2130706433", "http://0x7f000001", "http://0177.0.0.1", "http://0x7f.1", "http://2852039166"].forEach(blocked);
  });
  it("does not block neighbouring public ranges", () => {
    allowed("http://172.32.0.1");
    allowed("http://100.128.0.1");
  });
});

describe("IPv6 internal ranges", () => {
  it("blocks loopback, unspecified, ULA, link-local, multicast", () => {
    ["http://[::1]", "http://[::]", "http://[fd00::1]", "http://[fd00:ec2::254]", "http://[fc00::1]",
     "http://[fe80::1]", "http://[ff02::1]"].forEach(blocked);
  });
  it("blocks IPv4-mapped/compatible, NAT64, 6to4, Teredo tunnels", () => {
    ["http://[::ffff:127.0.0.1]", "http://[::ffff:7f00:1]", "http://[::ffff:169.254.169.254]",
     "http://[::127.0.0.1]", "http://[64:ff9b::a9fe:a9fe]", "http://[2002:7f00:1::]", "http://[2001:0::1]"].forEach(blocked);
  });
});

describe("internal hostnames", () => {
  it("blocks localhost and internal suffixes", () => {
    ["http://localhost", "http://LOCALHOST.", "http://app.localhost", "http://metadata.google.internal",
     "http://printer.local", "http://intranet"].forEach(blocked);
  });
});

describe("DNS resolution (rebinding defence)", () => {
  const fake = (map: Record<string, string[]>): Resolver => async (h, t) => map[`${h}/${t}`] ?? [];
  it("rejects a public name that resolves to a private address", async () => {
    const r = await checkUrlResolved("https://evil.example", fake({ "evil.example/A": ["93.184.216.34", "10.0.0.1"] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("blocked_dns");
  });
  it("rejects AAAA pointing at loopback", async () => {
    const r = await checkUrlResolved("https://v6.example", fake({ "v6.example/A": ["93.184.216.34"], "v6.example/AAAA": ["::1"] }));
    expect(r.ok).toBe(false);
  });
  it("rejects names that do not resolve", async () => {
    const r = await checkUrlResolved("https://nothing.example", fake({}));
    expect(r.ok).toBe(false);
  });
  it("accepts names resolving only to public addresses", async () => {
    const r = await checkUrlResolved("https://ok.example", fake({ "ok.example/A": ["93.184.216.34"] }));
    expect(r.ok).toBe(true);
  });
  it("treats unparseable resolver output as blocked", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });
});
