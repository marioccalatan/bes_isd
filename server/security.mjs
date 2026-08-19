import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: pbkdf2Sync(password, salt, 210000, 64, 'sha512').toString('hex') };
}
export function verifyPassword(password, salt, expected) {
  const actual = Buffer.from(hashPassword(password, salt).hash, 'hex');
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}
export function createOpaqueToken() { return randomBytes(32).toString('base64url'); }
export function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
