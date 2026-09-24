import fs from 'node:fs';
import oracledb from 'oracledb';
import { createHash, randomUUID } from 'node:crypto';
import { withConnection, getDatabaseRuntimeStatus } from './db.mjs';
import { ensureRecruitmentProfileColumns, profileChanges, saveRecruitmentProfile } from './recruitment-profile.mjs';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: node server/import-recruitment-responses.mjs payload.json [--apply]');
const apply = process.argv.includes('--apply');
const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const normalized = value => String(value ?? '').trim().toLowerCase();
const timestampSql = `TO_TIMESTAMP(:submittedAt, 'YYYY-MM-DD"T"HH24:MI:SS.FF')`;
const table = 'bes_hro_recruitment_and_onboarding';
const records = payload.records;
if (!Array.isArray(records) || !records.length) throw new Error('No application responses supplied.');
const groups = new Map();
const submissionKeys = new Set();
for (const item of records) {
  const p = item.profile;
  if (!p.firstName || !p.lastName || !p.email || !p.birthDate || !p.positionApplying) throw new Error(`Incomplete identity at row ${item.row}.`);
  profileChanges(p);
  const identity = [normalized(p.email), p.birthDate, normalized(p.positionApplying)].join('|');
  item.submissionKey = createHash('sha256').update([identity, p.submittedAt].join('|')).digest('hex');
  if (submissionKeys.has(item.submissionKey)) throw new Error(`Duplicate source submission at row ${item.row}.`);
  submissionKeys.add(item.submissionKey);
  groups.set(identity, [...(groups.get(identity) ?? []), item]);
}

await withConnection(async connection => {
  const existing = (await connection.execute(`SELECT r.*, TO_CHAR(birth_date,'YYYY-MM-DD') birth_date_text FROM ${table} r`)).rows;
  const plans = [];
  for (const submissions of groups.values()) {
    submissions.sort((a,b) => a.profile.submittedAt.localeCompare(b.profile.submittedAt));
    const p = submissions.at(-1).profile;
    const matches = existing.filter(row => normalized(row.EMAIL) === normalized(p.email) && normalized(row.POSITION_APPLYING) === normalized(p.positionApplying));
    if (matches.length > 1 || matches.some(row => row.BIRTH_DATE_TEXT && row.BIRTH_DATE_TEXT !== p.birthDate)) throw new Error(`Ambiguous existing applicant for source row ${submissions.at(-1).row}.`);
    if (matches[0]?.IS_ACTIVE === 'N') throw new Error('Import matches an archived/deleted applicant; review required.');
    plans.push({ submissions, profile: p, existing: matches[0] });
  }
  const summary = { mode: apply ? 'apply' : 'dry-run', database: getDatabaseRuntimeStatus().activeDatabase, sourceRows: records.length, applicants: plans.length, repeatedSubmissions: records.length - plans.length, create: plans.filter(p => !p.existing).length, update: plans.filter(p => p.existing).length, untouched: existing.length - plans.filter(p => p.existing).length };
  if (!apply) { console.log(JSON.stringify(summary)); return; }
  // Save the pre-import records outside version control before any changes.
  fs.writeFileSync(`${inputPath}.${Date.now()}.backup.local`, JSON.stringify(existing));
  await ensureRecruitmentProfileColumns(connection);
  try {
    await connection.execute(`CREATE TABLE bes_hro_recruitment_imports (
      submission_key VARCHAR2(64) PRIMARY KEY,
      recruitment_uid VARCHAR2(80) NOT NULL REFERENCES bes_hro_recruitment_and_onboarding(recruitment_uid),
      source_file VARCHAR2(500) NOT NULL, sheet_name VARCHAR2(200) NOT NULL,
      source_row NUMBER NOT NULL, source_response CLOB NOT NULL,
      imported_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
  } catch (error) { if (error.errorNum !== 955) throw error; }
  try {
    for (const plan of plans) {
      const p = plan.profile;
      const submittedAt = profileChanges(p).find(field => field.key === 'submittedAt').value;
      const uid = plan.existing?.RECRUITMENT_UID ?? `HRO-APP-${randomUUID()}`;
      if (!plan.existing) {
        const taskUid = `TASK-${randomUUID()}`;
        await connection.execute(`INSERT INTO bes_work_tasks (task_uid, title, task_subject, created_at)
          VALUES (:taskUid, :title, 'Application Letter', ${timestampSql})`, {
          taskUid, title: `Application Letter of ${p.originalFullName}`, submittedAt,
        });
        await connection.execute(`INSERT INTO ${table} (recruitment_uid, source_task_uid, workflow_status, position_applying, action_taken)
          VALUES (:recruitmentUid, :taskUid, 'Received', :positionApplying, 'Imported from application form')`, { recruitmentUid: uid, taskUid, positionApplying: p.positionApplying });
      }
      await connection.execute(`UPDATE ${table} SET
        first_name=:firstName, last_name=:lastName, middle_name=:middleName, suffix=:suffix,
        birth_date=TO_DATE(:birthDate,'YYYY-MM-DD'), sex=:sex, civil_status=:civilStatus,
        email=:email, mobile_no=:mobileNo, address=:address, application_source=:applicationSource,
        updated_at=SYSTIMESTAMP WHERE recruitment_uid=:recruitmentUid`, {
        recruitmentUid: uid, ...Object.fromEntries(['firstName','lastName','middleName','suffix','birthDate','sex','civilStatus','email','mobileNo','address','applicationSource'].map(key => [key,p[key] || null])),
      });
      await saveRecruitmentProfile(connection, uid, p);
      await connection.execute(`MERGE INTO bes_hro_recruitment_positions p USING (SELECT :positionApplying name FROM dual) s
        ON (UPPER(p.position_name)=UPPER(s.name)) WHEN NOT MATCHED THEN INSERT (position_name) VALUES (s.name)`, { positionApplying: p.positionApplying });
      for (const item of plan.submissions) {
        await connection.execute(`MERGE INTO bes_hro_recruitment_imports t USING (SELECT :submissionKey submission_key FROM dual) s
          ON (t.submission_key=s.submission_key)
          WHEN MATCHED THEN UPDATE SET source_response=:sourceResponse, source_file=:sourceFile, sheet_name=:sheet, source_row=:sourceRow
          WHEN NOT MATCHED THEN INSERT (submission_key,recruitment_uid,source_file,sheet_name,source_row,source_response)
            VALUES (:submissionKey,:recruitmentUid,:sourceFile,:sheet,:sourceRow,:sourceResponse)`, {
          submissionKey: item.submissionKey, recruitmentUid: uid, sourceFile: payload.sourceFile, sheet: payload.sheet, sourceRow: item.row, sourceResponse: { val: JSON.stringify(item.raw), type: oracledb.CLOB },
        });
      }
      // Verify every imported field before committing the whole batch.
      const saved = (await connection.execute(`SELECT r.*, TO_CHAR(birth_date,'YYYY-MM-DD') birth_date_text,
        TO_CHAR(submitted_at,'YYYY-MM-DD"T"HH24:MI:SS.FF6') submitted_at_text FROM ${table} r WHERE recruitment_uid=:recruitmentUid`, {recruitmentUid: uid})).rows[0];
      for (const field of profileChanges(p)) {
        const actual = field.key === 'submittedAt' ? saved.SUBMITTED_AT_TEXT : saved[field.column.toUpperCase()] || null;
        const expected = field.key === 'submittedAt' ? field.value.split('.')[0] + '.' + field.value.split('.')[1].padEnd(6,'0') : field.value;
        if (actual !== expected) throw new Error(`Import verification failed at source row ${plan.submissions.at(-1).row}: ${field.key}`);
      }
      for (const [key,column] of Object.entries({firstName:'FIRST_NAME',lastName:'LAST_NAME',middleName:'MIDDLE_NAME',suffix:'SUFFIX',birthDate:'BIRTH_DATE_TEXT',sex:'SEX',civilStatus:'CIVIL_STATUS',email:'EMAIL',mobileNo:'MOBILE_NO',address:'ADDRESS',applicationSource:'APPLICATION_SOURCE',positionApplying:'POSITION_APPLYING'})) {
        if ((saved[column] || '') !== (p[key] || '')) throw new Error(`Import verification failed: ${key}`);
      }
    }
    await connection.commit();
    console.log(JSON.stringify({...summary, verified: true, sourceResponsesPreserved: records.length}));
  } catch (error) {
    await connection.rollback();
    throw error;
  }
});
