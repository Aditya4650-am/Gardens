// Known-plaintext recovery of the save's repeating XOR key.
//
// Not every account writes the same key. Two generations are on file: the
// original (XOR_KEY) and the fresh-account one (FRESH_KEY), and a future
// build can rotate it again — so rather than treating a key we do not know as
// an unreadable save, the key is *derived from the file itself*.
//
// The attack is the one that recovered the Homescapes f205 key: the container
// is repeating-key XOR with period 731, so for each key index every candidate
// byte is scored by the log-likelihood of the plaintext bytes it would imply,
// under a byte-frequency model of what an AUDB document looks like
// (./key-model.ts). Each index is independent, so the winner per index is the
// key. There is no crib and no search over offsets — 256 candidates × 731
// indices, i.e. one pass over the file.
//
// It is only reached when the known keys have failed, and the result is
// accepted only if the document then parses as AUDB (magic, TBLE chain,
// BDUA trailer) — a wrong key byte corrupts one byte in every 731 and breaks
// that structure. The margin guard rejects a file too short for the vote to
// be decisive rather than guessing.

import { AUDB_BYTE_LOGP } from "./key-model.ts";

/** Key period of the save container. */
export const XOR_KEY_PERIOD = 731;

/** Median winning margin (nats) below which the vote is not trusted. */
const MIN_MEDIAN_MARGIN = 2;

export interface RecoveredKey {
  key: string;
  /** Winning margin per index, for diagnostics. */
  medianMargin: number;
}

/**
 * Recover the period-731 XOR key of `cipher`.
 *
 * Throws when the file is too short for each index to have enough votes or
 * when no candidate separates from the rest — both mean "this file is not an
 * XOR-wrapped AUDB save", which is a truthful answer rather than a guess.
 */
export function recoverXorKeyDetailed(cipher: Uint8Array): RecoveredKey {
  const P = XOR_KEY_PERIOD;
  const N = cipher.length;
  const votes = Math.floor(N / P);
  if (votes < 8) {
    throw new Error(`key recovery: save too short (${N} B) for a ${P}-byte key`);
  }

  const logp = AUDB_BYTE_LOGP;
  const key = new Uint8Array(P);
  const margins = new Float64Array(P);

  for (let r = 0; r < P; r++) {
    let best = -Infinity;
    let second = -Infinity;
    let win = 0;
    for (let b = 0; b < 256; b++) {
      let s = 0;
      for (let p = r; p < N; p += P) s += logp[cipher[p] ^ b];
      if (s > best) {
        second = best;
        best = s;
        win = b;
      } else if (s > second) {
        second = s;
      }
    }
    key[r] = win;
    margins[r] = best - second;
  }

  const sorted = Array.from(margins).sort((a, b) => a - b);
  const medianMargin = sorted[P >> 1] ?? 0;
  if (!(medianMargin >= MIN_MEDIAN_MARGIN)) {
    throw new Error(
      `key recovery: no decisive key (median margin ${medianMargin.toFixed(2)} nats)`,
    );
  }

  let k = "";
  for (let r = 0; r < P; r++) k += String.fromCharCode(key[r]);
  return { key: k, medianMargin };
}

/** Recover the key as a plain string (see ./key.ts for the key alphabet). */
export function recoverXorKey(cipher: Uint8Array): string {
  return recoverXorKeyDetailed(cipher).key;
}
