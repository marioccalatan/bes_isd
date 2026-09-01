import { withLocalConnection } from './db.mjs';

await withLocalConnection(async (connection) => {
  const totals = await connection.execute(`SELECT
    (SELECT COUNT(*) FROM bes_hr_duties) duties,
    (SELECT COUNT(*) FROM bes_hr_qualifications) qualifications,
    (SELECT COUNT(*) FROM bes_positions WHERE position_purpose IS NOT NULL) purposes,
    (SELECT COUNT(*) FROM bes_hr_job_duty_bak) backed_up_duties,
    (SELECT COUNT(*) FROM bes_hr_job_qual_bak) backed_up_qualifications
    FROM dual`);
  const samples = await connection.execute(`SELECT p.position_title,d.department_code,
    (SELECT COUNT(*) FROM bes_hr_duties x WHERE x.position_id=p.position_id) duties,
    (SELECT COUNT(*) FROM bes_hr_qualifications x WHERE x.position_id=p.position_id) qualifications,
    DBMS_LOB.GETLENGTH(p.position_purpose) purpose_length
    FROM bes_positions p
    LEFT JOIN bes_departments d ON d.department_id=p.department_id OR d.department_id=(SELECT department_id FROM bes_offices WHERE office_id=p.office_id)
    WHERE p.position_id IN (12599,12608,12619,12584,12589,12593,12602)
    ORDER BY p.position_id`);
  const invalid = await connection.execute(`SELECT
    (SELECT COUNT(*) FROM bes_hr_duties WHERE position_level NOT BETWEEN 1 AND 5 OR subject IS NULL) bad_duties,
    (SELECT COUNT(*) FROM bes_hr_qualifications WHERE position_level NOT BETWEEN 1 AND 5 OR subject IS NULL) bad_qualifications
    FROM dual`);
  console.log(JSON.stringify({ totals: totals.rows[0], samples: samples.rows, invalid: invalid.rows[0] }, null, 2));
});
