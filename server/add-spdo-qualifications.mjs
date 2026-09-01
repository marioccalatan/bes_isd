import fs from 'node:fs';
import { withLocalConnection } from './db.mjs';

const qualifications = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!Array.isArray(qualifications) || qualifications.some((item) => !item?.subject?.trim())) {
  throw new Error('Expected an array of qualifications with non-empty subjects.');
}

await withLocalConnection(async (connection) => {
  const found = await connection.execute(`
    SELECT position_id
    FROM bes_positions
    WHERE UPPER(position_title) = 'SYSTEM PLANNING AND DESIGN OFFICER'
      AND is_active = 'Y'
  `);
  const positionId = found.rows[0]?.POSITION_ID;
  if (!positionId) throw new Error('System Planning and Design Officer was not found.');

  const existing = await connection.execute(`
    SELECT position_level, UPPER(TRIM(subject)) AS subject
    FROM bes_hr_qualifications
    WHERE position_id = :positionId
  `, { positionId });
  const existingKeys = new Set(existing.rows.map((row) => `${row.POSITION_LEVEL}|${row.SUBJECT}`));
  const sortResult = await connection.execute(`
    SELECT NVL(MAX(sort_order), 0) AS max_sort_order
    FROM bes_hr_qualifications
    WHERE position_id = :positionId
  `, { positionId });
  let sortOrder = Number(sortResult.rows[0]?.MAX_SORT_ORDER || 0);
  let inserted = 0;
  let skipped = 0;

  for (const qualification of qualifications) {
    const positionLevel = Number(qualification.positionLevel || 1);
    const subject = qualification.subject.trim();
    const key = `${positionLevel}|${subject.toUpperCase()}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    sortOrder += 1;
    await connection.execute(`
      INSERT INTO bes_hr_qualifications
        (position_id, position_level, subject, qualification_level, description, sort_order)
      VALUES
        (:positionId, :positionLevel, :subject, :qualificationLevel, :description, :sortOrder)
    `, {
      positionId,
      positionLevel,
      subject,
      qualificationLevel: qualification.qualificationLevel?.trim() || null,
      description: qualification.description?.trim() || null,
      sortOrder,
    });
    existingKeys.add(key);
    inserted += 1;
  }

  await connection.commit();
  console.log(JSON.stringify({ positionId, inserted, skipped }));
});
