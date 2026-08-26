import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import crypto from 'node:crypto';
import { withLocalConnection } from '../../server/db.mjs';

const sourcePath = 'C:/Users/ENDUSER/Downloads/PROPOSED CSR PROGRAMS 2025_ISD_SIR CRIS a.xlsx';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const rows = workbook.worksheets.getItem('2026 CSR (August)').getRange('A9:G173').values;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const programFor = (label, current) => {
  const text = clean(label).toLowerCase();
  if (/skills training|epira 101|kmcc|bcbc|kbp/.test(text)) return 'Skills Training Program';
  if (/livelihood/.test(text)) return 'Livelihood Program';
  if (/pailaw sa paaralan/.test(text)) return 'Pailaw sa Paaralan';
  if (/environmental sustainability|nursery/.test(text)) return 'Environmental Sustainability Program';
  if (/reforestation|watershed|tree planting|adopted area/.test(text)) return 'Reforestation Program';
  if (/partner with ngo|mco empowerment|medical mission|balili river|onkaska|zero waste/.test(text)) return 'NGO Partnership for Social Cause';
  if (/assistance and support|other requests/.test(text)) return 'Other Projects';
  return current;
};
const parseDate = (text) => {
  const value = clean(text).replace(/20226/g, '2026');
  let match = value.match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(2026|202)\b/);
  if (match) return `2026-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
  match = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+2026\b/i);
  if (!match) return '';
  const month = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(match[1].toLowerCase()) + 1;
  return `2026-${String(month).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
};
const splitRequestee = (raw) => {
  const parts = clean(raw).split(',').map(clean).filter(Boolean);
  return { requestee: parts[0] ?? '', designation: parts[1] ?? '', organization: parts.slice(2).join(', ') };
};
const mapStatus = (remarks) => {
  const text = clean(remarks).toLowerCase();
  if (/implemented|completed/.test(text)) return 'Completed';
  if (/approved|implementation|coordination|inspection|initial/.test(text)) return 'Pending';
  return 'For evaluation';
};

let district = '';
let programType = '';
const candidates = [];
for (const row of rows) {
  if (Number.isInteger(Number(row[0])) && Number(row[0]) >= 1 && Number(row[0]) <= 11) district = `DISTRICT ${String(Number(row[0])).padStart(2, '0')}`;
  programType = programFor(row[1], programType);
  const rawRequestee = clean(row[3]);
  const particulars = clean(row[4]);
  const remarks = clean(row[6]);
  const dateRequested = parseDate(particulars);
  if (!rawRequestee || !dateRequested || !district) continue;
  const person = splitRequestee(rawRequestee);
  const evaluationResult = /not within csr policy|diss?approved/i.test(remarks) ? 'Not Within CSR Policy' : (/approved|implemented|for implementation/i.test(remarks) ? 'Within CSR Policy' : '');
  candidates.push({
    ...person,
    dateRequested,
    programType: programType || 'Other Projects',
    sector: '', location: '', barangay: '', municipality: '', district,
    projectDetails: remarks,
    projectRequirement: particulars,
    status: mapStatus(remarks), evaluationResult,
    evaluatedBy: '', dateApproved: '',
    amountFunding: typeof row[5] === 'number' && row[5] > 0 ? String(row[5]) : '',
    pjrs: '', actualProjectCost: '',
  });
}

const existing = await withLocalConnection(async (connection) => (await connection.execute(
  `SELECT csr_uid, requestee, date_requested, project_requirement FROM bes_csr_requests`
)).rows);
const existingNames = new Set(existing.map((row) => key(row.REQUESTEE)));
const seen = new Set();
const uniqueCandidates = candidates.filter((item) => {
  const candidateKey = `${key(item.requestee)}|${item.dateRequested}|${key(item.projectRequirement)}`;
  if (seen.has(candidateKey)) return false;
  seen.add(candidateKey);
  return true;
});
const fresh = uniqueCandidates.filter((item) => !existingNames.has(key(item.requestee)));

if (process.argv.includes('--commit')) {
  await withLocalConnection(async (connection) => {
    for (const item of fresh) {
      const digest = crypto.createHash('sha256').update(`${key(item.requestee)}|${item.dateRequested}|${key(item.projectRequirement)}`).digest('hex').slice(0, 24);
      await connection.execute(`INSERT INTO bes_csr_requests (
        csr_uid,date_requested,program_type,requestee,designation,organization,sector,location,barangay,municipality,district,
        project_details,project_requirement,request_status,evaluation_result,evaluated_by,date_approved,amount_funding,pjrs,actual_project_cost
      ) VALUES (
        :csrImportUid,TO_DATE(:csrImportDateRequested,'YYYY-MM-DD'),:csrImportProgramType,:csrImportRequestee,:csrImportDesignation,:csrImportOrganization,:csrImportSector,:csrImportLocation,:csrImportBarangay,:csrImportMunicipality,:csrImportDistrict,
        :csrImportProjectDetails,:csrImportProjectRequirement,:csrImportRequestStatus,:csrImportEvaluationResult,:csrImportEvaluatedBy,NULL,:csrImportAmountFunding,:csrImportPjrs,:csrImportActualProjectCost
      )`, {
        csrImportUid: `CSR-XLSX-2026-${digest}`,
        csrImportDateRequested: item.dateRequested,
        csrImportProgramType: item.programType,
        csrImportRequestee: item.requestee,
        csrImportDesignation: item.designation || null,
        csrImportOrganization: item.organization || null,
        csrImportSector: null,
        csrImportLocation: null,
        csrImportBarangay: null,
        csrImportMunicipality: null,
        csrImportDistrict: item.district,
        csrImportProjectDetails: item.projectDetails || null,
        csrImportProjectRequirement: item.projectRequirement || null,
        csrImportRequestStatus: item.status,
        csrImportEvaluationResult: item.evaluationResult || null,
        csrImportEvaluatedBy: null,
        csrImportAmountFunding: item.amountFunding ? Number(item.amountFunding) : null,
        csrImportPjrs: null,
        csrImportActualProjectCost: null,
      });
    }
    await connection.commit();
  });
}

console.log(JSON.stringify({
  sourceSheet: '2026 CSR (August)',
  candidateCount: candidates.length,
  sourceDuplicateCount: candidates.length - uniqueCandidates.length,
  existingCount: existing.length,
  existingDuplicateCount: uniqueCandidates.length - fresh.length,
  importedCount: process.argv.includes('--commit') ? fresh.length : 0,
  readyToImportCount: fresh.length,
  existingDuplicates: uniqueCandidates.filter((item) => existingNames.has(key(item.requestee))).map((item) => item.requestee),
}, null, 2));
