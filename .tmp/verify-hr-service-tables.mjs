import oracledb from 'oracledb';
import { config } from '../server/config.mjs';
let connection;
try {
  connection = await oracledb.getConnection({ user: config.user, password: config.password, connectString: config.connectString });
  const result = await connection.execute(`SELECT table_name FROM user_tables WHERE table_name IN ('BES_HR_SERVICE_RECORDS','BES_HR_SERVICE_EVIDENCE') ORDER BY table_name`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log(JSON.stringify(result.rows));
} finally { if (connection) await connection.close(); }
