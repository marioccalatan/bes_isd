import fs from 'node:fs/promises';
import oracledb from 'oracledb';
await import('../server/config.mjs');

const updates = JSON.parse(await fs.readFile('D:/bes_isd/vehicle-master-model-updates.json', 'utf8'));
const localConfig = { user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING };
let connection;
try {
  connection = await oracledb.getConnection(localConfig);
  const localIdsResult = await connection.execute(`SELECT ID FROM VMS_VEHICLE_MAST`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const localIds = new Set(localIdsResult.rows.map(row => Number(row.ID)));
  const missingIds = updates.filter(row => !localIds.has(Number(row.id))).map(row => row.id);
  if (missingIds.length) throw new Error(`Spreadsheet IDs missing locally: ${missingIds.join(', ')}`);

  const columnResult = await connection.execute(`SELECT 1 FROM user_tab_columns WHERE table_name='VMS_VEHICLE_MAST' AND column_name='VEHICLE_TYPE'`);
  if (!columnResult.rows.length) await connection.execute(`ALTER TABLE VMS_VEHICLE_MAST ADD (VEHICLE_TYPE VARCHAR2(30 BYTE))`);

  const result = await connection.executeMany(
    `UPDATE VMS_VEHICLE_MAST SET MODEL=:model2, VEHICLE_TYPE=:vehicleType WHERE ID=:id`,
    updates.map(row => ({ id: row.id, model2: row.model2 || null, vehicleType: row.vehicleType || null })),
    {
      bindDefs: {
        id: { type: oracledb.NUMBER },
        model2: { type: oracledb.STRING, maxSize: 20 },
        vehicleType: { type: oracledb.STRING, maxSize: 30 },
      },
      dmlRowCounts: true,
    },
  );
  const unmatched = result.dmlRowCounts.map((count, index) => count === 0 ? updates[index].id : null).filter(value => value !== null);
  if (unmatched.length) throw new Error(`Updates did not match local IDs: ${unmatched.join(', ')}`);
  await connection.commit();

  const verification = await connection.execute(`SELECT COUNT(*) total,
      COUNT(MODEL) model_values,
      SUM(CASE WHEN MODEL IS NOT NULL AND MODEL <> '-' THEN 1 ELSE 0 END) populated_models,
      COUNT(VEHICLE_TYPE) vehicle_type_values,
      COUNT(DISTINCT VEHICLE_TYPE) distinct_vehicle_types
    FROM VMS_VEHICLE_MAST`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const types = await connection.execute(`SELECT VEHICLE_TYPE,COUNT(*) total FROM VMS_VEHICLE_MAST GROUP BY VEHICLE_TYPE ORDER BY VEHICLE_TYPE`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log(JSON.stringify({ updatedRows: result.dmlRowCounts.reduce((sum, count) => sum + count, 0), verification: verification.rows[0], vehicleTypes: types.rows }, null, 2));
} catch (error) {
  if (connection) await connection.rollback();
  throw error;
} finally {
  if (connection) await connection.close();
}
