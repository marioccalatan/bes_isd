import { withLocalConnection } from './db.mjs';

await withLocalConnection(async (connection) => {
  const result = await connection.execute(`
    SELECT p.position_id, p.position_title, p.position_level,
           d.department_code, d.department_name,
           o.office_short, o.office_name
    FROM bes_positions p
    LEFT JOIN bes_departments d ON d.department_id=p.department_id
      OR d.department_id=(SELECT department_id FROM bes_offices WHERE office_id=p.office_id)
    LEFT JOIN bes_offices o ON o.office_id=p.office_id
    WHERE p.is_organization_unit='Y' AND p.is_active='Y'
    ORDER BY UPPER(p.position_title)
  `);
  console.log(JSON.stringify(result.rows, null, 2));
});
