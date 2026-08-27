import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = "D:/bes_isd/.tmp/HR_EMP_MASTERFILE.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const sheets = workbook.worksheets.items.map((sheet) => sheet.name);
const target = workbook.worksheets.getItem("HR_EMP_MASTERFILE");
const used = target.getUsedRange(true);
const values = used.values;
const stats = values[0].map((header, columnIndex) => {
  const nonBlank = values.slice(1).map((row) => row[columnIndex]).filter((value) => value !== null && value !== undefined && value !== "");
  const types = [...new Set(nonBlank.map((value) => value instanceof Date ? "date" : typeof value))];
  const maxLength = nonBlank.reduce((max, value) => Math.max(max, String(value).length), 0);
  return { columnIndex: columnIndex + 1, header, types, maxLength, samples: nonBlank.slice(0, 5) };
});
console.log(JSON.stringify({ sheets, usedAddress: used.address, rowCount: values.length - 1, stats }));
