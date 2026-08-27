import fs from 'node:fs/promises';
import oracledb from 'oracledb';
await import('../server/config.mjs');

const rows = JSON.parse(await fs.readFile('D:/bes_isd/pm-schedule-rows.json', 'utf8'));
const normalize = value => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const monthMap = { JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 };
const parseWindow = value => {
  const text = String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  const match = text.match(/^([A-Z]+) (\d{1,2}) TO (?:(?:([A-Z]+) )?)(\d{1,2})$/);
  if (!match) return null;
  const startMonth = monthMap[match[1]];
  const endMonth = monthMap[match[3] || match[1]];
  if (!startMonth || !endMonth) return null;
  const iso = (month, day) => `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { startDate: iso(startMonth, Number(match[2])), endDate: iso(endMonth, Number(match[4])) };
};

let connection;
try {
  connection = await oracledb.getConnection({
    user: process.env.SERVER_ORACLE_USER,
    password: process.env.SERVER_ORACLE_PASSWORD,
    connectString: process.env.SERVER_ORACLE_CONNECT_STRING,
  });
  const result = await connection.execute(
    `SELECT ID, PLATE_NO, STATUS FROM ISD.VMS_VEHICLE_MAST WHERE NVL(DELETED, 0) = 0`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const vehicleMap = new Map();
  for (const vehicle of result.rows) {
    const key = normalize(vehicle.PLATE_NO);
    if (!key) continue;
    if (!vehicleMap.has(key)) vehicleMap.set(key, []);
    vehicleMap.get(key).push({ id: vehicle.ID, plate: vehicle.PLATE_NO, status: vehicle.STATUS });
  }
  const assessed = rows.map(row => {
    const key = normalize(row.plate);
    const matches = vehicleMap.get(key) ?? [];
    return { ...row, normalizedPlate: key, matches, parsed: row.quarters.map(parseWindow) };
  });
  const workbookGroups = [...Map.groupBy(assessed, row => row.normalizedPlate)].filter(([, group]) => group.length > 1);
  const unmatched = assessed.filter(row => row.matches.length === 0);
  const ambiguous = assessed.filter(row => row.matches.length > 1);
  const dateErrors = assessed.filter(row => row.parsed.some(value => !value));
  const exactScheduleKeys = new Set();
  for (const row of assessed.filter(row => row.matches.length === 1)) {
    row.parsed.forEach((window, index) => {
      if (window) exactScheduleKeys.add(`${row.matches[0].id}|${index + 1}|${window.startDate}|${window.endDate}`);
    });
  }
  console.log(JSON.stringify({
    sourceRows: assessed.length,
    distinctWorkbookPlates: new Set(assessed.map(row => row.normalizedPlate)).size,
    uniqueMatchedRows: assessed.filter(row => row.matches.length === 1).length,
    unmatchedRows: unmatched.length,
    ambiguousRows: ambiguous.length,
    potentialQuarterRowsBeforeDedupe: assessed.filter(row => row.matches.length === 1).length * 4,
    distinctQuarterRowsAfterExactDedupe: exactScheduleKeys.size,
    unmatched: unmatched.map(({ item, plate, assignee }) => ({ item, plate, assignee })),
    ambiguous: ambiguous.map(({ item, plate, matches }) => ({ item, plate, matches })),
    workbookDuplicates: workbookGroups.map(([plate, group]) => ({ plate, items: group.map(row => row.item), sourcePlates: group.map(row => row.plate), quarters: group.map(row => row.quarters) })),
    dateErrors: dateErrors.map(({ item, plate, quarters }) => ({ item, plate, quarters })),
  }, null, 2));
} finally {
  if (connection) await connection.close();
}
