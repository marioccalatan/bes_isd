import crypto from 'node:crypto';
import oracledb from 'oracledb';
await import('../server/config.mjs');
oracledb.fetchAsString = [oracledb.CLOB];

const normalize = value => String(value ?? '').trim().toUpperCase();
let connection;
try {
  connection = await oracledb.getConnection({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING });
  const candidates = await connection.execute(`SELECT TRIM(BRAND) BRAND,TRIM(MODEL) MODEL,TRIM(VEHICLE_TYPE) VEHICLE_TYPE,COUNT(*) VEHICLE_COUNT
    FROM VMS_VEHICLE_MAST
    WHERE VEHICLE_TYPE IS NOT NULL AND TRIM(BRAND) IS NOT NULL AND TRIM(MODEL) IS NOT NULL
      AND TRIM(BRAND)<>'-' AND TRIM(MODEL)<>'-'
    GROUP BY TRIM(BRAND),TRIM(MODEL),TRIM(VEHICLE_TYPE)`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const current = await connection.execute(`SELECT PAYLOAD FROM BES_FLEET_STORE WHERE DATA_KEY='MODEL_LIBRARY'`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  let existing = [];
  try { existing = current.rows[0]?.PAYLOAD ? JSON.parse(String(current.rows[0].PAYLOAD)) : []; } catch { existing = []; }
  const existingByPair = new Map(existing.map(item => [`${normalize(item.brand)}|${normalize(item.model)}`, item]));
  const grouped = Map.groupBy(candidates.rows, row => `${normalize(row.BRAND)}|${normalize(row.MODEL)}`);
  const generated = [...grouped.entries()].map(([pair, rows]) => {
    const selected = [...rows].sort((a, b) => Number(b.VEHICLE_COUNT) - Number(a.VEHICLE_COUNT) || String(a.VEHICLE_TYPE).localeCompare(String(b.VEHICLE_TYPE)))[0];
    const prior = existingByPair.get(pair);
    return {
      ...(prior ?? {}),
      id: prior?.id ?? `MODEL-${crypto.createHash('sha1').update(pair).digest('hex').slice(0, 16).toUpperCase()}`,
      type: selected.VEHICLE_TYPE,
      brand: selected.BRAND,
      model: selected.MODEL,
    };
  });
  const generatedPairs = new Set(generated.map(item => `${normalize(item.brand)}|${normalize(item.model)}`));
  const library = [...generated, ...existing.filter(item => !generatedPairs.has(`${normalize(item.brand)}|${normalize(item.model)}`))]
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
  const payload = JSON.stringify(library);
  await connection.execute(`MERGE INTO BES_FLEET_STORE target USING (SELECT 'MODEL_LIBRARY' DATA_KEY FROM dual) source
    ON (target.DATA_KEY=source.DATA_KEY)
    WHEN MATCHED THEN UPDATE SET PAYLOAD=:payload,UPDATED_AT=SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT (DATA_KEY,PAYLOAD) VALUES ('MODEL_LIBRARY',:payload)`, { payload: { val: payload, type: oracledb.CLOB } });
  await connection.commit();
  const typeCounts = Object.entries(Object.groupBy(generated, item => item.type)).map(([type, items]) => ({ type, models: items.length })).sort((a, b) => a.type.localeCompare(b.type));
  console.log(JSON.stringify({ generatedFromVehicleMaster: generated.length, retainedUnmatchedExisting: library.length - generated.length, finalLibraryEntries: library.length, typeCounts }, null, 2));
} catch (error) {
  if (connection) await connection.rollback();
  throw error;
} finally { if (connection) await connection.close(); }
