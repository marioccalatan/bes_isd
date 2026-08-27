import oracledb from 'oracledb';
await import('../server/config.mjs');

const localConfig = { user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING };
const serverConfig = { user: process.env.SERVER_ORACLE_USER, password: process.env.SERVER_ORACLE_PASSWORD, connectString: process.env.SERVER_ORACLE_CONNECT_STRING };
let local;
let server;
let tableCreated = false;
try {
  [local, server] = await Promise.all([oracledb.getConnection(localConfig), oracledb.getConnection(serverConfig)]);
  const exists = await local.execute(`SELECT 1 FROM user_objects WHERE object_name='VMS_VEHICLE_MAST'`);
  if (exists.rows.length) throw new Error('Local VMS_VEHICLE_MAST already exists; copy aborted without changing it.');

  const source = await server.execute(`SELECT * FROM ISD.VMS_VEHICLE_MAST ORDER BY ID`, {}, {
    outFormat: oracledb.OUT_FORMAT_ARRAY,
    extendedMetaData: true,
  });
  const sqlType = column => {
    if (column.dbTypeName === 'VARCHAR2') return `VARCHAR2(${column.byteSize} BYTE)`;
    if (column.dbTypeName === 'DATE') return 'DATE';
    if (column.dbTypeName === 'NUMBER') return column.precision > 0
      ? `NUMBER(${column.precision}${column.scale >= 0 ? `,${column.scale}` : ''})`
      : 'NUMBER';
    throw new Error(`Unsupported Oracle type ${column.dbTypeName} for ${column.name}`);
  };
  const definitions = source.metaData.map(column => `${column.name} ${sqlType(column)}${column.nullable === false ? ' NOT NULL' : ''}`);
  await local.execute(`CREATE TABLE VMS_VEHICLE_MAST (${definitions.join(',')})`);
  tableCreated = true;

  const names = source.metaData.map(column => column.name);
  const binds = names.map((_, index) => `:${index + 1}`).join(',');
  const bindDefs = source.metaData.map(column => {
    if (column.dbTypeName === 'VARCHAR2') return { type: oracledb.STRING, maxSize: Math.max(column.byteSize, 1) };
    if (column.dbTypeName === 'DATE') return { type: oracledb.DATE };
    return { type: oracledb.NUMBER };
  });
  await local.executeMany(`INSERT INTO VMS_VEHICLE_MAST (${names.join(',')}) VALUES (${binds})`, source.rows, { bindDefs });
  await local.execute(`CREATE INDEX IX_VMS_VEHICLE_MAST_ID ON VMS_VEHICLE_MAST (ID)`);
  await local.execute(`CREATE INDEX IX_VMS_VEHICLE_MAST_PLATE ON VMS_VEHICLE_MAST (PLATE_NO)`);
  await local.execute(`COMMENT ON TABLE VMS_VEHICLE_MAST IS 'Temporary offline snapshot copied from ISD.VMS_VEHICLE_MAST'`);
  await local.commit();

  const verification = await local.execute(`SELECT COUNT(*) total, COUNT(DISTINCT ID) distinct_ids, SUM(CASE WHEN NVL(DELETED,0)=0 THEN 1 ELSE 0 END) non_deleted FROM VMS_VEHICLE_MAST`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log(JSON.stringify({ copiedRows: source.rows.length, localVerification: verification.rows[0], columns: source.metaData.length }, null, 2));
} catch (error) {
  if (local) await local.rollback();
  if (local && tableCreated) {
    try { await local.execute(`DROP TABLE VMS_VEHICLE_MAST PURGE`); } catch { /* preserve the original error */ }
  }
  throw error;
} finally {
  if (local) await local.close();
  if (server) await server.close();
}
