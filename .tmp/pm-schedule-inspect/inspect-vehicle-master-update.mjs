import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import { writeFile } from 'node:fs/promises';

const source = 'C:/Users/ENDUSER/Desktop/VMS_VEHICLE_MAST.xlsx';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const summary = workbook.worksheets.items.map((sheet) => {
  const used = sheet.getUsedRange();
  const values = used.values;
  return {
    sheet: sheet.name,
    address: used.address,
    rows: values.length,
    columns: values[0]?.length ?? 0,
    firstRows: values.slice(0, 4),
  };
});
console.log(JSON.stringify(summary, null, 2));
const sheet = workbook.worksheets.getItem('VMS_VEHICLE_MAST');
const values = sheet.getRange('A1:AI361').values;
const headers = values[0].map((value) => String(value ?? '').trim().toUpperCase());
const idIndex = headers.indexOf('ID');
const model2Index = headers.indexOf('MODEL2');
const vehicleTypeIndex = headers.indexOf('VEHICLE_TYPE');
const updates = values.slice(1).filter((row) => row[idIndex] !== null && row[idIndex] !== '').map((row) => ({
  id: Number(row[idIndex]),
  model2: String(row[model2Index] ?? '').trim(),
  vehicleType: String(row[vehicleTypeIndex] ?? '').trim(),
}));
await writeFile('D:/bes_isd/vehicle-master-model-updates.json', JSON.stringify(updates, null, 2));
const duplicateIds = [...Map.groupBy(updates, row => row.id)].filter(([, rows]) => rows.length > 1).map(([id, rows]) => ({ id, count: rows.length }));
console.log(JSON.stringify({
  updateRows: updates.length,
  distinctIds: new Set(updates.map(row => row.id)).size,
  duplicateIds,
  model2Populated: updates.filter(row => row.model2 && row.model2 !== '-').length,
  vehicleTypePopulated: updates.filter(row => row.vehicleType && row.vehicleType !== '-').length,
  maxModel2Length: Math.max(...updates.map(row => row.model2.length)),
  maxVehicleTypeLength: Math.max(...updates.map(row => row.vehicleType.length)),
  vehicleTypes: [...new Set(updates.map(row => row.vehicleType).filter(Boolean))].sort(),
}, null, 2));
