// Gardenscapes profile-badge / title cipher.
//
// The game stores badge ids, the worn badge and the earned-title list as
// base64 of an XOR stream. Measured against a real save: all 17 owned badge
// ids, the worn badge and the title CSV decode to readable text, and encoding
// a known id reproduces the save's own cipher byte for byte.
//
//   raw   = base64(cipher)
//   L     = raw.length
//   off   = (L - 18) mod 32
//   out[i]= raw[i] XOR key[(i + off) mod 32]
//
// The key is 32 bytes; padding past the plaintext is '\n'.

const KEY = "59Cw33D7zONrgVoKb7v5nKmwq5PCttj2";

if (KEY.length !== 32) throw new Error("badge key must be 32 bytes");

const KEY_BYTES = Uint8Array.from(KEY, (c) => c.charCodeAt(0));

function offsetOf(len: number): number {
  return (((len - 18) % 32) + 32) % 32;
}

/** Decrypt a badge/title cipher to its plaintext (padding stripped). */
export function decodeBadgeCipher(cipher: string): string {
  const raw = Buffer.from(cipher, "base64");
  const L = raw.length;
  const off = offsetOf(L);
  const out = Buffer.alloc(L);
  for (let i = 0; i < L; i++) out[i] = raw[i] ^ KEY_BYTES[(i + off) % 32];
  return out.toString("latin1").replace(/\n+$/, "");
}

/** Encrypt a plaintext id into the cipher the save stores. */
export function encodeBadgeCipher(plain: string): string {
  const L = plain.length;
  const off = offsetOf(L);
  const buf = Buffer.alloc(L);
  for (let i = 0; i < L; i++) {
    const p = i < plain.length ? plain.charCodeAt(i) : 0x0a;
    buf[i] = p ^ KEY_BYTES[(i + off) % 32];
  }
  return buf.toString("base64");
}
