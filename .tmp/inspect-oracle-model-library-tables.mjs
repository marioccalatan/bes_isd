import oracledb from 'oracledb';
await import('../server/config.mjs');
oracledb.fetchAsString = [oracledb.CLOB];

let connection;
try {
  connection = await oracledb.getConnection({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING });
  const objects = await connection.execute(`SELECT object_name,object_type FROM user_objects WHERE object_name LIKE '%FLEET%MODEL%' ORDER BY object_name`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const columns = await connection.execute(`SELECT table_name,column_name,data_type,data_length,nullable FROM user_tab_columns WHERE table_name LIKE '%FLEET%MODEL%' ORDER BY table_name,column_id`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const blobCount = await connection.execute(`SELECT COUNT(*) total FROM BES_FLEET_VEHICLE_MODELS`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const payload = await connection.execute(`SELECT PAYLOAD FROM BES_FLEET_STORE WHERE DATA_KEY='MODEL_LIBRARY'`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  let models = [];
  try { models = payload.rows[0]?.PAYLOAD ? JSON.parse(String(payload.rows[0].PAYLOAD)) : []; } catch { models = []; }
  console.log(JSON.stringify({ objects: objects.rows, columns: columns.rows, blobRows: blobCount.rows[0].TOTAL, payloadModels: models.length }, null, 2));
} finally { if (connection) await connection.close(); }
