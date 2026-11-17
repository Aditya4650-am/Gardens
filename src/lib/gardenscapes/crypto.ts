// Gardenscapes save transform: repeating-key XOR, period 731, key alphabet
// ASCII 32..94 (verified against a known-plaintext pair: cipher = plain ^ key).
//
// The whole AUDB container (magic + version + tables + BDUA) is XORed with this
// keystream before it leaves the device, and un-XORed on the way in.

import { XOR_KEY, XOR_KEY_LENGTH } from "./key.ts";

export function xorBytes(data: Uint8Array, key: string = XOR_KEY): Uint8Array {
  const out = new Uint8Array(data.length);
  const klen = key.length;
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key.charCodeAt(i % klen);
  }
  return out;
}

export function xorKeyString(s: string, key: string = XOR_KEY): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    out += String.fromCharCode(s.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

export function xorPlainToCipher(plain: string | Uint8Array, key: string = XOR_KEY): Uint8Array {
  if (plain instanceof Uint8Array) return xorBytes(plain, key);
  const bytes: number[] = [];
  for (let i = 0; i < plain.length; i++) bytes.push(plain.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  return new Uint8Array(bytes);
}

