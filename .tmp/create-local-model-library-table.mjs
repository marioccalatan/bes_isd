import oracledb from 'oracledb';
await import('../server/config.mjs');
oracledb.fetchAsString = [oracledb.CLOB];

let connection;
try {
  connection = await oracledb.getConnection({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING });
  const exists = await connection.execute(`SELECT 1 FROM user_tables WHERE table_name='BES_FLEET_MODEL_LIBRARY'`);
  if (!exists.rows.length) await connection.execute(`CREATE TABLE BES_FLEET_MODEL_LIBRARY (
    MODEL_UID VARCHAR2(80) PRIMARY KEY,
    VEHICLE_TYPE VARCHAR2(80) NOT NULL,
    BRAND VARCHAR2(120) NOT NULL,
    MODEL VARCHAR2(160) NOT NULL,
    UPDATED_BY_USER_ID NUMBER REFERENCES BES_USERS(USER_ID) ON DELETE SET NULL,
    CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT UQ_BES_FLEET_MODEL_BRAND UNIQUE (BRAND,MODEL))`);
  const payloadResult = await connection.execute(`SELECT PAYLOAD FROM BES_FLEET_STORE WHERE DATA_KEY='MODEL_LIBRARY'`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const models = payloadResult.rows[0]?.PAYLOAD ? JSON.parse(String(payloadResult.rows[0].PAYLOAD)) : [];
  for (const item of models) {
    await connection.execute(`MERGE INTO BES_FLEET_MODEL_LIBRARY target USING (SELECT :modelUid MODEL_UID FROM dual) source
      ON (target.MODEL_UID=source.MODEL_UID)
      WHEN MATCHED THEN UPDATE SET VEHICLE_TYPE=:vehicleType,BRAND=:brand,MODEL=:model,UPDATED_AT=SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (MODEL_UID,VEHICLE_TYPE,BRAND,MODEL) VALUES (:modelUid,:vehicleType,:brand,:model)`, {
      modelUid: item.id, vehicleType: item.type, brand: item.brand, model: item.model,
    });
  }
  await connection.commit();
  const verified = await connection.execute(`SELECT COUNT(*) TOTAL,COUNT(DISTINCT BRAND||CHR(0)||MODEL) UNIQUE_PAIRS,COUNT(DISTINCT VEHICLE_TYPE) TYPES FROM BES_FLEET_MODEL_LIBRARY`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log(JSON.stringify(verified.rows[0], null, 2));
} catch (error) { if (connection) await connection.rollback(); throw error; }
finally { if (connection) await connection.close(); }
