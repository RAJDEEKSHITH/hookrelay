import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
// 12 bytes is the IV length GCM is designed for; other lengths are hashed internally and weaken the nonce.
const IV_BYTES = 12;
const FORMAT_VERSION = "v1";

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Encryption key must be ${KEY_BYTES} bytes, got ${key.length}`);
  }
}

/** Returns `v1.<iv>.<tag>.<ciphertext>`, each part base64url. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(
    ".",
  );
}

/** Throws if the value is malformed, was encrypted with another key, or was tampered with. */
export function decryptSecret(value: string, key: Buffer): string {
  assertKey(key);
  const [version, iv, tag, ciphertext, ...rest] = value.split(".");
  if (version !== FORMAT_VERSION || iv === undefined || tag === undefined || ciphertext === undefined || rest.length > 0) {
    throw new Error("Malformed encrypted value");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** `bytes` random bytes, base64url encoded. */
export function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time string comparison. A length difference returns early, which reveals only the length. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
