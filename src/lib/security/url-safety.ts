/**
 * Server-enforced destination safety. Pure, runtime-agnostic (no Node APIs).
 * Every check here must also run server-side before any browser navigation.
 */

export type UrlCheck =
  | { ok: true; url: URL; host: string; hostIsIp: boolean }
  | { ok: false; code: string; reason: string };

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const BLOCKED_HOSTNAMES = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.lan$/i,
  /\.home\.arpa$/i,
  /^metadata(\.google\.internal)?$/i,
  /^instance-data(\.ec2\.internal)?$/i,
];

/** Parse an IPv4 literal, including decimal/hex/octal/shorthand forms browsers accept. */
export function parseIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (p === "") return null;
    let n: number;
    if (/^0x[0-9a-f]*$/i.test(p)) n = p.length === 2 ? 0 : parseInt(p.slice(2), 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^(0|[1-9][0-9]*)$/.test(p)) n = parseInt(p, 10);
    else return null;
    if (!Number.isFinite(n)) return null;
    nums.push(n);
  }
  const last = nums.pop()!;
  for (const n of nums) if (n > 255) return null;
  const remainingBytes = 4 - nums.length;
  if (last >= 256 ** remainingBytes) return null;
  const tail: number[] = [];
  let v = last;
  for (let i = 0; i < remainingBytes; i++) {
    tail.unshift(v % 256);
    v = Math.floor(v / 256);
  }
  return [...nums, ...tail];
}

export function isBlockedIPv4(o: number[]): boolean {
  const [a, b, c] = o;
  if (a === 0) return true; // this network
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 6to4 relay
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** Expand an IPv6 literal into 8 16-bit groups. Handles embedded IPv4. */
export function parseIPv6(input: string): number[] | null {
  let s = input.replace(/^\[|\]$/g, "").toLowerCase();
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (!s.includes(":")) return null;
  let tailV4: number[] = [];
  const lastColon = s.lastIndexOf(":");
  const maybeV4 = s.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const v4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(maybeV4) ? maybeV4.split(".").map(Number) : null;
    if (!v4 || v4.some((n) => n > 255)) return null;
    tailV4 = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = s.slice(0, lastColon + 1) + "0:0";
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (h: string) => (h === "" ? [] : h.split(":"));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && fill < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  if (tailV4.length) {
    out[6] = tailV4[0];
    out[7] = tailV4[1];
  }
  return out;
}

export function isBlockedIPv6(g: number[]): boolean {
  const allZeroUntil = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (g.every((x) => x === 0)) return true; // ::
  if (allZeroUntil(7) && g[7] === 1) return true; // ::1
  const v4From = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (allZeroUntil(5) && (g[5] === 0xffff || g[5] === 0)) return isBlockedIPv4(v4From(g[6], g[7])) || g[5] === 0;
  // IPv4-translated ::ffff:0:a.b.c.d
  if (allZeroUntil(4) && g[4] === 0xffff && g[5] === 0) return true;
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64 (both well-known and local-use)
  if (g[0] === 0x2002) return true; // 6to4 can tunnel to private v4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard
  if ((g[0] & 0xfe00) === 0xfc00) return true; // ULA fc00::/7 (incl. fd00::/8, AWS fd00:ec2::254)
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const v6 = parseIPv6(ip);
  if (v6) return isBlockedIPv6(v6);
  const v4 = /^[0-9a-fx.]+$/i.test(ip) ? parseIPv4(ip) : null;
  if (v4) return isBlockedIPv4(v4);
  return true; // unparseable → refuse
}

/** Static checks (no DNS). Safe to call anywhere. */
export function checkUrlStatic(raw: string): UrlCheck {
  if (typeof raw !== "string" || raw.length > 2048) return { ok: false, code: "invalid", reason: "URL missing or too long" };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, code: "invalid", reason: "Not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, code: "scheme", reason: "Only http and https are allowed" };
  if (url.username || url.password) return { ok: false, code: "credentials", reason: "URLs with embedded credentials are not allowed" };
  if (!ALLOWED_PORTS.has(url.port)) return { ok: false, code: "port", reason: `Port ${url.port} is not allowed` };
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!host) return { ok: false, code: "invalid", reason: "Missing host" };
  const v6 = parseIPv6(host);
  if (v6) {
    if (isBlockedIPv6(v6)) return { ok: false, code: "blocked_ip", reason: "Destination is an internal or reserved address" };
    return { ok: true, url, host, hostIsIp: true };
  }
  // WHATWG URL already normalises decimal/hex/octal IPv4 forms into dotted quads.
  if (/^[0-9a-fx.]+$/i.test(host)) {
    const v4 = parseIPv4(host);
    if (v4) {
      if (isBlockedIPv4(v4)) return { ok: false, code: "blocked_ip", reason: "Destination is an internal or reserved address" };
      return { ok: true, url, host, hostIsIp: true };
    }
  }
  if (BLOCKED_HOSTNAMES.some((r) => r.test(host)))
    return { ok: false, code: "blocked_host", reason: "Internal hostnames are not allowed" };
  if (!host.includes(".")) return { ok: false, code: "blocked_host", reason: "Single-label hostnames are not allowed" };
  return { ok: true, url, host, hostIsIp: false };
}

export type Resolver = (host: string, type: "A" | "AAAA") => Promise<string[]>;

/** DNS-over-HTTPS resolver (works on Workers, Vercel and Node). */
export const dohResolver: Resolver = async (host, type) => {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
  const json = (await res.json()) as { Status: number; Answer?: { type: number; data: string }[] };
  const want = type === "A" ? 1 : 28;
  return (json.Answer ?? []).filter((a) => a.type === want).map((a) => a.data);
};

/** Full check: static + every resolved address must be public. */
export async function checkUrlResolved(raw: string, resolve: Resolver = dohResolver): Promise<UrlCheck & { addresses?: string[] }> {
  const s = checkUrlStatic(raw);
  if (!s.ok || s.hostIsIp) return s;
  let addrs: string[];
  try {
    const [a, aaaa] = await Promise.all([resolve(s.host, "A"), resolve(s.host, "AAAA")]);
    addrs = [...a, ...aaaa];
  } catch (e) {
    return { ok: false, code: "dns_error", reason: `Could not resolve host: ${(e as Error).message}` };
  }
  if (addrs.length === 0) return { ok: false, code: "dns_nxdomain", reason: "Host does not resolve" };
  const bad = addrs.find((ip) => isBlockedIp(ip));
  if (bad) return { ok: false, code: "blocked_dns", reason: `Host resolves to an internal address (${bad})` };
  return { ...s, addresses: addrs };
}

/** Registrable-ish site check: same host or subdomain of the project host. */
export function isSameSite(projectHost: string, host: string): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, "");
  const p = strip(projectHost);
  const h = strip(host);
  return h === p || h.endsWith("." + p) || p.endsWith("." + h);
}
