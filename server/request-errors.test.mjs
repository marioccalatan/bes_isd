import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the real handler without starting the server or initializing a database.
const source = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const handlerSource = source.slice(source.indexOf('async function handle(req, res) {'), source.lastIndexOf('await initializeDatabase();'));

test('vehicle inspection saves header, drawing annotations, snapshot and photo together', async () => {
  const queries = [];
  let commits = 0;
  const annotations = [{ id: 'drawing-1', type: 'circle', x: 10, y: 20, width: 30, height: 15, color: '#ff0000' }];
  const context = vm.createContext({
    URL, Buffer, console,
    bearerToken: () => 'test-session',
    currentSessionUser: async () => ({ USER_ID: 1 }),
    isLocalDevelopmentRequest: () => false,
    normalize: (value) => String(value ?? '').trim(),
    safeFileName: (value) => value,
    oracledb: { CLOB: 'CLOB' },
    json: (res, status, body) => Object.assign(res, { status, body }),
    readBody: async () => ({ vehicleMasterId: '7', inspectionDate: '2026-09-21', inspectedBy: 'Test inspector', inspectionStatus: 'With Findings', items: [{ id: 'item-1', activity: 'Body', status: 'Schedule Repair', findings: 'Scratch', annotations, snapshot: { name: 'snapshot.png', dataUrl: 'data:image/png;base64,AQID' }, photos: [{ name: 'photo.png', dataUrl: 'data:image/png;base64,BAUG' }] }] }),
    withConnection: async (work) => work({ execute: async (sql, binds) => { queries.push({ sql, binds }); return { rows: [[1]] }; }, commit: async () => { commits += 1; } }),
  });
  const handle = vm.runInContext(`${handlerSource}\nhandle`, context);
  const response = {};
  await handle({ method: 'POST', url: '/api/fleet/master-inspections' }, response);
  assert.equal(response.status, 201);
  const header = queries.find(({ sql }) => sql.startsWith('INSERT INTO bes_fleet_inspections '));
  const detail = queries.find(({ sql }) => sql.startsWith('INSERT INTO bes_fleet_inspection_items '));
  const photo = queries.find(({ sql }) => sql.startsWith('INSERT INTO bes_fleet_inspection_photos '));
  assert.equal(header.binds.vehicleMasterId, 7);
  assert.equal(detail.binds.inspectionUid, header.binds.inspectionUid);
  assert.deepEqual(JSON.parse(detail.binds.annotationsJson.val), annotations);
  assert.deepEqual(detail.binds.snapshotBlob, Buffer.from([1, 2, 3]));
  assert.equal(photo.binds.itemUid, 'item-1');
  assert.deepEqual(photo.binds.fileBlob, Buffer.from([4, 5, 6]));
  assert.equal(commits, 1);
});

for (const route of ['/api/fleet/maintenance-schedule', '/api/fleet/master-vehicles', '/api/fleet/records']) {
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

for (const route of ['/api/fleet/master-vehicles', '/api/fleet/records']) {
  test(`${route} requires a session and applies the correct vehicle scope`, async () => {
    let sessionToken = null;
    let validSession = true;
    const queries = [];
    const context = vm.createContext({
      URL, console,
      bearerToken: () => sessionToken,
      currentSessionUser: async () => validSession ? { USER_ID: 1 } : null,
      isLocalDevelopmentRequest: () => false,
      oracledb: { OUT_FORMAT_OBJECT: 1 },
      json: (res, status, body) => Object.assign(res, { status, body }),
      withConnection: async (work) => work({ execute: async (sql) => {
        queries.push(sql);
        return { rows: [{ ID: 7, PLATE_NO: 'TEST-7', STATUS: 'INACTIVE', VEHICLE_TYPE: null, CHASIS_NO: 'CH-7', ACQUIRED_COST: 0 }] };
      } }),
    });
    const handle = vm.runInContext(`${handlerSource}\nhandle`, context);
    const missingSession = {};
    await handle({ method: 'GET', url: route }, missingSession);
    assert.equal(missingSession.status, 401);
    sessionToken = 'test-session';
    validSession = false;
    const expiredSession = {};
    await handle({ method: 'GET', url: route }, expiredSession);
    assert.equal(expiredSession.status, 401);
    assert.equal(queries.length, 0);
    validSession = true;
    const response = {};
    await handle({ method: 'GET', url: route }, response);
    assert.equal(response.status, 200);
    assert.match(queries[0], /FROM vms_vehicle_mast WHERE NVL\(deleted,0\)=0/);
    assert.equal(queries[0].includes("status='ACTIVE' AND vehicle_type IS NOT NULL"), route.endsWith('master-vehicles'));
    assert.equal(queries[0].includes("asset_type='VEHICLE' AND status='ACTIVE'"), route.endsWith('records'));
    assert.equal(response.body.vehicles[0].id, '7');
    assert.equal(response.body.vehicles[0].chassisNo, 'CH-7');
    assert.equal(response.body.vehicles[0].acquiredCost, 0);
  });
}
