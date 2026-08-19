import { initializeDatabase } from './db.mjs';
import { withConnection } from './db.mjs';
import { hashPassword } from './security.mjs';
await initializeDatabase();
await withConnection(async (connection) => {
  const existing = await connection.execute(`SELECT COUNT(*) AS total FROM bes_users`);
  if (existing.rows[0].TOTAL === 0) {
    const secured = hashPassword('Admin123!');
    await connection.execute(`INSERT INTO bes_users
      (employee_no,username,email,password_hash,password_salt,first_name,middle_name,last_name,position_title,department_code,unit_name,account_status,app_role,work_location)
      VALUES ('BENECO-00127','admin','alex.delacruz@beneco.com.ph',:hash,:salt,'Alex','M.','Dela Cruz','Institutional Department Manager','ISD','IT Systems Unit','ACTIVE','Administrator','Main Office')`,
      { hash: secured.hash, salt: secured.salt });
    await connection.commit();
    console.log('Created initial administrator employee: admin');
  }
});
console.log('BES identity tables are ready.');
