import fs from 'node:fs';
import { withLocalConnection } from './db.mjs';

const parsedPath = process.argv[2] || '.tmp/job-document-parsed.json';
const apply = process.argv.includes('--apply');
const jobs = JSON.parse(fs.readFileSync(parsedPath, 'utf8'));

const normalize = (value) => String(value || '').normalize('NFKD').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
function utf8Limit(value, maxBytes) {
  const text = String(value || '');
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  let low = 0, high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(text.slice(0, middle), 'utf8') <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return text.slice(0, low);
}
const aliases = new Map(Object.entries({
  'metering associate': 'special equipment and metering associate',
  'network services department': 'department manager',
  'executive and consumer associate': '',
  'warehouse associate': 'material inventory associate',
  'materials and equipment management officer memo': 'material equipment and management officer',
  'isd manager': 'department manager',
  'hr associate': 'human resource associate',
  'general services associate': '',
  'community relations associate i ii iii and': 'community relations associate',
  'corporate planning department manager': 'department manager',
  'internal auditor': '',
  'internal audit supervisor': 'internal audit supervisor',
  'operation auditor': 'operations auditor',
  'safety officer': 'health and safety officer',
  'management information and communications i ii iii systems officer': 'management information and communication services officer',
  'information systems associate': 'information system associate',
  'rate analyst i ii iii': 'rate analyst',
  'department manager i ii iii nnsd': 'department manager',
  'special equipment and metering officer': 'special equipment and metering officer',
}));

function departmentCode(job) {
  const value = normalize(job.department);
  if (value.includes('non network')) return 'NNSD';
  if (value.includes('network services')) return 'NSD';
  if (value.includes('institutional')) return 'ISD';
  if (value.includes('corporate planning')) return 'CPD';
  if (value.includes('power generation')) return 'PGD';
  if (value.includes('internal audit')) return 'IAD';
  if (value.includes('general manager')) return 'OGM';
  return '';
}

const unique = (records, fields) => {
  const seen = new Set();
  return records.filter((record) => {
    const key = fields.map((field) => normalize(record[field])).join('|');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
};

await withLocalConnection(async (connection) => {
  const result = await connection.execute(`SELECT p.position_id,p.position_title,d.department_code,o.office_short
    FROM bes_positions p
    LEFT JOIN bes_departments d ON d.department_id=p.department_id OR d.department_id=(SELECT department_id FROM bes_offices WHERE office_id=p.office_id)
    LEFT JOIN bes_offices o ON o.office_id=p.office_id
    WHERE p.is_organization_unit='Y' AND p.is_active='Y'`);
  const positions = result.rows;
  const grouped = new Map();
  const unmatched = [];
  for (const job of jobs) {
    const raw = normalize(job.title);
    const wanted = aliases.has(raw) ? aliases.get(raw) : raw;
    if (!wanted) { unmatched.push({ source: job.source, title: job.title, reason: 'No canonical position exists' }); continue; }
    let candidates = positions.filter((position) => normalize(position.POSITION_TITLE) === wanted);
    const code = departmentCode(job);
    if (code && candidates.some((position) => position.DEPARTMENT_CODE === code)) candidates = candidates.filter((position) => position.DEPARTMENT_CODE === code);
    if (candidates.length !== 1) {
      unmatched.push({ source: job.source, title: job.title, department: job.department, reason: candidates.length ? 'Ambiguous canonical position' : 'No canonical title match' });
      continue;
    }
    const position = candidates[0];
    const bucket = grouped.get(position.POSITION_ID) || { position, sources: [], purposes: [], duties: [], qualifications: [] };
    bucket.sources.push(job.source);
    if (job.purpose) bucket.purposes.push(job.purpose);
    bucket.duties.push(...job.duties);
    bucket.qualifications.push(...job.qualifications);
    grouped.set(position.POSITION_ID, bucket);
  }
  const matched = [...grouped.values()].map((bucket) => ({
    ...bucket,
    duties: unique(bucket.duties, ['positionLevel', 'subject', 'description']),
    qualifications: unique(bucket.qualifications, ['positionLevel', 'subject', 'qualificationLevel', 'description']),
  }));
  const report = {
    mode: apply ? 'apply' : 'dry-run', logicalJobs: jobs.length, matchedPositions: matched.length,
    duties: matched.reduce((sum, item) => sum + item.duties.length, 0),
    qualifications: matched.reduce((sum, item) => sum + item.qualifications.length, 0),
    unmatched,
    matches: matched.map((item) => ({ positionId: item.position.POSITION_ID, title: item.position.POSITION_TITLE, department: item.position.DEPARTMENT_CODE, sources: [...new Set(item.sources)], duties: item.duties.length, qualifications: item.qualifications.length, purpose: Boolean(item.purposes[0]) })),
  };
  if (!apply) { console.log(JSON.stringify(report, null, 2)); return; }

  const ids = matched.map((item) => item.position.POSITION_ID);
  if (!ids.length) throw new Error('No positions matched; refusing to import.');
  for (const ddl of [
    `CREATE TABLE bes_hr_job_pos_bak AS SELECT * FROM bes_positions WHERE 1=0`,
    `CREATE TABLE bes_hr_job_qual_bak AS SELECT * FROM bes_hr_qualifications WHERE 1=0`,
    `CREATE TABLE bes_hr_job_duty_bak AS SELECT * FROM bes_hr_duties WHERE 1=0`,
  ]) { try { await connection.execute(ddl); } catch (error) { if (error.errorNum !== 955) throw error; } }
  await connection.execute(`TRUNCATE TABLE bes_hr_job_pos_bak`);
  await connection.execute(`TRUNCATE TABLE bes_hr_job_qual_bak`);
  await connection.execute(`TRUNCATE TABLE bes_hr_job_duty_bak`);
  for (const id of ids) {
    await connection.execute(`INSERT INTO bes_hr_job_pos_bak SELECT * FROM bes_positions WHERE position_id=:id`, { id });
    await connection.execute(`INSERT INTO bes_hr_job_qual_bak SELECT * FROM bes_hr_qualifications WHERE position_id=:id`, { id });
    await connection.execute(`INSERT INTO bes_hr_job_duty_bak SELECT * FROM bes_hr_duties WHERE position_id=:id`, { id });
    await connection.execute(`DELETE FROM bes_hr_qualifications WHERE position_id=:id`, { id });
    await connection.execute(`DELETE FROM bes_hr_duties WHERE position_id=:id`, { id });
  }
  for (const item of matched) {
    const positionId = item.position.POSITION_ID;
    const purpose = item.purposes[0]?.slice(0, 32000) || null;
    if (purpose) await connection.execute(`UPDATE bes_positions SET position_purpose=:purpose,updated_at=SYSTIMESTAMP WHERE position_id=:positionId`, { purpose, positionId });
    if (item.duties.length) await connection.executeMany(
      `INSERT INTO bes_hr_duties (position_id,position_level,subject,description,sort_order) VALUES (:positionId,:positionLevel,:subject,:description,:sortOrder)`,
      item.duties.map((record, index) => ({ positionId, positionLevel: record.positionLevel, subject: utf8Limit(record.subject || 'General', 180), description: utf8Limit(record.description, 2000), sortOrder: index + 1 })),
    );
    if (item.qualifications.length) await connection.executeMany(
      `INSERT INTO bes_hr_qualifications (position_id,position_level,subject,qualification_level,description,sort_order) VALUES (:positionId,:positionLevel,:subject,:qualificationLevel,:description,:sortOrder)`,
      item.qualifications.map((record, index) => ({ positionId, positionLevel: record.positionLevel, subject: utf8Limit(record.subject || 'General', 180), qualificationLevel: utf8Limit(record.qualificationLevel, 180), description: utf8Limit(record.description, 2000), sortOrder: index + 1 })),
    );
  }
  await connection.commit();
  console.log(JSON.stringify(report, null, 2));
});
