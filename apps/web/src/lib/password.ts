const LETTERS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

/** A readable temporary password that satisfies the password policy (letters and digits). */
export function generateTemporaryPassword(length = 10): string {
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  const pool = LETTERS + DIGITS;
  const chars = Array.from(random, (value) => pool[value % pool.length]);
  chars[0] = LETTERS[random[0]! % LETTERS.length]!;
  chars[length - 1] = DIGITS[random[length - 1]! % DIGITS.length]!;
  return chars.join('');
}
