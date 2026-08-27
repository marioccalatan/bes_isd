import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import { writeFile } from 'node:fs/promises';

const source = 'C:/Users/ENDUSER/Downloads/2026 PM SCHED.xlsx';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const sheet = workbook.worksheets.getItem('SKED PM 2026');
const values = sheet.getRange('A23:G187').values;
const schedules = [null, null, null, null];
const rows = [];
for (const row of values.slice(1)) {
  if (!Number.isInteger(Number(row[0])) || Number(row[0]) <= 0) continue;
  for (let index = 0; index < 4; index += 1) if (String(row[index + 3] ?? '').trim()) schedules[index] = String(row[index + 3]).trim();
  rows.push({ item: Number(row[0]), plate: String(row[1] ?? '').trim(), assignee: String(row[2] ?? '').trim(), quarters: [...schedules] });
}
await writeFile('D:/bes_isd/pm-schedule-rows.json', JSON.stringify(rows, null, 2));
console.log(JSON.stringify({ rows: rows.length, output: 'D:/bes_isd/pm-schedule-rows.json' }));
