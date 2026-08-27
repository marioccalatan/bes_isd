import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load("D:/bes_isd/.tmp/HR_DEPARTMENT_LOOKUP.xlsx"));
const result = workbook.worksheets.items.map((sheet) => {
  const used = sheet.getUsedRange(true);
  return { name: sheet.name, address: used.address, values: used.values };
});
console.log(JSON.stringify(result));
