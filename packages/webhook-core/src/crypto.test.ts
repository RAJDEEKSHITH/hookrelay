import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, randomToken, safeEqual, sha256Hex } from "./crypto";

const key = randomBytes(32);

describe("encryptSecret / decryptSecret", () => {
  it("round-trips, including non-ASCII text", () => {
    const plaintext = 'whsec_abc {"x-api-key":"ü✓"}';
    expect(decryptSecret(encryptSecret(plaintext, key), key)).toBe(plaintext);
  });

  it("uses the v1.<iv>.<tag>.<ciphertext> format with a fresh IV each time", () => {
    const a = encryptSecret("same", key);
    const b = encryptSecret("same", key);
    expect(a.split(".")).toHaveLength(4);
    expect(a.startsWith("v1.")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("rejects a different key", () => {
    expect(() => decryptSecret(encryptSecret("secret", key), randomBytes(32))).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const [version, iv, tag, ciphertext] = encryptSecret("secret", key).split(".");
    const flipped = Buffer.from(ciphertext ?? "", "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => decryptSecret([version, iv, tag, flipped.toString("base64url")].join("."), key)).toThrow();
  });

  it("rejects malformed values and wrong key sizes", () => {
    expect(() => decryptSecret("v1.only.three", key)).toThrow("Malformed");
    expect(() => decryptSecret("v2.a.b.c", key)).toThrow("Malformed");
    expect(() => encryptSecret("x", randomBytes(16))).toThrow("32 bytes");
  });
});

describe("sha256Hex", () => {
  it("matches the known digest", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("randomToken", () => {
  it("returns base64url of the requested byte length", () => {
    const token = randomToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(randomToken(32)).not.toBe(token);
  });
});

describe("safeEqual", () => {
  it("compares strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
