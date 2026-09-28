let sequence = 0;

// Inspection detail identifiers are record keys, not authentication tokens.
export function createInspectionItemId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return `INSP-ITEM-${cryptoApi.randomUUID()}`;
  // getRandomValues is also available on HTTP origins where randomUUID is absent.
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return `INSP-ITEM-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  sequence += 1;
  return `INSP-ITEM-${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}
