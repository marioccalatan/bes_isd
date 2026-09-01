import { initializeDatabase, withLocalConnection } from './db.mjs';

const backups = [
  ['BES_MIG_ORG_OFFICES_BAK', 'BES_OFFICES'],
  ['BES_MIG_ORG_POSITIONS_BAK', 'BES_POSITIONS'],
  ['BES_MIG_PERF_ASSIGN_BAK', 'BES_PERFORMANCE_ASSIGNMENTS'],
  ['BES_MIG_POSITION_DRPL_BAK', 'BES_POSITION_DR_PL'],
  ['BES_MIG_EMP_SKILL_BAK', 'BES_EMPLOYEE_SKILL_CHECKS'],
];

await withLocalConnection(async (connection) => {
  const existing = await connection.execute(`SELECT table_name FROM user_tables WHERE table_name IN (${backups.map((_, index) => `:name${index}`).join(',')})`, Object.fromEntries(backups.map(([name], index) => [`name${index}`, name])));
  if (existing.rows.length) throw new Error(`Organization split backup already exists: ${existing.rows.map((row) => row.TABLE_NAME).join(', ')}. Refusing to truncate twice.`);

  for (const [backup, source] of backups) {
    const sourceExists = await connection.execute(`SELECT 1 FROM user_tables WHERE table_name=:source`, { source });
    if (sourceExists.rows[0]) await connection.execute(`CREATE TABLE ${backup} AS SELECT * FROM ${source}`);
  }

  await connection.execute(`TRUNCATE TABLE bes_positions CASCADE`);
  await connection.execute(`TRUNCATE TABLE bes_offices CASCADE`);
});

await initializeDatabase();
await withLocalConnection(async (connection) => {
  await connection.execute(`DELETE FROM bes_positions WHERE is_organization_unit='N'`);
  await connection.execute(`DELETE FROM bes_offices WHERE is_organization_unit='N'`);
  await connection.commit();
});
console.log('BES_OFFICES and BES_POSITIONS were backed up, truncated, and rebuilt from BES_ORGANIZATION.');
