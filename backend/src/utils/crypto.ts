/**
 * Cryptographic utilities for secure credential storage.
 * Uses AES-256-GCM encryption via Web Crypto API.
 */

import { getEnv } from "./env.ts";

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const ENCRYPTED_PREFIX = "encrypted:";

/**
 * Derives a CryptoKey from a base64-encoded secret.
 * The secret should be 32 bytes (256 bits) for AES-256.
 */
export async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(secret);
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a base64-encoded string containing IV + ciphertext.
 */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  // Combine IV and ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return arrayBufferToBase64(combined);
}

/**
 * Decrypts a base64-encoded ciphertext (IV + encrypted data) using AES-256-GCM.
 */
export async function decrypt(ciphertext: string, key: CryptoKey): Promise<string> {
  const combined = base64ToArrayBuffer(ciphertext);
  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Encrypts a setting value using the PAYPAL_ENCRYPTION_KEY environment variable.
 * Returns the encrypted value with the "encrypted:" prefix.
 */
export async function encryptSetting(value: string): Promise<string> {
  const secret = getEnv("PAYPAL_ENCRYPTION_KEY");
  if (!secret) {
    throw new Error("PAYPAL_ENCRYPTION_KEY environment variable is not set");
  }

  const key = await deriveKey(secret);
  const encrypted = await encrypt(value, key);
  return ENCRYPTED_PREFIX + encrypted;
}

/**
 * Decrypts a setting value if it has the "encrypted:" prefix.
 * Returns the original value if not encrypted.
 */
export async function decryptSetting(value: string): Promise<string> {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  const secret = getEnv("PAYPAL_ENCRYPTION_KEY");
  if (!secret) {
    throw new Error("PAYPAL_ENCRYPTION_KEY environment variable is not set");
  }

  const key = await deriveKey(secret);
  const ciphertext = value.slice(ENCRYPTED_PREFIX.length);
  return await decrypt(ciphertext, key);
}

/**
 * Checks if a value is encrypted (has the "encrypted:" prefix).
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Generates a random encryption key suitable for AES-256.
 * Returns a base64-encoded 32-byte key.
 */
export function generateEncryptionKey(): string {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return arrayBufferToBase64(key);
}

// Helper functions for base64 conversion

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
