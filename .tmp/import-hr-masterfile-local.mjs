import fs from "node:fs/promises";
import oracledb from "oracledb";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "D:/bes_isd/.tmp/HR_EMP_MASTERFILE.xlsx";
const envText = await fs.readFile("D:/bes_isd/.env.local", "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
  const separator = line.indexOf("=");
  return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
}));

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const sheet = workbook.worksheets.getItem("HR_EMP_MASTERFILE");
const values = sheet.getUsedRange(true).values;
const headers = values[0].map((value) => String(value).trim().toUpperCase());
const sourceRows = values.slice(1).filter((row) => row.some((value) => value !== null && value !== undefined && value !== ""));
const dateColumns = new Set(["UPDATE_DATE", "BIRTHDATE", "DATE_HIRED", "DATE_RET", "DATE_CREDIT_RELEASED"]);
const forceText = /(^EMPNO$|_ID$|_NO$|^O_ID$|^GROUP_ID$|^JS_ID$|^JL_ID$|^ZIP$|^STEP$|^RANK$|^TIN_NO$|^BANK_ACC$|^BADGENUMBER$|^CIVIL_STAT$|^UPDATE_BY$)/;

function excelDate(serial) {
  if (serial === null || serial === undefined || serial === "") return null;
  if (serial instanceof Date) return serial;
  if (typeof serial === "number") return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  const parsed = new Date(serial);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

const columnTypes = headers.map((header, index) => {
  if (dateColumns.has(header)) return "DATE";
  const populated = sourceRows.map((row) => row[index]).filter((value) => value !== null && value !== undefined && value !== "");
  if (populated.length && populated.every((value) => typeof value === "number") && !forceText.test(header)) return "NUMBER";
  const maxLength = populated.reduce((max, value) => Math.max(max, String(value).length), 0);
  return `VARCHAR2(${Math.min(4000, Math.max(30, Math.ceil(maxLength * 1.5)))})`;
});

const rows = sourceRows.map((row) => Object.fromEntries(headers.map((header, index) => {
  const raw = row[index];
  if (dateColumns.has(header)) return [header, excelDate(raw)];
  if (columnTypes[index] === "NUMBER") return [header, raw === "" || raw === undefined ? null : raw];
  return [header, raw === null || raw === undefined || raw === "" ? null : String(raw)];
})));

let connection;
try {
  connection = await oracledb.getConnection({ user: env.ORACLE_USER, password: env.ORACLE_PASSWORD, connectString: env.ORACLE_CONNECT_STRING });
  const exists = await connection.execute("SELECT COUNT(*) AS TOTAL FROM user_tables WHERE table_name='HR_EMP_MASTERFILE'", {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  if (exists.rows[0].TOTAL) {
    const current = await connection.execute("SELECT COUNT(*) AS TOTAL FROM HR_EMP_MASTERFILE", {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    if (current.rows[0].TOTAL) throw new Error("HR_EMP_MASTERFILE already exists with data; refusing to overwrite it.");
    await connection.execute("DROP TABLE HR_EMP_MASTERFILE PURGE");
  }
  await connection.execute(`CREATE TABLE HR_EMP_MASTERFILE (${headers.map((header, index) => `${header} ${columnTypes[index]}`).join(",\n")})`);
  const bindDefs = Object.fromEntries(headers.map((header, index) => {
    if (columnTypes[index] === "DATE") return [header, { type: oracledb.DATE }];
    if (columnTypes[index] === "NUMBER") return [header, { type: oracledb.NUMBER }];
    return [header, { type: oracledb.STRING, maxSize: Number(columnTypes[index].match(/\((\d+)\)/)[1]) }];
  }));
  const sql = `INSERT INTO HR_EMP_MASTERFILE (${headers.join(",")}) VALUES (${headers.map((header) => `:${header}`).join(",")})`;
  const result = await connection.executeMany(sql, rows, { bindDefs, autoCommit: false });
  await connection.execute("CREATE INDEX IX_HR_EMP_MASTERFILE_EMPNO ON HR_EMP_MASTERFILE (EMPNO)");
  await connection.execute("CREATE INDEX IX_HR_EMP_MASTERFILE_ACTIVE ON HR_EMP_MASTERFILE (ACTIVE_STAT)");
  await connection.commit();
  const verification = await connection.execute(`SELECT COUNT(*) AS TOTAL_ROWS, COUNT(DISTINCT EMPNO) AS DISTINCT_EMPNO, COUNT(*) - COUNT(EMPNO) AS NULL_EMPNO FROM HR_EMP_MASTERFILE`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const columns = await connection.execute("SELECT COUNT(*) AS TOTAL_COLUMNS FROM user_tab_columns WHERE table_name='HR_EMP_MASTERFILE'", {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log(JSON.stringify({ rowsAffected: result.rowsAffected, ...verification.rows[0], ...columns.rows[0] }));
} catch (error) {
  if (connection) await connection.rollback();
  throw error;
} finally {
  if (connection) await connection.close();
}
