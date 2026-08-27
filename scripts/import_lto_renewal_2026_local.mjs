import oracledb from 'oracledb';
await import('../server/config.mjs');

const YEAR = 2026;
const normalize = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const pad = (value) => String(value).padStart(2, '0');

function renewalWindow(plateNumber) {
  const plate = normalize(plateNumber);
  const digits = plate.replace(/\D/g, '').match(/(\d)(\d)$/);
  if (!digits) return null;
  const weekDigit = Number(digits[1]);
  const monthDigit = Number(digits[2]);
  const month = monthDigit === 0 ? 10 : monthDigit;
  const [startDay, endDay] = weekDigit <= 3 ? [1, 7] : weekDigit <= 6 ? [8, 14] : weekDigit <= 8 ? [15, 21] : [22, new Date(YEAR, month, 0).getDate()];
  return {
    startDate: `${YEAR}-${pad(month)}-${pad(startDay)}`,
    endDate: `${YEAR}-${pad(month)}-${pad(endDay)}`,
    weekDigit,
    monthDigit,
  };
}

let connection;
try {
  connection = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const vehicleResult = await connection.execute(
    `SELECT ID, PLATE_NO FROM VMS_VEHICLE_MAST
      WHERE NVL(DELETED,0)=0 AND STATUS='ACTIVE' AND VEHICLE_TYPE IS NOT NULL`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const schedules = [];
  const undecodablePlates = [];
  for (const vehicle of vehicleResult.rows) {
    const window = renewalWindow(vehicle.PLATE_NO);
    if (!window) {
      undecodablePlates.push({ id: String(vehicle.ID), plateNo: vehicle.PLATE_NO });
      continue;
    }
    schedules.push({
      scheduleUid: `LTO${YEAR}-${vehicle.ID}`,
      vehicleMasterId: vehicle.ID,
      startDate: window.startDate,
      endDate: window.endDate,
      notes: `LTO registration schedule derived from plate ${vehicle.PLATE_NO}; month digit ${window.monthDigit}; week digit ${window.weekDigit}`,
    });
  }

  const existing = await connection.execute(
    `SELECT SCHEDULE_UID FROM BES_FLEET_SCHEDULES
      WHERE SCHEDULE_TYPE='Registration Renewal' AND START_DATE >= DATE '2026-01-01' AND START_DATE < DATE '2027-01-01'`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const existingIds = new Set(existing.rows.map((row) => row.SCHEDULE_UID));
  const pending = schedules.filter((schedule) => !existingIds.has(schedule.scheduleUid));
  if (pending.length) {
    await connection.executeMany(
      `INSERT INTO BES_FLEET_SCHEDULES
        (SCHEDULE_UID,VEHICLE_MASTER_ID,SCHEDULE_TYPE,START_DATE,END_DATE,SCHEDULE_STATUS,NOTES,CREATED_BY_USER_ID)
       VALUES
        (:scheduleUid,:vehicleMasterId,'Registration Renewal',TO_DATE(:startDate,'YYYY-MM-DD'),TO_DATE(:endDate,'YYYY-MM-DD'),'Scheduled',:notes,NULL)`,
      pending,
      { autoCommit: false },
    );
  }
  await connection.commit();

  const verify = await connection.execute(
    `SELECT COUNT(*) TOTAL, COUNT(DISTINCT VEHICLE_MASTER_ID) VEHICLES
       FROM BES_FLEET_SCHEDULES
      WHERE SCHEDULE_TYPE='Registration Renewal' AND START_DATE >= DATE '2026-01-01' AND START_DATE < DATE '2027-01-01'`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log(JSON.stringify({
    activeTypedVehicles: vehicleResult.rows.length,
    eligiblePlates: schedules.length,
    inserted: pending.length,
    skippedExisting: schedules.length - pending.length,
    undecodableCount: undecodablePlates.length,
    undecodablePlates,
    verifiedSchedules: verify.rows[0].TOTAL,
    verifiedVehicles: verify.rows[0].VEHICLES,
  }, null, 2));
} catch (error) {
  if (connection) await connection.rollback();
  throw error;
} finally {
  if (connection) await connection.close();
}
