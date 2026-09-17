import fs from 'node:fs';
import assert from 'node:assert/strict';
import { withConnection } from '../server/db.mjs';

const source = JSON.parse(fs.readFileSync('.tmp/training-import-source.json', 'utf8'));
const norm = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const names = [...new Set(source['Source rows'].map((row) => row['Source sheet']))];
await withConnection(async (c) => {
  const employees = (await c.execute('SELECT EMPNO,E_LAST,E_FIRST,E_MIDDLE,ACTIVE_STAT FROM HR_EMP_MASTERFILE')).rows;
  const trainings = (await c.execute("SELECT ID,TS_NAME,TO_CHAR(TS_DATE_FROM,'YYYY-MM-DD') DATE_FROM,TO_CHAR(TS_DATE_TO,'YYYY-MM-DD') DATE_TO FROM TRAINING_SEMINAR")).rows;
  const trainingMap = new Map(trainings.map((row) => [Number(row.ID), row]));
  const mismatches = source.TRAINING_SEMINAR.filter((row) => {
    const db = trainingMap.get(row.ID);
    return !db || norm(db.TS_NAME) !== norm(row.TS_NAME) || db.DATE_FROM !== row.TS_DATE_FROM || db.DATE_TO !== row.TS_DATE_TO;
  });
  assert.equal(mismatches.length, 0, `Training ID/name/date mismatches: ${JSON.stringify(mismatches.slice(0, 5))}`);
  const mapping = names.map((name) => {
    const [last, ...firstParts] = name.split(',');
    const first = firstParts.join(',');
    const candidates = employees.filter((employee) => {
      const variants = [employee.E_FIRST, `${employee.E_FIRST} ${employee.E_MIDDLE ?? ''}`, `${employee.E_FIRST} ${String(employee.E_MIDDLE ?? '').trim().slice(0, 1)}`];
      return firstParts.length ? norm(employee.E_LAST) === norm(last) && variants.map(norm).includes(norm(first)) : variants.some((variant) => norm(`${employee.E_LAST} ${variant}`) === norm(name));
    });
    const unique = [...new Map(candidates.map((employee) => [employee.EMPNO, employee])).values()];
    return { sourceName: name, sourceRows: source['Source rows'].filter((row) => row['Source sheet'] === name).length, status: unique.length === 1 ? 'Matched' : unique.length ? 'Ambiguous' : 'Unmatched', employeeNo: unique.length === 1 ? unique[0].EMPNO : null, candidates: unique, sameSurname: unique.length ? [] : employees.filter((employee) => norm(employee.E_LAST) === norm(last)) };
  });
  fs.writeFileSync('.tmp/training-employee-matches.json', JSON.stringify(mapping, null, 2));
  const mappingByName = new Map(mapping.map((row) => [row.sourceName, row]));
  const pairs = new Map();
  const unresolved = [];
  for (const row of source['Source rows']) {
    const match = mappingByName.get(row['Source sheet']);
    if (!match.employeeNo) { unresolved.push(row); continue; }
    assert.ok(trainingMap.has(row['Training ID']));
    const key = `${row['Training ID']}|${match.employeeNo}`;
    const pair = pairs.get(key) ?? { trainingId: row['Training ID'], employeeNo: match.employeeNo, sourceName: match.sourceName, sourceRows: [] };
    pair.sourceRows.push(row['Excel row']);
    pairs.set(key, pair);
  }
  const existing = (await c.execute('SELECT TRAINING_ID,EMPLOYEE_NO FROM BES_TRAINING_PARTICIPANTS')).rows;
  const existingKeys = new Set(existing.map((row) => `${row.TRAINING_ID}|${row.EMPLOYEE_NO}`));
  const planned = [...pairs.values()].filter((row) => !existingKeys.has(`${row.trainingId}|${row.employeeNo}`));
  const summary = { sourceRows: source['Source rows'].length, sourceEmployees: names.length, matchedEmployees: mapping.filter((row) => row.employeeNo).length, unresolvedEmployees: mapping.filter((row) => !row.employeeNo).length, unresolvedRows: unresolved.length, distinctPairs: pairs.size, duplicateSourceRows: source['Source rows'].length - unresolved.length - pairs.size, alreadyPresent: pairs.size - planned.length, toInsert: planned.length, trainingIdsVerified: trainingMap.size };
  fs.writeFileSync('.tmp/training-participant-import-plan.json', JSON.stringify({ summary, mapping, planned, unresolved }, null, 2));
  console.log(JSON.stringify(summary));
  const output = 'outputs/training-participant-import-2026-09-17';
  fs.mkdirSync(output, { recursive: true });
  const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const report = [
    '# Training participant import',
    '',
    'Source: C:/Users/mario/Desktop/Training_Seminar_Summary.xlsx, Source rows (header row 7).',
    '',
    'Training IDs were checked against Oracle using training title and both start/end dates. Employee matching uses the complete surname and given name, optionally with full middle name or matching middle initial, ignoring punctuation, case, accents and spacing. No nickname, spelling-change, shortened-given-name, or duplicate-ID choices are applied automatically. Historical inactive employees are included.',
    '',
    '## Counts',
    '',
    ...Object.entries(summary).map(([key, value]) => `- ${key}: ${value}`),
    '- Untitled rows excluded: 220 (no training ID).',
    '',
    '## Employee names requiring confirmation',
    '',
    'Candidates below share the surname or exact name; they are suggestions for review, not confirmed matches. Supply the correct employee number for each unresolved source name.',
    '',
    '| Source name | Attendance rows | Masterfile candidates |',
    '| --- | ---: | --- |',
    ...mapping.filter((row) => !row.employeeNo).map((row) => `| ${cell(row.sourceName)} | ${row.sourceRows} | ${cell([...row.candidates, ...row.sameSurname].map((e) => `${e.EMPNO}: ${e.E_LAST}, ${e.E_FIRST} ${e.E_MIDDLE ?? ''} (${e.ACTIVE_STAT})`).join('; ') || 'No same-surname match')} |`),
    '',
    '## Confirmed employee mapping',
    '',
    '| Source name | Employee number | Masterfile name | Attendance rows |',
    '| --- | --- | --- | ---: |',
    ...mapping.filter((row) => row.employeeNo).map((row) => `| ${cell(row.sourceName)} | ${row.employeeNo} | ${cell(`${row.candidates[0].E_LAST}, ${row.candidates[0].E_FIRST} ${row.candidates[0].E_MIDDLE ?? ''}`)} | ${row.sourceRows} |`),
  ];
  fs.writeFileSync(`${output}/employee-matching-report.md`, report.join('\n'));
  fs.writeFileSync(`${output}/import-plan.json`, JSON.stringify({ summary, mapping, planned, unresolved }, null, 2));
  if (process.argv.includes('--commit')) {
    try {
      await c.execute('LOCK TABLE BES_TRAINING_PARTICIPANTS IN EXCLUSIVE MODE NOWAIT');
      const before = (await c.execute('SELECT TRAINING_ID,EMPLOYEE_NO FROM BES_TRAINING_PARTICIPANTS')).rows;
      const beforeKeys = new Set(before.map((row) => `${row.TRAINING_ID}|${row.EMPLOYEE_NO}`));
      const insert = [...pairs.values()].filter((row) => !beforeKeys.has(`${row.trainingId}|${row.employeeNo}`));
      fs.writeFileSync(`${output}/inserted-pairs.json`, JSON.stringify(insert, null, 2));
      let inserted = 0;
      for (let offset = 0; offset < insert.length; offset += 500) {
        const batch = insert.slice(offset, offset + 500).map((row) => ({ trainingId: row.trainingId, employeeNo: row.employeeNo }));
        const result = await c.executeMany('INSERT INTO BES_TRAINING_PARTICIPANTS (TRAINING_ID,EMPLOYEE_NO) VALUES (:trainingId,:employeeNo)', batch);
        inserted += result.rowsAffected;
      }
      const after = (await c.execute('SELECT TRAINING_ID,EMPLOYEE_NO FROM BES_TRAINING_PARTICIPANTS')).rows;
      const afterKeys = new Set(after.map((row) => `${row.TRAINING_ID}|${row.EMPLOYEE_NO}`));
      assert.equal(after.length, before.length + inserted);
      for (const key of pairs.keys()) assert.ok(afterKeys.has(key), `Missing import pair ${key}`);
      for (const key of beforeKeys) assert.ok(afterKeys.has(key), `Missing preexisting pair ${key}`);
      await c.commit();
      const receipt = { committedAt: new Date().toISOString(), inserted, preserved: before.length, totalParticipants: after.length, ...summary };
      fs.writeFileSync(`${output}/import-receipt.json`, JSON.stringify(receipt, null, 2));
      fs.appendFileSync(`${output}/employee-matching-report.md`, `\n\n## Completed database update\n\nInserted ${inserted} participant records. Preserved ${before.length} existing records. Verified total after commit: ${after.length}.\n`);
      console.log(JSON.stringify(receipt));
    } catch (error) { await c.rollback(); throw error; }
  }
});
