import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const sourcePath = 'C:/Users/ENDUSER/Downloads/PROPOSED CSR PROGRAMS 2025_ISD_SIR CRIS a.xlsx';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const name = 'STATUS PER DISTRICT 2025';
const sheet = workbook.worksheets.getItem(name);
const values = sheet.getRange('A1:H165').values;
console.log(JSON.stringify({ name, values }));
