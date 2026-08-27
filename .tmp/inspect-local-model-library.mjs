import oracledb from 'oracledb';
await import('../server/config.mjs');
oracledb.fetchAsString = [oracledb.CLOB];

let connection;
try {
  connection = await oracledb.getConnection({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING });
  const candidates = await connection.execute(`SELECT BRAND,MODEL,VEHICLE_TYPE,COUNT(*) VEHICLE_COUNT
    FROM VMS_VEHICLE_MAST
    WHERE VEHICLE_TYPE IS NOT NULL AND TRIM(BRAND) IS NOT NULL AND TRIM(MODEL) IS NOT NULL
      AND TRIM(BRAND)<>'-' AND TRIM(MODEL)<>'-'
    GROUP BY BRAND,MODEL,VEHICLE_TYPE ORDER BY BRAND,MODEL,VEHICLE_TYPE`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const library = await connection.execute(`SELECT PAYLOAD FROM BES_FLEET_STORE WHERE DATA_KEY='MODEL_LIBRARY'`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  let existing = [];
  try { existing = library.rows[0]?.PAYLOAD ? JSON.parse(String(library.rows[0].PAYLOAD)) : []; } catch { existing = []; }
  const pairGroups = Map.groupBy(candidates.rows, row => `${String(row.BRAND).trim().toUpperCase()}|${String(row.MODEL).trim().toUpperCase()}`);
  const conflictingTypes = [...pairGroups].filter(([, rows]) => new Set(rows.map(row => row.VEHICLE_TYPE)).size > 1).map(([pair, rows]) => ({ pair, types: rows.map(row => ({ type: row.VEHICLE_TYPE, count: row.VEHICLE_COUNT })) }));
  console.log(JSON.stringify({ candidateRows: candidates.rows.length, uniqueBrandModels: pairGroups.size, existingLibraryEntries: existing.length, conflictingTypes, sample: candidates.rows.slice(0, 12) }, null, 2));
} finally { if (connection) await connection.close(); }
