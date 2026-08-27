import fs from "node:fs/promises";
import oracledb from "oracledb";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const envText = await fs.readFile("D:/bes_isd/.env.local", "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
  const separator = line.indexOf("=");
  return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load("D:/bes_isd/.tmp/HR_DEPARTMENT_LOOKUP.xlsx"));
const values = workbook.worksheets.getItem("HR_DEPARTMENT_LOOKUP").getUsedRange(true).values;
const rows = values.slice(1).filter((row) => row[0]).map(([deptId, deptShort, deptLong, updateDate, updateBy, activeStat]) => ({
  deptId: String(deptId), deptShort: String(deptShort), deptLong: String(deptLong),
  updateDate: new Date(Date.UTC(1899, 11, 30) + Number(updateDate) * 86400000), updateBy: String(updateBy), activeStat: String(activeStat),
}));
let connection;
try {
  connection = await oracledb.getConnection({ user: env.ORACLE_USER, password: env.ORACLE_PASSWORD, connectString: env.ORACLE_CONNECT_STRING });
  try {
    await connection.execute(`CREATE TABLE HR_DEPARTMENT_LOOKUP (
      DEPT_ID VARCHAR2(3) PRIMARY KEY,
      DEPT_SHORT VARCHAR2(20) NOT NULL,
      DEPT_LONG VARCHAR2(150) NOT NULL,
      UPDATE_DATE DATE,
      UPDATE_BY VARCHAR2(150),
      ACTIVE_STAT VARCHAR2(20) NOT NULL
    )`);
  } catch (error) { if (error.errorNum !== 955) throw error; }
  await connection.executeMany(`MERGE INTO HR_DEPARTMENT_LOOKUP d USING (SELECT :deptId DEPT_ID FROM dual) s ON (d.DEPT_ID=s.DEPT_ID)
    WHEN MATCHED THEN UPDATE SET d.DEPT_SHORT=:deptShort,d.DEPT_LONG=:deptLong,d.UPDATE_DATE=:updateDate,d.UPDATE_BY=:updateBy,d.ACTIVE_STAT=:activeStat
    WHEN NOT MATCHED THEN INSERT (DEPT_ID,DEPT_SHORT,DEPT_LONG,UPDATE_DATE,UPDATE_BY,ACTIVE_STAT)
      VALUES (:deptId,:deptShort,:deptLong,:updateDate,:updateBy,:activeStat)`, rows, {
    bindDefs: { deptId: { type: oracledb.STRING, maxSize: 3 }, deptShort: { type: oracledb.STRING, maxSize: 20 }, deptLong: { type: oracledb.STRING, maxSize: 150 }, updateDate: { type: oracledb.DATE }, updateBy: { type: oracledb.STRING, maxSize: 150 }, activeStat: { type: oracledb.STRING, maxSize: 20 } },
  });
  await connection.commit();
  const result = await connection.execute(`SELECT (SELECT COUNT(*) FROM HR_DEPARTMENT_LOOKUP) DEPARTMENTS,
    (SELECT COUNT(*) FROM HR_EMP_MASTERFILE WHERE UPPER(TRIM(ACTIVE_STAT))='ACTIVE') ACTIVE_EMPLOYEES FROM dual`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log(JSON.stringify(result.rows[0]));
} finally { if (connection) await connection.close(); }
