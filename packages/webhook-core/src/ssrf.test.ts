import { describe, expect, it } from "vitest";
import { isPublicIp, validateEndpointUrl, type ResolveHost } from "./ssrf";

describe("isPublicIp", () => {
  it.each([
    "127.0.0.1",
    "127.255.0.9",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "0.0.0.0",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
  ])("blocks %s", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (ip) => {
      expect(isPublicIp(ip)).toBe(true);
    },
  );

  it("rejects strings that are not IPs", () => {
    expect(isPublicIp("example.com")).toBe(false);
    expect(isPublicIp("")).toBe(false);
  });
});

describe("validateEndpointUrl", () => {
  const publicDns: ResolveHost = async () => ["93.184.216.34"];
  const strict = { allowHttp: false, allowPrivate: false, resolve: publicDns };

  it("accepts a public https URL", async () => {
    expect(await validateEndpointUrl("https://hooks.example.com/in", strict)).toEqual({ ok: true });
  });

  it("requires https unless http is allowed", async () => {
    expect(await validateEndpointUrl("http://hooks.example.com", strict)).toMatchObject({ ok: false });
    expect(await validateEndpointUrl("http://hooks.example.com", { ...strict, allowHttp: true })).toEqual({ ok: true });
    expect(await validateEndpointUrl("ftp://hooks.example.com", { ...strict, allowHttp: true })).toMatchObject({
      ok: false,
    });
  });

  it("rejects invalid URLs, credentials and URLs over the length limit", async () => {
    expect(await validateEndpointUrl("not a url", strict)).toMatchObject({ ok: false });
    expect(await validateEndpointUrl("https://user:pass@hooks.example.com", strict)).toMatchObject({ ok: false });
    expect(await validateEndpointUrl(`https://hooks.example.com/${"a".repeat(1024)}`, strict)).toMatchObject({
      ok: false,
    });
  });

  it("rejects private IP literals, including encoded and bracketed forms", async () => {
    for (const url of [
      "https://127.0.0.1/",
      "https://169.254.169.254/latest/meta-data",
      "https://2130706433/",
      "https://0x7f.1/",
      "https://[::1]/",
      "https://[::ffff:127.0.0.1]/",
      "https://[fd00::1]:8443/",
    ]) {
      expect(await validateEndpointUrl(url, strict), url).toMatchObject({ ok: false });
    }
  });

  it("rejects a host when any resolved address is private", async () => {
    const mixed: ResolveHost = async () => ["93.184.216.34", "10.0.0.5"];
    expect(await validateEndpointUrl("https://rebind.example.com", { ...strict, resolve: mixed })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("private"),
    });
  });

  it("rejects a host that does not resolve", async () => {
    const failing: ResolveHost = async () => {
      throw new Error("ENOTFOUND");
    };
    const empty: ResolveHost = async () => [];
    expect(await validateEndpointUrl("https://nope.invalid", { ...strict, resolve: failing })).toMatchObject({
      ok: false,
    });
    expect(await validateEndpointUrl("https://nope.invalid", { ...strict, resolve: empty })).toMatchObject({ ok: false });
  });

  it("skips the address check when private destinations are allowed", async () => {
    const neverCalled: ResolveHost = async () => {
      throw new Error("should not resolve");
    };
    const local = { allowHttp: true, allowPrivate: true, resolve: neverCalled };
    expect(await validateEndpointUrl("http://localhost:4000/ok", local)).toEqual({ ok: true });
    expect(await validateEndpointUrl("http://user:pw@localhost:4000/ok", local)).toMatchObject({ ok: false });
  });
});
