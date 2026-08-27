import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && process.env[match[1].trim()] === undefined) process.env[match[1].trim()] = match[2].trim();
  }
}

export const config = {
  user: process.env.ORACLE_USER ?? 'BES_ISD',
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING ?? 'localhost:1521/FREEPDB1',
  host: process.env.API_HOST ?? '127.0.0.1',
  port: Number(process.env.API_PORT ?? 3001),
  serverOracle: process.env.SERVER_ORACLE_USER && process.env.SERVER_ORACLE_PASSWORD && process.env.SERVER_ORACLE_CONNECT_STRING ? {
    user: process.env.SERVER_ORACLE_USER,
    password: process.env.SERVER_ORACLE_PASSWORD,
    connectString: process.env.SERVER_ORACLE_CONNECT_STRING,
  } : null,
};

if (!config.password) throw new Error('ORACLE_PASSWORD is required. Copy .env.example to .env.local.');
