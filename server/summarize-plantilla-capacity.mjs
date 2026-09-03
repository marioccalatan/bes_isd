import { withLocalConnection } from './db.mjs';

await withLocalConnection(async (connection) => {
  const result = await connection.execute(`
    SELECT d.department_code,
      NVL(SUM(CASE WHEN p.is_plantilla='Y' AND p.is_active='Y' AND p.is_organization_unit='Y'
        THEN NVL(p.position_quantity,1) ELSE 0 END),0) plantilla_quantity
    FROM bes_departments d
    LEFT JOIN (
      SELECT p.*, COALESCE(p.department_id,o.department_id) resolved_department_id
      FROM bes_positions p LEFT JOIN bes_offices o ON o.office_id=p.office_id
    ) p ON p.resolved_department_id=d.department_id
    WHERE d.is_active='Y' AND d.is_organization_unit='Y'
    GROUP BY d.department_code
    ORDER BY d.department_code
  `);
  console.log(JSON.stringify(result.rows, null, 2));
});
