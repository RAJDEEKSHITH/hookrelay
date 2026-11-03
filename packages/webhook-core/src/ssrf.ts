import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// Destinations a webhook must never reach. BlockList also matches IPv4-mapped IPv6 (::ffff:10.0.0.1)
// against the IPv4 rules, so the mapped form cannot be used to get around them.
const privateRanges = new BlockList();
privateRanges.addSubnet("0.0.0.0", 8, "ipv4"); // unspecified / "this network"
privateRanges.addSubnet("10.0.0.0", 8, "ipv4"); // RFC 1918
privateRanges.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT
privateRanges.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
privateRanges.addSubnet("169.254.0.0", 16, "ipv4"); // link-local, includes the 169.254.169.254 metadata service
privateRanges.addSubnet("172.16.0.0", 12, "ipv4"); // RFC 1918
privateRanges.addSubnet("192.168.0.0", 16, "ipv4"); // RFC 1918
privateRanges.addAddress("::", "ipv6"); // unspecified
privateRanges.addAddress("::1", "ipv6"); // loopback
privateRanges.addSubnet("fc00::", 7, "ipv6"); // unique-local
privateRanges.addSubnet("fe80::", 10, "ipv6"); // link-local

/** False for private, loopback, link-local, CGNAT, unique-local and unspecified addresses, and for non-IPs. */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  return !privateRanges.check(ip, family === 4 ? "ipv4" : "ipv6");
}

export type ResolveHost = (hostname: string) => Promise<string[]>;

const resolveWithDns: ResolveHost = async (hostname) => {
  const results = await lookup(hostname, { all: true });
  return results.map((result) => result.address);
};

export interface ValidateEndpointUrlOptions {
  allowHttp: boolean;
  allowPrivate: boolean;
  maxLength?: number;
  /** Injected in tests; defaults to the system resolver. */
  resolve?: ResolveHost;
}

export type EndpointUrlCheck = { ok: true } | { ok: false; reason: string };

/**
 * Save-time SSRF check. The worker repeats the address check in its DNS lookup at send time, because a host
 * can resolve to a public address now and a private one later (DNS rebinding).
 */
export async function validateEndpointUrl(
  url: string,
  { allowHttp, allowPrivate, maxLength = 1024, resolve = resolveWithDns }: ValidateEndpointUrlOptions,
): Promise<EndpointUrlCheck> {
  if (url.length > maxLength) return { ok: false, reason: `URL must be at most ${maxLength} characters` };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "URL is not valid" };
  }

  const isHttps = parsed.protocol === "https:";
  const isAllowedHttp = allowHttp && parsed.protocol === "http:";
  if (!isHttps && !isAllowedHttp) {
    return { ok: false, reason: allowHttp ? "URL must use http or https" : "URL must use https" };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, reason: "URL must not contain credentials" };
  }
  if (allowPrivate) return { ok: true };

  // URL keeps IPv6 literals in brackets. The WHATWG parser has already normalised odd IPv4 forms
  // such as 0x7f.1 or 2130706433 to dotted decimal, so they cannot hide a private address.
  const host = parsed.hostname.replace(/^\[(.*)\]$/, "$1");
  let addresses: string[];
  if (isIP(host) !== 0) {
    addresses = [host];
  } else {
    try {
      addresses = await resolve(host);
    } catch {
      return { ok: false, reason: "URL host does not resolve" };
    }
  }
  if (addresses.length === 0) return { ok: false, reason: "URL host does not resolve" };
  // Every address must be public: a client may connect to any of them.
  if (!addresses.every(isPublicIp)) {
    return { ok: false, reason: "URL must not point to a private or local address" };
  }
  return { ok: true };
}
