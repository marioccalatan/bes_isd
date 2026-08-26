import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import crypto from 'node:crypto';
import { withLocalConnection } from '../../server/db.mjs';

const sourcePath = 'C:/Users/ENDUSER/Downloads/PROPOSED CSR PROGRAMS 2025_ISD_SIR CRIS a.xlsx';
const sourceSheet = 'STATUS PER DISTRICT 2025';
const reportDate = '2025-12-31';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const rows = workbook.worksheets.getItem(sourceSheet).getRange('A9:F165').values;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const programFor = (label, current) => {
  const text = clean(label).toLowerCase();
  if (/pailaw sa paaralan|elementary school|national high school|\bes\b|\bcdc\b|school/.test(text)) return 'Pailaw sa Paaralan';
  if (/environmental sustainability|reforestation|nursery|watershed|tree planting/.test(text)) return 'Reforestation Program';
  if (/skills training|livelihood|training/.test(text)) return 'Skills Training Program';
  if (/medical mission|ngo|mco empowerment|social cause|mass feeding|journalism|cctv|laptop|computer/.test(text)) return 'NGO Partnership for Social Cause';
  if (/assistance and support|other worthy/.test(text)) return 'Other Projects';
  return current;
};
const statusFor = (value) => {
  const text = clean(value).toLowerCase();
  if (/implemented|accomplished|energized|installed|turn-over/.test(text)) return 'Completed';
  if (/for inspection|inspected|ongoing|canvass|approval|cash advance|submitted|schedule/.test(text)) return 'Pending';
  return 'For evaluation';
};
const splitProponent = (raw) => {
  const text = clean(raw).replace(/^\d+[.)]\s*/, '');
  const firstLine = text.split(/\s+-\s+/)[0];
  const parts = firstLine.split(',').map(clean).filter(Boolean);
  return {
    requestee: parts[0] || firstLine.slice(0, 180),
    designation: parts.length > 1 ? parts[1] : '',
    organization: parts.length > 2 ? parts.slice(2).join(', ') : '',
  };
};
const compositeKey = (item) => `${key(item.requestee)}|${item.dateRequested}|${key(item.projectRequirement)}`;

let district = '';
let programType = 'Other Projects';
let inNotWithinPolicy = false;
const candidates = [];
for (const row of rows) {
  const colA = clean(row[0]);
  const colB = clean(row[1]);
  if (colA === 'NOT WITHIN CSR POLICY') {
    inNotWithinPolicy = true;
    district = '';
    continue;
  }
  if (/^\d+$/.test(colA) && Number(colA) >= 1 && Number(colA) <= 11) district = `DISTRICT ${String(Number(colA)).padStart(2, '0')}`;
  programType = programFor(colB, programType);

  let rawProponent = clean(row[3]);
  let projectRequirement = rawProponent;
  if (inNotWithinPolicy && colB && clean(row[3])) {
    rawProponent = colB;
    projectRequirement = clean(row[3]);
    programType = 'Other Projects';
  }
  if (!rawProponent || !district || /^(sub-total|total)$/i.test(rawProponent)) continue;

  const person = splitProponent(rawProponent);
  const statusText = clean(row[5]);
  candidates.push({
    ...person,
    dateRequested: reportDate,
    programType,
    district,
    projectRequirement,
    projectDetails: `[Imported from ${sourceSheet}; original request date not provided.] ${statusText}`.trim(),
    status: statusFor(statusText),
    evaluationResult: /not within csr policy/i.test(statusText) ? 'Not Within CSR Policy' : '',
    actualProjectCost: typeof row[4] === 'number' && row[4] > 0 ? row[4] : null,
  });
}

const existing = await withLocalConnection(async (connection) => (await connection.execute(
  `SELECT requestee, TO_CHAR(date_requested, 'YYYY-MM-DD') AS date_requested, project_requirement FROM bes_csr_requests`
)).rows);
const existingKeys = new Set(existing.map((row) => compositeKey({
  requestee: row.REQUESTEE, dateRequested: row.DATE_REQUESTED, projectRequirement: row.PROJECT_REQUIREMENT,
})));
const seen = new Set();
const uniqueCandidates = candidates.filter((item) => {
  const value = compositeKey(item);
  if (seen.has(value)) return false;
  seen.add(value);
  return true;
});
const fresh = uniqueCandidates.filter((item) => !existingKeys.has(compositeKey(item)));

if (process.argv.includes('--commit')) {
  await withLocalConnection(async (connection) => {
    for (const item of fresh) {
      const digest = crypto.createHash('sha256').update(compositeKey(item)).digest('hex').slice(0, 24);
      await connection.execute(`INSERT INTO bes_csr_requests (
        csr_uid,date_requested,program_type,requestee,designation,organization,sector,location,barangay,municipality,district,
        project_details,project_requirement,request_status,evaluation_result,evaluated_by,date_approved,amount_funding,pjrs,actual_project_cost
      ) VALUES (
        :csrStatusUid,TO_DATE(:csrStatusDate,'YYYY-MM-DD'),:csrStatusProgram,:csrStatusRequestee,:csrStatusDesignation,:csrStatusOrganization,NULL,NULL,NULL,NULL,:csrStatusDistrict,
        :csrStatusDetails,:csrStatusRequirement,:csrStatusState,:csrStatusEvaluation,NULL,NULL,NULL,NULL,:csrStatusActualCost
      )`, {
        csrStatusUid: `CSR-XLSX-2025-${digest}`,
        csrStatusDate: item.dateRequested,
        csrStatusProgram: item.programType,
        csrStatusRequestee: item.requestee,
        csrStatusDesignation: item.designation || null,
        csrStatusOrganization: item.organization || null,
        csrStatusDistrict: item.district,
        csrStatusDetails: item.projectDetails,
        csrStatusRequirement: item.projectRequirement,
        csrStatusState: item.status,
        csrStatusEvaluation: item.evaluationResult || null,
        csrStatusActualCost: item.actualProjectCost,
      });
    }
    await connection.commit();
  });
}

console.log(JSON.stringify({
  sourceSheet,
  reportDatePlaceholder: reportDate,
  candidateCount: candidates.length,
  sourceDuplicateCount: candidates.length - uniqueCandidates.length,
  existingDuplicateCount: uniqueCandidates.length - fresh.length,
  readyToImportCount: fresh.length,
  importedCount: process.argv.includes('--commit') ? fresh.length : 0,
  byDistrict: fresh.reduce((acc, item) => ({ ...acc, [item.district]: (acc[item.district] || 0) + 1 }), {}),
}, null, 2));
