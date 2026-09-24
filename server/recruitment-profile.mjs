import { recruitmentFields } from '../shared/recruitment-fields.mjs';

const table = 'bes_hro_recruitment_and_onboarding';

export async function ensureRecruitmentProfileColumns(connection) {
  const existing = await connection.execute(`SELECT column_name FROM user_tab_columns WHERE table_name = UPPER(:tableName)`, { tableName: table });
  const columns = new Set(existing.rows.map(row => row.COLUMN_NAME));
  for (const field of recruitmentFields) {
    if (columns.has(field.column.toUpperCase())) continue;
    try {
      await connection.execute(`ALTER TABLE ${table} ADD (${field.column} ${field.key === 'submittedAt' ? 'TIMESTAMP' : 'VARCHAR2(2000)'})`);
    } catch (error) { if (error.errorNum !== 1430) throw error; }
  }
}

export function readRecruitmentProfile(row) {
  return Object.fromEntries(recruitmentFields.map(field => [field.key,
    (field.key === 'submittedAt' ? row.SUBMITTED_AT_TEXT : row[field.column.toUpperCase()]) || '',
  ]));
}

export function profileChanges(input) {
  return recruitmentFields.filter(field => Object.hasOwn(input, field.key)).map(field => {
    const value = input[field.key] == null ? '' : String(input[field.key]).trim();
    if (Buffer.byteLength(value, 'utf8') > 2000) throw Object.assign(new Error(`${field.label} exceeds 2000 bytes.`), { statusCode: 400 });
    let normalized = value;
    if (field.input === 'select-month' && value && !/^(0[1-9]|1[0-2])$/.test(value)) {
      throw Object.assign(new Error(`Select a valid ${field.label.toLowerCase()}.`), { statusCode: 400 });
    }
    if (field.input === 'select-year' && value && !/^(19|20)\d{2}$/.test(value)) {
      throw Object.assign(new Error(`Select a valid ${field.label.toLowerCase()}.`), { statusCode: 400 });
    }
    if (field.key === 'submittedAt' && value) {
      if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)?$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) {
        throw Object.assign(new Error('Enter a valid submission date.'), { statusCode: 400 });
      }
      normalized = value.length === 10 ? `${value}T00:00:00.000` : value.length === 16 ? `${value}:00.000` : value.includes('.') ? value : `${value}.000`;
    }
    return { ...field, value: normalized || null };
  });
}

// Omitted fields are preserved for older clients and unrelated updates.
export async function saveRecruitmentProfile(connection, recruitmentUid, input) {
  const changes = profileChanges(input);
  if (!changes.length) return;
  const binds = { recruitmentUid };
  const assignments = changes.map(field => {
    binds[field.key] = field.value;
    return `${field.column} = ${field.key === 'submittedAt' ? `TO_TIMESTAMP(:${field.key}, 'YYYY-MM-DD"T"HH24:MI:SS.FF')` : `:${field.key}`}`;
  });
  await connection.execute(`UPDATE ${table} SET ${assignments.join(', ')} WHERE recruitment_uid = :recruitmentUid`, binds);
}
