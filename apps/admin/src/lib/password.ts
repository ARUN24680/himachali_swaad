/**
 * Temporary staff password: 16 chars from an unambiguous alphabet (no 0/O, 1/l/I), from
 * crypto.getRandomValues. Rejection sampling keeps every character equally likely.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function tempPassword(length = 16): string {
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

/** Password rules the API enforces (NewPasswordSchema in @pk/shared): 12–200 characters. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;
