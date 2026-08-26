import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import crypto from 'node:crypto';
import { withLocalConnection } from '../../server/db.mjs';

const sourcePath = 'C:/Users/ENDUSER/Downloads/PROPOSED CSR PROGRAMS 2025_ISD_SIR CRIS a.xlsx';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const sources = [
  { name: '2026 CSR (summary april)', range: 'A9:G57', requestee: 2, particulars: 3, amount: 5, status: 4 },
  { name: '2026 CSR', range: 'A9:G173', requestee: 3, particulars: 4, amount: 5, status: 6 },
];

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const programFor = (label, current) => {
  const text = clean(label).toLowerCase();
  if (/skills training|epira 101|kmcc|bcbc|kbp|journalism/.test(text)) return 'Skills Training Program';
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
  const matches = [...value.matchAll(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(2026|202)\b/g)];
  if (matches.length) {
    const match = matches.at(-1);
    return `2026-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
  }
  const match = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+2026\b/i);
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
  if (/approved|implementation|coordination|inspection|initial|canvas|moa/.test(text)) return 'Pending';
  return 'For evaluation';
};
const compositeKey = (item) => `${key(item.requestee)}|${item.dateRequested}|${key(item.projectRequirement)}`;

const candidates = [];
for (const source of sources) {
  let district = '';
  let programType = '';
  const rows = workbook.worksheets.getItem(source.name).getRange(source.range).values;
  for (const row of rows) {
    if (Number.isInteger(Number(row[0])) && Number(row[0]) >= 1 && Number(row[0]) <= 11) district = `DISTRICT ${String(Number(row[0])).padStart(2, '0')}`;
    programType = programFor(row[1], programType);
    const rawRequestee = clean(row[source.requestee]);
    const particulars = clean(row[source.particulars]);
    const remarks = clean(row[source.status]);
    const dateRequested = parseDate(particulars);
    if (!rawRequestee || !dateRequested || !district) continue;
    const person = splitRequestee(rawRequestee);
    const evaluationResult = /not within csr policy|diss?approved/i.test(remarks)
      ? 'Not Within CSR Policy'
      : (/approved|implemented|for implementation/i.test(remarks) ? 'Within CSR Policy' : '');
    candidates.push({
      ...person, sourceSheet: source.name, dateRequested,
      programType: programType || 'Other Projects', district,
      projectDetails: remarks, projectRequirement: particulars,
      status: mapStatus(remarks), evaluationResult,
      amountFunding: typeof row[source.amount] === 'number' && row[source.amount] > 0 ? row[source.amount] : null,
    });
  }
}

const existing = await withLocalConnection(async (connection) => (await connection.execute(
  `SELECT requestee, TO_CHAR(date_requested, 'YYYY-MM-DD') AS date_requested, project_requirement FROM bes_csr_requests`
)).rows);
const existingKeys = new Set(existing.map((row) => compositeKey({
  requestee: row.REQUESTEE, dateRequested: row.DATE_REQUESTED, projectRequirement: row.PROJECT_REQUIREMENT,
})));
const existingNameDates = new Set(existing.map((row) => `${key(row.REQUESTEE)}|${row.DATE_REQUESTED}`));
const seen = new Set();
const uniqueCandidates = candidates.filter((item) => {
  const value = compositeKey(item);
  if (seen.has(value)) return false;
  seen.add(value);
  return true;
});
const fresh = uniqueCandidates.filter((item) =>
  !existingKeys.has(compositeKey(item)) &&
  !existingNameDates.has(`${key(item.requestee)}|${item.dateRequested}`)
);

if (process.argv.includes('--commit')) {
  await withLocalConnection(async (connection) => {
    for (const item of fresh) {
      const digest = crypto.createHash('sha256').update(compositeKey(item)).digest('hex').slice(0, 24);
      await connection.execute(`INSERT INTO bes_csr_requests (
        csr_uid,date_requested,program_type,requestee,designation,organization,sector,location,barangay,municipality,district,
        project_details,project_requirement,request_status,evaluation_result,evaluated_by,date_approved,amount_funding,pjrs,actual_project_cost
      ) VALUES (
        :csrOtherUid,TO_DATE(:csrOtherDate,'YYYY-MM-DD'),:csrOtherProgram,:csrOtherRequestee,:csrOtherDesignation,:csrOtherOrganization,NULL,NULL,NULL,NULL,:csrOtherDistrict,
        :csrOtherDetails,:csrOtherRequirement,:csrOtherStatus,:csrOtherEvaluation,NULL,NULL,:csrOtherFunding,NULL,NULL
      )`, {
        csrOtherUid: `CSR-XLSX-OTHER-${digest}`,
        csrOtherDate: item.dateRequested,
        csrOtherProgram: item.programType,
        csrOtherRequestee: item.requestee,
        csrOtherDesignation: item.designation || null,
        csrOtherOrganization: item.organization || null,
        csrOtherDistrict: item.district,
        csrOtherDetails: item.projectDetails || null,
        csrOtherRequirement: item.projectRequirement || null,
        csrOtherStatus: item.status,
        csrOtherEvaluation: item.evaluationResult || null,
        csrOtherFunding: item.amountFunding,
      });
    }
    await connection.commit();
  });
}

const bySheet = Object.fromEntries(sources.map(({ name }) => [name, {
  candidates: candidates.filter((item) => item.sourceSheet === name).length,
  fresh: fresh.filter((item) => item.sourceSheet === name).length,
}]));
console.log(JSON.stringify({
  bySheet,
  candidateCount: candidates.length,
  sourceDuplicateCount: candidates.length - uniqueCandidates.length,
  existingDuplicateCount: uniqueCandidates.length - fresh.length,
  readyToImportCount: fresh.length,
  importedCount: process.argv.includes('--commit') ? fresh.length : 0,
  fresh: fresh.map(({ requestee, dateRequested, district, sourceSheet }) => ({ requestee, dateRequested, district, sourceSheet })),
}, null, 2));
