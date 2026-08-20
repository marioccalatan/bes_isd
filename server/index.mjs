import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import oracledb from 'oracledb';
import { config } from './config.mjs';
import { initializeDatabase, withConnection } from './db.mjs';
import { createOpaqueToken, hashPassword, hashToken, verifyPassword } from './security.mjs';

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
};
const distRoot = path.resolve('dist');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const serveStatic = async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method ?? '')) return json(res, 405, { error: 'Method not allowed' });
  if (!fs.existsSync(distRoot)) return json(res, 404, { error: 'Frontend build not found. Run npm run build first.' });

  const url = new URL(req.url || '/', 'http://localhost');
  const requested = decodeURIComponent(url.pathname);
  const safePath = path.normalize(requested).replace(/^(\.\.[\\/])+/, '');
  let filePath = path.join(distRoot, safePath === '/' ? 'index.html' : safePath);
  if (!filePath.startsWith(distRoot)) return json(res, 403, { error: 'Forbidden' });

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    filePath = path.join(distRoot, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const body = await fsp.readFile(filePath);
  const cacheControl = ext === '.html'
    ? 'no-cache, no-store, must-revalidate'
    : 'public, max-age=31536000, immutable';
  res.writeHead(200, {
    'content-type': contentTypes[ext] ?? 'application/octet-stream',
    'cache-control': cacheControl,
  });
  if (req.method === 'HEAD') return res.end();
  return res.end(body);
};
const readBody = async (req) => {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 8_000_000) throw Object.assign(new Error('Request body exceeds the 8 MB limit.'), { statusCode: 413 }); }
  return raw ? JSON.parse(raw) : {};
};
const readBinaryBody = async (req, maxBytes = 25 * 1024 * 1024) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('DOCX file exceeds the 25 MB limit.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
};
const normalize = (value) => String(value ?? '').trim();
const nullableNormalize = (value) => {
  const text = normalize(value);
  return text ? text : null;
};
const toDbTimestamp = (value) => {
  const text = normalize(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return null;
  return text.slice(0, 16).replace('T', ' ');
};
const localIso = (value) => {
  if (!value) return value;
  if (!(value instanceof Date)) return String(value).replace(' ', 'T');
  const pad = (n) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
};
const localDateOnly = (value) => {
  if (!value) return '';
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  const pad = (number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};
const bearerToken = (req) => {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
};
const CALENDAR_LAYER_COLOR = {
  'Enterprise-wide': '#1a4fd6',
  Management: '#7c3aed',
  Department: '#158055',
  Training: '#cf8f1c',
  Compliance: '#c1272d',
  Projects: '#0d9488',
  Maintenance: '#ea580c',
  Personal: '#475569',
  'Reservation (Bonuan)': '#0891b2',
  'Reservation (DPS)': '#2563eb',
  'Reservation (Dumol)': '#16a34a',
  'Reservation (Sanchez)': '#d97706',
};
const calendarLayer = (value) => normalize(value) || 'Personal';
const calendarColor = (layer, value) => {
  const color = normalize(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : (CALENDAR_LAYER_COLOR[layer] || '#475569');
};
const attachmentList = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((file) => typeof file === 'string' ? file : file?.path || file?.name)
      .map((file) => normalize(file))
      .filter(Boolean);
  } catch {
    return [];
  }
};
const safeFileName = (value) => normalize(value).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_') || 'attachment';
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const isDocxBuffer = (file) => file.length >= 4
  && file[0] === 0x50 && file[1] === 0x4b
  && [0x03, 0x05, 0x07].includes(file[2]) && [0x04, 0x06, 0x08].includes(file[3])
  && file.includes(Buffer.from('[Content_Types].xml'))
  && file.includes(Buffer.from('word/document.xml'));
const workTaskAttachmentPaths = (taskUid, files) => Array.isArray(files)
  ? files
    .map((file, index) => {
      const text = normalize(typeof file === 'string' ? file : file?.name || file?.path);
      if (!text) return '';
      if (text.startsWith(`BES_TASKS/${taskUid}/`)) return text;
      return `BES_TASKS/${taskUid}/${taskUid}_${String(index + 1).padStart(3, '0')}_${safeFileName(text.split(/[\\/]/).pop() || text)}`;
    })
    .filter(Boolean)
  : [];
const departmentCodesFromValue = (value) => String(value ?? '').split('|').map((item) => normalize(item).toUpperCase()).filter(Boolean);
const departmentCodesFromBody = (body) => {
  const codes = Array.isArray(body.departmentIds)
    ? body.departmentIds.map((value) => normalize(value).toUpperCase()).filter(Boolean)
    : departmentCodesFromValue(body.departmentId);
  return [...new Set(codes)].slice(0, 12);
};
const calendarEvent = (row) => ({
  id: row.EVENT_UID,
  title: row.TITLE,
  layer: row.LAYER,
  start: localIso(row.START_AT),
  end: localIso(row.END_AT),
  allDay: row.ALL_DAY === 'Y',
  location: row.LOCATION,
  meetingLink: row.MEETING_LINK,
  description: row.DESCRIPTION,
  attendees: row.ATTENDEES ? String(row.ATTENDEES).split('|').filter(Boolean) : undefined,
  attachments: row.ATTACHMENTS ? JSON.parse(String(row.ATTACHMENTS)) : undefined,
  visibility: row.VISIBILITY || 'All employees',
  visibleToUsernames: row.VISIBLE_TO_USERS ? String(row.VISIBLE_TO_USERS).split('|').filter(Boolean) : undefined,
  done: row.IS_DONE === 'Y',
  doneAt: localIso(row.DONE_AT),
  doneBy: row.DONE_BY_USERNAME || undefined,
  departmentIds: departmentCodesFromValue(row.DEPARTMENT_CODE),
  departmentId: departmentCodesFromValue(row.DEPARTMENT_CODE)[0],
  officeAssignment: row.OFFICE_ASSIGNMENT || undefined,
  editable: row.EDITABLE === 'Y',
  recurring: row.RECURRING || 'none',
  ownerId: row.OWNER_USERNAME || undefined,
  color: row.COLOR || '#475569',
  sourceName: row.SOURCE_NAME,
});
const publicUser = (row) => ({
  id: String(row.USER_ID), employeeNo: row.EMPLOYEE_NO, username: row.USERNAME,
  email: row.EMAIL, firstName: row.FIRST_NAME, middleName: row.MIDDLE_NAME, lastName: row.LAST_NAME, suffix: row.SUFFIX,
  name: `${row.FIRST_NAME} ${row.LAST_NAME}`, role: row.APP_ROLE,
  position: row.POSITION_TITLE, designation: row.DESIGNATION, departmentCode: row.DEPARTMENT_CODE, unitName: row.UNIT_NAME,
  mobileNo: row.MOBILE_NO, employmentStatus: row.EMPLOYMENT_STATUS,
  accountStatus: row.ACCOUNT_STATUS, dateHired: row.DATE_HIRED, workLocation: row.WORK_LOCATION,
  profilePhoto: row.PROFILE_PHOTO_DATA_URL,
  roles: row.ROLE_ASSIGNMENTS ? String(row.ROLE_ASSIGNMENTS).split('|').filter(Boolean) : [row.APP_ROLE],
});
const policyRecord = (row) => ({
  id: row.RECORD_UID,
  title: row.TITLE,
  documentNumber: row.DOCUMENT_NUMBER,
  revisionNumber: row.REVISION_NUMBER,
  effectivityDate: localDateOnly(row.EFFECTIVITY_DATE),
  contents: row.CONTENTS,
  nature: row.NATURE,
  documentType: row.DOCUMENT_TYPE || 'Policy',
  attachmentName: row.ATTACHMENT_NAME || undefined,
  attachmentMimeType: row.ATTACHMENT_MIME_TYPE || undefined,
  attachmentSize: row.ATTACHMENT_SIZE == null ? undefined : Number(row.ATTACHMENT_SIZE),
  createdBy: [row.CREATED_BY_FIRST_NAME, row.CREATED_BY_LAST_NAME].filter(Boolean).join(' ') || row.CREATED_BY_USERNAME || undefined,
  createdAt: localIso(row.CREATED_AT),
  updatedAt: localIso(row.UPDATED_AT),
});
const policyTaskProcessing = (row) => ({
  taskId: row.SOURCE_TASK_UID,
  status: row.WORKFLOW_STATUS,
  actionTaken: row.ACTION_TAKEN || '',
  updatedAt: localIso(row.UPDATED_AT),
});
const HRO_TOOL_TASK_CONFIG = {
  recruitment: { table: 'BES_HRO_REC_TASK_PROCESSING', subject: 'application letter' },
  'human-resources': { table: 'BES_HRO_HR_TASK_PROCESSING', subject: 'human resource' },
  'learning-development': { table: 'BES_HRO_LD_TASK_PROCESSING', subject: 'learning and development' },
  'performance-management': { table: 'BES_HRO_PM_TASK_PROCESSING', subject: 'performance management' },
  'employee-relations': { table: 'BES_HRO_ER_TASK_PROCESSING', subject: 'employee relations' },
  'institutional-communications': { table: 'BES_HRO_IC_TASK_PROCESSING', subject: 'institutional communications' },
  'member-programs': { table: 'BES_HRO_MCP_TASK_PROCESSING', subject: 'member-consumer and community programs' },
  'records-management': { table: 'BES_HRO_RM_TASK_PROCESSING', subject: 'records management' },
  'events-management': { table: 'BES_HRO_EM_TASK_PROCESSING', subject: 'events management' },
};
const recruitmentComment = (row) => ({
  id: row.COMMENT_UID,
  author: [row.AUTHOR_FIRST_NAME, row.AUTHOR_LAST_NAME].filter(Boolean).join(' ') || row.AUTHOR_USERNAME || 'Unknown',
  authorId: row.AUTHOR_USERNAME || String(row.AUTHOR_USER_ID || ''),
  message: row.MESSAGE,
  createdAt: localIso(row.CREATED_AT),
  updatedAt: localIso(row.UPDATED_AT),
});
const recruitmentRecord = (row, comments = []) => ({
  id: row.RECRUITMENT_UID,
  sourceTaskId: row.SOURCE_TASK_UID,
  title: row.TITLE,
  controlNumber: row.CONTROL_NUMBER || undefined,
  applicantName: [row.FIRST_NAME, row.MIDDLE_NAME, row.LAST_NAME, row.SUFFIX].filter(Boolean).join(' ') || row.TITLE?.replace(/^Application Letter (?:of|for)\s+/i, '') || row.TITLE,
  lastName: row.LAST_NAME || '',
  firstName: row.FIRST_NAME || '',
  middleName: row.MIDDLE_NAME || '',
  suffix: row.SUFFIX || '',
  birthDate: localDateOnly(row.BIRTH_DATE) || '',
  sex: row.SEX || '',
  civilStatus: row.CIVIL_STATUS || '',
  email: row.EMAIL || '',
  mobileNo: row.MOBILE_NO || '',
  municipality: row.MUNICIPALITY || '',
  barangay: row.BARANGAY || '',
  address: row.ADDRESS || '',
  highestEducation: row.HIGHEST_EDUCATION || '',
  schoolName: row.SCHOOL_NAME || '',
  yearGraduated: row.YEAR_GRADUATED || '',
  applicationSource: row.APPLICATION_SOURCE || '',
  createdBy: [row.CREATED_BY_FIRST_NAME, row.CREATED_BY_LAST_NAME].filter(Boolean).join(' ') || row.CREATED_BY_USERNAME || 'Unknown',
  assignedTo: [row.ASSIGNED_TO_FIRST_NAME, row.ASSIGNED_TO_LAST_NAME].filter(Boolean).join(' ') || row.ASSIGNED_TO_USERNAME || 'Unassigned',
  dateSubmitted: localDateOnly(row.TASK_CREATED_AT),
  status: row.WORKFLOW_STATUS,
  actionTaken: row.ACTION_TAKEN || undefined,
  positionApplying: row.POSITION_APPLYING || undefined,
  remarks: row.REMARKS || '',
  comments,
  createdAt: localIso(row.CREATED_AT),
  updatedAt: localIso(row.UPDATED_AT),
});
const commentFromRow = (row) => ({
  id: row.COMMENT_UID,
  author: [row.AUTHOR_FIRST_NAME, row.AUTHOR_LAST_NAME].filter(Boolean).join(' ') || row.AUTHOR_USERNAME || 'Unknown',
  authorId: row.AUTHOR_USERNAME || String(row.AUTHOR_USER_ID || ''),
  timestamp: localIso(row.CREATED_AT),
  message: row.IS_DELETED === 'Y' ? 'This comment was deleted.' : row.MESSAGE,
  deleted: row.IS_DELETED === 'Y',
  parentCommentId: row.PARENT_COMMENT_UID || undefined,
  replies: [],
});
const nestComments = (rows) => {
  const byId = new Map();
  const roots = [];
  rows.map(commentFromRow).forEach((comment) => byId.set(comment.id, comment));
  byId.forEach((comment) => {
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) byId.get(comment.parentCommentId).replies.push(comment);
    else roots.push(comment);
  });
  return roots;
};
const workTask = (row, viewerUserId, comments = []) => ({
  id: row.TASK_UID,
  processType: 'task-assignment',
  title: row.TITLE,
  requestorId: row.CREATED_BY_USERNAME || String(row.CREATED_BY_USER_ID || ''),
  requestorName: [row.CREATED_BY_FIRST_NAME, row.CREATED_BY_LAST_NAME].filter(Boolean).join(' ') || row.CREATED_BY_USERNAME || 'Unknown',
  departmentId: row.DEPARTMENT_CODE || 'ISD',
  dateSubmitted: localIso(row.CREATED_AT)?.slice(0, 10) || '',
  status: row.STATUS || 'In Progress',
  priority: row.PRIORITY || 'Normal',
  purpose: row.DESCRIPTION || '',
    fields: {
      sourceCalendarEventId: row.CALENDAR_EVENT_UID,
      controlNumber: row.CONTROL_NUMBER,
      officeAssignment: row.OFFICE_ASSIGNMENT,
      taskSubject: row.TASK_SUBJECT,
      municipality: row.MUNICIPALITY,
      barangay: row.BARANGAY,
      address: row.ADDRESS,
      assignee: [row.ASSIGNED_TO_FIRST_NAME, row.ASSIGNED_TO_LAST_NAME].filter(Boolean).join(' ') || row.ASSIGNED_TO_USERNAME || '',
    },
  attachments: attachmentList(row.ATTACHMENTS),
  approvalChain: [],
  comments,
  activity: [{
    id: `${row.TASK_UID}-created`,
    timestamp: localIso(row.CREATED_AT),
    actor: [row.CREATED_BY_FIRST_NAME, row.CREATED_BY_LAST_NAME].filter(Boolean).join(' ') || row.CREATED_BY_USERNAME || 'System',
    action: 'Task created',
    detail: row.CALENDAR_EVENT_UID ? `Converted from calendar event ${row.CALENDAR_EVENT_UID}` : undefined,
  }],
  assigneeId: row.ASSIGNED_TO_USERNAME || String(row.ASSIGNED_TO_USER_ID || ''),
  assigneeName: [row.ASSIGNED_TO_FIRST_NAME, row.ASSIGNED_TO_LAST_NAME].filter(Boolean).join(' ') || row.ASSIGNED_TO_USERNAME || '',
  dueDate: row.DUE_DATE ? localIso(row.DUE_DATE)?.slice(0, 10) : undefined,
  isTeamItem: Number(row.CREATED_BY_USER_ID) === Number(viewerUserId) && Number(row.ASSIGNED_TO_USER_ID) !== Number(viewerUserId),
});
const adminUser = (row) => ({
  id: String(row.USER_ID),
  employeeNo: row.EMPLOYEE_NO,
  username: row.USERNAME,
  email: row.EMAIL,
  firstName: row.FIRST_NAME,
  middleName: row.MIDDLE_NAME,
  lastName: row.LAST_NAME,
  suffix: row.SUFFIX,
  name: [row.FIRST_NAME, row.MIDDLE_NAME, row.LAST_NAME, row.SUFFIX].filter(Boolean).join(' '),
  position: row.POSITION_TITLE,
  designation: row.DESIGNATION,
  departmentCode: row.DEPARTMENT_CODE,
  unitName: row.UNIT_NAME,
  mobileNo: row.MOBILE_NO,
  profilePhoto: row.PROFILE_PHOTO_DATA_URL,
  employmentStatus: row.EMPLOYMENT_STATUS,
  accountStatus: row.ACCOUNT_STATUS,
  role: row.APP_ROLE,
  roles: row.ROLE_ASSIGNMENTS ? String(row.ROLE_ASSIGNMENTS).split('|').filter(Boolean) : [row.APP_ROLE],
  dateHired: row.DATE_HIRED,
  lastLoginAt: row.LAST_LOGIN_AT,
  createdAt: row.CREATED_AT,
  updatedAt: row.UPDATED_AT,
});

async function createSession(connection, userId, rememberMe) {
  const token = createOpaqueToken();
  const days = rememberMe ? 30 : 1;
  await connection.execute(
    `INSERT INTO bes_auth_sessions (session_hash,user_id,expires_at) VALUES (:hash,:userId,SYSTIMESTAMP + NUMTODSINTERVAL(:days,'DAY'))`,
    { hash: hashToken(token), userId, days }
  );
  return token;
}

async function currentSessionUser(connection, token) {
  if (!token) return null;
  const found = await connection.execute(`SELECT u.user_id, u.username, u.department_code, u.app_role
    FROM bes_users u
    JOIN bes_auth_sessions s ON s.user_id = u.user_id
    WHERE s.session_hash = :hash
      AND s.expires_at > SYSTIMESTAMP
      AND u.account_status = 'ACTIVE'`, { hash: hashToken(token) });
  return found.rows[0] ?? null;
}

const isTaskModerator = (user) => ['Department Manager', 'Department Secretary', 'Office Secretary', 'Administrator'].includes(user?.APP_ROLE);

const DB_SYNC_TABLES = [
  'BES_USERS',
  'BES_ROLES',
  'BES_PERMISSIONS',
  'BES_ROLE_PERMISSIONS',
  'BES_USER_ROLES',
  'BES_DEPARTMENTS',
  'BES_OFFICES',
  'BES_POSITIONS',
  'BES_TOOL_ACCESS',
  'BES_TASK_SUBJECTS',
  'BES_MODULE_REGISTRY',
  'BES_MODULE_ACCESS',
  'BES_CALENDAR_EVENTS',
  'BES_WORK_TASKS',
  'BES_WORK_COMMENTS',
  'BES_HRO_RECRUITMENT_AND_ONBOARDING',
  'BES_HRO_RECRUITMENT_COMMENTS',
  'BES_HRO_RECRUITMENT_POSITIONS',
  'BES_POLICY_RECORDS',
  'BES_POLICY_TASK_PROCESSING',
  'BES_HRO_REC_TASK_PROCESSING',
  'BES_HRO_HR_TASK_PROCESSING',
  'BES_HRO_LD_TASK_PROCESSING',
  'BES_HRO_PM_TASK_PROCESSING',
  'BES_HRO_ER_TASK_PROCESSING',
  'BES_HRO_IC_TASK_PROCESSING',
  'BES_HRO_MCP_TASK_PROCESSING',
  'BES_HRO_RM_TASK_PROCESSING',
  'BES_HRO_EM_TASK_PROCESSING',
];
const DB_SYNC_DELETE_ORDER = [
  'BES_HRO_REC_TASK_PROCESSING',
  'BES_HRO_HR_TASK_PROCESSING',
  'BES_HRO_LD_TASK_PROCESSING',
  'BES_HRO_PM_TASK_PROCESSING',
  'BES_HRO_ER_TASK_PROCESSING',
  'BES_HRO_IC_TASK_PROCESSING',
  'BES_HRO_MCP_TASK_PROCESSING',
  'BES_HRO_RM_TASK_PROCESSING',
  'BES_HRO_EM_TASK_PROCESSING',
  'BES_POLICY_TASK_PROCESSING',
  'BES_HRO_RECRUITMENT_COMMENTS',
  'BES_HRO_RECRUITMENT_POSITIONS',
  'BES_HRO_RECRUITMENT_AND_ONBOARDING',
  'BES_WORK_COMMENTS',
  'BES_WORK_TASKS',
  'BES_CALENDAR_EVENTS',
  'BES_POLICY_RECORDS',
  'BES_USER_ROLES',
  'BES_ROLE_PERMISSIONS',
  'BES_POSITIONS',
  'BES_OFFICES',
  'BES_DEPARTMENTS',
  'BES_TOOL_ACCESS',
  'BES_TASK_SUBJECTS',
  'BES_MODULE_ACCESS',
  'BES_MODULE_REGISTRY',
  'BES_USERS',
  'BES_ROLES',
  'BES_PERMISSIONS',
];
const DB_SYNC_INSERT_ORDER = [
  'BES_USERS',
  'BES_ROLES',
  'BES_PERMISSIONS',
  'BES_ROLE_PERMISSIONS',
  'BES_USER_ROLES',
  'BES_DEPARTMENTS',
  'BES_OFFICES',
  'BES_POSITIONS',
  'BES_TOOL_ACCESS',
  'BES_TASK_SUBJECTS',
  'BES_MODULE_REGISTRY',
  'BES_MODULE_ACCESS',
  'BES_CALENDAR_EVENTS',
  'BES_WORK_TASKS',
  'BES_WORK_COMMENTS',
  'BES_HRO_RECRUITMENT_AND_ONBOARDING',
  'BES_HRO_RECRUITMENT_COMMENTS',
  'BES_HRO_RECRUITMENT_POSITIONS',
  'BES_POLICY_RECORDS',
  'BES_POLICY_TASK_PROCESSING',
  'BES_HRO_REC_TASK_PROCESSING',
  'BES_HRO_HR_TASK_PROCESSING',
  'BES_HRO_LD_TASK_PROCESSING',
  'BES_HRO_PM_TASK_PROCESSING',
  'BES_HRO_ER_TASK_PROCESSING',
  'BES_HRO_IC_TASK_PROCESSING',
  'BES_HRO_MCP_TASK_PROCESSING',
  'BES_HRO_RM_TASK_PROCESSING',
  'BES_HRO_EM_TASK_PROCESSING',
];
const DB_SYNC_ALLOWED = new Set(DB_SYNC_TABLES);

const oracleConnectString = (details) => {
  const host = normalize(details.host);
  const port = normalize(details.port) || '1521';
  const serviceName = normalize(details.serviceName);
  const mode = normalize(details.mode || details.connectionMode || 'serviceName').toLowerCase();
  if (!host || !serviceName) throw Object.assign(new Error('Host and service/SID are required.'), { statusCode: 400 });
  if (!/^\d{1,5}$/.test(port)) throw Object.assign(new Error('Oracle port must be numeric.'), { statusCode: 400 });
  return mode === 'sid'
    ? `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=(SID=${serviceName})))`
    : `${host}:${port}/${serviceName}`;
};

const oracleTargetConfig = (details) => {
  const user = normalize(details.username);
  const password = String(details.password ?? '');
  if (!user || !password) throw Object.assign(new Error('Oracle username and password are required.'), { statusCode: 400 });
  return { user, password, connectString: oracleConnectString(details) };
};

async function requireAdministrator(token) {
  if (!token) return null;
  return withConnection(async (c) => {
    const user = await currentSessionUser(c, token);
    if (!user) return null;
    if (user.APP_ROLE === 'Administrator') return user;
    const roleResult = await c.execute(`SELECT COUNT(*) role_count
      FROM bes_user_roles
      WHERE user_id = :userId
        AND role_code = 'Administrator'
        AND is_active = 'Y'`, { userId: user.USER_ID });
    return Number(roleResult.rows[0]?.ROLE_COUNT ?? 0) > 0 ? user : null;
  });
}

async function listSyncTables(connection) {
  const tableResult = await connection.execute(`SELECT table_name
    FROM user_tables
    WHERE table_name IN (${DB_SYNC_TABLES.map((_, index) => `:t${index}`).join(',')})
    ORDER BY table_name`, Object.fromEntries(DB_SYNC_TABLES.map((table, index) => [`t${index}`, table])));
  const rows = [];
  for (const table of tableResult.rows.map((row) => row.TABLE_NAME)) {
    const countResult = await connection.execute(`SELECT COUNT(*) row_count FROM ${table}`);
    rows.push({ tableName: table, rowCount: Number(countResult.rows[0]?.ROW_COUNT ?? 0) });
  }
  return rows;
}

async function tableColumns(connection, tableName) {
  if (!DB_SYNC_ALLOWED.has(tableName)) throw Object.assign(new Error(`Table ${tableName} is not allowed for sync.`), { statusCode: 400 });
  const result = await connection.execute(`SELECT column_name
    FROM user_tab_columns
    WHERE table_name = :tableName
    ORDER BY column_id`, { tableName });
  return result.rows.map((row) => row.COLUMN_NAME);
}

async function tableColumnMetadata(connection, tableName) {
  if (!DB_SYNC_ALLOWED.has(tableName)) throw Object.assign(new Error(`Table ${tableName} is not allowed for sync.`), { statusCode: 400 });
  const result = await connection.execute(`SELECT column_name, data_type, data_length, char_length, char_used, data_precision, data_scale
    FROM user_tab_columns WHERE table_name=:tableName ORDER BY column_id`, { tableName });
  return result.rows;
}

async function tablePrimaryKeyColumns(connection, tableName) {
  const result = await connection.execute(`SELECT cc.column_name
    FROM user_constraints c
    JOIN user_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name
    WHERE c.table_name=:tableName AND c.constraint_type='P'
    ORDER BY cc.position`, { tableName });
  return result.rows.map((row) => row.COLUMN_NAME);
}

function syncColumnType(column) {
  if (['VARCHAR2', 'CHAR'].includes(column.DATA_TYPE)) {
    const length = column.CHAR_USED === 'C' ? column.CHAR_LENGTH : column.DATA_LENGTH;
    return `${column.DATA_TYPE}(${length}${column.CHAR_USED === 'C' ? ' CHAR' : ''})`;
  }
  if (['NVARCHAR2', 'NCHAR'].includes(column.DATA_TYPE)) return `${column.DATA_TYPE}(${column.CHAR_LENGTH})`;
  if (column.DATA_TYPE === 'NUMBER' && column.DATA_PRECISION != null) {
    return `NUMBER(${column.DATA_PRECISION}${column.DATA_SCALE != null ? `,${column.DATA_SCALE}` : ''})`;
  }
  return column.DATA_TYPE;
}

async function alignDestinationColumns(source, destination, table) {
  const sourceColumns = await tableColumnMetadata(source, table);
  const destinationNames = new Set(await tableColumns(destination, table));
  const added = [];
  for (const column of sourceColumns.filter((item) => !destinationNames.has(item.COLUMN_NAME))) {
    await destination.execute(`ALTER TABLE ${table} ADD (${column.COLUMN_NAME} ${syncColumnType(column)})`);
    added.push(column.COLUMN_NAME);
  }
  return added;
}

function executeManyBindDefs(columns, rows) {
  return Object.fromEntries(columns.map((column) => {
    const name = column.COLUMN_NAME;
    const dataType = column.DATA_TYPE;
    if (dataType === 'CLOB' || dataType === 'NCLOB') return [name, { type: oracledb.CLOB }];
    if (dataType === 'BLOB') return [name, { type: oracledb.BLOB }];
    if (dataType === 'RAW') return [name, { type: oracledb.BUFFER, maxSize: Math.max(column.DATA_LENGTH ?? 1, 1) }];
    if (['NUMBER', 'FLOAT', 'BINARY_FLOAT', 'BINARY_DOUBLE'].includes(dataType)) return [name, { type: oracledb.NUMBER }];
    if (dataType === 'DATE') return [name, { type: oracledb.DATE }];
    if (dataType.startsWith('TIMESTAMP')) return [name, { type: oracledb.DB_TYPE_TIMESTAMP }];

    const largestValue = rows.reduce((largest, row) => {
      const value = row[name];
      return typeof value === 'string' ? Math.max(largest, Buffer.byteLength(value, 'utf8')) : largest;
    }, 0);
    return [name, { type: oracledb.STRING, maxSize: Math.max(column.DATA_LENGTH ?? 1, largestValue, 1) }];
  }));
}

async function oracleValueText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value.getData === 'function') return String(await value.getData());
  return String(value);
}

async function pushOracleSchema(targetDetails, requestedTables) {
  const selected = Array.isArray(requestedTables)
    ? [...new Set(requestedTables.map((table) => normalize(table).toUpperCase()).filter((table) => DB_SYNC_ALLOWED.has(table)))]
    : [];
  if (selected.length === 0) throw Object.assign(new Error('Select at least one BES table for schema push.'), { statusCode: 400 });
  const target = await oracledb.getConnection(oracleTargetConfig(targetDetails));
  try {
    return await withConnection(async (source) => {
      const sourceTables = new Set((await listSyncTables(source)).map((table) => table.tableName));
      const missingSource = selected.filter((table) => !sourceTables.has(table));
      if (missingSource.length) throw Object.assign(new Error(`Local schema is missing: ${missingSource.join(', ')}`), { statusCode: 400 });
      let targetTables = new Set((await listSyncTables(target)).map((table) => table.tableName));
      const report = [];
      for (const table of DB_SYNC_INSERT_ORDER.filter((item) => selected.includes(item))) {
        if (!targetTables.has(table)) {
          await source.execute(`BEGIN
            DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'STORAGE', false);
            DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SEGMENT_ATTRIBUTES', false);
            DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SQLTERMINATOR', false);
          END;`);
          const ddlResult = await source.execute(`SELECT DBMS_METADATA.GET_DDL('TABLE', :tableName, USER) ddl FROM dual`, { tableName: table });
          let ddl = await oracleValueText(ddlResult.rows[0]?.DDL);
          const ownerResult = await source.execute(`SELECT USER owner_name FROM dual`);
          const owner = ownerResult.rows[0]?.OWNER_NAME;
          if (owner) ddl = ddl.replaceAll(`"${owner}".`, '');
          await target.execute(ddl);
          targetTables.add(table);
          report.push({ tableName: table, created: true, addedColumns: [] });
        } else {
          const addedColumns = await alignDestinationColumns(source, target, table);
          report.push({ tableName: table, created: false, addedColumns });
        }
      }
      return report;
    });
  } finally {
    await target.close();
  }
}

async function copyOracleTables(source, destination, selected, direction) {
  const sourceTables = new Set((await listSyncTables(source)).map((table) => table.tableName));
  const destinationTables = new Set((await listSyncTables(destination)).map((table) => table.tableName));
  const missing = selected.filter((table) => !sourceTables.has(table) || !destinationTables.has(table));
  if (missing.length) throw Object.assign(new Error(`Server schema is missing: ${missing.join(', ')}. Run Push Schema Tables for the selected tables, then run data sync again.`), { statusCode: 400 });

  const addedColumns = new Map();
  for (const table of selected) addedColumns.set(table, await alignDestinationColumns(source, destination, table));
  const report = [];
  for (const table of DB_SYNC_INSERT_ORDER.filter((table) => selected.includes(table))) {
    const columnMetadata = await tableColumnMetadata(source, table);
    const columns = columnMetadata.map((column) => column.COLUMN_NAME);
    const primaryKeyColumns = await tablePrimaryKeyColumns(source, table);
    if (primaryKeyColumns.length === 0) throw Object.assign(new Error(`${table} has no primary key. Safe append/update sync requires a primary key and did not modify this table.`), { statusCode: 400 });
    const sourceResult = await source.execute(`SELECT ${columns.join(', ')} FROM ${table}`);
    const updateColumns = columns.filter((column) => !primaryKeyColumns.includes(column));
    const usingColumns = columns.map((column) => `:${column} ${column}`).join(', ');
    const match = primaryKeyColumns.map((column) => `destination.${column}=source.${column}`).join(' AND ');
    const update = updateColumns.length ? `WHEN MATCHED THEN UPDATE SET ${updateColumns.map((column) => `destination.${column}=source.${column}`).join(', ')}` : '';
    const mergeSql = `MERGE INTO ${table} destination
      USING (SELECT ${usingColumns} FROM dual) source ON (${match})
      ${update}
      WHEN NOT MATCHED THEN INSERT (${columns.join(', ')}) VALUES (${columns.map((column) => `source.${column}`).join(', ')})`;
    if (sourceResult.rows.length > 0) {
      await destination.executeMany(mergeSql, sourceResult.rows, {
        autoCommit: false,
        bindDefs: executeManyBindDefs(columnMetadata, sourceResult.rows),
      });
    }
    report.push({ tableName: table, rowCount: sourceResult.rows.length, columns: columns.length, addedColumns: addedColumns.get(table), direction, note: 'Upserted; destination-only rows preserved.' });
  }
  await destination.commit();
  return report;
}

async function syncOracleTables(targetDetails, requestedTables, requestedDirection = 'push') {
  const selected = Array.isArray(requestedTables)
    ? [...new Set(requestedTables.map((table) => normalize(table).toUpperCase()).filter((table) => DB_SYNC_ALLOWED.has(table)))]
    : [];
  if (selected.length === 0) throw Object.assign(new Error('Select at least one BES table to sync.'), { statusCode: 400 });

  const direction = ['push', 'pull', 'both'].includes(normalize(requestedDirection).toLowerCase()) ? normalize(requestedDirection).toLowerCase() : 'push';
  const target = await oracledb.getConnection(oracleTargetConfig(targetDetails));
  try {
    return await withConnection(async (source) => {
      if (direction === 'push') return copyOracleTables(source, target, selected, 'Local → Server');
      if (direction === 'pull') return copyOracleTables(target, source, selected, 'Server → Local');
      const pushed = await copyOracleTables(source, target, selected, 'Local → Server');
      const pulled = await copyOracleTables(target, source, selected, 'Server → Local');
      return [...pushed, ...pulled];
    });
  } catch (error) {
    try { await target.rollback(); } catch {}
    throw error;
  } finally {
    await target.close();
  }
}

async function ensureRecruitmentRecords(connection) {
  await connection.execute(`INSERT INTO bes_hro_recruitment_and_onboarding
      (recruitment_uid, source_task_uid, workflow_status)
    SELECT 'HRO-APP-' || TO_CHAR(t.task_id), t.task_uid, 'Received'
    FROM bes_work_tasks t
    WHERE t.is_active = 'Y'
      AND LOWER(TRIM(t.task_subject)) = 'application letter'
      AND NOT EXISTS (
        SELECT 1 FROM bes_hro_recruitment_and_onboarding r WHERE r.source_task_uid = t.task_uid
      )`);
  await connection.commit();
}

async function loadRecruitmentRecords(connection) {
  const records = await connection.execute(`SELECT r.*,
      t.title, t.control_number, t.created_at task_created_at,
      creator.username created_by_username, creator.first_name created_by_first_name, creator.last_name created_by_last_name,
      assignee.username assigned_to_username, assignee.first_name assigned_to_first_name, assignee.last_name assigned_to_last_name
    FROM bes_hro_recruitment_and_onboarding r
    JOIN bes_work_tasks t ON t.task_uid = r.source_task_uid
    LEFT JOIN bes_users creator ON creator.user_id = t.created_by_user_id
    LEFT JOIN bes_users assignee ON assignee.user_id = t.assigned_to_user_id
    WHERE t.is_active = 'Y'
      AND r.is_active = 'Y'
    ORDER BY r.updated_at DESC, t.created_at DESC`);
  const commentRows = await connection.execute(`SELECT c.*,
      u.username author_username, u.first_name author_first_name, u.last_name author_last_name
    FROM bes_hro_recruitment_comments c
    LEFT JOIN bes_users u ON u.user_id = c.author_user_id
    ORDER BY c.created_at`);
  const commentsByRecord = new Map();
  for (const row of commentRows.rows) {
    const comments = commentsByRecord.get(row.RECRUITMENT_UID) ?? [];
    comments.push(recruitmentComment(row));
    commentsByRecord.set(row.RECRUITMENT_UID, comments);
  }
  return records.rows.map((row) => recruitmentRecord(row, commentsByRecord.get(row.RECRUITMENT_UID) ?? []));
}

async function handle(req, res) {
  if (!req.url?.startsWith('/api/')) return serveStatic(req, res);
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      const db = await withConnection((c) => c.execute(`SELECT SYS_CONTEXT('USERENV','CON_NAME') container_name FROM dual`));
      return json(res, 200, { ok: true, database: db.rows[0].CONTAINER_NAME });
    }
    if (req.method === 'GET' && req.url === '/api/admin/users') {
      const result = await withConnection((c) => c.execute(`SELECT
          user_id, employee_no, username, email, first_name, middle_name, last_name, suffix,
          position_title, designation, department_code, unit_name, mobile_no, employment_status, account_status,
          app_role, date_hired, work_location, profile_photo_data_url, last_login_at, created_at, updated_at,
          (SELECT LISTAGG(ur.role_code || NVL2(ur.scope_department_code, ' (' || ur.scope_department_code || ')', ''), '|')
             WITHIN GROUP (ORDER BY r.sort_order, ur.scope_department_code)
           FROM bes_user_roles ur
           JOIN bes_roles r ON r.role_code = ur.role_code
           WHERE ur.user_id = u.user_id AND ur.is_active = 'Y') role_assignments
        FROM bes_users u
        WHERE NVL(u.account_status, 'ACTIVE') <> 'DISABLED'
        ORDER BY last_name, first_name, employee_no`));
      return json(res, 200, { users: result.rows.map(adminUser) });
    }
    if (req.method === 'GET' && req.url === '/api/tools') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const tools = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const access = await c.execute(`SELECT tool_code, tool_name, department_code, office_name, position_name,
            access_level, tool_status, owner_department_code, access_note
          FROM bes_tool_access WHERE is_active='Y'
          ORDER BY tool_code, department_code, office_name, position_name`);
        const subjects = await c.execute(`SELECT tool_code, task_subject FROM bes_task_subjects
          WHERE is_active='Y' ORDER BY tool_code, task_subject`);
        const subjectsByTool = new Map();
        for (const row of subjects.rows) {
          const list = subjectsByTool.get(row.TOOL_CODE) ?? [];
          list.push(row.TASK_SUBJECT);
          subjectsByTool.set(row.TOOL_CODE, list);
        }
        const byCode = new Map();
        for (const row of access.rows) {
          if (!byCode.has(row.TOOL_CODE)) byCode.set(row.TOOL_CODE, {
            code: row.TOOL_CODE,
            name: row.TOOL_NAME,
            ownerDepartmentId: row.OWNER_DEPARTMENT_CODE,
            status: row.TOOL_STATUS || 'ENABLED',
            taskSubjects: subjectsByTool.get(row.TOOL_CODE) ?? [],
            access: [],
          });
          byCode.get(row.TOOL_CODE).access.push({
            departmentId: row.DEPARTMENT_CODE,
            level: row.ACCESS_LEVEL,
            ...(row.OFFICE_NAME ? { unit: row.OFFICE_NAME } : {}),
            ...(row.POSITION_NAME ? { position: row.POSITION_NAME } : {}),
            ...(row.ACCESS_NOTE ? { note: row.ACCESS_NOTE } : {}),
          });
        }
        return [...byCode.values()];
      });
      if (!tools) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { tools });
    }
    if (req.method === 'GET' && req.url === '/api/modules') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const modules = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const result = await c.execute(`SELECT m.module_path, m.module_label, m.admin_only, a.department_code, a.is_enabled
          FROM bes_module_registry m LEFT JOIN bes_module_access a ON a.module_path=m.module_path
          WHERE m.is_active='Y' ORDER BY m.module_path, a.department_code`);
        const byPath = new Map();
        for (const row of result.rows) {
          if (!byPath.has(row.MODULE_PATH)) byPath.set(row.MODULE_PATH, { path: row.MODULE_PATH, label: row.MODULE_LABEL, adminOnly: row.ADMIN_ONLY === 'Y', departmentIds: [] });
          if (row.DEPARTMENT_CODE && row.IS_ENABLED === 'Y') byPath.get(row.MODULE_PATH).departmentIds.push(row.DEPARTMENT_CODE);
        }
        return [...byPath.values()];
      });
      if (!modules) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { modules });
    }
    if (req.method === 'PUT' && req.url === '/api/admin/modules') {
      const admin = await requireAdministrator(bearerToken(req));
      if (!admin) return json(res, 401, { error: 'Administrator session required.' });
      const body = await readBody(req);
      const access = body.access && typeof body.access === 'object' ? body.access : {};
      await withConnection(async (c) => {
        for (const [modulePath, departmentIds] of Object.entries(access)) {
          const enabled = new Set(Array.isArray(departmentIds) ? departmentIds.map((id) => normalize(id).toUpperCase()) : []);
          const departments = await c.execute(`SELECT department_code FROM bes_departments WHERE is_active='Y'`);
          for (const row of departments.rows) await c.execute(`MERGE INTO bes_module_access a
            USING (SELECT :modulePath module_path,:departmentCode department_code FROM dual) src
            ON (a.module_path=src.module_path AND a.department_code=src.department_code)
            WHEN MATCHED THEN UPDATE SET is_enabled=:isEnabled,updated_at=SYSTIMESTAMP
            WHEN NOT MATCHED THEN INSERT (module_path,department_code,is_enabled) VALUES (:modulePath,:departmentCode,:isEnabled)`, {
            modulePath, departmentCode: row.DEPARTMENT_CODE, isEnabled: enabled.has(row.DEPARTMENT_CODE) ? 'Y' : 'N',
          });
        }
        await c.commit();
      });
      return json(res, 200, { ok: true });
    }
    const toolRegistryMatch = url.pathname.match(/^\/api\/admin\/tools\/([^/]+)$/);
    if (req.method === 'PUT' && toolRegistryMatch) {
      const admin = await requireAdministrator(bearerToken(req));
      if (!admin) return json(res, 401, { error: 'Administrator session required.' });
      const toolCode = decodeURIComponent(toolRegistryMatch[1]);
      const body = await readBody(req);
      const toolName = normalize(body.name);
      const ownerDepartmentId = normalize(body.ownerDepartmentId).toUpperCase();
      const status = normalize(body.status || 'ENABLED').toUpperCase();
      const access = Array.isArray(body.access) ? body.access : [];
      const taskSubjects = Array.isArray(body.taskSubjects) ? body.taskSubjects.map(normalize).filter(Boolean) : [];
      if (!toolCode || !toolName || !ownerDepartmentId || !['SOON', 'ENABLED', 'DISABLED'].includes(status)) {
        return json(res, 400, { error: 'Valid tool name, owner department, and status are required.' });
      }
      await withConnection(async (c) => {
        await c.execute(`DELETE FROM bes_tool_access WHERE tool_code=:toolCode`, { toolCode });
        for (const grant of access) {
          const departmentCode = normalize(grant.departmentId).toUpperCase();
          const level = normalize(grant.level).toUpperCase();
          if (!departmentCode || !['ADMIN','NEW','VIEW','EDIT','OPEN','SOON','EXISTING'].includes(level)) continue;
          await c.execute(`INSERT INTO bes_tool_access
              (tool_code,tool_name,department_code,office_name,position_name,access_level,tool_status,owner_department_code,access_note,is_active)
            VALUES (:toolCode,:toolName,:departmentCode,:officeName,:positionName,:accessLevel,:toolStatus,:ownerDepartmentCode,:accessNote,'Y')`, {
            toolCode, toolName, departmentCode,
            officeName: nullableNormalize(grant.unit), positionName: nullableNormalize(grant.position),
            accessLevel: level, toolStatus: status, ownerDepartmentCode: ownerDepartmentId,
            accessNote: nullableNormalize(grant.note),
          });
        }
        await c.execute(`DELETE FROM bes_task_subjects WHERE tool_code=:toolCode`, { toolCode });
        for (const taskSubject of [...new Set(taskSubjects)]) {
          await c.execute(`INSERT INTO bes_task_subjects (tool_code,task_subject,is_active) VALUES (:toolCode,:taskSubject,'Y')`, { toolCode, taskSubject });
        }
        await c.commit();
      });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/api/admin/org-structure') {
      const admin = await requireAdministrator(bearerToken(req));
      if (!admin) return json(res, 401, { error: 'Administrator session required.' });
      const structure = await withConnection(async (c) => {
        const departments = await c.execute(`SELECT department_id, department_code, department_name FROM bes_departments WHERE is_active='Y' ORDER BY department_name`);
        const offices = await c.execute(`SELECT office_id, department_id, parent_office_id, office_name FROM bes_offices WHERE is_active='Y' ORDER BY office_name`);
        const positions = await c.execute(`SELECT position_id, department_id, office_id, position_title, employee_class FROM bes_positions WHERE is_active='Y' ORDER BY position_title`);
        return departments.rows.map((department) => ({
          id: String(department.DEPARTMENT_ID), code: department.DEPARTMENT_CODE, name: department.DEPARTMENT_NAME,
          positions: positions.rows.filter((position) => position.DEPARTMENT_ID === department.DEPARTMENT_ID && !position.OFFICE_ID).map((position) => ({
            id: String(position.POSITION_ID), title: position.POSITION_TITLE, employeeClass: position.EMPLOYEE_CLASS,
          })),
          offices: offices.rows.filter((office) => office.DEPARTMENT_ID === department.DEPARTMENT_ID).map((office) => ({
            id: String(office.OFFICE_ID), name: office.OFFICE_NAME, parentOfficeId: office.PARENT_OFFICE_ID ? String(office.PARENT_OFFICE_ID) : null,
            positions: positions.rows.filter((position) => position.OFFICE_ID === office.OFFICE_ID).map((position) => ({
              id: String(position.POSITION_ID), title: position.POSITION_TITLE, employeeClass: position.EMPLOYEE_CLASS,
            })),
          })),
        }));
      });
      return json(res, 200, { departments: structure });
    }
    if (['POST', 'PUT'].includes(req.method ?? '') && req.url === '/api/admin/org-structure') {
      const admin = await requireAdministrator(bearerToken(req));
      if (!admin) return json(res, 401, { error: 'Administrator session required.' });
      const body = await readBody(req);
      const entity = normalize(body.entity).toLowerCase();
      const id = Number(body.id || 0);
      await withConnection(async (c) => {
        if (entity === 'department') {
          const code = normalize(body.code).toUpperCase();
          const name = normalize(body.name);
          if (!code || !name) throw Object.assign(new Error('Department name and initials are required.'), { statusCode: 400 });
          if (id) {
            const previous = await c.execute(`SELECT department_code FROM bes_departments WHERE department_id=:id`, { id });
            const oldCode = previous.rows[0]?.DEPARTMENT_CODE;
            await c.execute(`UPDATE bes_departments SET department_code=:code, department_name=:name, updated_at=SYSTIMESTAMP WHERE department_id=:id`, { id, code, name });
            if (oldCode && oldCode !== code) {
              await c.execute(`UPDATE bes_tool_access SET department_code=:code, updated_at=SYSTIMESTAMP WHERE department_code=:oldCode`, { code, oldCode });
              await c.execute(`UPDATE bes_tool_access SET owner_department_code=:code, updated_at=SYSTIMESTAMP WHERE owner_department_code=:oldCode`, { code, oldCode });
            }
          } else await c.execute(`INSERT INTO bes_departments (department_code, department_name) VALUES (:code,:name)`, { code, name });
        } else if (entity === 'office') {
          const name = normalize(body.name);
          const departmentId = Number(body.departmentId);
          const parentOfficeId = body.parentOfficeId ? Number(body.parentOfficeId) : null;
          if (!name || !departmentId) throw Object.assign(new Error('Office name and department are required.'), { statusCode: 400 });
          if (id) {
            const previous = await c.execute(`SELECT office_name FROM bes_offices WHERE office_id=:id`, { id });
            const oldName = previous.rows[0]?.OFFICE_NAME;
            await c.execute(`UPDATE bes_offices SET department_id=:departmentId, parent_office_id=:parentOfficeId, office_name=:name, updated_at=SYSTIMESTAMP WHERE office_id=:id`, { id, departmentId, parentOfficeId, name });
            if (oldName && oldName !== name) await c.execute(`UPDATE bes_tool_access SET office_name=:name, updated_at=SYSTIMESTAMP WHERE office_name=:oldName`, { name, oldName });
          } else await c.execute(`INSERT INTO bes_offices (department_id,parent_office_id,office_name) VALUES (:departmentId,:parentOfficeId,:name)`, { departmentId, parentOfficeId, name });
        } else if (entity === 'position') {
          const title = normalize(body.title);
          const officeId = body.officeId ? Number(body.officeId) : null;
          const departmentId = body.departmentId ? Number(body.departmentId) : null;
          const employeeClass = normalize(body.employeeClass).toUpperCase();
          const departmentRoles = ['DEPARTMENT_MANAGER', 'DEPARTMENT_SECRETARY'];
          const officeRoles = ['OFFICE_SECRETARY', 'SUPERVISOR', 'RAF'];
          const validScope = departmentRoles.includes(employeeClass) ? !!departmentId && !officeId : officeRoles.includes(employeeClass) && !!officeId && !departmentId;
          if (!title || !validScope) throw Object.assign(new Error('Select a valid role and its corresponding department or office.'), { statusCode: 400 });
          if (id) await c.execute(`UPDATE bes_positions SET department_id=:departmentId, office_id=:officeId, position_title=:title, employee_class=:employeeClass, updated_at=SYSTIMESTAMP WHERE position_id=:id`, { id, departmentId, officeId, title, employeeClass });
          else await c.execute(`INSERT INTO bes_positions (department_id,office_id,position_title,employee_class) VALUES (:departmentId,:officeId,:title,:employeeClass)`, { departmentId, officeId, title, employeeClass });
        } else throw Object.assign(new Error('Entity must be department, office, or position.'), { statusCode: 400 });
        await c.commit();
      });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/api/users/directory') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        return c.execute(`SELECT user_id, employee_no, username, email, first_name, middle_name, last_name, suffix, position_title, department_code
          FROM bes_users
          WHERE account_status = 'ACTIVE'
          ORDER BY last_name, first_name, employee_no`);
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, {
        users: result.rows.map((row) => ({
          id: String(row.USER_ID),
          employeeNo: row.EMPLOYEE_NO,
          username: row.USERNAME,
          email: row.EMAIL,
          firstName: row.FIRST_NAME,
          lastName: row.LAST_NAME,
          name: [row.FIRST_NAME, row.MIDDLE_NAME, row.LAST_NAME, row.SUFFIX].filter(Boolean).join(' '),
          position: row.POSITION_TITLE,
          departmentCode: row.DEPARTMENT_CODE,
        })),
      });
    }
    const userEditMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (req.method === 'PUT' && userEditMatch) {
      const userId = Number(userEditMatch[1]);
      const body = await readBody(req);
      const employeeNo = normalize(body.employeeNo).toUpperCase();
      const username = normalize(body.username).toLowerCase();
      const email = normalize(body.email).toLowerCase();
      const firstName = normalize(body.firstName);
      const lastName = normalize(body.lastName);
      const accountStatus = normalize(body.accountStatus).toUpperCase();
      const employmentStatus = normalize(body.employmentStatus) || 'Active';
      const roleAssignments = Array.isArray(body.roleAssignments)
        ? body.roleAssignments
          .map((assignment) => ({
            roleCode: normalize(assignment.roleCode),
            departmentCode: nullableNormalize(assignment.departmentCode)?.toUpperCase() ?? null,
            unitName: nullableNormalize(assignment.unitName),
            note: nullableNormalize(assignment.note),
          }))
          .filter((assignment) => assignment.roleCode)
        : [];
      const requestedRole = normalize(body.role);
      const role = roleAssignments.some((assignment) => assignment.roleCode === requestedRole)
        ? requestedRole
        : roleAssignments[0]?.roleCode || requestedRole || 'Employee';
      if (!employeeNo || !username || !email || !firstName || !lastName)
        return json(res, 400, { error: 'Employee number, username, email, first name, and last name are required.' });
      if (!['PENDING', 'ACTIVE', 'LOCKED', 'DISABLED'].includes(accountStatus))
        return json(res, 400, { error: 'Account status must be PENDING, ACTIVE, LOCKED, or DISABLED.' });
      if (Array.isArray(body.roleAssignments) && roleAssignments.length === 0)
        return json(res, 400, { error: 'Select at least one BES role.' });
      const updated = await withConnection(async (c) => {
        if (roleAssignments.length > 0) {
          const roleLookup = await c.execute(`SELECT role_code FROM bes_roles WHERE is_active='Y'`);
          const validRoles = new Set(roleLookup.rows.map((row) => row.ROLE_CODE));
          const invalid = roleAssignments.find((assignment) => !validRoles.has(assignment.roleCode));
          if (invalid) {
            const error = new Error(`Invalid BES role: ${invalid.roleCode}`);
            error.statusCode = 400;
            throw error;
          }
        }
        const result = await c.execute(`UPDATE bes_users SET
            employee_no = :employeeNo,
            username = :username,
            email = :email,
            first_name = :firstName,
            middle_name = :middleName,
            last_name = :lastName,
            suffix = :suffix,
            position_title = :positionTitle,
            designation = :designation,
            department_code = :departmentCode,
            unit_name = :unitName,
            mobile_no = :mobileNo,
            employment_status = :employmentStatus,
            account_status = :accountStatus,
            app_role = :role,
            updated_at = SYSTIMESTAMP
          WHERE user_id = :userId`, {
          userId,
          employeeNo,
          username,
          email,
          firstName,
          middleName: nullableNormalize(body.middleName),
          lastName,
          suffix: nullableNormalize(body.suffix),
          positionTitle: nullableNormalize(body.position),
          designation: nullableNormalize(body.designation),
          departmentCode: nullableNormalize(body.departmentCode)?.toUpperCase() ?? null,
          unitName: nullableNormalize(body.unitName),
          mobileNo: nullableNormalize(body.mobileNo),
          employmentStatus,
          accountStatus,
          role,
        });
        if (result.rowsAffected && roleAssignments.length > 0) {
          await c.execute(`DELETE FROM bes_user_roles WHERE user_id = :userId`, { userId });
          for (const assignment of roleAssignments) {
            await c.execute(`INSERT INTO bes_user_roles
              (user_id, role_code, scope_department_code, scope_unit_name, is_active, assignment_note)
              VALUES (:userId, :roleCode, :departmentCode, :unitName, 'Y', :note)`, {
              userId,
              roleCode: assignment.roleCode,
              departmentCode: assignment.departmentCode,
              unitName: assignment.unitName,
              note: assignment.note,
            });
          }
        }
        await c.commit();
        return result.rowsAffected ?? 0;
      });
      return updated > 0 ? json(res, 200, { ok: true }) : json(res, 404, { error: 'User not found.' });
    }
    if (req.method === 'DELETE' && userEditMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const userId = Number(userEditMatch[1]);
      const deleted = await withConnection(async (c) => {
        const actor = await currentSessionUser(c, token);
        if (!actor) {
          const error = new Error('Session expired.');
          error.statusCode = 401;
          throw error;
        }
        const roleResult = await c.execute(`SELECT COUNT(*) AS role_count
          FROM bes_user_roles
          WHERE user_id = :actorId
            AND role_code = 'Administrator'
            AND is_active = 'Y'`, { actorId: actor.USER_ID });
        const isAdministrator = actor.APP_ROLE === 'Administrator' || Number(roleResult.rows[0]?.ROLE_COUNT ?? 0) > 0;
        if (!isAdministrator) {
          const error = new Error('Only administrators can delete employees.');
          error.statusCode = 403;
          throw error;
        }
        if (Number(actor.USER_ID) === userId) {
          const error = new Error('You cannot delete your own administrator account while signed in.');
          error.statusCode = 400;
          throw error;
        }
        const result = await c.execute(`UPDATE bes_users
          SET account_status = 'DISABLED',
              updated_at = SYSTIMESTAMP
          WHERE user_id = :userId
            AND NVL(account_status, 'ACTIVE') <> 'DISABLED'`, { userId });
        if (result.rowsAffected) {
          await c.execute(`UPDATE bes_user_roles
            SET is_active = 'N',
                updated_at = SYSTIMESTAMP
            WHERE user_id = :userId
              AND is_active = 'Y'`, { userId });
          await c.execute(`DELETE FROM bes_auth_sessions WHERE user_id = :userId`, { userId });
        }
        await c.commit();
        return result.rowsAffected ?? 0;
      });
      return deleted > 0 ? json(res, 200, { ok: true }) : json(res, 404, { error: 'User not found or already deleted.' });
    }
    if (req.method === 'GET' && req.url === '/api/admin/roles-permissions') {
      const result = await withConnection(async (c) => {
        const roles = await c.execute(`SELECT role_code, role_name FROM bes_roles WHERE is_active='Y' ORDER BY sort_order, role_name`);
        const permissions = await c.execute(`SELECT permission_code, permission_name FROM bes_permissions WHERE is_active='Y' ORDER BY sort_order, permission_name`);
        const matrix = await c.execute(`SELECT role_code, permission_code, is_granted FROM bes_role_permissions ORDER BY role_code, permission_code`);
        const assignments = await c.execute(`SELECT u.username, u.first_name, u.last_name, ur.role_code, ur.scope_department_code, ur.scope_unit_name, ur.assignment_note
            FROM bes_user_roles ur
            JOIN bes_users u ON u.user_id = ur.user_id
            JOIN bes_roles r ON r.role_code = ur.role_code
            WHERE ur.is_active='Y'
            ORDER BY u.last_name, u.first_name, r.sort_order, ur.scope_department_code`);
        const factors = await c.execute(`SELECT factor_name FROM (
            SELECT 'Employment Status' factor_name, 10 sort_order FROM dual UNION ALL
            SELECT 'Department', 20 FROM dual UNION ALL
            SELECT 'Unit', 30 FROM dual UNION ALL
            SELECT 'Position', 40 FROM dual UNION ALL
            SELECT 'Approval Authority', 50 FROM dual UNION ALL
            SELECT 'Special Assignment', 60 FROM dual UNION ALL
            SELECT 'Committee Membership', 70 FROM dual
          ) ORDER BY sort_order`);
        return { roles, permissions, matrix, assignments, factors };
      });
      return json(res, 200, {
        factors: result.factors.rows.map((r) => r.FACTOR_NAME),
        roles: result.roles.rows.map((r) => ({ code: r.ROLE_CODE, name: r.ROLE_NAME })),
        permissions: result.permissions.rows.map((r) => ({ code: r.PERMISSION_CODE, name: r.PERMISSION_NAME })),
        matrix: result.matrix.rows.map((r) => ({ roleCode: r.ROLE_CODE, permissionCode: r.PERMISSION_CODE, granted: r.IS_GRANTED === 'Y' })),
        assignments: result.assignments.rows.map((r) => ({
          username: r.USERNAME,
          name: `${r.FIRST_NAME} ${r.LAST_NAME}`,
          roleCode: r.ROLE_CODE,
          departmentCode: r.SCOPE_DEPARTMENT_CODE,
          unitName: r.SCOPE_UNIT_NAME,
          note: r.ASSIGNMENT_NOTE,
        })),
      });
    }
    if (req.method === 'GET' && req.url === '/api/admin/database-sync/local-tables') {
      const admin = await requireAdministrator(bearerToken(req));
      if (!admin) return json(res, 403, { error: 'Administrator access is required for database sync.' });
      const tables = await withConnection((c) => listSyncTables(c));
      return json(res, 200, {
        tables,
        excludedTables: [
          { tableName: 'BES_AUTH_SESSIONS', reason: 'Live login sessions are not copied between environments.' },
          { tableName: 'BES_PASSWORD_RESETS', reason: 'Password reset hashes are not copied between environments.' },
        ],
      });
    }
    if (req.method === 'POST' && req.url === '/api/admin/database-sync/test') {
      const admin = await requireAdministrator(bearerToken(req));
      if (!admin) return json(res, 403, { error: 'Administrator access is required for database sync.' });
      const body = await readBody(req);
      const target = await oracledb.getConnection(oracleTargetConfig(body.connection ?? body));
      try {
        const result = await target.execute(`SELECT
            SYS_CONTEXT('USERENV','DB_NAME') db_name,
            SYS_CONTEXT('USERENV','CON_NAME') container_name,
            SYS_CONTEXT('USERENV','CURRENT_SCHEMA') schema_name
          FROM dual`);
        return json(res, 200, {
          ok: true,
          database: result.rows[0]?.DB_NAME,
          container: result.rows[0]?.CONTAINER_NAME,
          schema: result.rows[0]?.SCHEMA_NAME,
        });
      } finally {
        await target.close();
      }
    }
    if (req.method === 'POST' && req.url === '/api/admin/database-sync/run') {
      const admin = await requireAdministrator(bearerToken(req));
      if (!admin) return json(res, 403, { error: 'Administrator access is required for database sync.' });
      const body = await readBody(req);
      const startedAt = new Date().toISOString();
      const direction = normalize(body.direction || 'push').toLowerCase();
      const tables = await syncOracleTables(body.connection ?? body.target ?? {}, body.tables, direction);
      return json(res, 200, { ok: true, startedAt, finishedAt: new Date().toISOString(), tables });
    }
    if (req.method === 'POST' && req.url === '/api/admin/database-sync/push-schema') {
      const admin = await requireAdministrator(bearerToken(req));
      if (!admin) return json(res, 403, { error: 'Administrator access is required for database schema sync.' });
      const body = await readBody(req);
      const startedAt = new Date().toISOString();
      const tables = await pushOracleSchema(body.connection ?? body.target ?? {}, body.tables);
      return json(res, 200, { ok: true, startedAt, finishedAt: new Date().toISOString(), tables });
    }
    if (req.method === 'GET' && req.url === '/api/hro/recruitment') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        return loadRecruitmentRecords(c);
      });
      return result ? json(res, 200, { records: result }) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'GET' && req.url === '/api/hro/recruitment-positions') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        return c.execute(`SELECT position_name
          FROM bes_hro_recruitment_positions
          WHERE is_active = 'Y'
          ORDER BY UPPER(position_name)`);
      });
      return result ? json(res, 200, { positions: result.rows.map((row) => row.POSITION_NAME) }) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'POST' && req.url === '/api/hro/recruitment-positions') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const body = await readBody(req);
      const positionName = normalize(body.positionName);
      if (!positionName) return json(res, 400, { error: 'Enter a position name.' });
      if (positionName.length > 200) return json(res, 400, { error: 'Position name must be 200 characters or fewer.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const existing = await c.execute(`SELECT position_name FROM bes_hro_recruitment_positions
          WHERE UPPER(position_name) = UPPER(:positionName) AND is_active = 'Y'`, { positionName });
        if (existing.rows[0]) return { positionName: existing.rows[0].POSITION_NAME, created: false };
        await c.execute(`INSERT INTO bes_hro_recruitment_positions (position_name, created_by_user_id)
          VALUES (:positionName, :createdByUserId)`, { positionName, createdByUserId: user.USER_ID });
        await c.commit();
        return { positionName, created: true };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, result.created ? 201 : 200, { positionName: result.positionName });
    }
    if (req.method === 'POST' && req.url === '/api/hro/recruitment/archive') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const body = await readBody(req);
      const sourceTaskUid = normalize(body.sourceTaskId);
      const status = normalize(body.status) || 'Received';
      const allowedStatuses = new Set(['Received', 'For Screening', 'For Interview', 'Qualified', 'Not Qualified', 'Applicant Pool', 'Hired', 'Withdrawn']);
      if (!sourceTaskUid) return json(res, 400, { error: 'Source task is required.' });
      if (!allowedStatuses.has(status)) return json(res, 400, { error: 'Select a valid recruitment status.' });
      const positionApplying = nullableNormalize(body.positionApplying);
      const remarks = normalize(body.remarks);
      const lastName = normalize(body.lastName);
      const firstName = normalize(body.firstName);
      const middleName = nullableNormalize(body.middleName);
      const suffix = nullableNormalize(body.suffix);
      const birthDate = nullableNormalize(body.birthDate);
      const sex = nullableNormalize(body.sex);
      const civilStatus = nullableNormalize(body.civilStatus);
      const email = nullableNormalize(body.email);
      const mobileNo = nullableNormalize(body.mobileNo);
      const municipality = nullableNormalize(body.municipality);
      const barangay = nullableNormalize(body.barangay);
      const address = nullableNormalize(body.address);
      const highestEducation = nullableNormalize(body.highestEducation);
      const schoolName = nullableNormalize(body.schoolName);
      const yearGraduated = nullableNormalize(body.yearGraduated);
      const applicationSource = nullableNormalize(body.applicationSource);
      if (!lastName || !firstName) return json(res, 400, { error: 'Applicant first name and last name are required.' });
      if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return json(res, 400, { error: 'Select a valid birth date.' });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid applicant email address.' });
      if (yearGraduated && !/^\d{4}$/.test(yearGraduated)) return json(res, 400, { error: 'Year graduated must contain four digits.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const task = await c.execute(`SELECT task_id, task_uid
          FROM bes_work_tasks
          WHERE task_uid = :sourceTaskUid
            AND is_active = 'Y'
            AND LOWER(TRIM(task_subject)) = 'application letter'`, { sourceTaskUid });
        if (!task.rows[0]) return false;
        const existing = await c.execute(`SELECT recruitment_uid
          FROM bes_hro_recruitment_and_onboarding
          WHERE source_task_uid = :sourceTaskUid`, { sourceTaskUid });
        const recruitmentUid = existing.rows[0]?.RECRUITMENT_UID ?? `HRO-APP-${task.rows[0].TASK_ID}`;
        const binds = {
          recruitmentUid, status, positionApplying,
          remarks: remarks ? { val: remarks, type: oracledb.CLOB } : null,
          lastName, firstName, middleName, suffix, birthDate, sex, civilStatus, email, mobileNo,
          municipality, barangay, address, highestEducation, schoolName, yearGraduated, applicationSource,
          updatedByUserId: user.USER_ID,
        };
        if (existing.rows[0]) {
          await c.execute(`UPDATE bes_hro_recruitment_and_onboarding SET
              workflow_status = :status, action_taken = 'Archived from Recruitment Task',
              position_applying = :positionApplying, remarks = :remarks,
              last_name = :lastName, first_name = :firstName, middle_name = :middleName, suffix = :suffix,
              birth_date = CASE WHEN :birthDate IS NULL THEN NULL ELSE TO_DATE(:birthDate, 'YYYY-MM-DD') END,
              sex = :sex, civil_status = :civilStatus, email = :email, mobile_no = :mobileNo,
              municipality = :municipality, barangay = :barangay, address = :address,
              highest_education = :highestEducation, school_name = :schoolName,
              year_graduated = :yearGraduated, application_source = :applicationSource,
              is_active = 'Y', updated_by_user_id = :updatedByUserId, updated_at = SYSTIMESTAMP
            WHERE recruitment_uid = :recruitmentUid`, binds);
        } else {
          await c.execute(`INSERT INTO bes_hro_recruitment_and_onboarding
              (recruitment_uid, source_task_uid, workflow_status, action_taken, position_applying, remarks,
               last_name, first_name, middle_name, suffix, birth_date, sex, civil_status, email, mobile_no,
               municipality, barangay, address, highest_education, school_name, year_graduated,
               application_source, updated_by_user_id, is_active)
            VALUES
              (:recruitmentUid, :sourceTaskUid, :status, 'Archived from Recruitment Task', :positionApplying, :remarks,
               :lastName, :firstName, :middleName, :suffix,
               CASE WHEN :birthDate IS NULL THEN NULL ELSE TO_DATE(:birthDate, 'YYYY-MM-DD') END,
               :sex, :civilStatus, :email, :mobileNo, :municipality, :barangay, :address,
               :highestEducation, :schoolName, :yearGraduated, :applicationSource, :updatedByUserId, 'Y')`, { ...binds, sourceTaskUid });
        }
        await c.commit();
        return (await loadRecruitmentRecords(c)).find((record) => record.id === recruitmentUid);
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Application Letter task not found.' });
      return json(res, 201, { record: result });
    }
    const recruitmentCommentMatch = url.pathname.match(/^\/api\/hro\/recruitment\/([^/]+)\/comments$/);
    if (req.method === 'POST' && recruitmentCommentMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const recruitmentUid = decodeURIComponent(recruitmentCommentMatch[1]);
      const body = await readBody(req);
      const message = normalize(body.message);
      if (!message) return json(res, 400, { error: 'Enter a comment.' });
      if (message.length > 10000) return json(res, 400, { error: 'Comment must be 10,000 characters or fewer.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const found = await c.execute(`SELECT recruitment_uid FROM bes_hro_recruitment_and_onboarding WHERE recruitment_uid = :recruitmentUid`, { recruitmentUid });
        if (!found.rows[0]) return false;
        const commentUid = `HRO-CMT-${Date.now()}`;
        await c.execute(`INSERT INTO bes_hro_recruitment_comments
          (comment_uid, recruitment_uid, author_user_id, message)
          VALUES (:commentUid, :recruitmentUid, :authorUserId, :message)`, {
          commentUid,
          recruitmentUid,
          authorUserId: user.USER_ID,
          message: { val: message, type: oracledb.CLOB },
        });
        await c.execute(`UPDATE bes_hro_recruitment_and_onboarding SET updated_at = SYSTIMESTAMP WHERE recruitment_uid = :recruitmentUid`, { recruitmentUid });
        await c.commit();
        const created = await c.execute(`SELECT c.*,
            u.username author_username, u.first_name author_first_name, u.last_name author_last_name
          FROM bes_hro_recruitment_comments c
          LEFT JOIN bes_users u ON u.user_id = c.author_user_id
          WHERE c.comment_uid = :commentUid`, { commentUid });
        return recruitmentComment(created.rows[0]);
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Recruitment record not found.' });
      return json(res, 201, { comment: result });
    }
    const recruitmentMatch = url.pathname.match(/^\/api\/hro\/recruitment\/([^/]+)$/);
    if (req.method === 'DELETE' && recruitmentMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const recruitmentUid = decodeURIComponent(recruitmentMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const removed = await c.execute(`UPDATE bes_hro_recruitment_and_onboarding SET
            is_active = 'N',
            updated_by_user_id = :updatedByUserId,
            updated_at = SYSTIMESTAMP
          WHERE recruitment_uid = :recruitmentUid
            AND is_active = 'Y'`, {
          updatedByUserId: user.USER_ID,
          recruitmentUid,
        });
        if (!removed.rowsAffected) return false;
        await c.commit();
        return true;
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Recruitment record not found.' });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'PATCH' && recruitmentMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const recruitmentUid = decodeURIComponent(recruitmentMatch[1]);
      const body = await readBody(req);
      const status = normalize(body.status);
      const allowedStatuses = new Set(['Received', 'For Screening', 'For Interview', 'Qualified', 'Not Qualified', 'Applicant Pool', 'Hired', 'Withdrawn']);
      if (!allowedStatuses.has(status)) return json(res, 400, { error: 'Select a valid recruitment status.' });
      const actionTaken = nullableNormalize(body.actionTaken);
      const positionApplying = nullableNormalize(body.positionApplying);
      const remarks = normalize(body.remarks);
      const lastName = normalize(body.lastName);
      const firstName = normalize(body.firstName);
      const middleName = nullableNormalize(body.middleName);
      const suffix = nullableNormalize(body.suffix);
      const birthDate = nullableNormalize(body.birthDate);
      const sex = nullableNormalize(body.sex);
      const civilStatus = nullableNormalize(body.civilStatus);
      const email = nullableNormalize(body.email);
      const mobileNo = nullableNormalize(body.mobileNo);
      const municipality = nullableNormalize(body.municipality);
      const barangay = nullableNormalize(body.barangay);
      const address = nullableNormalize(body.address);
      const highestEducation = nullableNormalize(body.highestEducation);
      const schoolName = nullableNormalize(body.schoolName);
      const yearGraduated = nullableNormalize(body.yearGraduated);
      const applicationSource = nullableNormalize(body.applicationSource);
      if (!lastName || !firstName) return json(res, 400, { error: 'Applicant first name and last name are required.' });
      if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return json(res, 400, { error: 'Select a valid birth date.' });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid applicant email address.' });
      if (yearGraduated && !/^\d{4}$/.test(yearGraduated)) return json(res, 400, { error: 'Year graduated must contain four digits.' });
      if (actionTaken === 'Archive to Pool of Applicants' && !positionApplying) {
        return json(res, 400, { error: 'Position Applying is required when archiving an applicant to the pool.' });
      }
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const updated = await c.execute(`UPDATE bes_hro_recruitment_and_onboarding SET
            workflow_status = :status,
            action_taken = :actionTaken,
            position_applying = :positionApplying,
            remarks = :remarks,
            last_name = :lastName,
            first_name = :firstName,
            middle_name = :middleName,
            suffix = :suffix,
            birth_date = CASE WHEN :birthDate IS NULL THEN NULL ELSE TO_DATE(:birthDate, 'YYYY-MM-DD') END,
            sex = :sex,
            civil_status = :civilStatus,
            email = :email,
            mobile_no = :mobileNo,
            municipality = :municipality,
            barangay = :barangay,
            address = :address,
            highest_education = :highestEducation,
            school_name = :schoolName,
            year_graduated = :yearGraduated,
            application_source = :applicationSource,
            updated_by_user_id = :updatedByUserId,
            updated_at = SYSTIMESTAMP
          WHERE recruitment_uid = :recruitmentUid`, {
          status,
          actionTaken,
          positionApplying,
          remarks: remarks ? { val: remarks, type: oracledb.CLOB } : null,
          lastName,
          firstName,
          middleName,
          suffix,
          birthDate,
          sex,
          civilStatus,
          email,
          mobileNo,
          municipality,
          barangay,
          address,
          highestEducation,
          schoolName,
          yearGraduated,
          applicationSource,
          updatedByUserId: user.USER_ID,
          recruitmentUid,
        });
        if (!updated.rowsAffected) return false;
        await c.commit();
        return (await loadRecruitmentRecords(c)).find((record) => record.id === recruitmentUid);
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Recruitment record not found.' });
      return json(res, 200, { record: result });
    }
    const hroToolTaskCollectionMatch = url.pathname.match(/^\/api\/hro\/tool-task-processing\/([^/]+)$/);
    if (req.method === 'GET' && hroToolTaskCollectionMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const moduleId = decodeURIComponent(hroToolTaskCollectionMatch[1]);
      const config = HRO_TOOL_TASK_CONFIG[moduleId];
      if (!config) return json(res, 404, { error: 'Human Resource Office tool not found.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        await c.execute(`INSERT INTO ${config.table} (source_task_uid, workflow_status)
          SELECT t.task_uid, 'Received'
          FROM bes_work_tasks t
          WHERE t.is_active = 'Y'
            AND LOWER(TRIM(t.task_subject)) = :subject
            AND NOT EXISTS (SELECT 1 FROM ${config.table} p WHERE p.source_task_uid = t.task_uid)`, { subject: config.subject });
        await c.commit();
        return c.execute(`SELECT source_task_uid, workflow_status, action_taken, updated_at
          FROM ${config.table}
          ORDER BY updated_at DESC`);
      });
      return result ? json(res, 200, { records: result.rows.map(policyTaskProcessing) }) : json(res, 401, { error: 'Session expired.' });
    }
    const hroToolTaskItemMatch = url.pathname.match(/^\/api\/hro\/tool-task-processing\/([^/]+)\/([^/]+)$/);
    if (req.method === 'PATCH' && hroToolTaskItemMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const moduleId = decodeURIComponent(hroToolTaskItemMatch[1]);
      const taskUid = decodeURIComponent(hroToolTaskItemMatch[2]);
      const config = HRO_TOOL_TASK_CONFIG[moduleId];
      if (!config) return json(res, 404, { error: 'Human Resource Office tool not found.' });
      const body = await readBody(req);
      const status = normalize(body.status);
      const actionTaken = normalize(body.actionTaken);
      const allowedStatuses = new Set(['Received', 'Under Review', 'For Approval', 'Approved', 'Issued', 'Completed', 'Returned']);
      if (!allowedStatuses.has(status)) return json(res, 400, { error: 'Select a valid processing status.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const found = await c.execute(`SELECT task_uid FROM bes_work_tasks
          WHERE task_uid = :taskUid AND is_active = 'Y' AND LOWER(TRIM(task_subject)) = :subject`, { taskUid, subject: config.subject });
        if (!found.rows[0]) return false;
        await c.execute(`MERGE INTO ${config.table} p
          USING (SELECT :taskUid source_task_uid FROM dual) src
          ON (p.source_task_uid = src.source_task_uid)
          WHEN MATCHED THEN UPDATE SET p.workflow_status = :status, p.action_taken = :actionTaken,
            p.updated_by_user_id = :updatedByUserId, p.updated_at = SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT (source_task_uid, workflow_status, action_taken, updated_by_user_id)
            VALUES (:taskUid, :status, :actionTaken, :updatedByUserId)`, {
          taskUid,
          status,
          actionTaken: actionTaken ? { val: actionTaken, type: oracledb.CLOB } : null,
          updatedByUserId: user.USER_ID,
        });
        await c.commit();
        const updated = await c.execute(`SELECT source_task_uid, workflow_status, action_taken, updated_at
          FROM ${config.table} WHERE source_task_uid = :taskUid`, { taskUid });
        return updated.rows[0];
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Task not found for this Human Resource Office tool.' });
      return json(res, 200, { record: policyTaskProcessing(result) });
    }
    if (req.method === 'GET' && req.url === '/api/policy-task-processing') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        await c.execute(`INSERT INTO bes_policy_task_processing (source_task_uid, workflow_status)
          SELECT t.task_uid, 'Received'
          FROM bes_work_tasks t
          WHERE t.is_active = 'Y'
            AND LOWER(TRIM(t.task_subject)) = 'policy related'
            AND NOT EXISTS (SELECT 1 FROM bes_policy_task_processing p WHERE p.source_task_uid = t.task_uid)`);
        await c.commit();
        return c.execute(`SELECT source_task_uid, workflow_status, action_taken, updated_at
          FROM bes_policy_task_processing
          ORDER BY updated_at DESC`);
      });
      return result ? json(res, 200, { records: result.rows.map(policyTaskProcessing) }) : json(res, 401, { error: 'Session expired.' });
    }
    const policyTaskProcessingMatch = url.pathname.match(/^\/api\/policy-task-processing\/([^/]+)$/);
    if (req.method === 'PATCH' && policyTaskProcessingMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const taskUid = decodeURIComponent(policyTaskProcessingMatch[1]);
      const body = await readBody(req);
      const status = normalize(body.status);
      const actionTaken = normalize(body.actionTaken);
      const allowedStatuses = new Set(['Received', 'Under Review', 'For Approval', 'Approved', 'Issued', 'Completed', 'Returned']);
      if (!allowedStatuses.has(status)) return json(res, 400, { error: 'Select a valid policy-processing status.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const found = await c.execute(`SELECT task_uid FROM bes_work_tasks
          WHERE task_uid = :taskUid AND is_active = 'Y' AND LOWER(TRIM(task_subject)) = 'policy related'`, { taskUid });
        if (!found.rows[0]) return false;
        await c.execute(`MERGE INTO bes_policy_task_processing p
          USING (SELECT :taskUid source_task_uid FROM dual) src
          ON (p.source_task_uid = src.source_task_uid)
          WHEN MATCHED THEN UPDATE SET p.workflow_status = :status, p.action_taken = :actionTaken,
            p.updated_by_user_id = :updatedByUserId, p.updated_at = SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT (source_task_uid, workflow_status, action_taken, updated_by_user_id)
            VALUES (:taskUid, :status, :actionTaken, :updatedByUserId)`, {
          taskUid,
          status,
          actionTaken: actionTaken ? { val: actionTaken, type: oracledb.CLOB } : null,
          updatedByUserId: user.USER_ID,
        });
        await c.commit();
        const updated = await c.execute(`SELECT source_task_uid, workflow_status, action_taken, updated_at
          FROM bes_policy_task_processing WHERE source_task_uid = :taskUid`, { taskUid });
        return updated.rows[0];
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Policy task not found.' });
      return json(res, 200, { record: policyTaskProcessing(result) });
    }
    if (req.method === 'GET' && req.url === '/api/policy-records') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        return c.execute(`SELECT p.*,
            u.username created_by_username, u.first_name created_by_first_name, u.last_name created_by_last_name
          FROM bes_policy_records p
          LEFT JOIN bes_users u ON u.user_id = p.created_by_user_id
          WHERE p.is_active = 'Y'
          ORDER BY p.effectivity_date DESC, p.title`);
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { records: result.rows.map(policyRecord) });
    }
    if (req.method === 'POST' && req.url === '/api/policy-records') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const body = await readBody(req);
      const title = normalize(body.title);
      const documentNumber = normalize(body.documentNumber);
      const revisionNumber = normalize(body.revisionNumber);
      const effectivityDate = normalize(body.effectivityDate);
      const contents = normalize(body.contents);
      const nature = normalize(body.nature);
      const documentType = normalize(body.documentType);
      const allowedNatures = new Set(['Financial', 'Human Resources', 'Legal and Compliance', 'Public Relations', 'Operations']);
      const allowedDocumentTypes = new Set(['Policy', 'Issuance', 'Guidelines']);
      if (!title || !documentNumber || !revisionNumber || !contents || !/^\d{4}-\d{2}-\d{2}$/.test(effectivityDate) || !allowedNatures.has(nature) || !allowedDocumentTypes.has(documentType)) {
        return json(res, 400, { error: 'Title, document number, document type, revision number, effectivity date, contents, and a valid nature are required.' });
      }
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const duplicate = await c.execute(`SELECT record_uid FROM bes_policy_records WHERE UPPER(document_number) = UPPER(:documentNumber) AND is_active = 'Y'`, { documentNumber });
        if (duplicate.rows[0]) throw Object.assign(new Error('A policy record with that document number already exists.'), { statusCode: 409 });
        const recordUid = `POL-${new Date().getFullYear()}-${Date.now()}`;
        await c.execute(`INSERT INTO bes_policy_records
          (record_uid, title, document_number, document_type, revision_number, effectivity_date, contents, nature,
           created_by_user_id, is_active)
          VALUES
          (:recordUid, :title, :documentNumber, :documentType, :revisionNumber, TO_DATE(:effectivityDate, 'YYYY-MM-DD'), :contents, :nature,
           :createdByUserId, 'Y')`, {
          recordUid,
          title,
          documentNumber,
          documentType,
          revisionNumber,
          effectivityDate,
          contents: { val: contents, type: oracledb.CLOB },
          nature,
          createdByUserId: user.USER_ID,
        });
        await c.commit();
        const created = await c.execute(`SELECT p.*,
            u.username created_by_username, u.first_name created_by_first_name, u.last_name created_by_last_name
          FROM bes_policy_records p
          LEFT JOIN bes_users u ON u.user_id = p.created_by_user_id
          WHERE p.record_uid = :recordUid`, { recordUid });
        return created.rows[0];
      });
      return result ? json(res, 201, { record: policyRecord(result) }) : json(res, 401, { error: 'Session expired.' });
    }
    const policyAttachmentMatch = url.pathname.match(/^\/api\/policy-records\/([^/]+)\/attachment$/);
    if (req.method === 'PUT' && policyAttachmentMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const recordUid = decodeURIComponent(policyAttachmentMatch[1]);
      let originalName = '';
      try { originalName = decodeURIComponent(normalize(req.headers['x-file-name'])); } catch { return json(res, 400, { error: 'The DOCX filename is invalid.' }); }
      const attachmentName = safeFileName(originalName);
      if (!originalName.toLowerCase().endsWith('.docx')) return json(res, 400, { error: 'Only Microsoft Word .docx files can be uploaded to policy records.' });
      const file = await readBinaryBody(req);
      if (!file.length || !isDocxBuffer(file)) return json(res, 400, { error: 'The selected file is not a valid DOCX document.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const updated = await c.execute(`UPDATE bes_policy_records
          SET attachment_name = :attachmentName,
              attachment_mime_type = :attachmentMimeType,
              attachment_size = :attachmentSize,
              attachment_blob = :attachmentBlob,
              attachment_data = NULL,
              updated_at = SYSTIMESTAMP
          WHERE record_uid = :recordUid AND is_active = 'Y'`, {
          attachmentName,
          attachmentMimeType: DOCX_MIME_TYPE,
          attachmentSize: file.length,
          attachmentBlob: { val: file, type: oracledb.BLOB },
          recordUid,
        });
        if (!updated.rowsAffected) return false;
        await c.commit();
        return true;
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Policy record not found.' });
      return json(res, 200, { ok: true, attachmentName, attachmentMimeType: DOCX_MIME_TYPE, attachmentSize: file.length });
    }
    if (req.method === 'GET' && policyAttachmentMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const recordUid = decodeURIComponent(policyAttachmentMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const found = await c.execute(`SELECT attachment_name, attachment_mime_type, attachment_size, attachment_blob, attachment_data
          FROM bes_policy_records
          WHERE record_uid = :recordUid AND is_active = 'Y'`, { recordUid });
        const row = found.rows[0];
        if (!row) return false;
        if (Buffer.isBuffer(row.ATTACHMENT_BLOB)) row.ATTACHMENT_BUFFER = row.ATTACHMENT_BLOB;
        else if (row.ATTACHMENT_BLOB) row.ATTACHMENT_BUFFER = await row.ATTACHMENT_BLOB.getData();
        return row;
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result || (!result.ATTACHMENT_BUFFER && !result.ATTACHMENT_DATA)) return json(res, 404, { error: 'This policy record has no attachment.' });
      const fileName = safeFileName(result.ATTACHMENT_NAME || 'policy-attachment');
      let file = result.ATTACHMENT_BUFFER;
      let legacyMimeType = '';
      if (!file) {
        const match = String(result.ATTACHMENT_DATA).match(/^data:([^;,]+);base64,(.+)$/s);
        if (!match) return json(res, 500, { error: 'The stored attachment is invalid.' });
        legacyMimeType = match[1];
        file = Buffer.from(match[2], 'base64');
      }
      res.writeHead(200, {
        'content-type': result.ATTACHMENT_MIME_TYPE || legacyMimeType || 'application/octet-stream',
        'content-length': String(file.length),
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'cache-control': 'private, no-store',
      });
      return res.end(file);
    }
    const policyRecordMatch = url.pathname.match(/^\/api\/policy-records\/([^/]+)$/);
    if (req.method === 'PATCH' && policyRecordMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const recordUid = decodeURIComponent(policyRecordMatch[1]);
      const body = await readBody(req);
      const title = normalize(body.title);
      const documentNumber = normalize(body.documentNumber);
      const revisionNumber = normalize(body.revisionNumber);
      const effectivityDate = normalize(body.effectivityDate);
      const contents = normalize(body.contents);
      const nature = normalize(body.nature);
      const documentType = normalize(body.documentType);
      const allowedNatures = new Set(['Financial', 'Human Resources', 'Legal and Compliance', 'Public Relations', 'Operations']);
      const allowedDocumentTypes = new Set(['Policy', 'Issuance', 'Guidelines']);
      if (!title || !documentNumber || !revisionNumber || !contents || !/^\d{4}-\d{2}-\d{2}$/.test(effectivityDate) || !allowedNatures.has(nature) || !allowedDocumentTypes.has(documentType)) {
        return json(res, 400, { error: 'Title, document number, document type, revision number, effectivity date, contents, and a valid nature are required.' });
      }
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const duplicate = await c.execute(`SELECT record_uid FROM bes_policy_records
          WHERE UPPER(document_number) = UPPER(:documentNumber) AND record_uid <> :recordUid AND is_active = 'Y'`, { documentNumber, recordUid });
        if (duplicate.rows[0]) throw Object.assign(new Error('Another policy record already uses that document number.'), { statusCode: 409 });
        const updated = await c.execute(`UPDATE bes_policy_records SET
            title = :title,
            document_number = :documentNumber,
            document_type = :documentType,
            revision_number = :revisionNumber,
            effectivity_date = TO_DATE(:effectivityDate, 'YYYY-MM-DD'),
            contents = :contents,
            nature = :nature,
            updated_at = SYSTIMESTAMP
          WHERE record_uid = :recordUid AND is_active = 'Y'`, {
          title,
          documentNumber,
          documentType,
          revisionNumber,
          effectivityDate,
          contents: { val: contents, type: oracledb.CLOB },
          nature,
          recordUid,
        });
        if (!updated.rowsAffected) return false;
        await c.commit();
        const found = await c.execute(`SELECT p.*,
            u.username created_by_username, u.first_name created_by_first_name, u.last_name created_by_last_name
          FROM bes_policy_records p
          LEFT JOIN bes_users u ON u.user_id = p.created_by_user_id
          WHERE p.record_uid = :recordUid`, { recordUid });
        return found.rows[0];
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Policy record not found.' });
      return json(res, 200, { record: policyRecord(result) });
    }
    if (req.method === 'DELETE' && policyRecordMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const recordUid = decodeURIComponent(policyRecordMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const deleted = await c.execute(`UPDATE bes_policy_records
          SET is_active = 'N', updated_at = SYSTIMESTAMP
          WHERE record_uid = :recordUid AND is_active = 'Y'`, { recordUid });
        if (!deleted.rowsAffected) return false;
        await c.commit();
        return true;
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Policy record not found.' });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/api/calendar/events') {
      const token = bearerToken(req);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        return c.execute(`SELECT e.*, u.username owner_username, du.username done_by_username
          FROM bes_calendar_events e
          LEFT JOIN bes_users u ON u.user_id = e.owner_user_id
          LEFT JOIN bes_users du ON du.user_id = e.done_by_user_id
          WHERE e.is_active = 'Y'
            AND (
              e.visibility IS NULL
              OR e.visibility = 'All employees'
              OR (:userId IS NOT NULL AND e.owner_user_id = :userId)
              OR (:departmentCode IS NOT NULL AND e.visibility = 'Department only' AND INSTR('|' || NVL(e.department_code, '') || '|', '|' || :departmentCode || '|') > 0)
              OR (:username IS NOT NULL AND e.visibility = 'Specific people' AND INSTR('|' || NVL(e.visible_to_users, '') || '|', '|' || :username || '|') > 0)
            )
          ORDER BY e.start_at, e.title`, {
          userId: user?.USER_ID ?? null,
          username: user?.USERNAME ?? null,
          departmentCode: user?.DEPARTMENT_CODE ?? null,
        });
      });
      return json(res, 200, { events: result.rows.map(calendarEvent) });
    }
    if (req.method === 'GET' && req.url === '/api/work/tasks') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const tasks = await c.execute(`SELECT t.*,
            au.username assigned_to_username, au.first_name assigned_to_first_name, au.last_name assigned_to_last_name,
            cu.username created_by_username, cu.first_name created_by_first_name, cu.last_name created_by_last_name
          FROM bes_work_tasks t
          LEFT JOIN bes_users au ON au.user_id = t.assigned_to_user_id
          LEFT JOIN bes_users cu ON cu.user_id = t.created_by_user_id
          WHERE t.is_active = 'Y'
            AND (
              t.assigned_to_user_id = :userId
              OR t.created_by_user_id = :userId
              OR (:departmentCode IS NOT NULL AND t.department_code = :departmentCode)
            )
          ORDER BY NVL(t.due_date, TRUNC(t.created_at)) DESC, t.created_at DESC`, {
          userId: user.USER_ID,
          departmentCode: user.DEPARTMENT_CODE ?? null,
        });
        const comments = await c.execute(`SELECT wc.*,
            au.username author_username, au.first_name author_first_name, au.last_name author_last_name
          FROM bes_work_comments wc
          JOIN bes_work_tasks t ON t.task_uid = wc.task_uid
          LEFT JOIN bes_users au ON au.user_id = wc.author_user_id
          WHERE t.is_active = 'Y'
            AND (
              t.assigned_to_user_id = :userId
              OR t.created_by_user_id = :userId
              OR (:departmentCode IS NOT NULL AND t.department_code = :departmentCode)
            )
          ORDER BY wc.created_at`, {
          userId: user.USER_ID,
          departmentCode: user.DEPARTMENT_CODE ?? null,
        });
        return { user, tasks, comments };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      const commentsByTask = new Map();
      for (const row of result.comments.rows) {
        const rows = commentsByTask.get(row.TASK_UID) ?? [];
        rows.push(row);
        commentsByTask.set(row.TASK_UID, rows);
      }
      return json(res, 200, { tasks: result.tasks.rows.map((row) => workTask(row, result.user.USER_ID, nestComments(commentsByTask.get(row.TASK_UID) ?? []))) });
    }
    const workCommentMatch = url.pathname.match(/^\/api\/work\/tasks\/([^/]+)\/comments(?:\/([^/]+))?$/);
    if (req.method === 'POST' && workCommentMatch && !workCommentMatch[2]) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const taskUid = decodeURIComponent(workCommentMatch[1]);
      const body = await readBody(req);
      const message = normalize(body.message);
      const parentCommentId = nullableNormalize(body.parentCommentId);
      if (!message) return json(res, 400, { error: 'Comment message is required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const task = await c.execute(`SELECT task_uid FROM bes_work_tasks WHERE task_uid = :taskUid AND is_active = 'Y'`, { taskUid });
        if (!task.rows[0]) {
          const error = new Error('Task not found.');
          error.statusCode = 404;
          throw error;
        }
        if (parentCommentId) {
          const parent = await c.execute(`SELECT comment_uid FROM bes_work_comments WHERE comment_uid = :parentCommentId AND task_uid = :taskUid`, { parentCommentId, taskUid });
          if (!parent.rows[0]) {
            const error = new Error('Parent comment not found.');
            error.statusCode = 400;
            throw error;
          }
        }
        const commentUid = `CMT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await c.execute(`INSERT INTO bes_work_comments (comment_uid, task_uid, parent_comment_uid, author_user_id, message)
          VALUES (:commentUid, :taskUid, :parentCommentId, :authorUserId, :message)`, {
          commentUid, taskUid, parentCommentId, authorUserId: user.USER_ID, message,
        });
        await c.commit();
        const created = await c.execute(`SELECT wc.*,
            au.username author_username, au.first_name author_first_name, au.last_name author_last_name
          FROM bes_work_comments wc
          LEFT JOIN bes_users au ON au.user_id = wc.author_user_id
          WHERE wc.comment_uid = :commentUid`, { commentUid });
        return created.rows[0];
      });
      return result ? json(res, 201, { comment: commentFromRow(result) }) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'DELETE' && workCommentMatch?.[2]) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const taskUid = decodeURIComponent(workCommentMatch[1]);
      const commentUid = decodeURIComponent(workCommentMatch[2]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const found = await c.execute(`SELECT author_user_id FROM bes_work_comments WHERE task_uid = :taskUid AND comment_uid = :commentUid`, { taskUid, commentUid });
        const row = found.rows[0];
        if (!row) {
          const error = new Error('Comment not found.');
          error.statusCode = 404;
          throw error;
        }
        if (Number(row.AUTHOR_USER_ID) !== Number(user.USER_ID) && !isTaskModerator(user)) {
          const error = new Error('You can delete only your own comments.');
          error.statusCode = 403;
          throw error;
        }
        await c.execute(`UPDATE bes_work_comments SET is_deleted = 'Y', message = NULL, updated_at = SYSTIMESTAMP WHERE task_uid = :taskUid AND comment_uid = :commentUid`, { taskUid, commentUid });
        await c.commit();
        return true;
      });
      return result ? json(res, 200, { ok: true }) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'PATCH' && workCommentMatch?.[2]) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const taskUid = decodeURIComponent(workCommentMatch[1]);
      const commentUid = decodeURIComponent(workCommentMatch[2]);
      const body = await readBody(req);
      const message = normalize(body.message);
      if (!message) return json(res, 400, { error: 'Comment message is required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const found = await c.execute(`SELECT author_user_id FROM bes_work_comments WHERE task_uid = :taskUid AND comment_uid = :commentUid AND is_deleted = 'N'`, { taskUid, commentUid });
        const row = found.rows[0];
        if (!row) {
          const error = new Error('Comment not found.');
          error.statusCode = 404;
          throw error;
        }
        if (Number(row.AUTHOR_USER_ID) !== Number(user.USER_ID) && !isTaskModerator(user)) {
          const error = new Error('You can edit only your own comments.');
          error.statusCode = 403;
          throw error;
        }
        await c.execute(`UPDATE bes_work_comments SET message = :message, updated_at = SYSTIMESTAMP WHERE task_uid = :taskUid AND comment_uid = :commentUid`, { message, taskUid, commentUid });
        await c.commit();
        const updated = await c.execute(`SELECT wc.*,
            au.username author_username, au.first_name author_first_name, au.last_name author_last_name
          FROM bes_work_comments wc
          LEFT JOIN bes_users au ON au.user_id = wc.author_user_id
          WHERE wc.comment_uid = :commentUid`, { commentUid });
        return updated.rows[0];
      });
      return result ? json(res, 200, { comment: commentFromRow(result) }) : json(res, 401, { error: 'Session expired.' });
    }
    const workTaskMatch = url.pathname.match(/^\/api\/work\/tasks\/([^/]+)$/);
    if (req.method === 'PATCH' && workTaskMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const taskUid = decodeURIComponent(workTaskMatch[1]);
      const body = await readBody(req);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const found = await c.execute(`SELECT created_by_user_id, assigned_to_user_id FROM bes_work_tasks WHERE task_uid = :taskUid AND is_active = 'Y'`, { taskUid });
        const task = found.rows[0];
        if (!task) {
          const error = new Error('Task not found.');
          error.statusCode = 404;
          throw error;
        }
        const canUpdate = Number(task.CREATED_BY_USER_ID) === Number(user.USER_ID)
          || Number(task.ASSIGNED_TO_USER_ID) === Number(user.USER_ID)
          || isTaskModerator(user);
        if (!canUpdate) {
          const error = new Error('You are not allowed to update this task.');
          error.statusCode = 403;
          throw error;
        }
        const priority = ['Low', 'Normal', 'High', 'Urgent'].includes(normalize(body.priority)) ? normalize(body.priority) : null;
        const status = ['In Progress', 'Completed', 'Cancelled', 'Returned'].includes(normalize(body.status)) ? normalize(body.status) : null;
        const dueDate = normalize(body.dueDate);
        const attachments = Array.isArray(body.attachments)
          ? JSON.stringify(workTaskAttachmentPaths(taskUid, body.attachments))
          : null;
        await c.execute(`UPDATE bes_work_tasks SET
            title = COALESCE(:title, title),
            description = :description,
            control_number = :controlNumber,
            office_assignment = :officeAssignment,
            task_subject = :taskSubject,
            municipality = :municipality,
            barangay = :barangay,
            address = :address,
            attachments = CASE WHEN :attachments IS NULL THEN attachments ELSE :attachments END,
            priority = COALESCE(:priority, priority),
            status = COALESCE(:status, status),
            due_date = CASE WHEN :dueDate IS NULL THEN due_date ELSE TO_DATE(:dueDate, 'YYYY-MM-DD') END,
            updated_at = SYSTIMESTAMP
          WHERE task_uid = :taskUid`, {
          title: nullableNormalize(body.title),
          description: nullableNormalize(body.description),
          controlNumber: nullableNormalize(body.controlNumber),
          officeAssignment: nullableNormalize(body.officeAssignment),
          taskSubject: nullableNormalize(body.taskSubject),
          municipality: nullableNormalize(body.municipality),
          barangay: nullableNormalize(body.barangay),
          address: nullableNormalize(body.address),
          attachments,
          priority,
          status,
          dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null,
          taskUid,
        });
        await c.commit();
        const updated = await c.execute(`SELECT t.*,
            au.username assigned_to_username, au.first_name assigned_to_first_name, au.last_name assigned_to_last_name,
            cu.username created_by_username, cu.first_name created_by_first_name, cu.last_name created_by_last_name
          FROM bes_work_tasks t
          LEFT JOIN bes_users au ON au.user_id = t.assigned_to_user_id
          LEFT JOIN bes_users cu ON cu.user_id = t.created_by_user_id
          WHERE t.task_uid = :taskUid`, { taskUid });
        return { user, task: updated.rows[0] };
      });
      return result ? json(res, 200, { task: workTask(result.task, result.user.USER_ID) }) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'POST' && req.url === '/api/work/tasks') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const body = await readBody(req);
      const title = normalize(body.title);
      const assigneeUsername = normalize(body.assigneeUsername).toLowerCase();
      if (!title || !assigneeUsername) return json(res, 400, { error: 'Task title and assignee are required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const assignee = await c.execute(`SELECT user_id FROM bes_users WHERE LOWER(username) = :username AND account_status = 'ACTIVE'`, { username: assigneeUsername });
        const assigneeRow = assignee.rows[0];
        if (!assigneeRow) {
          const error = new Error('Assignee not found or inactive.');
          error.statusCode = 400;
          throw error;
        }
        const taskUid = `TASK-${new Date().getFullYear()}-${Date.now()}`;
        const priority = ['Low', 'Normal', 'High', 'Urgent'].includes(normalize(body.priority)) ? normalize(body.priority) : 'Normal';
        const dueDate = normalize(body.dueDate);
        const attachments = JSON.stringify(workTaskAttachmentPaths(taskUid, body.attachments));
        await c.execute(`INSERT INTO bes_work_tasks
          (task_uid, calendar_event_uid, control_number, title, description, department_code, office_assignment, task_subject, municipality, barangay, address, attachments, priority, status, due_date, assigned_to_user_id, created_by_user_id, is_active)
          VALUES
          (:taskUid, :calendarEventUid, :controlNumber, :title, :description, :departmentCode, :officeAssignment, :taskSubject, :municipality, :barangay, :address, :attachments, :priority, 'In Progress',
           CASE WHEN :dueDate IS NULL THEN NULL ELSE TO_DATE(:dueDate, 'YYYY-MM-DD') END,
           :assignedToUserId, :createdByUserId, 'Y')`, {
          taskUid,
          calendarEventUid: nullableNormalize(body.calendarEventId),
          controlNumber: nullableNormalize(body.controlNumber),
          title,
          description: nullableNormalize(body.description),
          departmentCode: nullableNormalize(body.departmentId)?.toUpperCase() ?? user.DEPARTMENT_CODE ?? null,
          officeAssignment: nullableNormalize(body.officeAssignment),
          taskSubject: nullableNormalize(body.taskSubject),
          municipality: nullableNormalize(body.municipality),
          barangay: nullableNormalize(body.barangay),
          address: nullableNormalize(body.address),
          attachments,
          priority,
          dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null,
          assignedToUserId: assigneeRow.USER_ID,
          createdByUserId: user.USER_ID,
        });
        await c.commit();
        const created = await c.execute(`SELECT t.*,
            au.username assigned_to_username, au.first_name assigned_to_first_name, au.last_name assigned_to_last_name,
            cu.username created_by_username, cu.first_name created_by_first_name, cu.last_name created_by_last_name
          FROM bes_work_tasks t
          LEFT JOIN bes_users au ON au.user_id = t.assigned_to_user_id
          LEFT JOIN bes_users cu ON cu.user_id = t.created_by_user_id
          WHERE t.task_uid = :taskUid`, { taskUid });
        return { user, task: created.rows[0] };
      });
      return result ? json(res, 201, { task: workTask(result.task, result.user.USER_ID) }) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'POST' && req.url === '/api/calendar/events') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const body = await readBody(req);
      const title = normalize(body.title);
      const startAt = toDbTimestamp(body.start);
      const endAt = toDbTimestamp(body.end);
      if (!title || !startAt || !endAt) return json(res, 400, { error: 'Title, start, and end are required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const eventUid = `EVT-P-${Date.now()}-${Math.round(Math.random() * 1e5)}`;
        const layer = calendarLayer(body.layer);
        const color = calendarColor(layer, body.color);
        const visibility = normalize(body.visibility) || 'All employees';
        const visibleToUsers = Array.isArray(body.visibleToUsernames) ? body.visibleToUsernames.map((v) => normalize(v).toLowerCase()).filter(Boolean).join('|') : null;
        const departmentCodes = departmentCodesFromBody(body);
        const officeAssignment = nullableNormalize(body.officeAssignment);
        const attachments = Array.isArray(body.attachments)
          ? JSON.stringify(body.attachments.map((file) => ({
            name: normalize(file.name),
            size: Number(file.size) || 0,
            type: nullableNormalize(file.type),
          })).filter((file) => file.name).slice(0, 20))
          : null;
        await c.execute(`INSERT INTO bes_calendar_events
          (event_uid, title, layer, start_at, end_at, all_day, location, meeting_link, description, attendees,
           attachments, visibility, visible_to_users, department_code, office_assignment, owner_user_id, editable, recurring, color, source_name, is_active)
          VALUES
          (:eventUid, :title, :layer, TO_TIMESTAMP(:startAt, 'YYYY-MM-DD HH24:MI'), TO_TIMESTAMP(:endAt, 'YYYY-MM-DD HH24:MI'),
           :allDay, :location, :meetingLink, :description, :attendees, :attachments, :visibility, :visibleToUsers, :departmentCode, :officeAssignment, :ownerUserId, 'Y', :recurring, :color, 'BES personal calendar', 'Y')`, {
          eventUid,
          title,
          layer,
          color,
          startAt,
          endAt,
          allDay: body.allDay ? 'Y' : 'N',
          location: nullableNormalize(body.location),
          meetingLink: nullableNormalize(body.meetingLink),
          description: nullableNormalize(body.description),
          attendees: Array.isArray(body.attendees) ? body.attendees.map(normalize).filter(Boolean).join('|') : null,
          attachments,
          visibility,
          visibleToUsers,
          departmentCode: departmentCodes.length ? departmentCodes.join('|') : null,
          officeAssignment,
          ownerUserId: user.USER_ID,
          recurring: nullableNormalize(body.recurring) ?? 'none',
        });
        await c.commit();
        const created = await c.execute(`SELECT e.*, u.username owner_username, du.username done_by_username
          FROM bes_calendar_events e
          LEFT JOIN bes_users u ON u.user_id = e.owner_user_id
          LEFT JOIN bes_users du ON du.user_id = e.done_by_user_id
          WHERE e.event_uid = :eventUid`, { eventUid });
        return created.rows[0];
      });
      return result ? json(res, 201, { event: calendarEvent(result) }) : json(res, 401, { error: 'Session expired.' });
    }
    const calendarEventMatch = url.pathname.match(/^\/api\/calendar\/events\/([^/]+)$/);
    const calendarDoneMatch = url.pathname.match(/^\/api\/calendar\/events\/([^/]+)\/done$/);
    if (req.method === 'PATCH' && calendarDoneMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const eventUid = decodeURIComponent(calendarDoneMatch[1]);
      const body = await readBody(req);
      const done = Boolean(body.done);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const updated = await c.execute(`UPDATE bes_calendar_events SET
            is_done = :isDone,
            done_at = CASE WHEN :isDone = 'Y' THEN SYSTIMESTAMP ELSE NULL END,
            done_by_user_id = CASE WHEN :isDone = 'Y' THEN :userId ELSE NULL END,
            updated_at = SYSTIMESTAMP
          WHERE event_uid = :eventUid AND is_active = 'Y'`, {
          eventUid,
          isDone: done ? 'Y' : 'N',
          userId: user.USER_ID,
        });
        await c.commit();
        return Boolean(updated.rowsAffected);
      });
      return result === null ? json(res, 401, { error: 'Session expired.' }) : result ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Event not found.' });
    }
    if (req.method === 'PUT' && calendarEventMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const eventUid = decodeURIComponent(calendarEventMatch[1]);
      const body = await readBody(req);
      const title = normalize(body.title);
      const startAt = toDbTimestamp(body.start);
      const endAt = toDbTimestamp(body.end);
      if (!title || !startAt || !endAt) return json(res, 400, { error: 'Title, start, and end are required.' });
        const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const layer = calendarLayer(body.layer);
        const color = calendarColor(layer, body.color);
        const visibility = normalize(body.visibility) || 'All employees';
        const visibleToUsers = Array.isArray(body.visibleToUsernames) ? body.visibleToUsernames.map((v) => normalize(v).toLowerCase()).filter(Boolean).join('|') : null;
        const departmentCodes = departmentCodesFromBody(body);
        const officeAssignment = nullableNormalize(body.officeAssignment);
        const attachments = Array.isArray(body.attachments)
          ? JSON.stringify(body.attachments.map((file) => ({
            name: normalize(file.name),
            size: Number(file.size) || 0,
            type: nullableNormalize(file.type),
          })).filter((file) => file.name).slice(0, 20))
          : null;
        const updated = await c.execute(`UPDATE bes_calendar_events SET
            title = :title,
            layer = :layer,
            start_at = TO_TIMESTAMP(:startAt, 'YYYY-MM-DD HH24:MI'),
            end_at = TO_TIMESTAMP(:endAt, 'YYYY-MM-DD HH24:MI'),
            all_day = :allDay,
            location = :location,
            meeting_link = :meetingLink,
            description = :description,
            attendees = :attendees,
            attachments = :attachments,
            visibility = :visibility,
            visible_to_users = :visibleToUsers,
            department_code = :departmentCode,
            office_assignment = :officeAssignment,
            recurring = :recurring,
            color = :color,
            updated_at = SYSTIMESTAMP
          WHERE event_uid = :eventUid
            AND (editable = 'N' OR owner_user_id = :ownerUserId)
            AND is_active = 'Y'`, {
          eventUid,
          ownerUserId: user.USER_ID,
          title,
          layer,
          color,
          startAt,
          endAt,
          allDay: body.allDay ? 'Y' : 'N',
          location: nullableNormalize(body.location),
          meetingLink: nullableNormalize(body.meetingLink),
          description: nullableNormalize(body.description),
          attendees: Array.isArray(body.attendees) ? body.attendees.map(normalize).filter(Boolean).join('|') : null,
          attachments,
          visibility,
          visibleToUsers,
          departmentCode: departmentCodes.length ? departmentCodes.join('|') : null,
          officeAssignment,
          recurring: nullableNormalize(body.recurring) ?? 'none',
        });
        if (!updated.rowsAffected) return false;
        await c.commit();
        return true;
      });
      return result === null ? json(res, 401, { error: 'Session expired.' }) : result ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Personal event not found.' });
    }
    if (req.method === 'DELETE' && calendarEventMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const eventUid = decodeURIComponent(calendarEventMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const deleted = await c.execute(`UPDATE bes_calendar_events SET
            is_active = 'N',
            attachments = NULL,
            updated_at = SYSTIMESTAMP
          WHERE event_uid = :eventUid
            AND is_active = 'Y'`, { eventUid });
        await c.commit();
        return Boolean(deleted.rowsAffected);
      });
      return result === null ? json(res, 401, { error: 'Session expired.' }) : result ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Event not found.' });
    }
    if (req.method === 'GET' && req.url === '/api/auth/me') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection((c) => c.execute(`SELECT u.*,
          (SELECT LISTAGG(ur.role_code || NVL2(ur.scope_department_code, ' (' || ur.scope_department_code || ')', ''), '|')
             WITHIN GROUP (ORDER BY r.sort_order, ur.scope_department_code)
           FROM bes_user_roles ur
           JOIN bes_roles r ON r.role_code = ur.role_code
           WHERE ur.user_id = u.user_id AND ur.is_active = 'Y') role_assignments
        FROM bes_users u
        JOIN bes_auth_sessions s ON s.user_id = u.user_id
        WHERE s.session_hash = :hash
          AND s.expires_at > SYSTIMESTAMP
          AND u.account_status = 'ACTIVE'`, { hash: hashToken(token) }));
      const user = result.rows[0];
      return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'PATCH' && req.url === '/api/profile/photo') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const body = await readBody(req);
      const profilePhoto = normalize(body.profilePhoto);
      if (profilePhoto && !profilePhoto.startsWith('data:image/')) return json(res, 400, { error: 'Profile photo must be an image data URL.' });
      if (profilePhoto.length > 1_500_000) return json(res, 400, { error: 'Profile photo is too large. Use an image under about 1 MB.' });
      const result = await withConnection(async (c) => {
        const found = await c.execute(`SELECT u.user_id
          FROM bes_users u
          JOIN bes_auth_sessions s ON s.user_id = u.user_id
          WHERE s.session_hash = :hash
            AND s.expires_at > SYSTIMESTAMP
            AND u.account_status = 'ACTIVE'`, { hash: hashToken(token) });
        const user = found.rows[0];
        if (!user) return null;
        await c.execute(`UPDATE bes_users SET profile_photo_data_url = :profilePhoto, updated_at = SYSTIMESTAMP WHERE user_id = :userId`, {
          userId: user.USER_ID,
          profilePhoto: profilePhoto || null,
        });
        await c.commit();
        const updated = await c.execute(`SELECT u.*,
            (SELECT LISTAGG(ur.role_code || NVL2(ur.scope_department_code, ' (' || ur.scope_department_code || ')', ''), '|')
               WITHIN GROUP (ORDER BY r.sort_order, ur.scope_department_code)
             FROM bes_user_roles ur
             JOIN bes_roles r ON r.role_code = ur.role_code
             WHERE ur.user_id = u.user_id AND ur.is_active = 'Y') role_assignments
          FROM bes_users u
          WHERE u.user_id = :userId`, { userId: user.USER_ID });
        return updated.rows[0];
      });
      return result ? json(res, 200, { user: publicUser(result) }) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'PATCH' && req.url === '/api/profile') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const body = await readBody(req);
      const username = normalize(body.username).toLowerCase();
      const email = normalize(body.email).toLowerCase();
      const firstName = normalize(body.firstName);
      const lastName = normalize(body.lastName);
      const dateHired = nullableNormalize(body.dateHired);
      if (!username || !email || !firstName || !lastName)
        return json(res, 400, { error: 'Username, email, first name, and last name are required.' });
      if (dateHired && !/^\d{4}-\d{2}-\d{2}$/.test(dateHired))
        return json(res, 400, { error: 'Date hired must use YYYY-MM-DD format.' });
      const result = await withConnection(async (c) => {
        const found = await c.execute(`SELECT u.user_id
          FROM bes_users u
          JOIN bes_auth_sessions s ON s.user_id = u.user_id
          WHERE s.session_hash = :hash
            AND s.expires_at > SYSTIMESTAMP
            AND u.account_status = 'ACTIVE'`, { hash: hashToken(token) });
        const user = found.rows[0];
        if (!user) return null;
        await c.execute(`UPDATE bes_users SET
            username = :username,
            email = :email,
            first_name = :firstName,
            middle_name = :middleName,
            last_name = :lastName,
            suffix = :suffix,
            position_title = :positionTitle,
            department_code = :departmentCode,
            unit_name = :unitName,
            mobile_no = :mobileNo,
            date_hired = CASE WHEN :dateHired IS NULL THEN NULL ELSE TO_DATE(:dateHired, 'YYYY-MM-DD') END,
            work_location = :workLocation,
            updated_at = SYSTIMESTAMP
          WHERE user_id = :userId`, {
          userId: user.USER_ID,
          username,
          email,
          firstName,
          middleName: nullableNormalize(body.middleName),
          lastName,
          suffix: nullableNormalize(body.suffix),
          positionTitle: nullableNormalize(body.position),
          departmentCode: nullableNormalize(body.departmentCode)?.toUpperCase() ?? null,
          unitName: nullableNormalize(body.unitName),
          mobileNo: nullableNormalize(body.mobileNo),
          dateHired,
          workLocation: nullableNormalize(body.workLocation),
        });
        await c.commit();
        const updated = await c.execute(`SELECT u.*,
            (SELECT LISTAGG(ur.role_code || NVL2(ur.scope_department_code, ' (' || ur.scope_department_code || ')', ''), '|')
               WITHIN GROUP (ORDER BY r.sort_order, ur.scope_department_code)
             FROM bes_user_roles ur
             JOIN bes_roles r ON r.role_code = ur.role_code
             WHERE ur.user_id = u.user_id AND ur.is_active = 'Y') role_assignments
          FROM bes_users u
          WHERE u.user_id = :userId`, { userId: user.USER_ID });
        return updated.rows[0];
      });
      return result ? json(res, 200, { user: publicUser(result) }) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'GET' && req.url === '/api/auth/registration-options') {
      const departments = await withConnection(async (c) => {
        const departmentRows = await c.execute(`SELECT department_id, department_code, department_name
          FROM bes_departments WHERE is_active='Y' ORDER BY department_name`);
        const officeRows = await c.execute(`SELECT office_id, department_id, parent_office_id, office_name
          FROM bes_offices WHERE is_active='Y' ORDER BY office_name`);
        const positionRows = await c.execute(`SELECT position_id, department_id, office_id, position_title, employee_class
          FROM bes_positions WHERE is_active='Y' ORDER BY position_title`);
        const mapPosition = (position) => ({
          id: String(position.POSITION_ID),
          title: position.POSITION_TITLE,
          employeeClass: position.EMPLOYEE_CLASS,
        });
        return departmentRows.rows.map((department) => ({
          id: String(department.DEPARTMENT_ID),
          code: department.DEPARTMENT_CODE,
          name: department.DEPARTMENT_NAME,
          positions: positionRows.rows
            .filter((position) => position.DEPARTMENT_ID === department.DEPARTMENT_ID && position.OFFICE_ID == null)
            .map(mapPosition),
          offices: officeRows.rows
            .filter((office) => office.DEPARTMENT_ID === department.DEPARTMENT_ID)
            .map((office) => ({
              id: String(office.OFFICE_ID),
              name: office.OFFICE_NAME,
              parentOfficeId: office.PARENT_OFFICE_ID == null ? null : String(office.PARENT_OFFICE_ID),
              positions: positionRows.rows
                .filter((position) => position.OFFICE_ID === office.OFFICE_ID)
                .map(mapPosition),
            })),
        }));
      });
      return json(res, 200, { departments });
    }
    if (req.method === 'POST' && req.url === '/api/auth/signup') {
      const body = await readBody(req);
      const employeeNo = normalize(body.employeeNo).toUpperCase();
      const username = normalize(body.username).toLowerCase();
      const email = normalize(body.email).toLowerCase();
      const firstName = normalize(body.firstName);
      const lastName = normalize(body.lastName);
      const password = String(body.password ?? '');
      if (!employeeNo || !username || !email || !firstName || !lastName || password.length < 8)
        return json(res, 400, { error: 'Complete all required fields. Password must be at least 8 characters.' });
      const secured = hashPassword(password);
      await withConnection(async (c) => {
        await c.execute(`INSERT INTO bes_users
          (employee_no,username,email,password_hash,password_salt,first_name,middle_name,last_name,suffix,
           position_title,department_code,unit_name,mobile_no,employment_status,account_status)
          VALUES (:employeeNo,:username,:email,:hash,:salt,:firstName,:middleName,:lastName,:suffix,
           :positionTitle,:departmentCode,:unitName,:mobileNo,:employmentStatus,'ACTIVE')`, {
          employeeNo, username, email, hash: secured.hash, salt: secured.salt, firstName,
          middleName: nullableNormalize(body.middleName), lastName, suffix: nullableNormalize(body.suffix),
          positionTitle: nullableNormalize(body.position),
          departmentCode: nullableNormalize(body.departmentCode)?.toUpperCase() ?? null,
          unitName: nullableNormalize(body.unitName), mobileNo: nullableNormalize(body.mobileNo),
          employmentStatus: normalize(body.employmentStatus) || 'Active',
        });
        await c.commit();
      });
      return json(res, 201, { ok: true, message: 'Your BES account has been created. You can now sign in.' });
    }
    if (req.method === 'POST' && req.url === '/api/auth/login') {
      const body = await readBody(req);
      const identifier = normalize(body.username).toLowerCase();
      const result = await withConnection(async (c) => {
        const found = await c.execute(`SELECT u.*,
            (SELECT LISTAGG(ur.role_code || NVL2(ur.scope_department_code, ' (' || ur.scope_department_code || ')', ''), '|')
               WITHIN GROUP (ORDER BY r.sort_order, ur.scope_department_code)
             FROM bes_user_roles ur
             JOIN bes_roles r ON r.role_code = ur.role_code
             WHERE ur.user_id = u.user_id AND ur.is_active = 'Y') role_assignments
          FROM bes_users u
          WHERE (LOWER(username)=:identifier OR LOWER(email)=:identifier) AND account_status='ACTIVE'`, { identifier });
        const user = found.rows[0];
        if (!user || !verifyPassword(String(body.password ?? ''), user.PASSWORD_SALT, user.PASSWORD_HASH)) return null;
        const token = await createSession(c, user.USER_ID, Boolean(body.rememberMe));
        await c.execute(`UPDATE bes_users SET last_login_at=SYSTIMESTAMP,updated_at=SYSTIMESTAMP WHERE user_id=:id`, { id: user.USER_ID });
        await c.commit();
        return { token, user: publicUser(user) };
      });
      return result ? json(res, 200, result) : json(res, 401, { error: 'Invalid username or password.' });
    }
    if (req.method === 'POST' && req.url === '/api/auth/forgot-password') {
      const body = await readBody(req);
      const identifier = normalize(body.identifier).toLowerCase();
      const employeeNo = normalize(body.employeeNo).toUpperCase();
      const resetToken = await withConnection(async (c) => {
        const found = await c.execute(`SELECT user_id FROM bes_users WHERE employee_no=:employeeNo AND (LOWER(username)=:identifier OR LOWER(email)=:identifier) AND account_status='ACTIVE'`, { employeeNo, identifier });
        if (!found.rows[0]) return null;
        const token = createOpaqueToken();
        await c.execute(`UPDATE bes_password_resets SET used_at=SYSTIMESTAMP WHERE user_id=:id AND used_at IS NULL`, { id: found.rows[0].USER_ID });
        await c.execute(`INSERT INTO bes_password_resets (reset_hash,user_id,expires_at) VALUES (:hash,:id,SYSTIMESTAMP + NUMTODSINTERVAL(15,'MINUTE'))`, { hash: hashToken(token), id: found.rows[0].USER_ID });
        await c.commit();
        return token;
      });
      return resetToken ? json(res, 200, { ok: true, resetToken }) : json(res, 404, { error: 'We could not verify that employee account.' });
    }
    if (req.method === 'POST' && req.url === '/api/auth/reset-password') {
      const body = await readBody(req);
      const password = String(body.password ?? '');
      if (password.length < 8) return json(res, 400, { error: 'Password must be at least 8 characters.' });
      const secured = hashPassword(password);
      const updated = await withConnection(async (c) => {
        const found = await c.execute(`SELECT user_id FROM bes_password_resets WHERE reset_hash=:hash AND used_at IS NULL AND expires_at>SYSTIMESTAMP`, { hash: hashToken(String(body.resetToken ?? '')) });
        if (!found.rows[0]) return false;
        const id = found.rows[0].USER_ID;
        await c.execute(`UPDATE bes_users SET password_hash=:passwordHash,password_salt=:salt,updated_at=SYSTIMESTAMP WHERE user_id=:id`, { passwordHash: secured.hash, salt: secured.salt, id });
        await c.execute(`UPDATE bes_password_resets SET used_at=SYSTIMESTAMP WHERE reset_hash=:hash`, { hash: hashToken(String(body.resetToken ?? '')) });
        await c.execute(`DELETE FROM bes_auth_sessions WHERE user_id=:id`, { id });
        await c.commit();
        return true;
      });
      return updated ? json(res, 200, { ok: true }) : json(res, 400, { error: 'This reset request has expired or was already used.' });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error?.statusCode) return json(res, error.statusCode, { error: error.message });
    if (error?.errorNum === 1) return json(res, 409, { error: 'That employee number, username, or email is already registered.' });
    console.error(error);
    return json(res, 500, { error: 'The server could not complete the request.' });
  }
}

await initializeDatabase();
http.createServer(handle).listen(config.port, config.host, () => console.log(`BES server listening on http://${config.host}:${config.port}`));
