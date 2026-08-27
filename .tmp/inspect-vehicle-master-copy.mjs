import oracledb from 'oracledb';
await import('../server/config.mjs');

const localConfig = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING,
};
const serverConfig = {
  user: process.env.SERVER_ORACLE_USER,
  password: process.env.SERVER_ORACLE_PASSWORD,
  connectString: process.env.SERVER_ORACLE_CONNECT_STRING,
};
let local;
let server;
try {
  [local, server] = await Promise.all([oracledb.getConnection(localConfig), oracledb.getConnection(serverConfig)]);
  const [localObject, serverObject, serverCount, structure] = await Promise.all([
    local.execute(`SELECT object_name,object_type FROM user_objects WHERE object_name='VMS_VEHICLE_MAST'`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
    server.execute(`SELECT owner,object_name,object_type FROM all_objects WHERE owner='ISD' AND object_name='VMS_VEHICLE_MAST'`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
    server.execute(`SELECT COUNT(*) total, SUM(CASE WHEN NVL(deleted,0)=0 THEN 1 ELSE 0 END) active_snapshot_rows FROM ISD.VMS_VEHICLE_MAST`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
    server.execute(`SELECT * FROM ISD.VMS_VEHICLE_MAST WHERE 1=0`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT, extendedMetaData: true }),
  ]);
  console.log(JSON.stringify({ localObject: localObject.rows, serverObject: serverObject.rows, serverCounts: serverCount.rows[0], columns: structure.metaData }, null, 2));
} finally {
  if (local) await local.close();
  if (server) await server.close();
}
