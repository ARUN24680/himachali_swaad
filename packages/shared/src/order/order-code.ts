/** D-27: `PK-` + 6 Crockford Base32 characters (no I, L, O, U), e.g. PK-7KQ2M9. */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ORDER_CODE_REGEX = /^PK-[0-9A-HJKMNP-TV-Z]{6}$/;

/** Random order code. `random` returns n bytes (defaults to Web Crypto, available in Node and browsers). */
export function generateOrderCode(
  random: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
): string {
  // 32 symbols = 5 bits per byte → modulo is unbiased because 256 % 32 === 0
  const bytes = random(6);
  let code = 'PK-';
  for (const b of bytes) code += CROCKFORD_ALPHABET[b % 32];
  return code;
}

/** Customer-typed code → canonical (uppercase, Crockford look-alikes O→0, I/L→1). */
export function normalizeOrderCode(input: string): string {
  const raw = input.trim().toUpperCase().replace(/^PK-?/, '');
  return `PK-${raw.replace(/O/g, '0').replace(/[IL]/g, '1')}`;
}
