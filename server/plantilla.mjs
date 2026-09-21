export async function readPlantilla(connection) {
  const result = await connection.execute(`SELECT p.id, p.plantilla_name, p.dept_id, p.o_id, p.group_id,
    d.dept_long department_name, d.dept_short department_code, o.o_long office_name
    FROM bes_plantilla p
    LEFT JOIN (SELECT dept_id, MAX(dept_long) dept_long, MAX(dept_short) dept_short FROM hr_department_lookup GROUP BY dept_id) d ON d.dept_id=p.dept_id
    LEFT JOIN (SELECT o_id, MAX(o_long) o_long FROM bes_hr_office_lookup GROUP BY o_id) o ON o.o_id=p.o_id
    ORDER BY d.dept_long, p.dept_id, o.o_long, p.o_id, p.plantilla_name, p.id`);
  return result.rows.map((row) => ({
    id: String(row.ID), name: row.PLANTILLA_NAME, deptId: row.DEPT_ID,
    officeId: row.O_ID, groupId: row.GROUP_ID,
    departmentName: row.DEPARTMENT_NAME, departmentCode: row.DEPARTMENT_CODE,
    officeName: row.OFFICE_NAME,
  }));
}
