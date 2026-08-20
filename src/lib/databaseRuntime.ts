import type { OracleConnectionInput } from '@/lib/api';

export const DB_SYNC_SESSION_KEY = 'bes.database-sync.connection';

export const defaultSyncConnection: OracleConnectionInput = {
  connectionName: 'BES Server Oracle',
  connectionType: 'Basic',
  host: '192.168.60.1',
  port: '1521',
  serviceName: 'ORCL',
  mode: 'serviceName',
  username: 'ISD',
  password: '',
  savePassword: false,
};

export function loadSyncConnection(): OracleConnectionInput {
  if (typeof window === 'undefined') return defaultSyncConnection;
  try {
    const stored = window.sessionStorage.getItem(DB_SYNC_SESSION_KEY);
    if (!stored) return defaultSyncConnection;
    const parsed = JSON.parse(stored) as Partial<OracleConnectionInput>;
    if (!parsed.savePassword) return defaultSyncConnection;
    return { ...defaultSyncConnection, ...parsed, connectionType: 'Basic', savePassword: true };
  } catch {
    window.sessionStorage.removeItem(DB_SYNC_SESSION_KEY);
    return defaultSyncConnection;
  }
}

export function isLocalBrowser() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}
