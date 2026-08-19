import { stdin } from 'node:process';
import { withConnection } from '../server/db.mjs';

const COLORS = {
  'Enterprise-wide': '#1a4fd6',
  Management: '#7c3aed',
  Department: '#158055',
  Training: '#cf8f1c',
  Compliance: '#c1272d',
  Projects: '#0d9488',
  Maintenance: '#ea580c',
  Personal: '#475569',
};

const toDbTimestamp = (value) => String(value).slice(0, 16).replace('T', ' ');
const fit = (value, length) => {
  const text = String(value ?? '');
  if (Buffer.byteLength(text, 'utf8') <= length) return text;
  let out = '';
  for (const char of text) {
    if (Buffer.byteLength(`${out}${char}…`, 'utf8') > length) break;
    out += char;
  }
  return `${out}…`;
};

async function readJson() {
  let raw = '';
  for await (const chunk of stdin) raw += chunk;
  return JSON.parse(raw);
}

const payload = await readJson();
const events = Array.isArray(payload.events) ? payload.events : [];

const imported = await withConnection(async (connection) => {
  await connection.execute(`UPDATE bes_calendar_events
    SET is_active = 'N', updated_at = SYSTIMESTAMP
    WHERE editable = 'N'
      AND (source_name = 'Calendar.xlsx' OR source_name = 'Oracle baseline / Sheet import pending')`);

  let count = 0;
  for (const event of events) {
    await connection.execute(`MERGE INTO bes_calendar_events e
      USING (SELECT :eventUid event_uid FROM dual) src
      ON (e.event_uid = src.event_uid)
      WHEN MATCHED THEN UPDATE SET
        title = :title,
        layer = :layer,
        start_at = TO_TIMESTAMP(:startAt, 'YYYY-MM-DD HH24:MI'),
        end_at = TO_TIMESTAMP(:endAt, 'YYYY-MM-DD HH24:MI'),
        all_day = :allDay,
        location = :location,
        description = :description,
        department_code = :departmentCode,
        editable = 'N',
        recurring = 'none',
        color = :color,
        source_name = 'Calendar.xlsx',
        source_row_key = :sourceRowKey,
        raw_source = :rawSource,
        visibility = 'All employees',
        is_active = 'Y',
        updated_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT
        (event_uid, title, layer, start_at, end_at, all_day, location, description, department_code,
         editable, recurring, color, source_name, source_row_key, raw_source, visibility, is_active)
        VALUES
        (:eventUid, :title, :layer, TO_TIMESTAMP(:startAt, 'YYYY-MM-DD HH24:MI'), TO_TIMESTAMP(:endAt, 'YYYY-MM-DD HH24:MI'),
         :allDay, :location, :description, :departmentCode, 'N', 'none', :color, 'Calendar.xlsx', :sourceRowKey, :rawSource, 'All employees', 'Y')`, {
      eventUid: event.eventUid,
      title: fit(event.title, 290),
      layer: event.layer,
      startAt: toDbTimestamp(event.start),
      endAt: toDbTimestamp(event.end),
      allDay: event.allDay ? 'Y' : 'N',
      location: event.location ?? null,
      description: event.description ?? null,
      departmentCode: event.departmentCode ?? null,
      color: COLORS[event.layer] ?? '#475569',
      sourceRowKey: event.sourceRowKey,
      rawSource: event.rawSource,
    });
    count += 1;
  }
  await connection.commit();
  return count;
});

console.log(JSON.stringify({ imported, skipped: payload.skipped?.length ?? 0 }));
