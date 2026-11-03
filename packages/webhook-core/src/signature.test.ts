import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "./signature";

const secret = "whsec_test";
const body = '{"id":"evt_1","type":"user.created","data":{"a":1}}';
const t = 1_700_000_000;

describe("signPayload", () => {
  it("produces t=<ts>,v1=<HMAC-SHA256 of '<t>.<body>'>", () => {
    const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(signPayload(secret, body, t)).toBe(`t=${t},v1=${expected}`);
  });
});

describe("verifySignature", () => {
  const header = signPayload(secret, body, t);
  const base = { secret, header, body, toleranceSec: 300, nowSec: t };

  it("accepts a valid signature", () => {
    expect(verifySignature(base)).toBe(true);
    expect(verifySignature({ ...base, nowSec: t + 300 })).toBe(true);
  });

  it("rejects a changed body, a wrong secret, or a missing header", () => {
    expect(verifySignature({ ...base, body: body.replace("1", "2") })).toBe(false);
    expect(verifySignature({ ...base, secret: "whsec_other" })).toBe(false);
    expect(verifySignature({ ...base, header: undefined })).toBe(false);
    expect(verifySignature({ ...base, header: "" })).toBe(false);
  });

  it("rejects timestamps outside the tolerance in either direction", () => {
    expect(verifySignature({ ...base, nowSec: t + 301 })).toBe(false);
    expect(verifySignature({ ...base, nowSec: t - 301 })).toBe(false);
  });

  it("rejects a signature moved to another timestamp", () => {
    const v1 = header.split("v1=")[1];
    expect(verifySignature({ ...base, header: `t=${t + 1},v1=${v1}`, nowSec: t + 1 })).toBe(false);
  });

  it("rejects malformed headers", () => {
    expect(verifySignature({ ...base, header: "garbage" })).toBe(false);
    expect(verifySignature({ ...base, header: `t=${t}` })).toBe(false);
    expect(verifySignature({ ...base, header: `t=abc,v1=${header.split("v1=")[1]}` })).toBe(false);
  });

  it("accepts any matching v1 among several", () => {
    expect(verifySignature({ ...base, header: `${header.split(",")[0]},v1=deadbeef,${header.split(",")[1]}` })).toBe(
      true,
    );
  });
});
