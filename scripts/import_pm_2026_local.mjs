import fs from 'node:fs/promises';
import oracledb from 'oracledb';
await import('../server/config.mjs');

const sourceRows = JSON.parse(await fs.readFile(new URL('../pm-schedule-rows.json', import.meta.url), 'utf8'));
const normalize = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const months = { JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 };

function parseWindow(value) {
  const match = String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ').match(/^([A-Z]+) (\d{1,2}) TO (?:(?:([A-Z]+) )?)(\d{1,2})$/);
  if (!match) throw new Error(`Unrecognized schedule window: ${value}`);
  const iso = (month, day) => `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { startDate: iso(months[match[1]], Number(match[2])), endDate: iso(months[match[3] || match[1]], Number(match[4])) };
}

const firstRowsByPlate = new Map();
for (const row of sourceRows) {
  const plateKey = normalize(row.plate);
  if (plateKey && !firstRowsByPlate.has(plateKey)) firstRowsByPlate.set(plateKey, row);
}

let connection;
try {
  connection = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const vehicleResult = await connection.execute(
    `SELECT ID, PLATE_NO, STATUS FROM VMS_VEHICLE_MAST WHERE NVL(DELETED,0)=0`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const vehiclesByPlate = Map.groupBy(vehicleResult.rows.filter((row) => normalize(row.PLATE_NO)), (row) => normalize(row.PLATE_NO));
  const schedules = [];
  const unmatchedPlates = [];
  const ambiguousPlates = [];

  for (const [plateKey, row] of firstRowsByPlate) {
    const candidates = vehiclesByPlate.get(plateKey) ?? [];
    const active = candidates.filter((candidate) => String(candidate.STATUS).toUpperCase() === 'ACTIVE');
    const selected = active.length === 1 ? active[0] : candidates.length === 1 ? candidates[0] : null;
    if (!selected) {
      (candidates.length ? ambiguousPlates : unmatchedPlates).push(row.plate);
      continue;
    }
    row.quarters.forEach((value, index) => {
      const window = parseWindow(value);
      schedules.push({
        scheduleUid: `PM2026-${selected.ID}-Q${index + 1}`,
        vehicleMasterId: selected.ID,
        startDate: window.startDate,
        endDate: window.endDate,
        notes: `Initial 2026 PM schedule; source row ${row.item}; plate ${row.plate}; quarter ${index + 1}`,
      });
    });
  }

  const result = await connection.executeMany(
    `MERGE INTO BES_FLEET_SCHEDULES target
     USING (SELECT :scheduleUid schedule_uid, :vehicleMasterId vehicle_master_id,
                   TO_DATE(:startDate,'YYYY-MM-DD') start_date, TO_DATE(:endDate,'YYYY-MM-DD') end_date,
                   :notes notes FROM dual) source
     ON (target.schedule_uid=source.schedule_uid)
     WHEN NOT MATCHED THEN INSERT
       (schedule_uid,vehicle_master_id,schedule_type,start_date,end_date,schedule_status,notes,created_by_user_id)
     VALUES
       (source.schedule_uid,source.vehicle_master_id,'Preventive Maintenance',source.start_date,source.end_date,'Scheduled',source.notes,NULL)`,
    schedules,
    { autoCommit: false },
  );
  await connection.commit();

  const verify = await connection.execute(
    `SELECT COUNT(*) total, COUNT(DISTINCT vehicle_master_id) vehicles
       FROM BES_FLEET_SCHEDULES
      WHERE schedule_type='Preventive Maintenance'
        AND start_date >= DATE '2026-01-01' AND start_date < DATE '2027-01-01'`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log(JSON.stringify({
    uniqueSourcePlates: firstRowsByPlate.size,
    matchedVehicles: schedules.length / 4,
    preparedSchedules: schedules.length,
    inserted: result.rowsAffected,
    unmatchedPlates,
    ambiguousPlates,
    verifiedSchedules: verify.rows[0].TOTAL,
    verifiedVehicles: verify.rows[0].VEHICLES,
  }, null, 2));
} catch (error) {
  if (connection) await connection.rollback();
  throw error;
} finally {
  if (connection) await connection.close();
}
