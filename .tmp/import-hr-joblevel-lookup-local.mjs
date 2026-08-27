import fs from "node:fs/promises";
import oracledb from "oracledb";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const envText = await fs.readFile("D:/bes_isd/.env.local", "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
  const separator = line.indexOf("=");
  return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load("D:/bes_isd/.tmp/HR_JOBLEVEL_LOOKUP.xlsx"));
const values = workbook.worksheets.getItem("HR_JOBLEVEL_LOOKUP").getUsedRange(true).values;
const rows = values.slice(1).filter((row) => row[0]).map(([jobLevelId, jobLevelDescription, updateDate, updateBy, activeStat]) => ({
  jobLevelId: String(jobLevelId).padStart(2, "0"),
  jobLevelDescription: String(jobLevelDescription),
  updateDate: new Date(Date.UTC(1899, 11, 30) + Number(updateDate) * 86400000),
  updateBy: String(updateBy),
  activeStat: String(activeStat),
}));

let connection;
try {
  connection = await oracledb.getConnection({ user: env.ORACLE_USER, password: env.ORACLE_PASSWORD, connectString: env.ORACLE_CONNECT_STRING });
  try {
    await connection.execute(`CREATE TABLE HR_JOBLEVEL_LOOKUP (
      JL_ID VARCHAR2(2) PRIMARY KEY,
      JL_DESC VARCHAR2(100) NOT NULL,
      UPDATE_DATE DATE,
      UPDATE_BY VARCHAR2(150),
      ACTIVE_STAT VARCHAR2(20) NOT NULL
    )`);
  } catch (error) { if (error.errorNum !== 955) throw error; }
  await connection.executeMany(`MERGE INTO HR_JOBLEVEL_LOOKUP d USING (SELECT :jobLevelId JL_ID FROM dual) s ON (d.JL_ID=s.JL_ID)
    WHEN MATCHED THEN UPDATE SET d.JL_DESC=:jobLevelDescription,d.UPDATE_DATE=:updateDate,d.UPDATE_BY=:updateBy,d.ACTIVE_STAT=:activeStat
    WHEN NOT MATCHED THEN INSERT (JL_ID,JL_DESC,UPDATE_DATE,UPDATE_BY,ACTIVE_STAT)
      VALUES (:jobLevelId,:jobLevelDescription,:updateDate,:updateBy,:activeStat)`, rows, {
    bindDefs: {
      jobLevelId: { type: oracledb.STRING, maxSize: 2 },
      jobLevelDescription: { type: oracledb.STRING, maxSize: 100 },
      updateDate: { type: oracledb.DATE },
      updateBy: { type: oracledb.STRING, maxSize: 150 },
      activeStat: { type: oracledb.STRING, maxSize: 20 },
    },
  });
  await connection.commit();
  const result = await connection.execute(`SELECT JL_ID, JL_DESC, ACTIVE_STAT FROM HR_JOBLEVEL_LOOKUP ORDER BY JL_ID`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const counts = await connection.execute(`SELECT LPAD(TRIM(TO_CHAR(e.JL_ID)),2,'0') JL_ID, NVL(jl.JL_DESC,'UNASSIGNED') JL_DESC, COUNT(*) EMPLOYEE_COUNT
    FROM HR_EMP_MASTERFILE e
    LEFT JOIN HR_JOBLEVEL_LOOKUP jl ON jl.JL_ID=LPAD(TRIM(TO_CHAR(e.JL_ID)),2,'0') AND UPPER(TRIM(jl.ACTIVE_STAT))='ACTIVE'
    WHERE UPPER(TRIM(e.ACTIVE_STAT))='ACTIVE'
      AND UPPER(TRIM(NVL(e.CURRENT_POSITION_TYPE,'-'))) <> 'BOD MEMBER'
      AND UPPER(TRIM(NVL(e.OFFICIAL_POSITION_TYPE,'-'))) <> 'BOD MEMBER'
    GROUP BY LPAD(TRIM(TO_CHAR(e.JL_ID)),2,'0'), NVL(jl.JL_DESC,'UNASSIGNED')
    ORDER BY JL_ID`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log(JSON.stringify({ imported: rows.length, rows: result.rows, employeeCounts: counts.rows }));
} finally { if (connection) await connection.close(); }
