import fs from 'node:fs';
import { withLocalConnection } from './db.mjs';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!Array.isArray(input.duties) || !Array.isArray(input.qualifications)) throw new Error('Invalid SPDO requirement payload.');

await withLocalConnection(async (connection) => {
  const found = await connection.execute(`SELECT position_id FROM bes_positions WHERE UPPER(position_name)='SYSTEM PLANNING AND DESIGN OFFICER' AND is_active='Y'`);
  const positionId = found.rows[0]?.POSITION_ID;
  if (!positionId) throw new Error('System Planning and Design Officer was not found.');
  await connection.execute(`DELETE FROM bes_hr_duties WHERE position_id=:positionId`, { positionId });
  await connection.execute(`DELETE FROM bes_hr_qualifications WHERE position_id=:positionId`, { positionId });
  for (const [index, duty] of input.duties.entries()) {
    await connection.execute(`INSERT INTO bes_hr_duties (position_id,position_level,subject,description,sort_order) VALUES (:positionId,:positionLevel,:subject,:description,:sortOrder)`, { positionId, positionLevel: duty.positionLevel, subject: duty.subject, description: duty.description, sortOrder: index + 1 });
  }
  for (const [index, qualification] of input.qualifications.entries()) {
    await connection.execute(`INSERT INTO bes_hr_qualifications (position_id,position_level,subject,qualification_level,description,sort_order) VALUES (:positionId,:positionLevel,:subject,:qualificationLevel,:description,:sortOrder)`, { positionId, positionLevel: qualification.positionLevel, subject: qualification.subject, qualificationLevel: qualification.qualificationLevel, description: qualification.description, sortOrder: index + 1 });
  }
  await connection.commit();
  console.log(JSON.stringify({ positionId, duties: input.duties.length, qualifications: input.qualifications.length }));
});
