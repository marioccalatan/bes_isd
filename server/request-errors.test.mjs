import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the real handler without starting the server or initializing a database.
const source = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const handlerSource = source.slice(source.indexOf('async function handle(req, res) {'), source.lastIndexOf('await initializeDatabase();'));

for (const route of ['/api/fleet/maintenance-schedule', '/api/fleet/master-vehicles']) {
  test(`${route} contains database errors and allows subsequent requests`, async () => {
    const errors = [];
    const context = vm.createContext({
      URL,
      console: { error: (error) => errors.push(error) },
      bearerToken: () => 'test-session',
      currentSessionUser: async () => ({ USER_ID: 1 }),
      isLocalDevelopmentRequest: () => false,
      oracledb: { OUT_FORMAT_OBJECT: 1 },
      json: (res, status, body) => Object.assign(res, { status, body }),
      withConnection: async (work) => work({
        execute: async (sql) => {
          if (sql.includes('FROM dual')) return { rows: [{ CONTAINER_NAME: 'TEST' }] };
          throw Object.assign(new Error('ORA-00904: "VEHICLE"."VEHICLE_TYPE": invalid identifier'), { errorNum: 904 });
        },
      }),
    });
    const handle = vm.runInContext(`${handlerSource}\nhandle`, context);
    const failedResponse = {};
    await handle({ method: 'GET', url: route }, failedResponse);
    assert.equal(failedResponse.status, 500);
    assert.equal(failedResponse.body.error, 'The server could not complete the request.');
    assert.equal(errors.length, 1);
    const healthResponse = {};
    await handle({ method: 'GET', url: '/api/health' }, healthResponse);
    assert.equal(healthResponse.status, 200);
    assert.equal(healthResponse.body.ok, true);
  });
}
