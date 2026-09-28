import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { createInspectionItemId } from './fleet-inspection-id.ts';

function withCrypto(value, check) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value });
  try { check(); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor); else delete globalThis.crypto; }
}

test('inspection detail uses native UUID where available', () => {
  withCrypto(webcrypto, () => assert.match(createInspectionItemId(), /^INSP-ITEM-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/));
});

test('HTTP browser without randomUUID can create multiple inspection details', () => {
  withCrypto({ getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }, () => {
    const ids = Array.from({ length: 1000 }, createInspectionItemId);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => /^INSP-ITEM-[\da-f]{32}$/.test(id) && id.length <= 80));
  });
});

test('missing crypto does not crash or duplicate details created in the same millisecond', () => {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => 123456789;
  Math.random = () => 0.5;
  try {
    withCrypto(undefined, () => {
      const ids = Array.from({ length: 1000 }, createInspectionItemId);
      assert.equal(new Set(ids).size, ids.length);
      assert.ok(ids.every((id) => id.startsWith('INSP-ITEM-') && id.length <= 80));
    });
  } finally { Date.now = originalNow; Math.random = originalRandom; }
});
