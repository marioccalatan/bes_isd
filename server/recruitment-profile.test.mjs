import test from 'node:test';
import assert from 'node:assert/strict';
import { profileChanges, readRecruitmentProfile, saveRecruitmentProfile } from './recruitment-profile.mjs';

test('partial updates preserve omitted fields and allow explicit clearing', async () => {
  const calls = [];
  const connection = { execute: async (...args) => calls.push(args) };
  await saveRecruitmentProfile(connection, 'APP-1', { tin: '', irrelevant: 'ignored' });
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /SET tin = :tin WHERE/);
  assert.deepEqual(calls[0][1], { recruitmentUid: 'APP-1', tin: null });
  await saveRecruitmentProfile(connection, 'APP-1', { firstName: 'Existing client' });
  assert.equal(calls.length, 1);
});

test('government IDs retain leading zeros and reported units remain text', () => {
  const fields = profileChanges({ pagIbigNo: '001234567890', height: '5 ft 2', weight: '55 kg' });
  assert.equal(fields.find(field => field.key === 'pagIbigNo').value, '001234567890');
  assert.equal(fields.find(field => field.key === 'height').value, '5 ft 2');
});

test('submission timestamps retain milliseconds and reject invalid input', () => {
  assert.equal(profileChanges({ submittedAt: '2026-06-02T23:48:27.050000' })[0].value, '2026-06-02T23:48:27.050000');
  assert.equal(profileChanges({ submittedAt: '2026-06-02T23:48' })[0].value, '2026-06-02T23:48:00.000');
  assert.throws(() => profileChanges({ submittedAt: 'not a date' }), /valid submission/);
  assert.throws(() => profileChanges({ tin: 'x'.repeat(2001) }), /2000 bytes/);
});

test('API returns new fields and safely defaults older applicant records', () => {
  const result = readRecruitmentProfile({ TIN: '001-234', SUBMITTED_AT_TEXT: '2026-06-02T23:48:27.050' });
  assert.equal(result.tin, '001-234');
  assert.equal(result.submittedAt, '2026-06-02T23:48:27.050');
  assert.equal(result.college, '');
});

test('date-only submissions save without requiring a time and reject impossible dates', () => {
  assert.equal(profileChanges({ submittedAt: '2026-09-23' })[0].value, '2026-09-23T00:00:00.000');
  assert.throws(() => profileChanges({ submittedAt: '2026-02-30' }), /valid submission date/);
});

test('graduation month and year can be recorded independently and validated', () => {
  assert.equal(profileChanges({ collegeGraduationYear: '2020' })[0].value, '2020');
  assert.equal(profileChanges({ elementaryGraduationMonth: '03' })[0].value, '03');
  assert.throws(() => profileChanges({ collegeGraduationMonth: '13' }), /valid/);
  assert.throws(() => profileChanges({ secondaryGraduationYear: 'abcd' }), /valid/);
});

test('permanent address components save separately without overwriting imported address', async () => {
  const calls = [];
  await saveRecruitmentProfile({ execute: async (...args) => calls.push(args) }, 'APP-1', { permanentMunicipality: 'Baguio', permanentBarangay: 'Test Barangay' });
  assert.match(calls[0][0], /permanent_municipality = :permanentMunicipality/);
  assert.match(calls[0][0], /permanent_barangay = :permanentBarangay/);
  assert.doesNotMatch(calls[0][0], /permanent_address =/);
});
