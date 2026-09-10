import crypto from "node:crypto";

// Server-only runtime protection: cryptographic keys and operations must never leak to browser clients
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Cryptographic utility cannot be imported in the browser."
  );
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96-bit IV (NIST recommended for GCM)
const AUTH_TAG_LENGTH_BYTES = 16; // 128-bit authentication tag
const FORMAT_VERSION = "v1";

function resolveKey(keyHex?: string): Buffer {
  const key = keyHex ?? process.env.LIFEOS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "Encryption key not provided and LIFEOS_ENCRYPTION_KEY environment variable is not set."
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "Encryption key must be a valid 64-character hexadecimal string (32 bytes)."
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypts a plaintext secret using AES-256-GCM.
 * Output wire format: `v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 */
export function encryptSecret(plaintext: string, keyHex?: string): string {
  const key = resolveKey(keyHex);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${FORMAT_VERSION}:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypts an AES-256-GCM payload formatted as `v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
 * Throws an error if payload is malformed or if tampering is detected.
 */
export function decryptSecret(payload: string, keyHex?: string): string {
  const key = resolveKey(keyHex);
  const parts = payload.split(":");

  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error(
      `Invalid encrypted payload format: expected version '${FORMAT_VERSION}' with 4 segments.`
    );
  }

  const [, ivHex, authTagHex, ciphertextHex] = parts;

  // Explicitly validate hexadecimal format and lengths to prevent Buffer.from from silently truncating malformed hex
  if (!/^[0-9a-fA-F]{24}$/.test(ivHex)) {
    throw new Error(
      `Invalid IV format: expected 24 hexadecimal characters (${IV_LENGTH_BYTES} bytes).`
    );
  }

  if (!/^[0-9a-fA-F]{32}$/.test(authTagHex)) {
    throw new Error(
      `Invalid auth tag format: expected 32 hexadecimal characters (${AUTH_TAG_LENGTH_BYTES} bytes).`
    );
  }

  if (ciphertextHex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(ciphertextHex)) {
    throw new Error(
      "Invalid ciphertext format: expected an even-length hexadecimal string."
    );
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    throw new Error(
      "Decryption failed: authentication tag verification failed (ciphertext or tag was tampered with)."
    );
  }
}

/**
 * Encrypts an arbitrary JSON-serializable object into an AES-256-GCM payload.
 */
export function encryptJSON<T>(data: T, keyHex?: string): string {
  const jsonString = JSON.stringify(data);
  return encryptSecret(jsonString, keyHex);
}

/**
 * Decrypts an AES-256-GCM payload and parses the underlying JSON object.
 */
export function decryptJSON<T>(payload: string, keyHex?: string): T {
  const decrypted = decryptSecret(payload, keyHex);
  return JSON.parse(decrypted) as T;
}
