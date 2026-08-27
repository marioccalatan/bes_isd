import fs from 'node:fs/promises';
import oracledb from 'oracledb';
await import('../server/config.mjs');

const sourceRows = JSON.parse(await fs.readFile('D:/bes_isd/pm-schedule-rows.json', 'utf8'));
const normalize = value => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const months = { JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 };
const parseWindow = value => {
  const text = String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  const match = text.match(/^([A-Z]+) (\d{1,2}) TO (?:(?:([A-Z]+) )?)(\d{1,2})$/);
  if (!match) throw new Error(`Unrecognized schedule window: ${value}`);
  const startMonth = months[match[1]];
  const endMonth = months[match[3] || match[1]];
  const iso = (month, day) => `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { startDate: iso(startMonth, Number(match[2])), endDate: iso(endMonth, Number(match[4])) };
};

const firstRows = [...Map.groupBy(sourceRows, row => normalize(row.plate)).values()].map(group => group[0]);
let connection;
try {
  connection = await oracledb.getConnection({
    user: process.env.SERVER_ORACLE_USER,
    password: process.env.SERVER_ORACLE_PASSWORD,
    connectString: process.env.SERVER_ORACLE_CONNECT_STRING,
  });
  const vehicleResult = await connection.execute(
    `SELECT ID, PLATE_NO, STATUS FROM ISD.VMS_VEHICLE_MAST WHERE NVL(DELETED,0)=0`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const vehicleMap = Map.groupBy(vehicleResult.rows.filter(row => normalize(row.PLATE_NO)), row => normalize(row.PLATE_NO));
  const schedules = [];
  for (const row of firstRows) {
    const candidates = vehicleMap.get(normalize(row.plate)) ?? [];
    const active = candidates.filter(candidate => String(candidate.STATUS).toUpperCase() === 'ACTIVE');
    const selected = active.length === 1 ? active[0] : candidates.length === 1 ? candidates[0] : null;
    if (!selected) throw new Error(`Plate ${row.plate} does not resolve to exactly one preferred vehicle record.`);
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
  const existingResult = await connection.execute(
    `SELECT VEHICLE_MASTER_ID, TO_CHAR(START_DATE,'YYYY-MM-DD') START_DATE, TO_CHAR(END_DATE,'YYYY-MM-DD') END_DATE
       FROM BES_FLEET_SCHEDULES WHERE SCHEDULE_TYPE='Preventive Maintenance'`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const existingKeys = new Set(existingResult.rows.map(row => `${row.VEHICLE_MASTER_ID}|${row.START_DATE}|${row.END_DATE}`));
  const pending = schedules.filter(row => !existingKeys.has(`${row.vehicleMasterId}|${row.startDate}|${row.endDate}`));
  if (pending.length) {
    await connection.executeMany(
      `INSERT INTO BES_FLEET_SCHEDULES
        (SCHEDULE_UID, VEHICLE_MASTER_ID, SCHEDULE_TYPE, START_DATE, END_DATE, SCHEDULE_STATUS, NOTES, CREATED_BY_USER_ID)
       VALUES (:scheduleUid, :vehicleMasterId, 'Preventive Maintenance', TO_DATE(:startDate,'YYYY-MM-DD'),
        TO_DATE(:endDate,'YYYY-MM-DD'), 'Scheduled', :notes, NULL)`,
      pending,
      { autoCommit: false },
    );
  }
  await connection.commit();
  const verify = await connection.execute(
    `SELECT COUNT(*) TOTAL FROM BES_FLEET_SCHEDULES
      WHERE SCHEDULE_TYPE='Preventive Maintenance' AND START_DATE >= DATE '2026-01-01' AND START_DATE < DATE '2027-01-01'`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log(JSON.stringify({
    distinctPlatesImported: firstRows.length,
    preparedSchedules: schedules.length,
    inserted: pending.length,
    skippedExisting: schedules.length - pending.length,
    verified2026PreventiveMaintenanceRows: verify.rows[0].TOTAL,
  }, null, 2));
} catch (error) {
  if (connection) await connection.rollback();
  throw error;
} finally {
  if (connection) await connection.close();
}
