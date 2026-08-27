import oracledb from 'oracledb';
await import('../server/config.mjs');
let connection;
try {
  connection = await oracledb.getConnection({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING });
  const result = await connection.execute(`SELECT COUNT(*) TOTAL, COUNT(DISTINCT BRAND||CHR(0)||MODEL) UNIQUE_MODELS,
    COUNT(DISTINCT VEHICLE_TYPE) VEHICLE_TYPES, SUM(CASE WHEN VEHICLE_TYPE IS NULL THEN 1 ELSE 0 END) NULL_TYPES
    FROM BES_FLEET_MODEL_LIBRARY`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const duplicates = await connection.execute(`SELECT BRAND,MODEL,COUNT(*) TOTAL FROM BES_FLEET_MODEL_LIBRARY GROUP BY BRAND,MODEL HAVING COUNT(*)>1`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log(JSON.stringify({ ...result.rows[0], DUPLICATE_PAIRS: duplicates.rows.length }, null, 2));
} finally { if (connection) await connection.close(); }
