import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbook = await SpreadsheetFile.importXlsx(
  await FileBlob.load("D:/bes_isd/.tmp/HR_JOBLEVEL_LOOKUP.xlsx"),
);

for (const sheet of workbook.worksheets.items) {
  console.log(JSON.stringify({ sheet: sheet.name, directValues: sheet.getRange("A1:Z100").values }));
  const inspection = await workbook.inspect({
    kind: "table",
    range: `${sheet.name}!A1:Z2000`,
    include: "values,formulas",
    tableMaxRows: 2000,
    tableMaxCols: 26,
  });
  console.log(JSON.stringify({ sheet: sheet.name, data: inspection.ndjson }));
}
