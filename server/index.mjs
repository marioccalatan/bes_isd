import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import oracledb from 'oracledb';
import { config } from './config.mjs';
import {
  getDatabaseRuntimeStatus,
  initializeDatabase,
  useLocalDatabase,
  useServerDatabase,
  withConnection,
  withLocalConnection,
} from './db.mjs';
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
const readBody = async (req, maxChars = 8_000_000) => {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > maxChars) throw Object.assign(new Error(`Request body exceeds the ${Math.round(maxChars / 1_000_000)} MB limit.`), { statusCode: 413 }); }
  return raw ? JSON.parse(raw) : {};
};
const readBinaryBody = async (req, maxBytes = 25 * 1024 * 1024, label = 'File') => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error(`${label} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`), { statusCode: 413 });
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
const csrRequestJson = (row) => ({
  id: row.CSR_UID,
  dateRequested: localDateOnly(row.DATE_REQUESTED),
  programType: row.PROGRAM_TYPE || '',
  requestee: row.REQUESTEE || '',
  designation: row.DESIGNATION || '',
  organization: row.ORGANIZATION || '',
  registrationDetails: row.REGISTRATION_DETAILS || '',
  sector: row.SECTOR || '',
  location: row.LOCATION || '',
  barangay: row.BARANGAY || '',
  municipality: row.MUNICIPALITY || '',
  district: row.DISTRICT || '',
  projectDetails: row.PROJECT_DETAILS || '',
  projectRequirement: row.PROJECT_REQUIREMENT || '',
  pendingReason: row.PENDING_REASON || '',
  withLetterReply: row.WITH_LETTER_REPLY === 'Y',
  additionalRemarks: row.ADDITIONAL_REMARKS || '',
  status: row.REQUEST_STATUS || 'For evaluation',
  approvalStatus: row.APPROVAL_STATUS || 'For Evaluation',
  evaluationResult: normalize(row.EVALUATION_RESULT) ? normalize(row.EVALUATION_RESULT).split('|').filter(Boolean) : [],
  evaluatedBy: row.EVALUATED_BY || '',
  dateApproved: localDateOnly(row.DATE_APPROVED) || '',
  amountFunding: row.AMOUNT_FUNDING == null ? '' : String(row.AMOUNT_FUNDING),
  pjrs: row.PJRS || '',
  actualProjectCost: row.ACTUAL_PROJECT_COST == null ? '' : String(row.ACTUAL_PROJECT_COST),
  updatedAt: localIso(row.UPDATED_AT),
});
const jsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const CSR_EVALUATION_RESULTS = ['Within CSR Policy', 'Not Within CSR Policy'];
const csrEvaluationResults = (body) => {
  if (normalize(body.status) !== 'Completed') return [];
  const values = Array.isArray(body.evaluationResult) ? body.evaluationResult : [body.evaluationResult];
  return [...new Set(values.map(normalize).filter(Boolean))];
};
const fleetModelLookupIds = async (connection, requestedId) => {
  const ids = [requestedId];
  const stored = await connection.execute(`SELECT data_key,payload FROM bes_fleet_store WHERE data_key IN ('VEHICLES','MODEL_LIBRARY')`);
  const payloads = new Map(stored.rows.map((row) => [row.DATA_KEY, jsonArray(row.PAYLOAD)]));
  const vehicles = payloads.get('VEHICLES') ?? [];
  const models = payloads.get('MODEL_LIBRARY') ?? [];
  const vehicle = vehicles.find((item) => normalize(item?.id) === requestedId);
  const directModel = models.find((item) => normalize(item?.id) === requestedId);
  const linkedId = normalize(vehicle?.modelLibraryId);
  if (linkedId) ids.push(linkedId);
  const matchingModel = directModel ?? models.find((item) => vehicle
    && normalize(item?.brand).toLowerCase() === normalize(vehicle?.brand).toLowerCase()
    && normalize(item?.model).toLowerCase() === normalize(vehicle?.model).toLowerCase());
  if (matchingModel?.id) ids.push(normalize(matchingModel.id));
  return [...new Set(ids.filter(Boolean))];
};
const loadFleetModelBlob = async (connection, requestedId) => {
  const lookupIds = await fleetModelLookupIds(connection, requestedId);
  for (const lookupId of lookupIds) {
    const found = await connection.execute(`SELECT vehicle_uid,file_name,mime_type,file_size,file_blob FROM bes_fleet_vehicle_models WHERE vehicle_uid=:lookupId`, { lookupId });
    const row = found.rows[0];
    if (!row) continue;
    const body = Buffer.isBuffer(row.FILE_BLOB) ? row.FILE_BLOB : await row.FILE_BLOB.getData();
    return { ...row, BODY: body };
  }
  return false;
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
const workTaskAttachmentRecords = (taskUid, files) => workTaskAttachmentPaths(taskUid, files).map((attachmentPath, index) => {
  const source = files[index];
  const dataUrl = typeof source === 'object' && /^data:[^;,]+;base64,[a-z0-9+/=\r\n]+$/i.test(normalize(source?.dataUrl))
    ? normalize(source.dataUrl)
    : undefined;
  return {
    path: attachmentPath,
    name: safeFileName(typeof source === 'object' ? source?.name : attachmentPath.split('/').pop()),
    size: typeof source === 'object' ? Number(source?.size) || 0 : 0,
    type: typeof source === 'object' ? nullableNormalize(source?.type) : null,
    dataUrl,
  };
});
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
  status: row.POLICY_STATUS || 'Effective',
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

async function loadBuildingFacilitiesOperations(connection, facilityScope = 'Operations') {
  const [facilities, personnel, todos, assignments, activity, workDetails, projects] = await Promise.all([
    connection.execute(`SELECT f.*, u.username updated_by_username, u.first_name updated_by_first_name, u.last_name updated_by_last_name
      FROM bes_bfm_facilities f LEFT JOIN bes_users u ON u.user_id=f.updated_by_user_id
      WHERE f.is_active='Y' AND f.facility_scope=:facilityScope ORDER BY f.sort_order, f.facility_name`, { facilityScope }),
    connection.execute(`SELECT p.*, u.username updated_by_username, u.first_name updated_by_first_name, u.last_name updated_by_last_name
      FROM bes_bfm_personnel p LEFT JOIN bes_users u ON u.user_id=p.updated_by_user_id
      WHERE p.is_active='Y' ORDER BY p.personnel_name`),
    connection.execute(`SELECT t.*, u.username updated_by_username, u.first_name updated_by_first_name, u.last_name updated_by_last_name
      FROM bes_bfm_todos t LEFT JOIN bes_users u ON u.user_id=t.updated_by_user_id
      WHERE t.is_active='Y' ORDER BY t.due_date NULLS LAST, t.todo_title`),
    connection.execute(`SELECT todo_uid, personnel_uid FROM bes_bfm_todo_workers`),
    connection.execute(`SELECT a.*, u.username updated_by_username, u.first_name updated_by_first_name, u.last_name updated_by_last_name,
        p.personnel_name performed_for_name
      FROM bes_bfm_activity a
      LEFT JOIN bes_users u ON u.user_id=a.updated_by_user_id
      LEFT JOIN bes_bfm_personnel p ON p.personnel_uid=a.performed_for_personnel_uid
      ORDER BY a.created_at DESC`),
    connection.execute(`SELECT d.*, u.username updated_by_username, u.first_name updated_by_first_name, u.last_name updated_by_last_name
      FROM bes_bfm_work_details d LEFT JOIN bes_users u ON u.user_id=d.updated_by_user_id
      ORDER BY d.work_date DESC, d.updated_at DESC`),
    connection.execute(`SELECT p.*, u.username updated_by_username, u.first_name updated_by_first_name, u.last_name updated_by_last_name
      FROM bes_bfm_projects p LEFT JOIN bes_users u ON u.user_id=p.updated_by_user_id
      WHERE p.is_active='Y' ORDER BY p.target_date NULLS LAST, p.project_title`),
  ]);
  const updaterName = (row) => [row.UPDATED_BY_FIRST_NAME, row.UPDATED_BY_LAST_NAME].filter(Boolean).join(' ') || row.UPDATED_BY_USERNAME || 'System';
  const workerIds = new Map();
  for (const row of assignments.rows) {
    const values = workerIds.get(row.TODO_UID) ?? [];
    values.push(row.PERSONNEL_UID);
    workerIds.set(row.TODO_UID, values);
  }
  return {
    facilities: facilities.rows.map((row) => ({
      id: row.FACILITY_UID, parentId: row.PARENT_FACILITY_UID || undefined, name: row.FACILITY_NAME,
      type: row.FACILITY_TYPE, description: row.DESCRIPTION || '', location: row.LOCATION || '', sortOrder: Number(row.SORT_ORDER || 0),
      updatedBy: updaterName(row), updatedAt: localIso(row.UPDATED_AT),
    })),
    personnel: personnel.rows.map((row) => ({
      id: row.PERSONNEL_UID, name: row.PERSONNEL_NAME, employeeNo: row.EMPLOYEE_NO || '', position: row.POSITION_TITLE || '',
      contact: row.CONTACT_INFO || '', updatedBy: updaterName(row), updatedAt: localIso(row.UPDATED_AT),
    })),
    todos: todos.rows.map((row) => ({
      id: row.TODO_UID, facilityId: row.FACILITY_UID, title: row.TODO_TITLE, description: row.DESCRIPTION || '',
      category: row.CATEGORY, frequency: row.FREQUENCY,
      customDays: String(row.CUSTOM_DAYS || '').split(',').map(Number).filter((day) => day >= 1 && day <= 7),
      priority: row.PRIORITY, status: row.TODO_STATUS,
      dueDate: localDateOnly(row.DUE_DATE), lastCompletedAt: localIso(row.LAST_COMPLETED_AT), workerIds: workerIds.get(row.TODO_UID) ?? [],
      updatedBy: updaterName(row), updatedAt: localIso(row.UPDATED_AT),
    })),
    activity: activity.rows.map((row) => ({
      id: row.ACTIVITY_UID, todoId: row.TODO_UID, previousStatus: row.PREVIOUS_STATUS || '', newStatus: row.NEW_STATUS,
      note: row.WORK_NOTE || '', performedForId: row.PERFORMED_FOR_PERSONNEL_UID || undefined,
      performedForName: row.PERFORMED_FOR_NAME || undefined, workDate: localDateOnly(row.WORK_DATE),
      updatedBy: updaterName(row), createdAt: localIso(row.CREATED_AT),
    })),
    workDetails: workDetails.rows.map((row) => ({
      id: row.DETAIL_UID, todoId: row.TODO_UID, workDate: localDateOnly(row.WORK_DATE),
      findings: row.FINDINGS || '', actionTaken: row.ACTION_TAKEN || '', materialsUsed: row.MATERIALS_USED || '',
      recommendation: row.RECOMMENDATION || '', convertedTaskId: row.CONVERTED_TASK_UID || undefined,
      updatedBy: updaterName(row), updatedAt: localIso(row.UPDATED_AT),
    })),
    projects: projects.rows.map((row) => ({
      id: row.PROJECT_UID, facilityId: row.FACILITY_UID, title: row.PROJECT_TITLE, description: row.DESCRIPTION || '',
      category: row.CATEGORY, priority: row.PRIORITY, status: row.PROJECT_STATUS,
      startDate: localDateOnly(row.START_DATE), targetDate: localDateOnly(row.TARGET_DATE),
      budgetAmount: row.BUDGET_AMOUNT == null ? null : Number(row.BUDGET_AMOUNT), budgetStatus: row.BUDGET_STATUS || 'For Budgeting',
      workerIds: jsonArray(row.ASSIGNED_PERSONNEL), updatedBy: updaterName(row), updatedAt: localIso(row.UPDATED_AT),
    })),
  };
}
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
const isLocalDevelopmentRequest = (req) => {
  const origin = normalize(req.headers.origin);
  if (origin) {
    try {
      if (!['localhost', '127.0.0.1', '::1'].includes(new URL(origin).hostname)) return false;
    } catch { return false; }
  }
  const forwardedHost = normalize(req.headers['x-forwarded-host']).split(',')[0].trim();
  const requestHost = forwardedHost || normalize(req.headers.host);
  const hostname = requestHost.startsWith('[')
    ? requestHost.slice(1, requestHost.indexOf(']'))
    : requestHost.split(':')[0];
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
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
  const found = await connection.execute(`SELECT u.user_id, u.username, u.department_code, u.unit_name, u.position_title, u.app_role
    FROM bes_users u
    JOIN bes_auth_sessions s ON s.user_id = u.user_id
    WHERE s.session_hash = :hash
      AND s.expires_at > SYSTIMESTAMP
      AND u.account_status = 'ACTIVE'`, { hash: hashToken(token) });
  return found.rows[0] ?? null;
}

const isTaskModerator = (user) => ['Department Manager', 'Department Secretary', 'Supervisor', 'Office Secretary', 'Administrator'].includes(user?.APP_ROLE);
const isPerformanceManager = (user) => ['Department Manager', 'Supervisor', 'Administrator'].includes(user?.APP_ROLE);
const isDepartmentPerformanceManager = (user) => user?.APP_ROLE === 'Department Manager';
const isOfficePerformanceManager = (user) => user?.APP_ROLE === 'Supervisor';
const canAccessPerformanceEmployee = (user, employee, manage = false) => {
  if (!user || !employee) return false;
  if (user.APP_ROLE === 'Administrator') return true;
  if (isDepartmentPerformanceManager(user)) return employee.DEPARTMENT_CODE === user.DEPARTMENT_CODE;
  if (isOfficePerformanceManager(user)) return employee.DEPARTMENT_CODE === user.DEPARTMENT_CODE && employee.UNIT_NAME === user.UNIT_NAME;
  return !manage && Number(employee.EMPLOYEE_USER_ID ?? employee.USER_ID) === Number(user.USER_ID);
};

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
  'BES_PERFORMANCE_PLANS',
  'BES_PERFORMANCE_TARGETS',
  'BES_PERFORMANCE_ASSIGNMENTS',
  'BES_POSITION_DR_PL',
  'BES_EMPLOYEE_SKILL_CHECKS',
  'BES_FLEET_STORE',
  'BES_FLEET_VEHICLE_MODELS',
  'BES_FLEET_MODEL_LIBRARY',
  'BES_FLEET_SCHEDULES',
  'BES_FLEET_RENEWAL_RECEIPTS',
  'BES_FLEET_INSPECTIONS',
  'BES_FLEET_INSPECTION_ITEMS',
  'BES_FLEET_INSPECTION_PHOTOS',
  'BES_CSR_SECTORS',
  'BES_BARANGAY_LOCATIONS',
  'BES_CSR_REQUESTS',
  'BES_CSR_EVENTS',
  'BES_CSR_ATTACHMENTS',
  'BES_MEMBER_PROGRAMS',
  'BES_MEMBER_OPS_PROGRAMS',
  'BES_MEMBER_OPS_ACTIVITIES',
  'BES_MEMBER_OPS_SCHEDULES',
  'BES_BFM_FACILITIES',
  'BES_BFM_PERSONNEL',
  'BES_BFM_TODOS',
  'BES_BFM_TODO_WORKERS',
  'BES_BFM_ACTIVITY',
  'BES_BFM_WORK_DETAILS',
  'BES_BFM_PROJECTS',
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
  'BES_MEMBER_OPS_SCHEDULES',
  'BES_MEMBER_OPS_ACTIVITIES',
  'BES_MEMBER_OPS_PROGRAMS',
  'BES_MEMBER_PROGRAMS',
  'BES_CSR_ATTACHMENTS',
  'BES_CSR_EVENTS',
  'BES_CSR_REQUESTS',
  'BES_CSR_SECTORS',
  'BES_BARANGAY_LOCATIONS',
  'BES_EMPLOYEE_SKILL_CHECKS',
  'BES_POSITION_DR_PL',
  'BES_PERFORMANCE_ASSIGNMENTS',
  'BES_PERFORMANCE_TARGETS',
  'BES_PERFORMANCE_PLANS',
  'BES_BFM_PROJECTS',
  'BES_BFM_WORK_DETAILS',
  'BES_BFM_ACTIVITY',
  'BES_BFM_TODO_WORKERS',
  'BES_BFM_TODOS',
  'BES_BFM_PERSONNEL',
  'BES_BFM_FACILITIES',
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
  'BES_FLEET_INSPECTION_PHOTOS',
  'BES_FLEET_INSPECTION_ITEMS',
  'BES_FLEET_INSPECTIONS',
  'BES_FLEET_RENEWAL_RECEIPTS',
  'BES_FLEET_SCHEDULES',
  'BES_FLEET_MODEL_LIBRARY',
  'BES_FLEET_VEHICLE_MODELS',
  'BES_FLEET_STORE',
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
  'BES_POSITION_DR_PL',
  'BES_PERFORMANCE_ASSIGNMENTS',
  'BES_EMPLOYEE_SKILL_CHECKS',
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
  'BES_PERFORMANCE_PLANS',
  'BES_PERFORMANCE_TARGETS',
  'BES_FLEET_STORE',
  'BES_FLEET_VEHICLE_MODELS',
  'BES_FLEET_MODEL_LIBRARY',
  'BES_FLEET_SCHEDULES',
  'BES_FLEET_RENEWAL_RECEIPTS',
  'BES_FLEET_INSPECTIONS',
  'BES_FLEET_INSPECTION_ITEMS',
  'BES_FLEET_INSPECTION_PHOTOS',
  'BES_CSR_SECTORS',
  'BES_BARANGAY_LOCATIONS',
  'BES_CSR_REQUESTS',
  'BES_CSR_EVENTS',
  'BES_CSR_ATTACHMENTS',
  'BES_MEMBER_PROGRAMS',
  'BES_MEMBER_OPS_PROGRAMS',
  'BES_MEMBER_OPS_ACTIVITIES',
  'BES_MEMBER_OPS_SCHEDULES',
  'BES_BFM_FACILITIES',
  'BES_BFM_PERSONNEL',
  'BES_BFM_TODOS',
  'BES_BFM_TODO_WORKERS',
  'BES_BFM_ACTIVITY',
  'BES_BFM_WORK_DETAILS',
  'BES_BFM_PROJECTS',
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
const DB_SYNC_KEY_OVERRIDES = new Map([
  ['BES_DEPARTMENTS', ['DEPARTMENT_NAME']],
  ['BES_HRO_RECRUITMENT_POSITIONS', ['POSITION_NAME']],
  ['BES_OFFICES', ['DEPARTMENT_ID', 'OFFICE_NAME']],
  ['BES_POSITIONS', ['DEPARTMENT_ID', 'OFFICE_ID', 'POSITION_TITLE']],
  ['BES_TASK_SUBJECTS', ['TOOL_CODE', 'TASK_SUBJECT']],
  ['BES_TOOL_ACCESS', ['TOOL_CODE', 'DEPARTMENT_CODE', 'OFFICE_NAME', 'POSITION_NAME']],
  ['BES_USER_ROLES', ['USER_ID', 'ROLE_CODE', 'SCOPE_DEPARTMENT_CODE', 'SCOPE_UNIT_NAME']],
  ['BES_FLEET_VEHICLE_MODELS', ['VEHICLE_UID']],
  ['BES_FLEET_MODEL_LIBRARY', ['MODEL_UID']],
  ['BES_FLEET_SCHEDULES', ['SCHEDULE_UID']],
  ['BES_FLEET_RENEWAL_RECEIPTS', ['SCHEDULE_UID']],
  ['BES_FLEET_INSPECTIONS', ['INSPECTION_UID']],
  ['BES_FLEET_INSPECTION_ITEMS', ['ITEM_UID']],
  ['BES_CSR_SECTORS', ['SECTOR_NAME']],
  ['BES_BARANGAY_LOCATIONS', ['MUNICIPALITY', 'BARANGAY']],
  ['BES_CSR_REQUESTS', ['CSR_UID']],
  ['BES_CSR_EVENTS', ['EVENT_UID']],
  ['BES_CSR_ATTACHMENTS', ['ATTACHMENT_UID']],
  ['BES_MEMBER_PROGRAMS', ['PROGRAM_UID']],
  ['BES_MEMBER_OPS_PROGRAMS', ['PROGRAM_UID']],
  ['BES_MEMBER_OPS_ACTIVITIES', ['ACTIVITY_UID']],
  ['BES_MEMBER_OPS_SCHEDULES', ['ACTIVITY_UID', 'WEEKDAY_NAME']],
]);
const DB_SYNC_CASE_INSENSITIVE_KEYS = new Set([
  'DEPARTMENT_NAME', 'OFFICE_NAME', 'POSITION_TITLE', 'POSITION_NAME', 'TASK_SUBJECT', 'SECTOR_NAME', 'MUNICIPALITY', 'BARANGAY',
]);
const DB_SYNC_DEPENDENCIES = new Map([
  ['BES_FLEET_RENEWAL_RECEIPTS', ['BES_FLEET_SCHEDULES']],
  ['BES_FLEET_INSPECTION_ITEMS', ['BES_FLEET_INSPECTIONS']],
  ['BES_FLEET_INSPECTION_PHOTOS', ['BES_FLEET_INSPECTIONS', 'BES_FLEET_INSPECTION_ITEMS']],
  ['BES_MEMBER_OPS_ACTIVITIES', ['BES_MEMBER_OPS_PROGRAMS']],
  ['BES_MEMBER_OPS_SCHEDULES', ['BES_MEMBER_OPS_PROGRAMS', 'BES_MEMBER_OPS_ACTIVITIES']],
]);
function expandSyncSelection(requestedTables) {
  const selected = new Set(Array.isArray(requestedTables) ? requestedTables.map((table) => normalize(table).toUpperCase()).filter((table) => DB_SYNC_ALLOWED.has(table)) : []);
  for (const table of [...selected]) for (const dependency of DB_SYNC_DEPENDENCIES.get(table) ?? []) selected.add(dependency);
  return [...selected];
}

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

async function prepareServerDatabase(databaseConfig, admin, token) {
  const connection = await oracledb.getConnection(databaseConfig);
  try {
    const tables = await connection.execute(`SELECT table_name
      FROM user_tables
      WHERE table_name IN ('BES_USERS','BES_USER_ROLES','BES_AUTH_SESSIONS')`);
    const available = new Set(tables.rows.map((row) => row.TABLE_NAME));
    const missing = ['BES_USERS', 'BES_USER_ROLES', 'BES_AUTH_SESSIONS'].filter((table) => !available.has(table));
    if (missing.length) throw Object.assign(new Error(`Server schema is missing ${missing.join(', ')}. Push the schema and data from Database Sync first.`), { statusCode: 400 });

    const remoteUser = await connection.execute(`SELECT u.user_id, u.username, u.app_role,
        (SELECT COUNT(*) FROM bes_user_roles ur
          WHERE ur.user_id=u.user_id AND ur.role_code='Administrator' AND ur.is_active='Y') administrator_roles
      FROM bes_users u
      WHERE LOWER(u.username)=LOWER(:username)
        AND u.account_status='ACTIVE'`, { username: admin.USERNAME });
    const user = remoteUser.rows[0];
    if (!user) throw Object.assign(new Error(`The Administrator account ${admin.USERNAME} is not active in the server database. Sync BES_USERS and BES_USER_ROLES first.`), { statusCode: 400 });
    if (user.APP_ROLE !== 'Administrator' && Number(user.ADMINISTRATOR_ROLES ?? 0) === 0) {
      throw Object.assign(new Error(`The account ${admin.USERNAME} is not an Administrator in the server database.`), { statusCode: 403 });
    }

    const policyTable = await connection.execute(`SELECT COUNT(*) table_count
      FROM user_tables WHERE table_name = 'BES_POLICY_RECORDS'`);
    if (Number(policyTable.rows[0]?.TABLE_COUNT ?? 0) > 0) {
      try {
        await connection.execute(`ALTER TABLE bes_policy_records DROP CONSTRAINT chk_bes_policy_records_status`);
      } catch (error) {
        if (error.errorNum !== 2443) throw error;
      }
      await connection.execute(`UPDATE bes_policy_records
        SET policy_status = 'New (Draft)'
        WHERE policy_status = 'Draft'`);
      try {
        await connection.execute(`ALTER TABLE bes_policy_records MODIFY (effectivity_date NULL)`);
      } catch (error) {
        if (error.errorNum !== 1451) throw error;
      }
      await connection.execute(`ALTER TABLE bes_policy_records ADD CONSTRAINT chk_bes_policy_records_status
        CHECK (policy_status IN ('Effective', 'New (Draft)', 'Amended (Draft)', 'Amended', 'Rescinded'))`);
    }

    const sessionHash = hashToken(token);
    await connection.execute(`DELETE FROM bes_auth_sessions WHERE session_hash=:sessionHash`, { sessionHash });
    await connection.execute(`INSERT INTO bes_auth_sessions (session_hash,user_id,expires_at)
      VALUES (:sessionHash,:userId,SYSTIMESTAMP + NUMTODSINTERVAL(1,'DAY'))`, {
      sessionHash,
      userId: user.USER_ID,
    });
    const identity = await connection.execute(`SELECT
        SYS_CONTEXT('USERENV','DB_NAME') db_name,
        SYS_CONTEXT('USERENV','CON_NAME') container_name,
        SYS_CONTEXT('USERENV','CURRENT_SCHEMA') schema_name
      FROM dual`);
    await connection.commit();
    return identity.rows[0] ?? {};
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    await connection.close();
  }
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

async function canManageBuildingFacilities(connection, user) {
  if (!user) return false;
  if (user.APP_ROLE === 'Administrator') return true;
  const access = await connection.execute(`SELECT
      (SELECT COUNT(*) FROM bes_user_roles
        WHERE user_id = :userId AND role_code = 'Administrator' AND is_active = 'Y') administrator_count,
      (SELECT COUNT(*) FROM bes_tool_access
        WHERE tool_code = 'Building and Facilities Management System'
          AND is_active = 'Y'
          AND tool_status = 'ENABLED'
          AND access_level IN ('ADMIN', 'EDIT')
          AND department_code = :departmentCode
          AND (office_name IS NULL OR LOWER(TRIM(office_name)) = LOWER(TRIM(:unitName)))
          AND (position_name IS NULL OR LOWER(TRIM(position_name)) = LOWER(TRIM(:positionTitle)))) access_count
    FROM dual`, {
    userId: user.USER_ID,
    departmentCode: user.DEPARTMENT_CODE,
    unitName: user.UNIT_NAME,
    positionTitle: user.POSITION_TITLE,
  });
  return Number(access.rows[0]?.ADMINISTRATOR_COUNT ?? 0) > 0 || Number(access.rows[0]?.ACCESS_COUNT ?? 0) > 0;
}

async function requireBuildingFacilitiesManager(token) {
  if (!token) return null;
  return withConnection(async (c) => {
    const user = await currentSessionUser(c, token);
    return await canManageBuildingFacilities(c, user) ? user : null;
  });
}

async function tableIdentityColumns(connection, tableName) {
  const result = await connection.execute(`SELECT column_name FROM user_tab_identity_cols
    WHERE table_name=:tableName ORDER BY column_name`, { tableName });
  return result.rows.map((row) => row.COLUMN_NAME);
}

async function alignIdentitySequences(connection, tableName) {
  const result = await connection.execute(`SELECT column_name, generation_type FROM user_tab_identity_cols
    WHERE table_name=:tableName ORDER BY column_name`, { tableName });
  for (const row of result.rows) {
    const generation = row.GENERATION_TYPE === 'ALWAYS' ? 'ALWAYS' : 'BY DEFAULT';
    await connection.execute(`ALTER TABLE ${tableName} MODIFY ${row.COLUMN_NAME}
      GENERATED ${generation} AS IDENTITY (START WITH LIMIT VALUE)`);
  }
}

async function executeWithTableTriggersDisabled(connection, tableName, operation) {
  const triggerResult = await connection.execute(`SELECT trigger_name FROM user_triggers
    WHERE table_name=:tableName AND status='ENABLED' ORDER BY trigger_name`, { tableName });
  const triggers = triggerResult.rows.map((row) => row.TRIGGER_NAME);
  try {
    for (const trigger of triggers) await connection.execute(`ALTER TRIGGER ${trigger} DISABLE`);
    return await operation();
  } finally {
    for (const trigger of triggers) {
      try { await connection.execute(`ALTER TRIGGER ${trigger} ENABLE`); } catch (error) { console.error(`Unable to re-enable trigger ${trigger}:`, error); }
    }
  }
}

async function tableSyncKeyColumns(connection, tableName) {
  const override = DB_SYNC_KEY_OVERRIDES.get(tableName);
  if (override) return override;
  const result = await connection.execute(`SELECT c.constraint_name, c.constraint_type, cc.column_name, cc.position
    FROM user_constraints c
    JOIN user_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name
    WHERE c.table_name=:tableName AND c.constraint_type IN ('P','U')
    ORDER BY c.constraint_name, cc.position`, { tableName });
  const constraints = new Map();
  for (const row of result.rows) {
    const current = constraints.get(row.CONSTRAINT_NAME) ?? { type: row.CONSTRAINT_TYPE, columns: [] };
    current.columns.push(row.COLUMN_NAME);
    constraints.set(row.CONSTRAINT_NAME, current);
  }
  const candidates = [...constraints.values()];
  const stableUid = candidates.find((candidate) => candidate.columns.length === 1 && candidate.columns[0].endsWith('_UID'));
  const primaryKey = candidates.find((candidate) => candidate.type === 'P');
  const uniqueKey = candidates.find((candidate) => candidate.type === 'U');
  return (stableUid ?? uniqueKey ?? primaryKey)?.columns ?? [];
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

async function materializeOracleLobs(rows, columns) {
  const lobColumns = columns.filter((column) => ['CLOB', 'NCLOB', 'BLOB'].includes(column.DATA_TYPE));
  if (!lobColumns.length) return rows;
  return Promise.all(rows.map(async (row) => {
    const materialized = { ...row };
    for (const column of lobColumns) {
      const value = row[column.COLUMN_NAME];
      if (value != null && typeof value.getData === 'function') materialized[column.COLUMN_NAME] = await value.getData();
    }
    return materialized;
  }));
}

async function oracleValueText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value.getData === 'function') return String(await value.getData());
  return String(value);
}

async function remapPositionScopeIds(source, destination, rows) {
  if (!rows.length) return rows;
  const [sourceDepartments, targetDepartments, sourceOffices, targetOffices] = await Promise.all([
    source.execute(`SELECT department_id, department_code FROM bes_departments`),
    destination.execute(`SELECT department_id, department_code FROM bes_departments`),
    source.execute(`SELECT office_id, department_id, office_name FROM bes_offices`),
    destination.execute(`SELECT office_id, department_id, office_name FROM bes_offices`),
  ]);
  const sourceDepartmentCodes = new Map(sourceDepartments.rows.map((row) => [String(row.DEPARTMENT_ID), normalize(row.DEPARTMENT_CODE).toUpperCase()]));
  const targetDepartmentIds = new Map(targetDepartments.rows.map((row) => [normalize(row.DEPARTMENT_CODE).toUpperCase(), row.DEPARTMENT_ID]));
  const sourceOfficeScopes = new Map(sourceOffices.rows.map((row) => [String(row.OFFICE_ID), {
    departmentCode: sourceDepartmentCodes.get(String(row.DEPARTMENT_ID)),
    officeName: normalize(row.OFFICE_NAME).toUpperCase(),
  }]));
  const targetOfficeIds = new Map(targetOffices.rows.map((row) => {
    const departmentCode = [...targetDepartmentIds.entries()].find(([, id]) => String(id) === String(row.DEPARTMENT_ID))?.[0] ?? '';
    return [`${departmentCode}\u0000${normalize(row.OFFICE_NAME).toUpperCase()}`, row.OFFICE_ID];
  }));
  return rows.map((row) => {
    const departmentCode = sourceDepartmentCodes.get(String(row.DEPARTMENT_ID ?? '')) ?? '';
    const officeScope = row.OFFICE_ID == null ? null : sourceOfficeScopes.get(String(row.OFFICE_ID));
    return {
      ...row,
      DEPARTMENT_ID: departmentCode ? (targetDepartmentIds.get(departmentCode) ?? row.DEPARTMENT_ID) : row.DEPARTMENT_ID,
      OFFICE_ID: officeScope ? (targetOfficeIds.get(`${officeScope.departmentCode}\u0000${officeScope.officeName}`) ?? row.OFFICE_ID) : null,
    };
  });
}

async function remapCsrEventRequestIds(source, destination, rows) {
  if (!rows.length) return rows;
  const [sourceRequests, destinationRequests] = await Promise.all([
    source.execute(`SELECT csr_id, csr_uid FROM bes_csr_requests`),
    destination.execute(`SELECT csr_id, csr_uid FROM bes_csr_requests`),
  ]);
  const sourceUids = new Map(sourceRequests.rows.map((row) => [String(row.CSR_ID), row.CSR_UID]));
  const destinationIds = new Map(destinationRequests.rows.map((row) => [row.CSR_UID, row.CSR_ID]));
  return rows.map((row) => {
    const requestUid = sourceUids.get(String(row.CSR_ID));
    const destinationId = requestUid ? destinationIds.get(requestUid) : null;
    if (destinationId == null) throw Object.assign(new Error(`CSR event ${row.EVENT_UID ?? row.EVENT_ID} references a CSR request that is not present in the destination.`), { statusCode: 400 });
    return { ...row, CSR_ID: destinationId };
  });
}

function parentFirstRows(rows, idColumn, parentColumn) {
  const remaining = [...rows]; const ordered = []; const inserted = new Set();
  while (remaining.length) {
    const index = remaining.findIndex((row) => row[parentColumn] == null || inserted.has(String(row[parentColumn])) || !remaining.some((candidate) => String(candidate[idColumn]) === String(row[parentColumn])));
    const [row] = remaining.splice(index < 0 ? 0 : index, 1); ordered.push(row); inserted.add(String(row[idColumn]));
  }
  return ordered;
}

async function remapUserReferenceIds(source, destination, rows, columns) {
  if (!rows.length || !columns.length) return rows;
  const [sourceUsers, destinationUsers] = await Promise.all([source.execute(`SELECT user_id,username FROM bes_users`), destination.execute(`SELECT user_id,username FROM bes_users`)]);
  const usernameBySourceId = new Map(sourceUsers.rows.map((row) => [String(row.USER_ID), normalize(row.USERNAME).toLowerCase()]));
  const destinationIdByUsername = new Map(destinationUsers.rows.map((row) => [normalize(row.USERNAME).toLowerCase(), row.USER_ID]));
  return rows.map((row) => ({ ...row, ...Object.fromEntries(columns.map((column) => { const username = row[column] == null ? null : usernameBySourceId.get(String(row[column])); return [column, username ? destinationIdByUsername.get(username) ?? null : null]; })) }));
}

async function pushOracleSchema(targetDetails, requestedTables) {
  const selected = expandSyncSelection(requestedTables);
  if (selected.length === 0) throw Object.assign(new Error('Select at least one BES table for schema push.'), { statusCode: 400 });
  const target = await oracledb.getConnection(oracleTargetConfig(targetDetails));
  try {
    return await withLocalConnection(async (source) => {
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
    let syncStage = 'reading metadata';
    try {
      const columnMetadata = await tableColumnMetadata(source, table);
      const columns = columnMetadata.map((column) => column.COLUMN_NAME);
      const syncKeyColumns = await tableSyncKeyColumns(source, table);
      if (syncKeyColumns.length === 0) throw Object.assign(new Error(`${table} has no primary or unique key. Safe append/update sync did not modify this table.`), { statusCode: 400 });
      const primaryKeyColumns = await tablePrimaryKeyColumns(source, table);
      const identityColumns = await tableIdentityColumns(destination, table);
      syncStage = 'reading source rows';
      const sourceResult = await source.execute(`SELECT ${columns.join(', ')} FROM ${table}`);
      sourceResult.rows = await materializeOracleLobs(sourceResult.rows, columnMetadata);
      let memberProgramParents = null;
      if (table === 'BES_POSITIONS') sourceResult.rows = await remapPositionScopeIds(source, destination, sourceResult.rows);
      if (table === 'BES_CSR_EVENTS' || table === 'BES_CSR_ATTACHMENTS') sourceResult.rows = await remapCsrEventRequestIds(source, destination, sourceResult.rows);
      if (table === 'BES_MEMBER_OPS_PROGRAMS') sourceResult.rows = parentFirstRows(sourceResult.rows, 'PROGRAM_UID', 'PARENT_PROGRAM_UID');
      if (['BES_MEMBER_PROGRAMS','BES_MEMBER_OPS_PROGRAMS','BES_MEMBER_OPS_ACTIVITIES'].includes(table)) {
        sourceResult.rows = await remapUserReferenceIds(source, destination, sourceResult.rows, columns.filter((column) => ['CREATED_BY_USER_ID','UPDATED_BY_USER_ID'].includes(column)));
      }
      if (table === 'BES_MEMBER_PROGRAMS') {
        const uidBySourceId = new Map(sourceResult.rows.map((row) => [String(row.PROGRAM_ID), row.PROGRAM_UID]));
        memberProgramParents = sourceResult.rows.map((row) => ({ programUid: row.PROGRAM_UID, parentUid: row.PARENT_PROGRAM_ID == null ? null : uidBySourceId.get(String(row.PARENT_PROGRAM_ID)) ?? null }));
        sourceResult.rows = sourceResult.rows.map((row) => ({ ...row, PARENT_PROGRAM_ID: null }));
      }
      const immutableColumns = new Set([...syncKeyColumns, ...primaryKeyColumns]);
      const updateColumns = columns.filter((column) => !immutableColumns.has(column));
      const usesLogicalKey = syncKeyColumns.some((column) => !primaryKeyColumns.includes(column));
      const insertColumns = usesLogicalKey ? columns.filter((column) => !identityColumns.includes(column)) : columns;
      if (usesLogicalKey && identityColumns.length) {
        syncStage = 'aligning destination identity';
        await alignIdentitySequences(destination, table);
      }
      const usingColumns = columns.map((column) => `:${column} ${column}`).join(', ');
      const match = syncKeyColumns.map((column) => {
        const destinationValue = DB_SYNC_CASE_INSENSITIVE_KEYS.has(column) ? `UPPER(destination.${column})` : `destination.${column}`;
        const sourceValue = DB_SYNC_CASE_INSENSITIVE_KEYS.has(column) ? `UPPER(source.${column})` : `source.${column}`;
        return `(${destinationValue}=${sourceValue} OR (destination.${column} IS NULL AND source.${column} IS NULL))`;
      }).join(' AND ');
      const update = updateColumns.length ? `WHEN MATCHED THEN UPDATE SET ${updateColumns.map((column) => `destination.${column}=source.${column}`).join(', ')}` : '';
      const mergeSql = `MERGE INTO ${table} destination
        USING (SELECT ${usingColumns} FROM dual) source ON (${match})
        ${update}
        WHEN NOT MATCHED THEN INSERT (${insertColumns.join(', ')}) VALUES (${insertColumns.map((column) => `source.${column}`).join(', ')})`;
      if (sourceResult.rows.length > 0) {
        syncStage = 'merging rows';
        await executeWithTableTriggersDisabled(destination, table, () => destination.executeMany(mergeSql, sourceResult.rows, {
            autoCommit: false,
            bindDefs: executeManyBindDefs(columnMetadata, sourceResult.rows),
          }));
      }
      if (table === 'BES_MEMBER_PROGRAMS' && memberProgramParents?.length) {
        const destinationPrograms = await destination.execute(`SELECT program_id,program_uid FROM bes_member_programs`);
        const destinationIdByUid = new Map(destinationPrograms.rows.map((row) => [row.PROGRAM_UID, row.PROGRAM_ID]));
        for (const relation of memberProgramParents) {
          await destination.execute(`UPDATE bes_member_programs SET parent_program_id=:parentId WHERE program_uid=:programUid`, { programUid: relation.programUid, parentId: relation.parentUid ? destinationIdByUid.get(relation.parentUid) ?? null : null });
        }
      }
      report.push({ tableName: table, rowCount: sourceResult.rows.length, columns: columns.length, addedColumns: addedColumns.get(table), direction, syncKey: syncKeyColumns, note: 'Upserted; destination-only rows preserved.' });
    } catch (error) {
      if (error?.statusCode) throw error;
      const detail = normalize(error?.message) || 'Unknown Oracle error.';
      throw Object.assign(new Error(`${table} sync failed while ${syncStage}: ${detail}`), { statusCode: error?.errorNum === 1 ? 409 : 400, cause: error });
    }
  }
  await destination.commit();
  return report;
}

async function syncOracleTables(targetDetails, requestedTables, requestedDirection = 'push') {
  const selected = expandSyncSelection(requestedTables);
  if (selected.length === 0) throw Object.assign(new Error('Select at least one BES table to sync.'), { statusCode: 400 });

  const direction = ['push', 'pull', 'both'].includes(normalize(requestedDirection).toLowerCase()) ? normalize(requestedDirection).toLowerCase() : 'push';
  const target = await oracledb.getConnection(oracleTargetConfig(targetDetails));
  try {
    return await withLocalConnection(async (source) => {
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
            access_level, tool_status, owner_department_code, access_note, is_active
          FROM bes_tool_access
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
          if (row.IS_ACTIVE === 'Y') {
            byCode.get(row.TOOL_CODE).access.push({
              departmentId: row.DEPARTMENT_CODE,
              level: row.ACCESS_LEVEL,
              ...(row.OFFICE_NAME ? { unit: row.OFFICE_NAME } : {}),
              ...(row.POSITION_NAME ? { position: row.POSITION_NAME } : {}),
              ...(row.ACCESS_NOTE ? { note: row.ACCESS_NOTE } : {}),
            });
          }
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
        const uniqueAccess = new Map();
        for (const grant of access) {
          const departmentCode = normalize(grant.departmentId).toUpperCase();
          const level = normalize(grant.level).toUpperCase();
          if (!departmentCode || !['ADMIN','NEW','VIEW','EDIT','OPEN','SOON','EXISTING'].includes(level)) continue;
          const officeName = nullableNormalize(grant.unit);
          const positionName = nullableNormalize(grant.position);
          const scopeKey = [departmentCode, officeName?.toUpperCase() || '-', positionName?.toUpperCase() || '-'].join('|');
          uniqueAccess.set(scopeKey, { departmentCode, level, officeName, positionName, note: nullableNormalize(grant.note) });
        }
        for (const grant of uniqueAccess.values()) {
          await c.execute(`INSERT INTO bes_tool_access
              (tool_access_id,tool_code,tool_name,department_code,office_name,position_name,access_level,tool_status,owner_department_code,access_note,is_active)
            VALUES ((SELECT NVL(MAX(tool_access_id),0)+1 FROM bes_tool_access),:toolCode,:toolName,:departmentCode,:officeName,:positionName,:accessLevel,:toolStatus,:ownerDepartmentCode,:accessNote,'Y')`, {
            toolCode, toolName, departmentCode: grant.departmentCode,
            officeName: grant.officeName, positionName: grant.positionName,
            accessLevel: grant.level, toolStatus: status, ownerDepartmentCode: ownerDepartmentId,
            accessNote: grant.note,
          });
        }
        await c.execute(`DELETE FROM bes_task_subjects WHERE tool_code=:toolCode`, { toolCode });
        const uniqueSubjects = [...new Map(taskSubjects.map((taskSubject) => [taskSubject.toUpperCase(), taskSubject])).values()];
        for (const taskSubject of uniqueSubjects) {
          await c.execute(`INSERT INTO bes_task_subjects (tool_subject_id,tool_code,task_subject,is_active)
            VALUES ((SELECT NVL(MAX(tool_subject_id),0)+1 FROM bes_task_subjects),:toolCode,:taskSubject,'Y')`, { toolCode, taskSubject });
        }
        await c.commit();
      });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/api/admin/org-structure') {
      const structure = await withConnection(async (c) => {
        const user = await currentSessionUser(c, bearerToken(req));
        if (!user) return null;
        const departments = await c.execute(`SELECT department_id, department_code, department_name FROM bes_departments WHERE is_active='Y' ORDER BY department_name`);
        const offices = await c.execute(`SELECT office_id, department_id, parent_office_id, office_name FROM bes_offices WHERE is_active='Y' ORDER BY office_name`);
        const positions = await c.execute(`SELECT position_id, department_id, office_id, position_title, employee_class FROM bes_positions WHERE is_active='Y' ORDER BY position_title`);
        const ownAssignments = !isPerformanceManager(user) ? await c.execute(`SELECT position_id FROM bes_performance_assignments
          WHERE employee_user_id=:userId AND is_active='Y' AND assignment_mode='INCLUDE'`, { userId: user.USER_ID }) : { rows: [] };
        const ownPositionIds = new Set(ownAssignments.rows.map((assignment) => assignment.POSITION_ID));
        const visiblePositions = !isPerformanceManager(user) ? positions.rows.filter((position) => ownPositionIds.has(position.POSITION_ID) || position.POSITION_TITLE === user.POSITION_TITLE) : positions.rows;
        const employeeDepartmentIds = new Set(visiblePositions.map((position) => position.DEPARTMENT_ID ?? offices.rows.find((office) => office.OFFICE_ID === position.OFFICE_ID)?.DEPARTMENT_ID).filter(Boolean));
        const visibleDepartments = user.APP_ROLE === 'Administrator' ? departments.rows
          : !isPerformanceManager(user) ? departments.rows.filter((department) => employeeDepartmentIds.has(department.DEPARTMENT_ID))
          : departments.rows.filter((department) => department.DEPARTMENT_CODE === user.DEPARTMENT_CODE);
        const visibleOfficeIds = new Set();
        if (isOfficePerformanceManager(user) || !isPerformanceManager(user)) {
          offices.rows.filter((office) => office.OFFICE_NAME === user.UNIT_NAME).forEach((office) => visibleOfficeIds.add(office.OFFICE_ID));
          if (!isPerformanceManager(user)) visiblePositions.forEach((position) => { if (position.OFFICE_ID) visibleOfficeIds.add(position.OFFICE_ID); });
          let changed = true;
          while (changed) {
            changed = false;
            offices.rows.forEach((office) => { if (visibleOfficeIds.has(office.PARENT_OFFICE_ID) && !visibleOfficeIds.has(office.OFFICE_ID)) { visibleOfficeIds.add(office.OFFICE_ID); changed = true; } });
          }
        }
        const visibleOffices = (isOfficePerformanceManager(user) || !isPerformanceManager(user)) ? offices.rows.filter((office) => visibleOfficeIds.has(office.OFFICE_ID)) : offices.rows;
        return visibleDepartments.map((department) => ({
          id: String(department.DEPARTMENT_ID), code: department.DEPARTMENT_CODE, name: department.DEPARTMENT_NAME,
          positions: visiblePositions.filter((position) => position.DEPARTMENT_ID === department.DEPARTMENT_ID && !position.OFFICE_ID).map((position) => ({
            id: String(position.POSITION_ID), title: position.POSITION_TITLE, employeeClass: position.EMPLOYEE_CLASS,
          })),
          offices: visibleOffices.filter((office) => office.DEPARTMENT_ID === department.DEPARTMENT_ID).map((office) => ({
            id: String(office.OFFICE_ID), name: office.OFFICE_NAME, parentOfficeId: office.PARENT_OFFICE_ID ? String(office.PARENT_OFFICE_ID) : null,
            positions: visiblePositions.filter((position) => position.OFFICE_ID === office.OFFICE_ID).map((position) => ({
              id: String(position.POSITION_ID), title: position.POSITION_TITLE, employeeClass: position.EMPLOYEE_CLASS,
            })),
          })),
        }));
      });
      if (!structure) return json(res, 401, { error: 'Session expired.' });
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
    if (req.method === 'GET' && req.url === '/api/position-dr-pl') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const profiles = await c.execute(`SELECT position_id, position_purpose, employment_level, reports_to, area_of_work,
            position_levels_json, max_level, competency_notes_json, categories_json, duties_json, source_document FROM bes_position_dr_pl ORDER BY position_id`);
        return profiles.rows.map((profile) => {
          let positionLevels = [];
          let categories = [];
          let competencyNotes = [];
          let duties = [];
          try { positionLevels = JSON.parse(String(profile.POSITION_LEVELS_JSON || '[]')); } catch { positionLevels = []; }
          try { categories = JSON.parse(String(profile.CATEGORIES_JSON || '[]')); } catch { categories = []; }
          try { competencyNotes = JSON.parse(String(profile.COMPETENCY_NOTES_JSON || '[]')); } catch { competencyNotes = []; }
          if (!competencyNotes.length) competencyNotes = [
            { level: 2, name: 'Basic', description: 'Basic/general understanding of the field to perform job duties.' },
            { level: 3, name: 'Proficient', description: 'Sufficient understanding and experience to perform job duties. Can generalize basic principles to effectively function in both predictable and new situations.' },
            { level: 4, name: 'Advanced', description: 'Broad and deep understanding and skills, with substantial experience in this area. Can apply the competency regularly and display this competency in complex, varied situations.' },
          ];
          try { duties = JSON.parse(String(profile.DUTIES_JSON || '[]')); } catch { duties = []; }
          if (!categories.length) categories = [...new Set(duties.map((duty) => duty.kra).filter(Boolean))];
          return { positionId: String(profile.POSITION_ID), purpose: profile.POSITION_PURPOSE || '', employmentLevel: profile.EMPLOYMENT_LEVEL || '',
            reportsTo: profile.REPORTS_TO || '', areaOfWork: profile.AREA_OF_WORK || '', positionLevels, maxLevel: Number(profile.MAX_LEVEL) || 4, competencyNotes, categories, duties, sourceDocument: profile.SOURCE_DOCUMENT };
        });
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { profiles: result });
    }
    const positionDrPlUpdateMatch = req.url.match(/^\/api\/position-dr-pl\/(\d+)$/);
    if (req.method === 'PUT' && positionDrPlUpdateMatch) {
      const token = bearerToken(req);
      const positionId = Number(positionDrPlUpdateMatch[1]);
      const body = await readBody(req);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        if (!isPerformanceManager(user)) throw Object.assign(new Error('Supervisor or administrator access is required.'), { statusCode: 403 });
        const maxLevel = Number(body.maxLevel);
        if (!Number.isInteger(maxLevel) || maxLevel < 2 || maxLevel > 20) throw Object.assign(new Error('Max Level must be an integer from 2 to 20.'), { statusCode: 400 });
        const purpose = normalize(body.purpose);
        const employmentLevel = normalize(body.employmentLevel);
        const reportsTo = normalize(body.reportsTo);
        const areaOfWork = normalize(body.areaOfWork);
        if (!purpose || !employmentLevel || !reportsTo || !areaOfWork) throw Object.assign(new Error('All position details are required.'), { statusCode: 400 });
        const competencyNotes = Array.isArray(body.competencyNotes) ? body.competencyNotes.map((note) => ({ level: Number(note.level), name: normalize(note.name), description: normalize(note.description) })).filter((note) => Number.isInteger(note.level) && note.level >= 2 && note.level <= maxLevel && note.name && note.description) : [];
        const categories = Array.isArray(body.categories) ? [...new Set(body.categories.map((item) => normalize(item)).filter(Boolean))] : [];
        const duties = Array.isArray(body.duties) ? body.duties.filter((duty) => duty && normalize(duty.id) && normalize(duty.kra) && normalize(duty.description)).map((duty) => ({
          id: normalize(duty.id), kra: normalize(duty.kra), kraWeight: Number(duty.kraWeight) || 0, description: normalize(duty.description),
          applicableLevels: Array.isArray(duty.applicableLevels) ? duty.applicableLevels.map((item) => normalize(item)).filter(Boolean) : [],
          competency: normalize(duty.competency), levelRequirement: normalize(duty.levelRequirement),
        })) : [];
        await c.execute(`UPDATE bes_position_dr_pl SET position_purpose=:purpose, employment_level=:employmentLevel, reports_to=:reportsTo, area_of_work=:areaOfWork, max_level=:maxLevel, competency_notes_json=:competencyNotes, categories_json=:categories, duties_json=:duties, updated_by_user_id=:updatedBy, updated_at=SYSTIMESTAMP WHERE position_id=:positionId`, {
          purpose, employmentLevel, reportsTo, areaOfWork, maxLevel, competencyNotes: JSON.stringify(competencyNotes), categories: JSON.stringify(categories), duties: JSON.stringify(duties), updatedBy: user.USER_ID, positionId,
        });
        const saved = await c.execute(`SELECT position_id, position_purpose, employment_level, reports_to, area_of_work, position_levels_json, source_document FROM bes_position_dr_pl WHERE position_id=:positionId`, { positionId });
        if (!saved.rows.length) throw Object.assign(new Error('Position DR / PL record was not found.'), { statusCode: 404 });
        let positionLevels = [];
        try { positionLevels = JSON.parse(String(saved.rows[0].POSITION_LEVELS_JSON || '[]')); } catch { positionLevels = []; }
        await c.commit();
        const profile = saved.rows[0];
        return { positionId: String(positionId), purpose, employmentLevel, reportsTo, areaOfWork, positionLevels, maxLevel, competencyNotes, categories, duties, sourceDocument: profile.SOURCE_DOCUMENT };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { profile: result });
    }
    if (req.method === 'GET' && req.url === '/api/performance-assignments') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const assignments = await c.execute(`SELECT a.assignment_id, a.position_id, a.employee_user_id, a.detail_order, a.effective_start, a.effective_end, a.assignment_mode, a.current_level,
            u.department_code, u.unit_name FROM bes_performance_assignments a JOIN bes_users u ON u.user_id=a.employee_user_id
          WHERE a.is_active='Y' ORDER BY a.created_at`);
        assignments.rows = assignments.rows.filter((assignment) => canAccessPerformanceEmployee(user, assignment));
        return assignments.rows.map((assignment) => ({
          id: String(assignment.ASSIGNMENT_ID), positionId: String(assignment.POSITION_ID), employeeUserId: String(assignment.EMPLOYEE_USER_ID),
          detailOrder: assignment.DETAIL_ORDER, effectiveStart: localDateOnly(assignment.EFFECTIVE_START) || null, effectiveEnd: localDateOnly(assignment.EFFECTIVE_END) || null,
          mode: assignment.ASSIGNMENT_MODE || 'INCLUDE', currentLevel: assignment.CURRENT_LEVEL == null ? null : Number(assignment.CURRENT_LEVEL),
        }));
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { assignments: result });
    }
    if (req.method === 'POST' && req.url === '/api/performance-assignments') {
      const token = bearerToken(req);
      const body = await readBody(req);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        if (!isPerformanceManager(user)) throw Object.assign(new Error('Supervisor or administrator access is required.'), { statusCode: 403 });
        const positionId = Number(body.positionId);
        const employeeUserId = Number(body.employeeUserId);
        const detailOrder = nullableNormalize(body.detailOrder);
        const effectiveStart = nullableNormalize(body.effectiveStart);
        const effectiveEnd = nullableNormalize(body.effectiveEnd);
        const currentLevel = Number(body.currentLevel);
        if (!positionId || !employeeUserId) throw Object.assign(new Error('Position and employee are required.'), { statusCode: 400 });
        if (![1, 2, 3, 4].includes(currentLevel)) throw Object.assign(new Error('Current level must be 1, 2, 3, or 4.'), { statusCode: 400 });
        if ([effectiveStart, effectiveEnd].some((date) => date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw Object.assign(new Error('Effective dates must be valid dates.'), { statusCode: 400 });
        await c.execute(`MERGE INTO bes_performance_assignments a
          USING (SELECT :positionId position_id, :employeeUserId employee_user_id FROM dual) src
          ON (a.position_id=src.position_id AND a.employee_user_id=src.employee_user_id)
          WHEN MATCHED THEN UPDATE SET detail_order=:detailOrder, current_level=:currentLevel,
            effective_start=CASE WHEN :effectiveStart IS NULL THEN NULL ELSE TO_DATE(:effectiveStart,'YYYY-MM-DD') END,
            effective_end=CASE WHEN :effectiveEnd IS NULL THEN NULL ELSE TO_DATE(:effectiveEnd,'YYYY-MM-DD') END,
            assignment_mode='INCLUDE', is_active='Y', updated_at=SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT (position_id,employee_user_id,detail_order,current_level,effective_start,effective_end,assignment_mode,created_by_user_id)
            VALUES (:positionId,:employeeUserId,:detailOrder,:currentLevel,
              CASE WHEN :effectiveStart IS NULL THEN NULL ELSE TO_DATE(:effectiveStart,'YYYY-MM-DD') END,
              CASE WHEN :effectiveEnd IS NULL THEN NULL ELSE TO_DATE(:effectiveEnd,'YYYY-MM-DD') END,'INCLUDE',:createdByUserId)`, {
          positionId, employeeUserId, detailOrder, currentLevel, effectiveStart, effectiveEnd, createdByUserId: user.USER_ID,
        });
        const saved = await c.execute(`SELECT assignment_id FROM bes_performance_assignments WHERE position_id=:positionId AND employee_user_id=:employeeUserId`, { positionId, employeeUserId });
        await c.commit();
        return { id: String(saved.rows[0].ASSIGNMENT_ID), positionId: String(positionId), employeeUserId: String(employeeUserId), detailOrder, effectiveStart, effectiveEnd, mode: 'INCLUDE', currentLevel };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 201, { assignment: result });
    }
    const performanceAssignmentDeleteMatch = url.pathname.match(/^\/api\/performance-assignments\/(\d+)\/(\d+)$/);
    if (req.method === 'DELETE' && performanceAssignmentDeleteMatch) {
      const token = bearerToken(req);
      const positionId = Number(performanceAssignmentDeleteMatch[1]);
      const employeeUserId = Number(performanceAssignmentDeleteMatch[2]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        if (!isPerformanceManager(user)) throw Object.assign(new Error('Supervisor or administrator access is required.'), { statusCode: 403 });
        await c.execute(`MERGE INTO bes_performance_assignments a USING (SELECT :positionId position_id, :employeeUserId employee_user_id FROM dual) src
          ON (a.position_id=src.position_id AND a.employee_user_id=src.employee_user_id)
          WHEN MATCHED THEN UPDATE SET assignment_mode='EXCLUDE', is_active='Y', updated_at=SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT (position_id,employee_user_id,assignment_mode,is_active,created_by_user_id)
            VALUES (:positionId,:employeeUserId,'EXCLUDE','Y',:createdByUserId)`, { positionId, employeeUserId, createdByUserId: user.USER_ID });
        const saved = await c.execute(`SELECT assignment_id FROM bes_performance_assignments WHERE position_id=:positionId AND employee_user_id=:employeeUserId`, { positionId, employeeUserId });
        await c.commit();
        return { id: String(saved.rows[0].ASSIGNMENT_ID), positionId: String(positionId), employeeUserId: String(employeeUserId), detailOrder: null, effectiveStart: null, effectiveEnd: null, mode: 'EXCLUDE' };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { assignment: result });
    }
    if (req.method === 'GET' && req.url === '/api/employee-skill-checks') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const checks = await c.execute(`SELECT c.employee_user_id, c.position_id, c.duty_id, c.attained, c.level_2, c.level_3, c.level_4, c.levels_json, c.remarks, c.assessed_at,
            u.department_code, u.unit_name FROM bes_employee_skill_checks c JOIN bes_users u ON u.user_id=c.employee_user_id
          ORDER BY c.employee_user_id,c.position_id,c.duty_id`);
        checks.rows = checks.rows.filter((check) => canAccessPerformanceEmployee(user, check));
        return checks.rows.map((check) => { let levels = []; try { levels = JSON.parse(String(check.LEVELS_JSON || '[]')); } catch { levels = []; }
          if (!levels.length) levels = [2, 3, 4].filter((level) => check[`LEVEL_${level}`] === 'Y');
          return { employeeUserId: String(check.EMPLOYEE_USER_ID), positionId: String(check.POSITION_ID), dutyId: check.DUTY_ID,
            attained: levels.length > 0, level2: levels.includes(2), level3: levels.includes(3), level4: levels.includes(4), levels,
            remarks: check.REMARKS, assessedAt: localIso(check.ASSESSED_AT) || null }; });
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { checks: result });
    }
    if (req.method === 'PUT' && req.url === '/api/employee-skill-checks') {
      const token = bearerToken(req);
      const body = await readBody(req);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        if (!isPerformanceManager(user)) throw Object.assign(new Error('Supervisor or administrator access is required.'), { statusCode: 403 });
        const employeeUserId = Number(body.employeeUserId);
        const positionId = Number(body.positionId);
        const dutyId = normalize(body.dutyId);
        const levels = Array.isArray(body.levels) ? [...new Set(body.levels.map(Number).filter((level) => Number.isInteger(level) && level >= 2 && level <= 20))] : [];
        const level2 = levels.includes(2) ? 'Y' : 'N';
        const level3 = levels.includes(3) ? 'Y' : 'N';
        const level4 = levels.includes(4) ? 'Y' : 'N';
        const attained = level2 === 'Y' || level3 === 'Y' || level4 === 'Y' ? 'Y' : 'N';
        const remarks = nullableNormalize(body.remarks);
        if (!employeeUserId || !positionId || !dutyId) throw Object.assign(new Error('Employee, position, and duty are required.'), { statusCode: 400 });
        await c.execute(`MERGE INTO bes_employee_skill_checks check_row USING (SELECT :employeeUserId employee_user_id, :positionId position_id, :dutyId duty_id FROM dual) src
          ON (check_row.employee_user_id=src.employee_user_id AND check_row.position_id=src.position_id AND check_row.duty_id=src.duty_id)
          WHEN MATCHED THEN UPDATE SET attained=:attained, level_2=:level2, level_3=:level3, level_4=:level4, levels_json=:levelsJson, remarks=:remarks, assessed_by_user_id=:assessedBy,
            assessed_at=SYSTIMESTAMP, updated_at=SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT (employee_user_id,position_id,duty_id,attained,level_2,level_3,level_4,levels_json,remarks,assessed_by_user_id,assessed_at)
            VALUES (:employeeUserId,:positionId,:dutyId,:attained,:level2,:level3,:level4,:levelsJson,:remarks,:assessedBy,SYSTIMESTAMP)`, {
          employeeUserId, positionId, dutyId, attained, level2, level3, level4, levelsJson: JSON.stringify(levels), remarks, assessedBy: user.USER_ID,
        });
        await c.commit();
        return { employeeUserId: String(employeeUserId), positionId: String(positionId), dutyId, attained: attained === 'Y',
          level2: level2 === 'Y', level3: level3 === 'Y', level4: level4 === 'Y', levels, remarks, assessedAt: new Date().toISOString() };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { check: result });
    }
    if (req.method === 'GET' && req.url === '/api/performance-plans') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const plans = await c.execute(`SELECT p.plan_id, p.employee_user_id, p.cycle_label, p.period_start, p.period_end, p.plan_status,
            u.employee_no, u.first_name, u.middle_name, u.last_name, u.suffix, u.department_code, u.unit_name
          FROM bes_performance_plans p JOIN bes_users u ON u.user_id=p.employee_user_id
          ORDER BY p.period_start DESC, u.last_name, u.first_name`);
        const targets = await c.execute(`SELECT target_id, plan_id, target_description, measure_type, target_value, target_unit,
            target_weight, due_date, actual_value, target_status
          FROM bes_performance_targets ORDER BY plan_id, sort_order, target_id`);
        const accomplishments = await c.execute(`SELECT accomplishment_id, target_id, accomplishment_description, accomplished_quantity, accomplished_on, created_at
          FROM bes_performance_accomplishments ORDER BY target_id, created_at, accomplishment_id`);
        const evidence = await c.execute(`SELECT evidence_id, accomplishment_id, file_name, mime_type, file_size
          FROM bes_performance_evidence ORDER BY accomplishment_id, evidence_id`);
        return plans.rows.filter((plan) => canAccessPerformanceEmployee(user, plan)).map((plan) => ({
          id: String(plan.PLAN_ID), employeeUserId: String(plan.EMPLOYEE_USER_ID), employeeNo: plan.EMPLOYEE_NO,
          employeeName: [plan.FIRST_NAME, plan.MIDDLE_NAME, plan.LAST_NAME, plan.SUFFIX].filter(Boolean).join(' '),
          cycleLabel: plan.CYCLE_LABEL, periodStart: localDateOnly(plan.PERIOD_START), periodEnd: localDateOnly(plan.PERIOD_END), status: plan.PLAN_STATUS,
          targets: targets.rows.filter((target) => target.PLAN_ID === plan.PLAN_ID).map((target) => ({
            id: String(target.TARGET_ID), description: target.TARGET_DESCRIPTION, measureType: target.MEASURE_TYPE,
            targetValue: Number(target.TARGET_VALUE), unit: target.TARGET_UNIT, weight: Number(target.TARGET_WEIGHT),
            dueDate: localDateOnly(target.DUE_DATE) || null, actualValue: target.ACTUAL_VALUE == null ? null : Number(target.ACTUAL_VALUE), status: target.TARGET_STATUS,
            accomplishments: accomplishments.rows.filter((item) => item.TARGET_ID === target.TARGET_ID).map((item) => ({
              id: String(item.ACCOMPLISHMENT_ID), description: item.ACCOMPLISHMENT_DESCRIPTION, quantity: Number(item.ACCOMPLISHED_QUANTITY),
              accomplishedOn: localDateOnly(item.ACCOMPLISHED_ON) || null, createdAt: item.CREATED_AT,
              evidence: evidence.rows.filter((file) => file.ACCOMPLISHMENT_ID === item.ACCOMPLISHMENT_ID).map((file) => ({ id: String(file.EVIDENCE_ID), name: file.FILE_NAME, mimeType: file.MIME_TYPE, size: Number(file.FILE_SIZE) })),
            })),
          })),
        }));
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { plans: result });
    }
    if (req.method === 'POST' && req.url === '/api/performance-plans') {
      const token = bearerToken(req);
      const body = await readBody(req);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        if (!isPerformanceManager(user)) throw Object.assign(new Error('Supervisor or administrator access is required.'), { statusCode: 403 });
        const employeeUserId = Number(body.employeeUserId);
        const cycleLabel = normalize(body.cycleLabel);
        const periodStart = normalize(body.periodStart);
        const periodEnd = normalize(body.periodEnd);
        if (!employeeUserId || !cycleLabel || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) throw Object.assign(new Error('Employee, cycle, and valid period dates are required.'), { statusCode: 400 });
        await c.execute(`INSERT INTO bes_performance_plans (employee_user_id,cycle_label,period_start,period_end,created_by_user_id)
          VALUES (:employeeUserId,:cycleLabel,TO_DATE(:periodStart,'YYYY-MM-DD'),TO_DATE(:periodEnd,'YYYY-MM-DD'),:createdByUserId)`, {
          employeeUserId, cycleLabel, periodStart, periodEnd, createdByUserId: user.USER_ID,
        });
        const created = await c.execute(`SELECT p.plan_id, u.employee_no, u.first_name, u.middle_name, u.last_name, u.suffix
          FROM bes_performance_plans p JOIN bes_users u ON u.user_id=p.employee_user_id
          WHERE p.employee_user_id=:employeeUserId AND UPPER(p.cycle_label)=UPPER(:cycleLabel)`, { employeeUserId, cycleLabel });
        await c.commit();
        const plan = created.rows[0];
        return { id: String(plan.PLAN_ID), employeeUserId: String(employeeUserId), employeeNo: plan.EMPLOYEE_NO,
          employeeName: [plan.FIRST_NAME, plan.MIDDLE_NAME, plan.LAST_NAME, plan.SUFFIX].filter(Boolean).join(' '),
          cycleLabel, periodStart, periodEnd, status: 'DRAFT', targets: [] };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 201, { plan: result });
    }
    const performancePlanUpdateMatch = url.pathname.match(/^\/api\/performance-plans\/(\d+)$/);
    if (req.method === 'PATCH' && performancePlanUpdateMatch) {
      const token = bearerToken(req);
      const body = await readBody(req);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        if (!isPerformanceManager(user)) throw Object.assign(new Error('Supervisor or administrator access is required.'), { statusCode: 403 });
        const planId = Number(performancePlanUpdateMatch[1]);
        const cycleLabel = normalize(body.cycleLabel);
        const periodStart = normalize(body.periodStart);
        const periodEnd = normalize(body.periodEnd);
        const status = normalize(body.status).toUpperCase();
        if (!cycleLabel || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || !['DRAFT','ACTIVE','COMPLETED','REVIEWED'].includes(status)) {
          throw Object.assign(new Error('Cycle, valid period dates, and a valid plan status are required.'), { statusCode: 400 });
        }
        const owner = await c.execute(`SELECT p.employee_user_id, u.employee_no, u.first_name, u.middle_name, u.last_name, u.suffix, u.department_code, u.unit_name
          FROM bes_performance_plans p JOIN bes_users u ON u.user_id=p.employee_user_id WHERE p.plan_id=:planId`, { planId });
        const employee = owner.rows[0];
        if (!employee) throw Object.assign(new Error('Performance plan was not found.'), { statusCode: 404 });
        if (!canAccessPerformanceEmployee(user, employee, true)) throw Object.assign(new Error('You are not allowed to edit this performance plan.'), { statusCode: 403 });
        await c.execute(`UPDATE bes_performance_plans SET cycle_label=:cycleLabel,
          period_start=TO_DATE(:periodStart,'YYYY-MM-DD'), period_end=TO_DATE(:periodEnd,'YYYY-MM-DD'),
          plan_status=:status, updated_at=SYSTIMESTAMP WHERE plan_id=:planId`, { planId, cycleLabel, periodStart, periodEnd, status });
        await c.commit();
        return { id: String(planId), employeeUserId: String(employee.EMPLOYEE_USER_ID), employeeNo: employee.EMPLOYEE_NO,
          employeeName: [employee.FIRST_NAME, employee.MIDDLE_NAME, employee.LAST_NAME, employee.SUFFIX].filter(Boolean).join(' '),
          cycleLabel, periodStart, periodEnd, status, targets: [] };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { plan: result });
    }
    const performanceTargetMatch = url.pathname.match(/^\/api\/performance-plans\/(\d+)\/targets$/);
    if (req.method === 'POST' && performanceTargetMatch) {
      const token = bearerToken(req);
      const body = await readBody(req);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        if (!isPerformanceManager(user)) throw Object.assign(new Error('Supervisor or administrator access is required.'), { statusCode: 403 });
        const planId = Number(performanceTargetMatch[1]);
        const description = normalize(body.description);
        const measureType = normalize(body.measureType).toUpperCase();
        const targetValue = Number(body.targetValue);
        const unit = normalize(body.unit);
        const weight = Number(body.weight);
        const dueDate = nullableNormalize(body.dueDate);
        if (!description || !['COUNT','PERCENTAGE','MILESTONE','COMPLIANCE'].includes(measureType) || !(targetValue > 0) || !unit || !(weight >= 0 && weight <= 100)) throw Object.assign(new Error('Description, measurement, positive target, unit, and a 0–100 weight are required.'), { statusCode: 400 });
        const weightResult = await c.execute(`SELECT NVL(SUM(target_weight),0) total_weight FROM bes_performance_targets WHERE plan_id=:planId`, { planId });
        if (Number(weightResult.rows[0]?.TOTAL_WEIGHT ?? 0) + weight > 100) throw Object.assign(new Error('Target weights for a plan cannot exceed 100%.'), { statusCode: 400 });
        const inserted = await c.execute(`INSERT INTO bes_performance_targets (plan_id,target_description,measure_type,target_value,target_unit,target_weight,due_date,sort_order)
          VALUES (:planId,:description,:measureType,:targetValue,:unit,:weight,CASE WHEN :dueDate IS NULL THEN NULL ELSE TO_DATE(:dueDate,'YYYY-MM-DD') END,
            (SELECT NVL(MAX(sort_order),0)+10 FROM bes_performance_targets WHERE plan_id=:planId)) RETURNING target_id INTO :targetId`, {
          planId, description, measureType, targetValue, unit, weight, dueDate,
          targetId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        });
        await c.commit();
        return { id: String(inserted.outBinds.targetId[0]), description, measureType, targetValue, unit, weight, dueDate, actualValue: null, status: 'NOT_STARTED' };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 201, { target: result });
    }
    const performanceTargetUpdateMatch = url.pathname.match(/^\/api\/performance-plans\/(\d+)\/targets\/(\d+)$/);
    if (req.method === 'PATCH' && performanceTargetUpdateMatch) {
      const token = bearerToken(req);
      const body = await readBody(req);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        if (!isPerformanceManager(user)) throw Object.assign(new Error('Supervisor or administrator access is required.'), { statusCode: 403 });
        const planId = Number(performanceTargetUpdateMatch[1]);
        const targetId = Number(performanceTargetUpdateMatch[2]);
        const description = normalize(body.description);
        const measureType = normalize(body.measureType).toUpperCase();
        const targetValue = Number(body.targetValue);
        const unit = normalize(body.unit);
        const weight = Number(body.weight);
        const dueDate = nullableNormalize(body.dueDate);
        if (!description || !['COUNT','PERCENTAGE','MILESTONE','COMPLIANCE'].includes(measureType) || !(targetValue > 0) || !unit || !(weight >= 0 && weight <= 100)) throw Object.assign(new Error('Description, measurement, positive target, unit, and a 0–100 weight are required.'), { statusCode: 400 });
        const weightResult = await c.execute(`SELECT NVL(SUM(target_weight),0) total_weight FROM bes_performance_targets WHERE plan_id=:planId AND target_id<>:targetId`, { planId, targetId });
        if (Number(weightResult.rows[0]?.TOTAL_WEIGHT ?? 0) + weight > 100) throw Object.assign(new Error('Target weights for a plan cannot exceed 100%.'), { statusCode: 400 });
        const updated = await c.execute(`UPDATE bes_performance_targets SET target_description=:description, measure_type=:measureType, target_value=:targetValue,
          target_unit=:unit, target_weight=:weight, due_date=CASE WHEN :dueDate IS NULL THEN NULL ELSE TO_DATE(:dueDate,'YYYY-MM-DD') END, updated_at=SYSTIMESTAMP
          WHERE plan_id=:planId AND target_id=:targetId`, { description, measureType, targetValue, unit, weight, dueDate, planId, targetId });
        if (!updated.rowsAffected) throw Object.assign(new Error('Performance target was not found.'), { statusCode: 404 });
        const current = await c.execute(`SELECT actual_value, target_status FROM bes_performance_targets WHERE target_id=:targetId`, { targetId });
        await c.commit();
        return { id: String(targetId), description, measureType, targetValue, unit, weight, dueDate, actualValue: current.rows[0]?.ACTUAL_VALUE == null ? null : Number(current.rows[0].ACTUAL_VALUE), status: current.rows[0]?.TARGET_STATUS ?? 'NOT_STARTED' };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { target: result });
    }
    const performanceAccomplishmentMatch = url.pathname.match(/^\/api\/performance-targets\/(\d+)\/accomplishments$/);
    if (req.method === 'POST' && performanceAccomplishmentMatch) {
      const token = bearerToken(req);
      const body = await readBody(req);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const targetId = Number(performanceAccomplishmentMatch[1]);
        const owner = await c.execute(`SELECT p.employee_user_id, u.department_code, u.unit_name
          FROM bes_performance_targets t JOIN bes_performance_plans p ON p.plan_id=t.plan_id JOIN bes_users u ON u.user_id=p.employee_user_id
          WHERE t.target_id=:targetId`, { targetId });
        if (!owner.rows[0]) throw Object.assign(new Error('Performance target was not found.'), { statusCode: 404 });
        if (!canAccessPerformanceEmployee(user, owner.rows[0])) throw Object.assign(new Error('You are not allowed to add an accomplishment for this employee.'), { statusCode: 403 });
        const description = normalize(body.description);
        const quantity = Number(body.quantity);
        const accomplishedOn = nullableNormalize(body.accomplishedOn);
        if (!description || !(quantity > 0)) throw Object.assign(new Error('Description and a positive accomplished quantity are required.'), { statusCode: 400 });
        const inserted = await c.execute(`INSERT INTO bes_performance_accomplishments (target_id,accomplishment_description,accomplished_quantity,accomplished_on,created_by_user_id)
          VALUES (:targetId,:description,:quantity,CASE WHEN :accomplishedOn IS NULL THEN NULL ELSE TO_DATE(:accomplishedOn,'YYYY-MM-DD') END,:userId)
          RETURNING accomplishment_id INTO :accomplishmentId`, { targetId, description: { val: description, type: oracledb.CLOB }, quantity, accomplishedOn, userId: user.USER_ID, accomplishmentId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
        await c.commit();
        return { id: String(inserted.outBinds.accomplishmentId[0]), description, quantity, accomplishedOn, evidence: [] };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 201, { accomplishment: result });
    }
    const performanceEvidenceUploadMatch = url.pathname.match(/^\/api\/performance-accomplishments\/(\d+)\/evidence$/);
    if (req.method === 'POST' && performanceEvidenceUploadMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      let originalName = '';
      try { originalName = decodeURIComponent(normalize(req.headers['x-file-name'])); } catch { return json(res, 400, { error: 'The evidence filename is invalid.' }); }
      const fileName = safeFileName(originalName || 'evidence-file');
      const mimeType = normalize(req.headers['content-type']) || 'application/octet-stream';
      const file = await readBinaryBody(req);
      if (!file.length) return json(res, 400, { error: 'The evidence file is empty.' });
      const accomplishmentId = Number(performanceEvidenceUploadMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const owner = await c.execute(`SELECT p.employee_user_id, u.department_code, u.unit_name
          FROM bes_performance_accomplishments a JOIN bes_performance_targets t ON t.target_id=a.target_id
          JOIN bes_performance_plans p ON p.plan_id=t.plan_id JOIN bes_users u ON u.user_id=p.employee_user_id
          WHERE a.accomplishment_id=:accomplishmentId`, { accomplishmentId });
        if (!owner.rows[0]) throw Object.assign(new Error('Accomplishment was not found.'), { statusCode: 404 });
        if (!canAccessPerformanceEmployee(user, owner.rows[0])) throw Object.assign(new Error('You are not allowed to attach evidence for this employee.'), { statusCode: 403 });
        const inserted = await c.execute(`INSERT INTO bes_performance_evidence (accomplishment_id,file_name,mime_type,file_size,file_blob,uploaded_by_user_id)
          VALUES (:accomplishmentId,:fileName,:mimeType,:fileSize,:fileBlob,:userId)
          RETURNING evidence_id INTO :evidenceId`, { accomplishmentId, fileName, mimeType, fileSize: file.length, fileBlob: { val: file, type: oracledb.BLOB }, userId: user.USER_ID, evidenceId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
        await c.commit();
        return { id: String(inserted.outBinds.evidenceId[0]), name: fileName, mimeType, size: file.length };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 201, { evidence: result });
    }
    const performanceEvidenceDownloadMatch = url.pathname.match(/^\/api\/performance-evidence\/(\d+)$/);
    if (req.method === 'GET' && performanceEvidenceDownloadMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const found = await c.execute(`SELECT e.file_name,e.mime_type,e.file_size,e.file_blob,p.employee_user_id,u.department_code,u.unit_name
          FROM bes_performance_evidence e JOIN bes_performance_accomplishments a ON a.accomplishment_id=e.accomplishment_id
          JOIN bes_performance_targets t ON t.target_id=a.target_id JOIN bes_performance_plans p ON p.plan_id=t.plan_id
          JOIN bes_users u ON u.user_id=p.employee_user_id WHERE e.evidence_id=:evidenceId`, { evidenceId: Number(performanceEvidenceDownloadMatch[1]) });
        const row = found.rows[0];
        if (!row) return false;
        if (!canAccessPerformanceEmployee(user, row)) throw Object.assign(new Error('You are not allowed to download this evidence file.'), { statusCode: 403 });
        row.FILE_BUFFER = Buffer.isBuffer(row.FILE_BLOB) ? row.FILE_BLOB : await row.FILE_BLOB.getData();
        return row;
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Evidence file was not found.' });
      res.writeHead(200, { 'content-type': result.MIME_TYPE || 'application/octet-stream', 'content-length': String(result.FILE_BUFFER.length), 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(result.FILE_NAME))}`, 'cache-control': 'private, no-store' });
      return res.end(result.FILE_BUFFER);
    }
    if (req.method === 'GET' && req.url === '/api/users/directory') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const directory = await c.execute(`SELECT user_id, employee_no, username, email, first_name, middle_name, last_name, suffix, position_title, department_code, unit_name
          FROM bes_users
          WHERE account_status = 'ACTIVE'
          ORDER BY last_name, first_name, employee_no`);
        directory.rows = directory.rows.filter((employee) => canAccessPerformanceEmployee(user, employee));
        return directory;
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, {
        users: result.rows.map((row) => ({
          id: String(row.USER_ID),
          employeeNo: row.EMPLOYEE_NO,
          username: row.USERNAME,
          email: row.EMAIL,
          firstName: row.FIRST_NAME,
          middleName: row.MIDDLE_NAME,
          lastName: row.LAST_NAME,
          name: [row.FIRST_NAME, row.MIDDLE_NAME, row.LAST_NAME, row.SUFFIX].filter(Boolean).join(' '),
          position: row.POSITION_TITLE,
          departmentCode: row.DEPARTMENT_CODE,
          unitName: row.UNIT_NAME,
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
    if (req.url === '/api/admin/database-runtime' && ['GET', 'PUT'].includes(req.method)) {
      if (!isLocalDevelopmentRequest(req)) return json(res, 404, { error: 'Database switching is available only on localhost.' });
      const token = bearerToken(req);
      const admin = await requireAdministrator(token);
      if (!admin) return json(res, 403, { error: 'Administrator access is required to switch databases.' });
      if (req.method === 'GET') return json(res, 200, getDatabaseRuntimeStatus());

      const body = await readBody(req);
      const target = normalize(body.target).toLowerCase();
      if (target === 'local') {
        useLocalDatabase();
        return json(res, 200, getDatabaseRuntimeStatus());
      }
      if (target !== 'server') return json(res, 400, { error: 'Database target must be Local or Server.' });

      const databaseConfig = oracleTargetConfig(body.connection ?? {});
      const identity = await prepareServerDatabase(databaseConfig, admin, token);
      useServerDatabase(databaseConfig);
      return json(res, 200, {
        ...getDatabaseRuntimeStatus(),
        database: identity.DB_NAME,
        container: identity.CONTAINER_NAME,
        schema: identity.SCHEMA_NAME,
      });
    }
    if (req.method === 'GET' && req.url === '/api/admin/database-sync/local-tables') {
      const admin = await requireAdministrator(bearerToken(req));
      if (!admin) return json(res, 403, { error: 'Administrator access is required for database sync.' });
      const tables = await withLocalConnection((c) => listSyncTables(c));
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
      const policyStatus = normalize(body.status) || 'Effective';
      const allowedNatures = new Set(['Financial', 'Human Resources', 'Legal and Compliance', 'Public Relations', 'Operations']);
      const allowedDocumentTypes = new Set(['Policy', 'Issuance', 'Guidelines']);
      const allowedPolicyStatuses = new Set(['Effective', 'New (Draft)', 'Amended (Draft)', 'Amended', 'Rescinded']);
      if (!title || !documentNumber || !revisionNumber || !contents || (effectivityDate && !/^\d{4}-\d{2}-\d{2}$/.test(effectivityDate)) || !allowedNatures.has(nature) || !allowedDocumentTypes.has(documentType) || !allowedPolicyStatuses.has(policyStatus)) {
        return json(res, 400, { error: 'Title, document number, document type, revision number, contents, nature, and policy status are required.' });
      }
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const duplicate = await c.execute(`SELECT record_uid FROM bes_policy_records WHERE UPPER(document_number) = UPPER(:documentNumber) AND is_active = 'Y'`, { documentNumber });
        if (duplicate.rows[0]) throw Object.assign(new Error('A policy record with that document number already exists.'), { statusCode: 409 });
        const recordUid = `POL-${new Date().getFullYear()}-${Date.now()}`;
        await c.execute(`INSERT INTO bes_policy_records
          (record_uid, title, document_number, document_type, policy_status, revision_number, effectivity_date, contents, nature,
           created_by_user_id, is_active)
          VALUES
          (:recordUid, :title, :documentNumber, :documentType, :policyStatus, :revisionNumber, CASE WHEN :effectivityDate IS NULL THEN NULL ELSE TO_DATE(:effectivityDate, 'YYYY-MM-DD') END, :contents, :nature,
           :createdByUserId, 'Y')`, {
          recordUid,
          title,
          documentNumber,
          documentType,
          policyStatus,
          revisionNumber,
          effectivityDate: effectivityDate || null,
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
    if (req.method === 'DELETE' && policyAttachmentMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const recordUid = decodeURIComponent(policyAttachmentMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const updated = await c.execute(`UPDATE bes_policy_records
          SET attachment_name = NULL,
              attachment_mime_type = NULL,
              attachment_size = NULL,
              attachment_blob = NULL,
              attachment_data = NULL,
              updated_at = SYSTIMESTAMP
          WHERE record_uid = :recordUid AND is_active = 'Y'`, { recordUid });
        if (!updated.rowsAffected) return false;
        await c.commit();
        return true;
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Policy record not found.' });
      return json(res, 200, { ok: true });
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
      const policyStatus = normalize(body.status) || 'Effective';
      const originalDocumentNumber = normalize(body.originalDocumentNumber);
      const allowedNatures = new Set(['Financial', 'Human Resources', 'Legal and Compliance', 'Public Relations', 'Operations']);
      const allowedDocumentTypes = new Set(['Policy', 'Issuance', 'Guidelines']);
      const allowedPolicyStatuses = new Set(['Effective', 'New (Draft)', 'Amended (Draft)', 'Amended', 'Rescinded']);
      if (!title || !documentNumber || !revisionNumber || !contents || (effectivityDate && !/^\d{4}-\d{2}-\d{2}$/.test(effectivityDate)) || !allowedNatures.has(nature) || !allowedDocumentTypes.has(documentType) || !allowedPolicyStatuses.has(policyStatus)) {
        return json(res, 400, { error: 'Title, document number, document type, revision number, contents, nature, and policy status are required.' });
      }
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const existing = await c.execute(`SELECT record_uid FROM bes_policy_records
          WHERE is_active = 'Y'
            AND (record_uid = :recordUid
              OR (:originalDocumentNumber IS NOT NULL AND UPPER(document_number) = UPPER(:originalDocumentNumber)))
          ORDER BY CASE WHEN record_uid = :recordUid THEN 0 ELSE 1 END
          FETCH FIRST 1 ROW ONLY`, { recordUid, originalDocumentNumber: originalDocumentNumber || null });
        const resolvedRecordUid = existing.rows[0]?.RECORD_UID;
        if (!resolvedRecordUid) return false;
        const duplicate = await c.execute(`SELECT record_uid FROM bes_policy_records
          WHERE UPPER(document_number) = UPPER(:documentNumber) AND record_uid <> :resolvedRecordUid AND is_active = 'Y'`, { documentNumber, resolvedRecordUid });
        if (duplicate.rows[0]) throw Object.assign(new Error('Another policy record already uses that document number.'), { statusCode: 409 });
        const updated = await c.execute(`UPDATE bes_policy_records SET
            title = :title,
            document_number = :documentNumber,
            document_type = :documentType,
            policy_status = :policyStatus,
            revision_number = :revisionNumber,
            effectivity_date = CASE WHEN :effectivityDate IS NULL THEN NULL ELSE TO_DATE(:effectivityDate, 'YYYY-MM-DD') END,
            contents = :contents,
            nature = :nature,
            updated_at = SYSTIMESTAMP
          WHERE record_uid = :resolvedRecordUid AND is_active = 'Y'`, {
          title,
          documentNumber,
          documentType,
          policyStatus,
          revisionNumber,
          effectivityDate: effectivityDate || null,
          contents: { val: contents, type: oracledb.CLOB },
          nature,
          resolvedRecordUid,
        });
        if (!updated.rowsAffected) return false;
        await c.commit();
        const found = await c.execute(`SELECT p.*,
            u.username created_by_username, u.first_name created_by_first_name, u.last_name created_by_last_name
          FROM bes_policy_records p
          LEFT JOIN bes_users u ON u.user_id = p.created_by_user_id
          WHERE p.record_uid = :resolvedRecordUid`, { resolvedRecordUid });
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
    if (req.method === 'GET' && req.url === '/api/hro/employees') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        return c.execute(`SELECT e.EMPNO, e.E_LAST, e.E_FIRST, e.E_MIDDLE,
            e.CURRENT_POSITION_TYPE, e.OFFICIAL_POSITION_TYPE, e.POSITION_LEVEL,
            TO_CHAR(e.DATE_HIRED, 'YYYY-MM-DD') DATE_HIRED,
            e.DEPT_ID, d.DEPT_SHORT, d.DEPT_LONG, e.JL_ID, jl.JL_DESC
          FROM HR_EMP_MASTERFILE e
          LEFT JOIN HR_DEPARTMENT_LOOKUP d ON d.DEPT_ID = e.DEPT_ID
            AND UPPER(TRIM(d.ACTIVE_STAT)) = 'ACTIVE'
          LEFT JOIN HR_JOBLEVEL_LOOKUP jl ON jl.JL_ID = LPAD(TRIM(TO_CHAR(e.JL_ID)), 2, '0')
            AND UPPER(TRIM(jl.ACTIVE_STAT)) = 'ACTIVE'
          WHERE UPPER(TRIM(e.ACTIVE_STAT)) = 'ACTIVE'
            AND UPPER(TRIM(NVL(e.CURRENT_POSITION_TYPE, '-'))) <> 'BOD MEMBER'
            AND UPPER(TRIM(NVL(e.OFFICIAL_POSITION_TYPE, '-'))) <> 'BOD MEMBER'
          ORDER BY UPPER(e.E_LAST), UPPER(e.E_FIRST), e.EMPNO`);
      });
      return result ? json(res, 200, { employees: result.rows.map((row) => ({
        employeeNo: row.EMPNO,
        lastName: row.E_LAST,
        firstName: row.E_FIRST,
        middleName: row.E_MIDDLE,
        currentPositionType: row.CURRENT_POSITION_TYPE,
        officialPositionType: row.OFFICIAL_POSITION_TYPE,
        positionLevel: row.POSITION_LEVEL,
        dateHired: row.DATE_HIRED,
        departmentId: row.DEPT_ID,
        departmentShort: row.DEPT_SHORT,
        departmentName: row.DEPT_LONG,
        jobLevelId: row.JL_ID == null ? null : String(row.JL_ID).padStart(2, '0'),
        jobLevelDescription: row.JL_DESC,
      })) }) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'PATCH' && /^\/api\/hro\/employees\/[^/]+$/.test(req.url || '')) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const employeeNo = decodeURIComponent((req.url || '').split('/').pop() || '');
      const body = await readBody(req);
      const lastName = normalize(body.lastName);
      const firstName = normalize(body.firstName);
      const middleName = nullableNormalize(body.middleName);
      const currentPositionType = nullableNormalize(body.currentPositionType);
      const officialPositionType = nullableNormalize(body.officialPositionType);
      const positionLevel = nullableNormalize(body.positionLevel);
      const dateHired = nullableNormalize(body.dateHired);
      if (!lastName || !firstName) return json(res, 400, { error: 'First and last name are required.' });
      if (dateHired && !/^\d{4}-\d{2}-\d{2}$/.test(dateHired)) return json(res, 400, { error: 'Date hired must use YYYY-MM-DD.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const updated = await c.execute(`UPDATE HR_EMP_MASTERFILE SET
            E_LAST=:lastName, E_FIRST=:firstName, E_MIDDLE=:middleName,
            CURRENT_POSITION_TYPE=:currentPositionType, OFFICIAL_POSITION_TYPE=:officialPositionType, POSITION_LEVEL=:positionLevel,
            DATE_HIRED=TO_DATE(:dateHired, 'YYYY-MM-DD'), UPDATE_BY=:updatedBy, UPDATE_DATE=SYSDATE
          WHERE EMPNO=:employeeNo`, { lastName, firstName, middleName, currentPositionType, officialPositionType, positionLevel, dateHired, updatedBy: user.USERNAME, employeeNo });
        if (!updated.rowsAffected) return { missing: true };
        await c.commit();
        const selected = await c.execute(`SELECT e.EMPNO, e.E_LAST, e.E_FIRST, e.E_MIDDLE,
            e.CURRENT_POSITION_TYPE, e.OFFICIAL_POSITION_TYPE, e.POSITION_LEVEL, TO_CHAR(e.DATE_HIRED, 'YYYY-MM-DD') DATE_HIRED,
            e.DEPT_ID, d.DEPT_SHORT, d.DEPT_LONG, e.JL_ID, jl.JL_DESC
          FROM HR_EMP_MASTERFILE e LEFT JOIN HR_DEPARTMENT_LOOKUP d ON d.DEPT_ID=e.DEPT_ID
            AND UPPER(TRIM(d.ACTIVE_STAT))='ACTIVE'
          LEFT JOIN HR_JOBLEVEL_LOOKUP jl ON jl.JL_ID=LPAD(TRIM(TO_CHAR(e.JL_ID)),2,'0')
            AND UPPER(TRIM(jl.ACTIVE_STAT))='ACTIVE'
          WHERE e.EMPNO=:employeeNo`, { employeeNo });
        return { row: selected.rows[0] };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      if (result.missing || !result.row) return json(res, 404, { error: 'Employee not found.' });
      const row = result.row;
      return json(res, 200, { employee: {
        employeeNo: row.EMPNO, lastName: row.E_LAST, firstName: row.E_FIRST, middleName: row.E_MIDDLE,
        currentPositionType: row.CURRENT_POSITION_TYPE, officialPositionType: row.OFFICIAL_POSITION_TYPE, positionLevel: row.POSITION_LEVEL, dateHired: row.DATE_HIRED,
        departmentId: row.DEPT_ID, departmentShort: row.DEPT_SHORT, departmentName: row.DEPT_LONG,
        jobLevelId: row.JL_ID == null ? null : String(row.JL_ID).padStart(2, '0'), jobLevelDescription: row.JL_DESC,
      } });
    }
    const hrEmployeeServiceMatch = url.pathname.match(/^\/api\/hro\/employees\/([^/]+)\/service-records$/);
    if (hrEmployeeServiceMatch && ['GET', 'POST'].includes(req.method)) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const employeeNo = decodeURIComponent(hrEmployeeServiceMatch[1]);
      if (req.method === 'GET') {
        const result = await withConnection(async (c) => {
          const user = await currentSessionUser(c, token); if (!user) return null;
          const records = await c.execute(`SELECT service_record_id,employee_no,position_title,position_level,monthly_salary,
              TO_CHAR(effective_start,'YYYY-MM-DD') effective_start,TO_CHAR(effective_end,'YYYY-MM-DD') effective_end,remarks
            FROM bes_hr_service_records WHERE employee_no=:employeeNo ORDER BY effective_start DESC,service_record_id DESC`, { employeeNo });
          const evidence = await c.execute(`SELECT e.evidence_id,e.service_record_id,e.file_name,e.mime_type,e.file_size,e.created_at
            FROM bes_hr_service_evidence e JOIN bes_hr_service_records r ON r.service_record_id=e.service_record_id
            WHERE r.employee_no=:employeeNo ORDER BY e.evidence_id`, { employeeNo });
          return { records: records.rows, evidence: evidence.rows };
        });
        if (!result) return json(res, 401, { error: 'Session expired.' });
        return json(res, 200, { records: result.records.map((row) => ({
          id: String(row.SERVICE_RECORD_ID), employeeNo: row.EMPLOYEE_NO, positionTitle: row.POSITION_TITLE, positionLevel: row.POSITION_LEVEL,
          monthlySalary: row.MONTHLY_SALARY == null ? null : Number(row.MONTHLY_SALARY), effectiveStart: row.EFFECTIVE_START, effectiveEnd: row.EFFECTIVE_END, remarks: row.REMARKS,
          evidence: result.evidence.filter((item) => item.SERVICE_RECORD_ID === row.SERVICE_RECORD_ID).map((item) => ({ id: String(item.EVIDENCE_ID), fileName: item.FILE_NAME, mimeType: item.MIME_TYPE, fileSize: Number(item.FILE_SIZE), createdAt: localIso(item.CREATED_AT) })),
        })) });
      }
      const body = await readBody(req); const positionTitle = normalize(body.positionTitle); const positionLevel = nullableNormalize(body.positionLevel);
      const monthlySalary = body.monthlySalary === null || body.monthlySalary === '' || body.monthlySalary === undefined ? null : Number(body.monthlySalary);
      const effectiveStart = normalize(body.effectiveStart); const effectiveEnd = nullableNormalize(body.effectiveEnd); const remarks = nullableNormalize(body.remarks);
      if (!positionTitle || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveStart)) return json(res, 400, { error: 'Position and effective start date are required.' });
      if (effectiveEnd && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveEnd)) return json(res, 400, { error: 'Effective end date is invalid.' });
      if (monthlySalary !== null && (!Number.isFinite(monthlySalary) || monthlySalary < 0)) return json(res, 400, { error: 'Salary must be zero or greater.' });
      const created = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return null;
        const exists = await c.execute(`SELECT 1 FROM HR_EMP_MASTERFILE WHERE EMPNO=:employeeNo`, { employeeNo });
        if (!exists.rows[0]) throw Object.assign(new Error('Employee was not found.'), { statusCode: 404 });
        const inserted = await c.execute(`INSERT INTO bes_hr_service_records (employee_no,position_title,position_level,monthly_salary,effective_start,effective_end,remarks,created_by_user_id)
          VALUES (:employeeNo,:positionTitle,:positionLevel,:monthlySalary,TO_DATE(:effectiveStart,'YYYY-MM-DD'),CASE WHEN :effectiveEnd IS NULL THEN NULL ELSE TO_DATE(:effectiveEnd,'YYYY-MM-DD') END,:remarks,:userId)
          RETURNING service_record_id INTO :recordId`, { employeeNo, positionTitle, positionLevel, monthlySalary, effectiveStart, effectiveEnd, remarks, userId: user.USER_ID, recordId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
        await c.commit(); return String(inserted.outBinds.recordId[0]);
      });
      return created ? json(res, 201, { record: { id: created, employeeNo, positionTitle, positionLevel, monthlySalary, effectiveStart, effectiveEnd, remarks, evidence: [] } }) : json(res, 401, { error: 'Session expired.' });
    }
    const hrServiceRecordMatch = url.pathname.match(/^\/api\/hro\/service-records\/(\d+)$/);
    if (hrServiceRecordMatch && ['PATCH', 'DELETE'].includes(req.method)) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' }); const recordId = Number(hrServiceRecordMatch[1]);
      if (req.method === 'DELETE') {
        const deleted = await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) return null; const result = await c.execute(`DELETE FROM bes_hr_service_records WHERE service_record_id=:recordId`, { recordId }); await c.commit(); return result.rowsAffected; });
        if (deleted === null) return json(res, 401, { error: 'Session expired.' }); return deleted ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Service record not found.' });
      }
      const body = await readBody(req); const positionTitle = normalize(body.positionTitle); const positionLevel = nullableNormalize(body.positionLevel);
      const monthlySalary = body.monthlySalary === null || body.monthlySalary === '' || body.monthlySalary === undefined ? null : Number(body.monthlySalary);
      const effectiveStart = normalize(body.effectiveStart); const effectiveEnd = nullableNormalize(body.effectiveEnd); const remarks = nullableNormalize(body.remarks);
      if (!positionTitle || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveStart)) return json(res, 400, { error: 'Position and effective start date are required.' });
      const updated = await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) return null; const result = await c.execute(`UPDATE bes_hr_service_records SET position_title=:positionTitle,position_level=:positionLevel,monthly_salary=:monthlySalary,effective_start=TO_DATE(:effectiveStart,'YYYY-MM-DD'),effective_end=CASE WHEN :effectiveEnd IS NULL THEN NULL ELSE TO_DATE(:effectiveEnd,'YYYY-MM-DD') END,remarks=:remarks,updated_at=SYSTIMESTAMP WHERE service_record_id=:recordId`, { positionTitle, positionLevel, monthlySalary, effectiveStart, effectiveEnd, remarks, recordId }); await c.commit(); return result.rowsAffected; });
      if (updated === null) return json(res, 401, { error: 'Session expired.' }); return updated ? json(res, 200, { record: { id: String(recordId), positionTitle, positionLevel, monthlySalary, effectiveStart, effectiveEnd, remarks } }) : json(res, 404, { error: 'Service record not found.' });
    }
    const hrServiceEvidenceUploadMatch = url.pathname.match(/^\/api\/hro\/service-records\/(\d+)\/evidence$/);
    if (req.method === 'POST' && hrServiceEvidenceUploadMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' }); const recordId = Number(hrServiceEvidenceUploadMatch[1]);
      let originalName = ''; try { originalName = decodeURIComponent(normalize(req.headers['x-file-name'])); } catch { return json(res, 400, { error: 'Evidence filename is invalid.' }); }
      const fileName = safeFileName(originalName || 'service-record-evidence'); const mimeType = normalize(req.headers['content-type']) || 'application/octet-stream'; const file = await readBinaryBody(req);
      if (!file.length) return json(res, 400, { error: 'Evidence file is empty.' });
      const uploaded = await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) return null; const inserted = await c.execute(`INSERT INTO bes_hr_service_evidence (service_record_id,file_name,mime_type,file_size,file_blob,uploaded_by_user_id) SELECT :recordId,:fileName,:mimeType,:fileSize,:fileBlob,:userId FROM bes_hr_service_records WHERE service_record_id=:recordId RETURNING evidence_id INTO :evidenceId`, { recordId, fileName, mimeType, fileSize: file.length, fileBlob: { val: file, type: oracledb.BLOB }, userId: user.USER_ID, evidenceId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }); await c.commit(); return inserted.rowsAffected ? String(inserted.outBinds.evidenceId[0]) : false; });
      if (uploaded === null) return json(res, 401, { error: 'Session expired.' }); return uploaded ? json(res, 201, { evidence: { id: uploaded, fileName, mimeType, fileSize: file.length } }) : json(res, 404, { error: 'Service record not found.' });
    }
    const hrServiceEvidenceMatch = url.pathname.match(/^\/api\/hro\/service-evidence\/(\d+)$/);
    if (hrServiceEvidenceMatch && ['GET', 'DELETE'].includes(req.method)) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' }); const evidenceId = Number(hrServiceEvidenceMatch[1]);
      if (req.method === 'DELETE') { const deleted = await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) return null; const result = await c.execute(`DELETE FROM bes_hr_service_evidence WHERE evidence_id=:evidenceId`, { evidenceId }); await c.commit(); return result.rowsAffected; }); if (deleted === null) return json(res, 401, { error: 'Session expired.' }); return deleted ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Evidence not found.' }); }
      const found = await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) return null; const result = await c.execute(`SELECT file_name,mime_type,file_size,file_blob FROM bes_hr_service_evidence WHERE evidence_id=:evidenceId`, { evidenceId }); const row = result.rows[0]; if (!row) return false; row.FILE_BUFFER = Buffer.isBuffer(row.FILE_BLOB) ? row.FILE_BLOB : await row.FILE_BLOB.getData(); return row; });
      if (found === null) return json(res, 401, { error: 'Session expired.' }); if (!found) return json(res, 404, { error: 'Evidence not found.' }); res.writeHead(200, { 'content-type': found.MIME_TYPE || 'application/octet-stream', 'content-length': String(found.FILE_BUFFER.length), 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(found.FILE_NAME))}`, 'cache-control': 'private, no-store' }); return res.end(found.FILE_BUFFER);
    }
    const orgDeleteMatch = url.pathname.match(/^\/api\/admin\/org-structure\/(office)\/(\d+)$/);
    if (req.method === 'DELETE' && orgDeleteMatch) {
      const admin = await requireAdministrator(bearerToken(req));
      if (!admin) return json(res, 401, { error: 'Administrator session required.' });
      const officeId = Number(orgDeleteMatch[2]);
      await withConnection(async (c) => {
        const officeResult = await c.execute(`SELECT office_name FROM bes_offices WHERE office_id=:officeId AND is_active='Y'`, { officeId });
        const officeName = officeResult.rows[0]?.OFFICE_NAME;
        if (!officeName) throw Object.assign(new Error('Office not found.'), { statusCode: 404 });
        const officeTree = await c.execute(`SELECT office_id, office_name FROM bes_offices
          WHERE is_active='Y' START WITH office_id=:officeId CONNECT BY PRIOR office_id=parent_office_id`, { officeId });
        await c.execute(`UPDATE bes_positions SET is_active='N', updated_at=SYSTIMESTAMP
          WHERE office_id IN (SELECT office_id FROM bes_offices START WITH office_id=:officeId CONNECT BY PRIOR office_id=parent_office_id)`, { officeId });
        await c.execute(`UPDATE bes_offices SET is_active='N', updated_at=SYSTIMESTAMP
          WHERE office_id IN (SELECT office_id FROM bes_offices START WITH office_id=:officeId CONNECT BY PRIOR office_id=parent_office_id)`, { officeId });
        for (const office of officeTree.rows) {
          await c.execute(`DELETE FROM bes_tool_access WHERE office_name=:officeName`, { officeName: office.OFFICE_NAME });
        }
        await c.commit();
      });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/api/member-programs/locations') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return null;
        return c.execute(`SELECT municipality,barangay,district FROM bes_barangay_locations ORDER BY municipality,barangay`);
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { locations: result.rows.map((row) => ({ municipality: row.MUNICIPALITY, barangay: row.BARANGAY, district: row.DISTRICT })) });
    }
    if (req.method === 'GET' && req.url === '/api/member-programs/programs') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) return null; return c.execute(`SELECT child.program_uid,parent.program_uid parent_uid,child.program_name,child.program_description,child.start_date,child.end_date,child.program_status FROM bes_member_programs child LEFT JOIN bes_member_programs parent ON parent.program_id=child.parent_program_id ORDER BY child.start_date,child.program_id`); });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { programs: result.rows.map((row) => ({ id: row.PROGRAM_UID, parentId: row.PARENT_UID || null, name: row.PROGRAM_NAME, description: row.PROGRAM_DESCRIPTION || '', startDate: localDateOnly(row.START_DATE), endDate: localDateOnly(row.END_DATE), status: row.PROGRAM_STATUS })) });
    }
    if (req.method === 'GET' && req.url === '/api/member-programs/operations') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const data = await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) return null; const [programs, activities, schedules] = await Promise.all([
        c.execute(`SELECT program_uid,parent_program_uid,program_title,display_order FROM bes_member_ops_programs ORDER BY display_order,program_title`),
        c.execute(`SELECT activity_uid,program_uid,activity_name,activity_description,frequency,uniform_time,time_from,time_to,display_order FROM bes_member_ops_activities ORDER BY display_order,activity_name`),
        c.execute(`SELECT activity_uid,weekday_name,time_from,time_to,display_order FROM bes_member_ops_schedules ORDER BY display_order`),
      ]); return { programs: programs.rows, activities: activities.rows, schedules: schedules.rows }; });
      if (!data) return json(res, 401, { error: 'Session expired.' });
      const activityMap = new Map(data.activities.map((row) => [row.ACTIVITY_UID, { id: row.ACTIVITY_UID, name: row.ACTIVITY_NAME, description: row.ACTIVITY_DESCRIPTION || '', frequency: row.FREQUENCY, weekdays: [], timeFrom: row.TIME_FROM || '', timeTo: row.TIME_TO || '', uniformTime: row.UNIFORM_TIME !== 'N', dayTimes: {} }]));
      for (const row of data.schedules) { const activity = activityMap.get(row.ACTIVITY_UID); if (activity) { activity.weekdays.push(row.WEEKDAY_NAME); activity.dayTimes[row.WEEKDAY_NAME] = { from: row.TIME_FROM, to: row.TIME_TO }; } }
      const nodes = data.programs.map((row) => ({ id: row.PROGRAM_UID, parentId: row.PARENT_PROGRAM_UID || null, title: row.PROGRAM_TITLE, children: [], activities: data.activities.filter((activity) => activity.PROGRAM_UID === row.PROGRAM_UID).map((activity) => activityMap.get(activity.ACTIVITY_UID)) })); const nodeMap = new Map(nodes.map((node) => [node.id, node])); const roots = []; for (const node of nodes) { const parent = node.parentId ? nodeMap.get(node.parentId) : null; if (parent) parent.children.push(node); else roots.push(node); delete node.parentId; }
      return json(res, 200, { programs: roots });
    }
    if (req.method === 'PUT' && req.url === '/api/member-programs/operations') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' }); const body = await readBody(req, 2_000_000); if (!Array.isArray(body.programs)) return json(res, 400, { error: 'Operations programs must be an array.' });
      await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 }); await c.execute(`DELETE FROM bes_member_ops_schedules`); await c.execute(`DELETE FROM bes_member_ops_activities`); await c.execute(`DELETE FROM bes_member_ops_programs`);
        const insertNodes = async (nodes, parentId = null) => { for (let programIndex = 0; programIndex < nodes.length; programIndex += 1) { const program = nodes[programIndex]; const programId = normalize(program.id); const title = normalize(program.title); if (!programId || !title) throw Object.assign(new Error('Every operations program requires an ID and title.'), { statusCode: 400 }); await c.execute(`INSERT INTO bes_member_ops_programs (program_uid,parent_program_uid,program_title,display_order,updated_by_user_id) VALUES (:programId,:parentId,:title,:displayOrder,:userId)`, { programId, parentId, title, displayOrder: programIndex, userId: user.USER_ID }); const activities = Array.isArray(program.activities) ? program.activities : []; for (let activityIndex = 0; activityIndex < activities.length; activityIndex += 1) { const activity = activities[activityIndex]; const activityId = normalize(activity.id); if (!activityId || !normalize(activity.name)) throw Object.assign(new Error('Every activity requires an ID and name.'), { statusCode: 400 }); await c.execute(`INSERT INTO bes_member_ops_activities (activity_uid,program_uid,activity_name,activity_description,frequency,uniform_time,time_from,time_to,display_order,updated_by_user_id) VALUES (:activityId,:programId,:activityName,:activityDescription,:frequency,:uniformTime,:timeFrom,:timeTo,:displayOrder,:userId)`, { activityId, programId, activityName: normalize(activity.name), activityDescription: nullableNormalize(activity.description), frequency: normalize(activity.frequency), uniformTime: activity.uniformTime === false ? 'N' : 'Y', timeFrom: nullableNormalize(activity.timeFrom), timeTo: nullableNormalize(activity.timeTo), displayOrder: activityIndex, userId: user.USER_ID }); const weekdays = Array.isArray(activity.weekdays) ? activity.weekdays : []; for (let dayIndex = 0; dayIndex < weekdays.length; dayIndex += 1) { const day = normalize(weekdays[dayIndex]); const schedule = activity.dayTimes?.[day] || { from: activity.timeFrom, to: activity.timeTo }; await c.execute(`INSERT INTO bes_member_ops_schedules (activity_uid,weekday_name,time_from,time_to,display_order) VALUES (:activityId,:weekday,:timeFrom,:timeTo,:displayOrder)`, { activityId, weekday: day, timeFrom: normalize(schedule.from), timeTo: normalize(schedule.to), displayOrder: dayIndex }); } } await insertNodes(Array.isArray(program.children) ? program.children : [], programId); } }; await insertNodes(body.programs); await c.commit(); });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && req.url === '/api/member-programs/programs') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' }); const body = await readBody(req, 50_000);
      const name = normalize(body.name); const startDate = normalize(body.startDate); const endDate = normalize(body.endDate); const status = normalize(body.status);
      if (!name || !startDate || !endDate) return json(res, 400, { error: 'Name and tentative schedule are required.' });
      if (endDate < startDate) return json(res, 400, { error: 'End date must be on or after the start date.' });
      if (!['Planned','Ongoing','Completed','On Hold','Cancelled'].includes(status)) return json(res, 400, { error: 'Invalid program status.' });
      const programUid = `MPRG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 }); const inserted = await c.execute(`INSERT INTO bes_member_programs (program_uid,parent_program_id,program_name,program_description,start_date,end_date,program_status,created_by_user_id,updated_by_user_id) VALUES (:programUid,(SELECT program_id FROM bes_member_programs WHERE program_uid=:parentUid),:programName,:programDescription,TO_DATE(:startDate,'YYYY-MM-DD'),TO_DATE(:endDate,'YYYY-MM-DD'),:programStatus,:userId,:userId)`, { programUid, parentUid: nullableNormalize(body.parentId), programName: name, programDescription: nullableNormalize(body.description), startDate, endDate, programStatus: status, userId: user.USER_ID }); if (!inserted.rowsAffected) throw Object.assign(new Error('Program was not saved.'), { statusCode: 400 }); await c.commit(); });
      return json(res, 201, { id: programUid });
    }
    const memberProgramMatch = url.pathname.match(/^\/api\/member-programs\/programs\/([^/]+)$/);
    if (req.method === 'PATCH' && memberProgramMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' }); const programUid = decodeURIComponent(memberProgramMatch[1]); const body = await readBody(req, 50_000); const name = normalize(body.name); const startDate = normalize(body.startDate); const endDate = normalize(body.endDate); const status = normalize(body.status);
      if (!name || !startDate || !endDate || endDate < startDate) return json(res, 400, { error: 'A valid name and tentative schedule are required.' });
      if (!['Planned','Ongoing','Completed','On Hold','Cancelled'].includes(status)) return json(res, 400, { error: 'Invalid program status.' });
      await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 }); await c.execute(`UPDATE bes_member_programs SET program_name=:programName,program_description=:programDescription,start_date=TO_DATE(:startDate,'YYYY-MM-DD'),end_date=TO_DATE(:endDate,'YYYY-MM-DD'),program_status=:programStatus,updated_by_user_id=:userId,updated_at=SYSTIMESTAMP WHERE program_uid=:programUid`, { programUid, programName: name, programDescription: nullableNormalize(body.description), startDate, endDate, programStatus: status, userId: user.USER_ID }); await c.commit(); });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE' && memberProgramMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' }); const programUid = decodeURIComponent(memberProgramMatch[1]);
      await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 }); await c.execute(`DELETE FROM bes_member_programs WHERE program_uid=:programUid`, { programUid }); await c.commit(); });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/api/member-programs/csr-sectors') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return null;
        return c.execute(`SELECT sector_name FROM bes_csr_sectors UNION SELECT sector FROM bes_csr_requests WHERE sector IS NOT NULL ORDER BY sector_name`);
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { sectors: result.rows.map((row) => row.SECTOR_NAME).filter(Boolean) });
    }
    if (req.method === 'POST' && req.url === '/api/member-programs/csr-sectors') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const body = await readBody(req, 10_000); const sector = normalize(body.sector);
      if (!sector) return json(res, 400, { error: 'Sector name is required.' });
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        await c.execute(`MERGE INTO bes_csr_sectors target USING (SELECT :sector sector_name FROM dual) source ON (UPPER(target.sector_name)=UPPER(source.sector_name)) WHEN NOT MATCHED THEN INSERT (sector_name,created_by_user_id) VALUES (source.sector_name,:userId)`, { sector, userId: user.USER_ID });
        await c.commit();
      });
      return json(res, 201, { sector });
    }
    if (req.method === 'GET' && req.url === '/api/member-programs/csr') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        return c.execute(`SELECT * FROM bes_csr_requests ORDER BY date_requested DESC, csr_id DESC`);
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { requests: result.rows.map(csrRequestJson) });
    }
    if (req.method === 'POST' && req.url === '/api/member-programs/csr') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const body = await readBody(req, 100_000);
      if (!normalize(body.dateRequested) || !normalize(body.programType) || !normalize(body.requestee)) return json(res, 400, { error: 'Date Requested, Program Type, and Requestee are required.' });
      if (!['For evaluation','Pending','Completed'].includes(normalize(body.status))) return json(res, 400, { error: 'Invalid CSR status.' });
      if (normalize(body.status) === 'Pending' && !normalize(body.pendingReason)) return json(res, 400, { error: 'Pending reason is required when the evaluation status is Pending.' });
      const evaluationResults = csrEvaluationResults(body);
      if (evaluationResults.some((value) => !CSR_EVALUATION_RESULTS.includes(value))) return json(res, 400, { error: 'Invalid evaluation result.' });
      const approvalStatus = evaluationResults.length ? normalize(body.approvalStatus) : 'For Evaluation';
      if (evaluationResults.length && !['Approved','Disapproved'].includes(approvalStatus)) return json(res, 400, { error: 'Select Approved or Disapproved after evaluating the request.' });
      const approvalDate = evaluationResults.length ? nullableNormalize(body.dateApproved) : null;
      const csrUid = `CSR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        await c.execute(`INSERT INTO bes_csr_requests (csr_uid,date_requested,program_type,requestee,designation,organization,registration_details,sector,location,barangay,municipality,district,project_details,project_requirement,pending_reason,with_letter_reply,additional_remarks,request_status,approval_status,evaluation_result,evaluated_by,date_approved,amount_funding,pjrs,actual_project_cost,created_by_user_id,updated_by_user_id)
          VALUES (:csrRequestUid,TO_DATE(:csrDateRequested,'YYYY-MM-DD'),:csrProgramType,:csrRequestee,:csrDesignation,:csrOrganization,:csrRegistrationDetails,:csrSector,:csrLocation,:csrBarangay,:csrMunicipality,:csrDistrict,:csrProjectDetails,:csrProjectRequirement,:csrPendingReason,:csrWithLetterReply,:csrAdditionalRemarks,:csrRequestStatus,:csrApprovalStatus,:csrEvaluationResult,:csrEvaluatedBy,TO_DATE(:csrDateApproved,'YYYY-MM-DD'),:csrAmountFunding,:csrPjrs,:csrActualProjectCost,:csrActorUserId,:csrActorUserId)`, {
          csrRequestUid: csrUid,
          csrDateRequested: normalize(body.dateRequested),
          csrProgramType: normalize(body.programType),
          csrRequestee: normalize(body.requestee),
          csrDesignation: nullableNormalize(body.designation),
          csrOrganization: nullableNormalize(body.organization),
          csrRegistrationDetails: nullableNormalize(body.registrationDetails),
          csrSector: nullableNormalize(body.sector),
          csrLocation: nullableNormalize(body.location),
          csrBarangay: nullableNormalize(body.barangay),
          csrMunicipality: nullableNormalize(body.municipality),
          csrDistrict: nullableNormalize(body.district),
          csrProjectDetails: nullableNormalize(body.projectDetails),
          csrProjectRequirement: nullableNormalize(body.projectRequirement),
          csrPendingReason: normalize(body.status) === 'Pending' ? nullableNormalize(body.pendingReason) : null,
          csrWithLetterReply: body.withLetterReply ? 'Y' : 'N',
          csrAdditionalRemarks: nullableNormalize(body.additionalRemarks),
          csrRequestStatus: normalize(body.status),
          csrApprovalStatus: approvalStatus,
          csrEvaluationResult: evaluationResults.length ? evaluationResults.join('|') : null,
          csrEvaluatedBy: nullableNormalize(body.evaluatedBy),
          csrDateApproved: approvalDate,
          csrAmountFunding: normalize(body.amountFunding) ? Number(body.amountFunding) : null,
          csrPjrs: nullableNormalize(body.pjrs),
          csrActualProjectCost: normalize(body.actualProjectCost) ? Number(body.actualProjectCost) : null,
          csrActorUserId: user.USER_ID,
        }); await c.commit();
      });
      return json(res, 201, { id: csrUid });
    }
    const csrAttachmentsMatch = url.pathname.match(/^\/api\/member-programs\/csr\/([^/]+)\/attachments$/);
    const csrAttachmentMatch = url.pathname.match(/^\/api\/member-programs\/csr\/([^/]+)\/attachments\/([^/]+)$/);
    if (req.method === 'GET' && csrAttachmentsMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const csrUid = decodeURIComponent(csrAttachmentsMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return null;
        return c.execute(`SELECT attachment.attachment_uid,attachment.file_name,attachment.mime_type,attachment.file_size,attachment.created_at FROM bes_csr_attachments attachment JOIN bes_csr_requests request ON request.csr_id=attachment.csr_id WHERE request.csr_uid=:csrUid ORDER BY attachment.attachment_id`, { csrUid });
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { attachments: result.rows.map((row) => ({ id: row.ATTACHMENT_UID, fileName: row.FILE_NAME, mimeType: row.MIME_TYPE || '', fileSize: Number(row.FILE_SIZE) || 0, createdAt: localIso(row.CREATED_AT) })) });
    }
    if (req.method === 'POST' && csrAttachmentsMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const csrUid = decodeURIComponent(csrAttachmentsMatch[1]); const body = await readBody(req, 22_000_000);
      const match = normalize(body.dataUrl).match(/^data:([^;,]+);base64,(.+)$/s);
      if (!normalize(body.fileName) || !match) return json(res, 400, { error: 'A valid attachment file is required.' });
      const file = Buffer.from(match[2], 'base64');
      if (!file.length || file.length > 15_000_000) return json(res, 400, { error: 'Attachments must be 15 MB or smaller.' });
      const attachmentUid = `CSRA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        const inserted = await c.execute(`INSERT INTO bes_csr_attachments (attachment_uid,csr_id,file_name,mime_type,file_size,file_blob,created_by_user_id) SELECT :attachmentUid,request.csr_id,:fileName,:mimeType,:fileSize,:fileBlob,:userId FROM bes_csr_requests request WHERE request.csr_uid=:csrUid`, {
          attachmentUid, csrUid, fileName: safeFileName(body.fileName), mimeType: normalize(body.mimeType) || match[1], fileSize: file.length, fileBlob: { val: file, type: oracledb.BLOB }, userId: user.USER_ID,
        });
        if (!inserted.rowsAffected) throw Object.assign(new Error('CSR request was not found.'), { statusCode: 404 });
        await c.commit();
      });
      return json(res, 201, { id: attachmentUid });
    }
    if (req.method === 'GET' && csrAttachmentMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const csrUid = decodeURIComponent(csrAttachmentMatch[1]); const attachmentUid = decodeURIComponent(csrAttachmentMatch[2]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return null;
        const found = await c.execute(`SELECT attachment.file_name,attachment.mime_type,attachment.file_size,attachment.file_blob FROM bes_csr_attachments attachment JOIN bes_csr_requests request ON request.csr_id=attachment.csr_id WHERE request.csr_uid=:csrUid AND attachment.attachment_uid=:attachmentUid`, { csrUid, attachmentUid });
        const row = found.rows[0]; if (!row) return false;
        const file = Buffer.isBuffer(row.FILE_BLOB) ? row.FILE_BLOB : await row.FILE_BLOB.getData(); return { ...row, FILE: file };
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Attachment was not found.' });
      res.writeHead(200, { 'content-type': result.MIME_TYPE || 'application/octet-stream', 'content-length': result.FILE_SIZE, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.FILE_NAME)}`, 'cache-control': 'private, no-store' }); return res.end(result.FILE);
    }
    if (req.method === 'DELETE' && csrAttachmentMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const csrUid = decodeURIComponent(csrAttachmentMatch[1]); const attachmentUid = decodeURIComponent(csrAttachmentMatch[2]);
      await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 }); await c.execute(`DELETE FROM bes_csr_attachments WHERE attachment_uid=:attachmentUid AND csr_id=(SELECT csr_id FROM bes_csr_requests WHERE csr_uid=:csrUid)`, { attachmentUid, csrUid }); await c.commit(); });
      return json(res, 200, { ok: true });
    }
    const csrEventsMatch = url.pathname.match(/^\/api\/member-programs\/csr\/([^/]+)\/events$/);
    if (req.method === 'GET' && csrEventsMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const csrUid = decodeURIComponent(csrEventsMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return null;
        return c.execute(`SELECT event.event_uid,event.event_date,event.project_event,event.inspected_by,event.created_at
          FROM bes_csr_events event JOIN bes_csr_requests request ON request.csr_id=event.csr_id
          WHERE request.csr_uid=:csrUid ORDER BY event.event_date DESC,event.event_id DESC`, { csrUid });
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      return json(res, 200, { events: result.rows.map((row) => ({ id: row.EVENT_UID, date: localDateOnly(row.EVENT_DATE), projectEvent: row.PROJECT_EVENT || '', inspectedBy: row.INSPECTED_BY || '', createdAt: localIso(row.CREATED_AT) })) });
    }
    if (req.method === 'POST' && csrEventsMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const csrUid = decodeURIComponent(csrEventsMatch[1]); const body = await readBody(req, 50_000);
      if (!normalize(body.date) || !normalize(body.projectEvent) || !normalize(body.inspectedBy)) return json(res, 400, { error: 'Date, Project Event, and Inspected By are required.' });
      const eventUid = `CSRE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        const inserted = await c.execute(`INSERT INTO bes_csr_events (event_uid,csr_id,event_date,project_event,inspected_by,created_by_user_id)
          SELECT :eventUid,request.csr_id,TO_DATE(:eventDate,'YYYY-MM-DD'),:projectEvent,:inspectedBy,:userId FROM bes_csr_requests request WHERE request.csr_uid=:csrUid`, {
          eventUid, eventDate: normalize(body.date), projectEvent: normalize(body.projectEvent), inspectedBy: normalize(body.inspectedBy), userId: user.USER_ID, csrUid,
        });
        if (!inserted.rowsAffected) throw Object.assign(new Error('CSR request was not found.'), { statusCode: 404 });
        await c.commit();
      });
      return json(res, 201, { id: eventUid });
    }
    const csrMatch = url.pathname.match(/^\/api\/member-programs\/csr\/([^/]+)$/);
    if (req.method === 'PATCH' && csrMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const csrUid = decodeURIComponent(csrMatch[1]); const body = await readBody(req, 100_000);
      if (!['For evaluation','Pending','Completed'].includes(normalize(body.status))) return json(res, 400, { error: 'Invalid CSR status.' });
      if (normalize(body.status) === 'Pending' && !normalize(body.pendingReason)) return json(res, 400, { error: 'Pending reason is required when the evaluation status is Pending.' });
      const evaluationResults = csrEvaluationResults(body);
      if (evaluationResults.some((value) => !CSR_EVALUATION_RESULTS.includes(value))) return json(res, 400, { error: 'Invalid evaluation result.' });
      const approvalStatus = evaluationResults.length ? normalize(body.approvalStatus) : 'For Evaluation';
      if (evaluationResults.length && !['Approved','Disapproved'].includes(approvalStatus)) return json(res, 400, { error: 'Select Approved or Disapproved after evaluating the request.' });
      const approvalDate = evaluationResults.length ? nullableNormalize(body.dateApproved) : null;
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        await c.execute(`UPDATE bes_csr_requests SET date_requested=TO_DATE(:csrDateRequested,'YYYY-MM-DD'),program_type=:csrProgramType,requestee=:csrRequestee,designation=:csrDesignation,organization=:csrOrganization,registration_details=:csrRegistrationDetails,sector=:csrSector,location=:csrLocation,barangay=:csrBarangay,municipality=:csrMunicipality,district=:csrDistrict,project_details=:csrProjectDetails,project_requirement=:csrProjectRequirement,pending_reason=:csrPendingReason,with_letter_reply=:csrWithLetterReply,additional_remarks=:csrAdditionalRemarks,request_status=:csrRequestStatus,approval_status=:csrApprovalStatus,evaluation_result=:csrEvaluationResult,evaluated_by=:csrEvaluatedBy,date_approved=TO_DATE(:csrDateApproved,'YYYY-MM-DD'),amount_funding=:csrAmountFunding,pjrs=:csrPjrs,actual_project_cost=:csrActualProjectCost,updated_by_user_id=:csrActorUserId,updated_at=SYSTIMESTAMP WHERE csr_uid=:csrRequestUid`, {
          csrRequestUid: csrUid, csrDateRequested: normalize(body.dateRequested), csrProgramType: normalize(body.programType), csrRequestee: normalize(body.requestee), csrDesignation: nullableNormalize(body.designation), csrOrganization: nullableNormalize(body.organization), csrRegistrationDetails: nullableNormalize(body.registrationDetails), csrSector: nullableNormalize(body.sector), csrLocation: nullableNormalize(body.location), csrBarangay: nullableNormalize(body.barangay), csrMunicipality: nullableNormalize(body.municipality), csrDistrict: nullableNormalize(body.district), csrProjectDetails: nullableNormalize(body.projectDetails), csrProjectRequirement: nullableNormalize(body.projectRequirement), csrPendingReason: normalize(body.status) === 'Pending' ? nullableNormalize(body.pendingReason) : null, csrWithLetterReply: body.withLetterReply ? 'Y' : 'N', csrAdditionalRemarks: nullableNormalize(body.additionalRemarks), csrRequestStatus: normalize(body.status), csrApprovalStatus: approvalStatus, csrEvaluationResult: evaluationResults.length ? evaluationResults.join('|') : null, csrEvaluatedBy: nullableNormalize(body.evaluatedBy), csrDateApproved: approvalDate, csrAmountFunding: normalize(body.amountFunding) ? Number(body.amountFunding) : null, csrPjrs: nullableNormalize(body.pjrs), csrActualProjectCost: normalize(body.actualProjectCost) ? Number(body.actualProjectCost) : null, csrActorUserId: user.USER_ID,
        }); await c.commit();
      });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE' && csrMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' }); const csrUid = decodeURIComponent(csrMatch[1]);
      await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 }); await c.execute(`DELETE FROM bes_csr_requests WHERE csr_uid=:csrUid`, { csrUid }); await c.commit(); });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/api/fleet/models') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const store = await c.execute(`SELECT payload, updated_at FROM bes_fleet_store WHERE data_key='MODEL_LIBRARY'`);
        let catalog = null;
        try { catalog = await c.execute(`SELECT library.model_uid,library.vehicle_type,library.brand,library.model,
          files.file_name,files.mime_type,files.file_size
          FROM bes_fleet_model_library library LEFT JOIN bes_fleet_vehicle_models files ON files.vehicle_uid=library.model_uid
          ORDER BY library.brand,library.model`); } catch (error) { if (error.errorNum !== 942) throw error; }
        return { store, catalog };
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      const payload = result.store.rows[0]?.PAYLOAD;
      let models = [];
      try { models = payload ? JSON.parse(String(payload)) : []; } catch { models = []; }
      if (result.catalog?.rows.length) models = result.catalog.rows.map((row) => ({
        id: row.MODEL_UID, type: row.VEHICLE_TYPE, brand: row.BRAND, model: row.MODEL,
        ...(row.FILE_NAME ? { model3d: { name: row.FILE_NAME, type: row.MIME_TYPE, size: row.FILE_SIZE } } : {}),
      }));
      return json(res, 200, { models, updatedAt: localIso(result.store.rows[0]?.UPDATED_AT) });
    }
    if (req.method === 'GET' && req.url === '/api/fleet/maintenance-schedule') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const sessionUser = await withConnection((c) => currentSessionUser(c, token));
      if (!sessionUser) return json(res, 401, { error: 'Session expired.' });
      return withConnection(async (connection) => {
        const result = await connection.execute(`SELECT vehicle.id,vehicle.plate_no,vehicle.brand,vehicle.model,vehicle.description,
            vehicle.driver,vehicle.department,vehicle.vehicle_type,schedule.schedule_uid,schedule.schedule_type,
            TO_CHAR(schedule.start_date,'YYYY-MM-DD') start_date,TO_CHAR(schedule.end_date,'YYYY-MM-DD') end_date,
            schedule.schedule_status,schedule.notes
          FROM vms_vehicle_mast vehicle
          LEFT JOIN bes_fleet_schedules schedule ON schedule.vehicle_master_id=vehicle.id
            AND schedule.schedule_type IN ('Preventive Maintenance','Registration Renewal')
          WHERE NVL(vehicle.deleted,0)=0 AND vehicle.status='ACTIVE' AND vehicle.vehicle_type IS NOT NULL
          ORDER BY vehicle.vehicle_type,vehicle.brand,vehicle.model,vehicle.plate_no,schedule.start_date`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const vehicles = new Map();
        for (const row of result.rows) {
          const id = String(row.ID);
          if (!vehicles.has(id)) vehicles.set(id, {
            id, plateNumber: row.PLATE_NO ?? '', brand: row.BRAND ?? '', model: row.MODEL ?? row.DESCRIPTION ?? '',
            type: row.VEHICLE_TYPE, custodian: row.DRIVER ?? '', assignedDepartment: row.DEPARTMENT ?? '',
            assignedOffice: row.DEPARTMENT ?? '', schedules: [],
          });
          if (row.SCHEDULE_UID) vehicles.get(id).schedules.push({
            id: row.SCHEDULE_UID, type: row.SCHEDULE_TYPE, startDate: row.START_DATE, endDate: row.END_DATE,
            status: row.SCHEDULE_STATUS, notes: row.NOTES, checklist: [], documents: [],
          });
        }
        return json(res, 200, { vehicles: [...vehicles.values()] });
      });
    }
    if (req.method === 'GET' && req.url === '/api/fleet/master-vehicles') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const sessionUser = await withConnection((c) => currentSessionUser(c, token));
      if (!sessionUser) return json(res, 401, { error: 'Session expired.' });
      return withConnection(async (connection) => {
        const result = await connection.execute(`SELECT id,vehicle_no,plate_no,model,year_model,brand,description,driver,department,
          acquired_date,acquired_cost,engine_no,chasis_no,remarks,fuel_type,status,vehicle_type,fuel_eff
          FROM vms_vehicle_mast WHERE NVL(deleted,0)=0 AND status='ACTIVE' AND vehicle_type IS NOT NULL
          ORDER BY vehicle_type,brand,model,plate_no`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return json(res, 200, { vehicles: result.rows.map((row) => ({
          id: String(row.ID), vehicleNo: row.VEHICLE_NO, plateNo: row.PLATE_NO, model: row.MODEL, yearModel: row.YEAR_MODEL,
          brand: row.BRAND, description: row.DESCRIPTION, driver: row.DRIVER, department: row.DEPARTMENT,
          acquiredDate: row.ACQUIRED_DATE, acquiredCost: row.ACQUIRED_COST, engineNo: row.ENGINE_NO, chassisNo: row.CHASIS_NO,
          remarks: row.REMARKS, fuelType: row.FUEL_TYPE, status: row.STATUS, fuelEfficiency: row.FUEL_EFF,
          vehicleType: row.VEHICLE_TYPE,
        })) });
      });
    }
    const fleetMasterActivityMatch = req.method === 'GET' && req.url?.match(/^\/api\/fleet\/master-vehicles\/(\d+)\/activity$/);
    if (fleetMasterActivityMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const sessionUser = await withConnection((c) => currentSessionUser(c, token));
      if (!sessionUser) return json(res, 401, { error: 'Session expired.' });
      const vehicleMasterId = Number(fleetMasterActivityMatch[1]);
      return withConnection(async (connection) => {
        const schedules = await connection.execute(`SELECT schedule_uid,schedule_type,TO_CHAR(start_date,'YYYY-MM-DD') start_date,TO_CHAR(end_date,'YYYY-MM-DD') end_date,TO_CHAR(actual_maintenance_date,'YYYY-MM-DD') actual_maintenance_date,schedule_status,notes,created_at,updated_at
          FROM bes_fleet_schedules WHERE vehicle_master_id=:vehicleMasterId ORDER BY start_date DESC,created_at DESC`, { vehicleMasterId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const inspections = await connection.execute(`SELECT inspection_uid,TO_CHAR(inspection_date,'YYYY-MM-DD') inspection_date,inspected_by,inspection_status,findings,action_taken,recommendation,created_at,updated_at
          FROM bes_fleet_inspections WHERE vehicle_master_id=:vehicleMasterId ORDER BY inspection_date DESC,created_at DESC`, { vehicleMasterId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return json(res, 200, {
          schedules: schedules.rows.map((row) => ({ id: row.SCHEDULE_UID, type: row.SCHEDULE_TYPE, startDate: row.START_DATE, endDate: row.END_DATE, actualDate: row.ACTUAL_MAINTENANCE_DATE, status: row.SCHEDULE_STATUS, notes: row.NOTES, createdAt: row.CREATED_AT, updatedAt: row.UPDATED_AT })),
          inspections: inspections.rows.map((row) => ({ id: row.INSPECTION_UID, date: row.INSPECTION_DATE, inspectedBy: row.INSPECTED_BY, status: row.INSPECTION_STATUS, findings: row.FINDINGS, actionTaken: row.ACTION_TAKEN, recommendation: row.RECOMMENDATION, createdAt: row.CREATED_AT, updatedAt: row.UPDATED_AT })),
        });
      });
    }
    const renewalReceiptMatch = req.url?.match(/^\/api\/fleet\/renewal-receipts\/([^/]+)$/);
    if (renewalReceiptMatch && req.method === 'GET') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const scheduleUid = decodeURIComponent(renewalReceiptMatch[1]);
      return withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return json(res, 401, { error: 'Session expired.' });
        const result = await c.execute(`SELECT or_number,TO_CHAR(receipt_date,'YYYY-MM-DD') receipt_date,amount_paid,issuing_office,file_name,mime_type,file_size
          FROM bes_fleet_renewal_receipts WHERE schedule_uid=:scheduleUid`, { scheduleUid }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const row = result.rows[0];
        return json(res, 200, { receipt: row ? { orNumber: row.OR_NUMBER, receiptDate: row.RECEIPT_DATE, amountPaid: row.AMOUNT_PAID, issuingOffice: row.ISSUING_OFFICE, attachment: row.FILE_NAME ? { name: row.FILE_NAME, type: row.MIME_TYPE, size: row.FILE_SIZE } : null } : null });
      });
    }
    if (renewalReceiptMatch && req.method === 'PUT') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const scheduleUid = decodeURIComponent(renewalReceiptMatch[1]);
      const body = await readBody(req, 8_000_000);
      const allowedTypes = new Set(['application/pdf','image/png','image/jpeg','image/bmp']);
      let fileBuffer = null; let fileName = null; let mimeType = null; let fileSize = null;
      if (body.attachment?.dataUrl) {
        const match = String(body.attachment.dataUrl).match(/^data:([^;]+);base64,(.+)$/s);
        if (!match || !allowedTypes.has(match[1])) return json(res, 400, { error: 'Attach a PDF, PNG, JPG/JPEG, or BMP file.' });
        fileBuffer = Buffer.from(match[2], 'base64'); fileName = safeFileName(String(body.attachment.name || 'attachment')); mimeType = match[1]; fileSize = fileBuffer.length;
      }
      return withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return json(res, 401, { error: 'Session expired.' });
        const schedule = await c.execute(`SELECT 1 FROM bes_fleet_schedules WHERE schedule_uid=:scheduleUid AND schedule_type='Registration Renewal'`, { scheduleUid });
        if (!schedule.rows.length) return json(res, 404, { error: 'Registration renewal schedule was not found.' });
        await c.execute(`MERGE INTO bes_fleet_renewal_receipts target USING (SELECT :scheduleUid schedule_uid FROM dual) source ON (target.schedule_uid=source.schedule_uid)
          WHEN MATCHED THEN UPDATE SET or_number=:orNumber,receipt_date=TO_DATE(:receiptDate,'YYYY-MM-DD'),amount_paid=:amountPaid,issuing_office=:issuingOffice,
            file_name=COALESCE(:fileName,target.file_name),mime_type=COALESCE(:mimeType,target.mime_type),file_size=COALESCE(:fileSize,target.file_size),file_blob=COALESCE(:fileBlob,target.file_blob),updated_by_user_id=:userId,updated_at=SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT (schedule_uid,or_number,receipt_date,amount_paid,issuing_office,file_name,mime_type,file_size,file_blob,updated_by_user_id)
            VALUES (:scheduleUid,:orNumber,TO_DATE(:receiptDate,'YYYY-MM-DD'),:amountPaid,:issuingOffice,:fileName,:mimeType,:fileSize,:fileBlob,:userId)`, {
          scheduleUid, orNumber: nullableNormalize(body.orNumber), receiptDate: nullableNormalize(body.receiptDate), amountPaid: body.amountPaid === '' || body.amountPaid == null ? null : Number(body.amountPaid),
          issuingOffice: nullableNormalize(body.issuingOffice), fileName, mimeType, fileSize, fileBlob: fileBuffer, userId: user.USER_ID,
        });
        await c.commit(); return json(res, 200, { ok: true });
      });
    }
    if (renewalReceiptMatch && req.method === 'DELETE') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const scheduleUid = decodeURIComponent(renewalReceiptMatch[1]);
      return withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) return json(res, 401, { error: 'Session expired.' }); await c.execute(`DELETE FROM bes_fleet_renewal_receipts WHERE schedule_uid=:scheduleUid`, { scheduleUid }); await c.commit(); return json(res, 200, { ok: true }); });
    }
    const renewalAttachmentMatch = req.method === 'GET' && req.url?.match(/^\/api\/fleet\/renewal-receipts\/([^/]+)\/attachment$/);
    if (renewalAttachmentMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const scheduleUid = decodeURIComponent(renewalAttachmentMatch[1]);
      const result = await withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) return null; return c.execute(`SELECT file_name,mime_type,file_blob FROM bes_fleet_renewal_receipts WHERE schedule_uid=:scheduleUid AND file_blob IS NOT NULL`, { scheduleUid }, { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { FILE_BLOB: { type: oracledb.BUFFER } } }); });
      if (!result) return json(res, 401, { error: 'Session expired.' }); const row = result.rows[0]; if (!row) return json(res, 404, { error: 'Attachment not found.' });
      res.writeHead(200, { 'content-type': row.MIME_TYPE, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.FILE_NAME)}`, 'content-length': String(row.FILE_BLOB.length) }); res.end(row.FILE_BLOB); return;
    }
    if (req.method === 'POST' && req.url === '/api/fleet/master-schedules') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const sessionUser = await withConnection((c) => currentSessionUser(c, token));
      if (!sessionUser) return json(res, 401, { error: 'Session expired.' });
      const body = await readBody(req);
      const vehicleMasterId = Number(body.vehicleMasterId);
      const scheduleType = normalize(body.scheduleType);
      const startDate = normalize(body.startDate);
      const endDate = normalize(body.endDate);
      if (!Number.isFinite(vehicleMasterId) || !['Preventive Maintenance', 'Registration Renewal'].includes(scheduleType) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return json(res, 400, { error: 'Vehicle, schedule type, and valid dates are required.' });
      return withConnection(async (connection) => {
        const exists = await connection.execute(`SELECT 1 FROM vms_vehicle_mast WHERE id=:vehicleMasterId AND NVL(deleted,0)=0`, { vehicleMasterId });
        if (!exists.rows[0]) return json(res, 404, { error: 'Vehicle master record was not found.' });
        const scheduleUid = `SCH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await connection.execute(`INSERT INTO bes_fleet_schedules (schedule_uid,vehicle_master_id,schedule_type,start_date,end_date,schedule_status,notes,created_by_user_id)
          VALUES (:scheduleUid,:vehicleMasterId,:scheduleType,TO_DATE(:startDate,'YYYY-MM-DD'),TO_DATE(:endDate,'YYYY-MM-DD'),'Scheduled',:notes,:userId)`, {
          scheduleUid, vehicleMasterId, scheduleType, startDate, endDate, notes: normalize(body.notes) || null, userId: sessionUser.USER_ID,
        });
        await connection.commit();
        return json(res, 201, { schedule: { id: scheduleUid, vehicleMasterId, scheduleType, startDate, endDate, status: 'Scheduled' } });
      });
    }
    const fleetScheduleStatusMatch = req.method === 'PATCH' && req.url?.match(/^\/api\/fleet\/master-schedules\/([^/]+)\/status$/);
    if (fleetScheduleStatusMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const scheduleUid = decodeURIComponent(fleetScheduleStatusMatch[1]); const body = await readBody(req); const status = normalize(body.status);
      if (!['Scheduled','In Progress','Registered'].includes(status)) return json(res, 400, { error: 'Invalid renewal status.' });
      return withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) return json(res, 401, { error: 'Session expired.' }); const result = await c.execute(`UPDATE bes_fleet_schedules SET schedule_status=:status,updated_at=SYSTIMESTAMP WHERE schedule_uid=:scheduleUid AND schedule_type='Registration Renewal'`, { status, scheduleUid }); if (!result.rowsAffected) return json(res, 404, { error: 'Registration renewal schedule was not found.' }); await c.commit(); return json(res, 200, { ok: true }); });
    }
    const fleetMaintenanceUpdateMatch = req.method === 'PATCH' && req.url?.match(/^\/api\/fleet\/master-schedules\/([^/]+)\/maintenance$/);
    if (fleetMaintenanceUpdateMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const scheduleUid = decodeURIComponent(fleetMaintenanceUpdateMatch[1]); const body = await readBody(req); const status = normalize(body.status); const actualDate = nullableNormalize(body.actualDate);
      if (!['Scheduled','Completed'].includes(status)) return json(res, 400, { error: 'Invalid preventive maintenance status.' });
      if (actualDate && !/^\d{4}-\d{2}-\d{2}$/.test(actualDate)) return json(res, 400, { error: 'Invalid actual maintenance date.' });
      return withConnection(async (c) => { const user = await currentSessionUser(c, token); if (!user) return json(res, 401, { error: 'Session expired.' }); const result = await c.execute(`UPDATE bes_fleet_schedules SET schedule_status=:status,actual_maintenance_date=TO_DATE(:actualDate,'YYYY-MM-DD'),updated_at=SYSTIMESTAMP WHERE schedule_uid=:scheduleUid AND schedule_type='Preventive Maintenance'`, { status, actualDate, scheduleUid }); if (!result.rowsAffected) return json(res, 404, { error: 'Preventive maintenance schedule was not found.' }); await c.commit(); return json(res, 200, { ok: true }); });
    }
    const fleetInspectionRecordMatch = req.url?.match(/^\/api\/fleet\/master-inspections\/([^/]+)$/);
    if (fleetInspectionRecordMatch && req.method === 'GET') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' }); const inspectionUid = decodeURIComponent(fleetInspectionRecordMatch[1]);
      return withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return json(res, 401, { error: 'Session expired.' });
        const header = await c.execute(`SELECT inspection_uid,vehicle_master_id,TO_CHAR(inspection_date,'YYYY-MM-DD') inspection_date,inspected_by,inspection_status,findings,action_taken,recommendation FROM bes_fleet_inspections WHERE inspection_uid=:inspectionUid`, { inspectionUid }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (!header.rows[0]) return json(res, 404, { error: 'Inspection was not found.' });
        const items = await c.execute(`SELECT item_uid,item_sequence,activity,item_status,findings,action_taken,recommendation,annotations_json,snapshot_name,snapshot_mime_type,snapshot_blob FROM bes_fleet_inspection_items WHERE inspection_uid=:inspectionUid ORDER BY item_sequence`, { inspectionUid }, { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { ANNOTATIONS_JSON: { type: oracledb.STRING }, SNAPSHOT_BLOB: { type: oracledb.BUFFER } } });
        const photos = await c.execute(`SELECT item_uid,file_name,mime_type,file_blob FROM bes_fleet_inspection_photos WHERE inspection_uid=:inspectionUid ORDER BY photo_id`, { inspectionUid }, { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { FILE_BLOB: { type: oracledb.BUFFER } } });
        const row = header.rows[0];
        const detailItems = items.rows.map((item) => ({ id: item.ITEM_UID, activity: item.ACTIVITY, status: item.ITEM_STATUS, findings: item.FINDINGS ?? '', actionTaken: item.ACTION_TAKEN ?? '', recommendation: item.RECOMMENDATION ?? '', notes: '', annotations: (() => { try { return JSON.parse(item.ANNOTATIONS_JSON || '[]'); } catch { return []; } })(), snapshot: item.SNAPSHOT_BLOB ? { name: item.SNAPSHOT_NAME, type: item.SNAPSHOT_MIME_TYPE, dataUrl: `data:${item.SNAPSHOT_MIME_TYPE};base64,${item.SNAPSHOT_BLOB.toString('base64')}` } : undefined, photos: photos.rows.filter((photo) => photo.ITEM_UID === item.ITEM_UID).map((photo) => ({ name: photo.FILE_NAME, type: photo.MIME_TYPE, dataUrl: `data:${photo.MIME_TYPE};base64,${photo.FILE_BLOB.toString('base64')}` })) }));
        if (!detailItems.length) detailItems.push({ id: `LEGACY-${row.INSPECTION_UID}`, activity: 'General vehicle condition', status: row.INSPECTION_STATUS, findings: row.FINDINGS ?? '', actionTaken: row.ACTION_TAKEN ?? '', recommendation: row.RECOMMENDATION ?? '', notes: '', annotations: [], snapshot: undefined, photos: [] });
        return json(res, 200, { inspection: { id: row.INSPECTION_UID, vehicleMasterId: String(row.VEHICLE_MASTER_ID), inspectionDate: row.INSPECTION_DATE, inspectedBy: row.INSPECTED_BY, inspectionStatus: row.INSPECTION_STATUS, items: detailItems } });
      });
    }
    if (fleetInspectionRecordMatch && req.method === 'PUT') {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' }); const inspectionUid = decodeURIComponent(fleetInspectionRecordMatch[1]); const body = await readBody(req, 40_000_000);
      const inspectionDate = normalize(body.inspectionDate); const inspectedBy = normalize(body.inspectedBy); const inspectionStatus = normalize(body.inspectionStatus); const items = Array.isArray(body.items) ? body.items : [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate) || !inspectedBy || !inspectionStatus || !items.length) return json(res, 400, { error: 'Inspection date, inspector, status, and at least one detail are required.' });
      return withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return json(res, 401, { error: 'Session expired.' }); const exists = await c.execute(`SELECT 1 FROM bes_fleet_inspections WHERE inspection_uid=:inspectionUid`, { inspectionUid }); if (!exists.rows.length) return json(res, 404, { error: 'Inspection was not found.' });
        const decodeImage = (item) => { if (!item?.dataUrl) return null; const match = String(item.dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s); if (!match) throw Object.assign(new Error('Inspection images must be valid images.'), { statusCode: 400 }); const buffer = Buffer.from(match[2], 'base64'); if (buffer.length > 12_000_000) throw Object.assign(new Error('Each inspection image must be 12 MB or smaller.'), { statusCode: 400 }); return { name: safeFileName(normalize(item.name) || 'inspection-image'), mimeType: match[1], buffer }; };
        await c.execute(`UPDATE bes_fleet_inspections SET inspection_date=TO_DATE(:inspectionDate,'YYYY-MM-DD'),inspected_by=:inspectedBy,inspection_status=:inspectionStatus,updated_at=SYSTIMESTAMP WHERE inspection_uid=:inspectionUid`, { inspectionDate, inspectedBy, inspectionStatus, inspectionUid });
        await c.execute(`DELETE FROM bes_fleet_inspection_photos WHERE inspection_uid=:inspectionUid`, { inspectionUid }); await c.execute(`DELETE FROM bes_fleet_inspection_items WHERE inspection_uid=:inspectionUid`, { inspectionUid });
        for (let index = 0; index < items.length; index += 1) { const item = items[index]; const itemUid = normalize(item.id) || `INSP-ITEM-${Date.now()}-${index}`; const snapshot = decodeImage(item.snapshot); const itemPhotos = Array.isArray(item.photos) ? item.photos.map(decodeImage).filter(Boolean) : []; await c.execute(`INSERT INTO bes_fleet_inspection_items (item_uid,inspection_uid,item_sequence,activity,item_status,findings,action_taken,recommendation,annotations_json,snapshot_name,snapshot_mime_type,snapshot_blob) VALUES (:itemUid,:inspectionUid,:itemSequence,:activity,:itemStatus,:findings,:actionTaken,:recommendation,:annotationsJson,:snapshotName,:snapshotMimeType,:snapshotBlob)`, { itemUid, inspectionUid, itemSequence: index + 1, activity: normalize(item.activity), itemStatus: normalize(item.status), findings: normalize(item.findings) || null, actionTaken: normalize(item.actionTaken) || null, recommendation: normalize(item.recommendation) || null, annotationsJson: { val: JSON.stringify(Array.isArray(item.annotations) ? item.annotations : []), type: oracledb.CLOB }, snapshotName: snapshot?.name ?? null, snapshotMimeType: snapshot?.mimeType ?? null, snapshotBlob: snapshot?.buffer ?? null }); for (const photo of itemPhotos) await c.execute(`INSERT INTO bes_fleet_inspection_photos (inspection_uid,item_uid,file_name,mime_type,file_size,file_blob) VALUES (:inspectionUid,:itemUid,:fileName,:mimeType,:fileSize,:fileBlob)`, { inspectionUid, itemUid, fileName: photo.name, mimeType: photo.mimeType, fileSize: photo.buffer.length, fileBlob: photo.buffer }); }
        await c.commit(); return json(res, 200, { ok: true });
      });
    }
    if (req.method === 'POST' && req.url === '/api/fleet/master-inspections') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const sessionUser = await withConnection((c) => currentSessionUser(c, token));
      if (!sessionUser) return json(res, 401, { error: 'Session expired.' });
      const body = await readBody(req, 40_000_000);
      const vehicleMasterId = Number(body.vehicleMasterId);
      const inspectionDate = normalize(body.inspectionDate);
      const inspectedBy = normalize(body.inspectedBy);
      const inspectionStatus = normalize(body.inspectionStatus);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!Number.isFinite(vehicleMasterId) || !/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate) || !inspectedBy || !inspectionStatus || !items.length) return json(res, 400, { error: 'Vehicle, inspection date, inspector, status, and at least one inspection detail are required.' });
      return withConnection(async (connection) => {
        const exists = await connection.execute(`SELECT 1 FROM vms_vehicle_mast WHERE id=:vehicleMasterId AND NVL(deleted,0)=0`, { vehicleMasterId });
        if (!exists.rows[0]) return json(res, 404, { error: 'Vehicle master record was not found.' });
        const inspectionUid = `INSP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const decodeImage = (item) => {
          if (!item?.dataUrl) return null;
          const match = String(item.dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
          if (!match) throw Object.assign(new Error('Inspection images must be valid image files.'), { statusCode: 400 });
          const buffer = Buffer.from(match[2], 'base64');
          if (buffer.length > 12_000_000) throw Object.assign(new Error('Each inspection image must be 12 MB or smaller.'), { statusCode: 400 });
          return { name: safeFileName(normalize(item.name) || 'inspection-image'), mimeType: match[1], buffer };
        };
        await connection.execute(`INSERT INTO bes_fleet_inspections (inspection_uid,vehicle_master_id,inspection_date,inspected_by,inspection_status,created_by_user_id) VALUES (:inspectionUid,:vehicleMasterId,TO_DATE(:inspectionDate,'YYYY-MM-DD'),:inspectedBy,:inspectionStatus,:userId)`, { inspectionUid, vehicleMasterId, inspectionDate, inspectedBy, inspectionStatus, userId: sessionUser.USER_ID });
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index]; const activity = normalize(item.activity); const itemStatus = normalize(item.status);
          if (!activity || !itemStatus) throw Object.assign(new Error(`Inspection detail ${index + 1} requires an activity and status.`), { statusCode: 400 });
          const itemUid = normalize(item.id) || `INSP-ITEM-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
          const snapshot = decodeImage(item.snapshot); const photos = Array.isArray(item.photos) ? item.photos.map(decodeImage).filter(Boolean) : [];
          await connection.execute(`INSERT INTO bes_fleet_inspection_items (item_uid,inspection_uid,item_sequence,activity,item_status,findings,action_taken,recommendation,annotations_json,snapshot_name,snapshot_mime_type,snapshot_blob) VALUES (:itemUid,:inspectionUid,:itemSequence,:activity,:itemStatus,:findings,:actionTaken,:recommendation,:annotationsJson,:snapshotName,:snapshotMimeType,:snapshotBlob)`, { itemUid, inspectionUid, itemSequence: index + 1, activity, itemStatus, findings: normalize(item.findings) || null, actionTaken: normalize(item.actionTaken) || null, recommendation: normalize(item.recommendation) || null, annotationsJson: { val: JSON.stringify(Array.isArray(item.annotations) ? item.annotations : []), type: oracledb.CLOB }, snapshotName: snapshot?.name ?? null, snapshotMimeType: snapshot?.mimeType ?? null, snapshotBlob: snapshot?.buffer ?? null });
          for (const photo of photos) await connection.execute(`INSERT INTO bes_fleet_inspection_photos (inspection_uid,item_uid,file_name,mime_type,file_size,file_blob) VALUES (:inspectionUid,:itemUid,:fileName,:mimeType,:fileSize,:fileBlob)`, { inspectionUid, itemUid, fileName: photo.name, mimeType: photo.mimeType, fileSize: photo.buffer.length, fileBlob: photo.buffer });
        }
        await connection.commit();
        return json(res, 201, { inspection: { id: inspectionUid, vehicleMasterId, inspectionDate, inspectedBy, inspectionStatus } });
      });
    }
    if (req.method === 'PUT' && req.url === '/api/fleet/models') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const body = await readBody(req, 2_000_000);
      if (!Array.isArray(body.models)) return json(res, 400, { error: 'Vehicle models must be an array.' });
      const payload = JSON.stringify(body.models);
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        await c.execute(`MERGE INTO bes_fleet_store target USING (SELECT 'MODEL_LIBRARY' data_key FROM dual) source
          ON (target.data_key=source.data_key)
          WHEN MATCHED THEN UPDATE SET payload=:payload,updated_by_user_id=:userId,updated_at=SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT (data_key,payload,updated_by_user_id) VALUES ('MODEL_LIBRARY',:payload,:userId)`, {
          payload: { val: payload, type: oracledb.CLOB }, userId: user.USER_ID,
        });
        try {
          const existingRows = await c.execute(`SELECT model_uid FROM bes_fleet_model_library`);
          const incomingIds = new Set(body.models.map((item) => normalize(item.id)).filter(Boolean));
          for (const row of existingRows.rows) if (!incomingIds.has(row.MODEL_UID)) await c.execute(`DELETE FROM bes_fleet_model_library WHERE model_uid=:modelUid`, { modelUid: row.MODEL_UID });
          for (const item of body.models) await c.execute(`MERGE INTO bes_fleet_model_library target USING (SELECT :modelUid model_uid FROM dual) source
            ON (target.model_uid=source.model_uid)
            WHEN MATCHED THEN UPDATE SET vehicle_type=:vehicleType,brand=:brand,model=:model,updated_by_user_id=:userId,updated_at=SYSTIMESTAMP
            WHEN NOT MATCHED THEN INSERT (model_uid,vehicle_type,brand,model,updated_by_user_id) VALUES (:modelUid,:vehicleType,:brand,:model,:userId)`, {
            modelUid: normalize(item.id), vehicleType: normalize(item.type), brand: normalize(item.brand), model: normalize(item.model), userId: user.USER_ID,
          });
        } catch (error) { if (error.errorNum !== 942) throw error; }
        await c.commit();
      });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/api/fleet/vehicles') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        return c.execute(`SELECT payload, updated_at FROM bes_fleet_store WHERE data_key='VEHICLES'`);
      });
      if (!result) return json(res, 401, { error: 'Session expired.' });
      const payload = result.rows[0]?.PAYLOAD;
      let vehicles = [];
      try { vehicles = payload ? JSON.parse(String(payload)) : []; } catch { vehicles = []; }
      return json(res, 200, { vehicles, updatedAt: localIso(result.rows[0]?.UPDATED_AT) });
    }
    const fleetModelMatch = url.pathname.match(/^\/api\/fleet\/vehicles\/([^/]+)\/model$/);
    if (req.method === 'PUT' && fleetModelMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const vehicleUid = decodeURIComponent(fleetModelMatch[1]);
      let originalName = '';
      try { originalName = decodeURIComponent(normalize(req.headers['x-file-name'])); } catch { return json(res, 400, { error: 'The GLB filename is invalid.' }); }
      if (!originalName.toLowerCase().endsWith('.glb')) return json(res, 400, { error: 'Only GLB 3D model files can be uploaded.' });
      const file = await readBinaryBody(req, 150 * 1024 * 1024, 'GLB model');
      if (file.length < 12 || file.toString('ascii', 0, 4) !== 'glTF') return json(res, 400, { error: 'The selected file is not a valid GLB model.' });
      const fileName = safeFileName(originalName);
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        await c.execute(`MERGE INTO bes_fleet_vehicle_models target USING (SELECT :vehicleUid vehicle_uid FROM dual) source
          ON (target.vehicle_uid=source.vehicle_uid)
          WHEN MATCHED THEN UPDATE SET file_name=:fileName,mime_type='model/gltf-binary',file_size=:fileSize,file_blob=:fileBlob,updated_by_user_id=:userId,updated_at=SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT (vehicle_uid,file_name,mime_type,file_size,file_blob,updated_by_user_id)
            VALUES (:vehicleUid,:fileName,'model/gltf-binary',:fileSize,:fileBlob,:userId)`, {
          vehicleUid, fileName, fileSize: file.length, fileBlob: { val: file, type: oracledb.BLOB }, userId: user.USER_ID,
        });
        await c.commit();
      });
      return json(res, 200, { model: { name: fileName, type: 'model/gltf-binary', size: file.length } });
    }
    if (req.method === 'GET' && fleetModelMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const vehicleUid = decodeURIComponent(fleetModelMatch[1]);
      let result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        return loadFleetModelBlob(c, vehicleUid);
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result && getDatabaseRuntimeStatus().activeDatabase === 'server') {
        const localModel = await withLocalConnection((c) => loadFleetModelBlob(c, vehicleUid));
        if (localModel) {
          const modelStorageUid = localModel.VEHICLE_UID || vehicleUid;
          await withConnection(async (c) => {
            const user = await currentSessionUser(c, token);
            if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
            await c.execute(`MERGE INTO bes_fleet_vehicle_models target USING (SELECT :modelStorageUid vehicle_uid FROM dual) source
              ON (target.vehicle_uid=source.vehicle_uid)
              WHEN MATCHED THEN UPDATE SET file_name=:fileName,mime_type=:mimeType,file_size=:fileSize,file_blob=:fileBlob,updated_by_user_id=:userId,updated_at=SYSTIMESTAMP
              WHEN NOT MATCHED THEN INSERT (vehicle_uid,file_name,mime_type,file_size,file_blob,updated_by_user_id)
                VALUES (:modelStorageUid,:fileName,:mimeType,:fileSize,:fileBlob,:userId)`, {
              modelStorageUid, fileName: localModel.FILE_NAME, mimeType: localModel.MIME_TYPE || 'model/gltf-binary', fileSize: localModel.FILE_SIZE,
              fileBlob: { val: localModel.BODY, type: oracledb.BLOB }, userId: user.USER_ID,
            });
            await c.commit();
          });
          result = localModel;
        }
      }
      if (!result) return json(res, 404, { error: 'No 3D model is attached to this vehicle.' });
      res.writeHead(200, { 'content-type': result.MIME_TYPE || 'model/gltf-binary', 'content-length': result.FILE_SIZE, 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(result.FILE_NAME)}`, 'cache-control': 'private, max-age=300' });
      return res.end(result.BODY);
    }
    if (req.method === 'DELETE' && fleetModelMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const vehicleUid = decodeURIComponent(fleetModelMatch[1]);
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        await c.execute(`DELETE FROM bes_fleet_vehicle_models WHERE vehicle_uid=:vehicleUid`, { vehicleUid });
        await c.commit();
      });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'PUT' && req.url === '/api/fleet/vehicles') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const body = await readBody(req, 50_000_000);
      if (!Array.isArray(body.vehicles)) return json(res, 400, { error: 'Vehicles must be an array.' });
      const payload = JSON.stringify(body.vehicles);
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        await c.execute(`MERGE INTO bes_fleet_store target USING (SELECT 'VEHICLES' data_key FROM dual) source
          ON (target.data_key=source.data_key)
          WHEN MATCHED THEN UPDATE SET payload=:payload,updated_by_user_id=:userId,updated_at=SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT (data_key,payload,updated_by_user_id) VALUES ('VEHICLES',:payload,:userId)`, {
          payload: { val: payload, type: oracledb.CLOB }, userId: user.USER_ID,
        });
        await c.commit();
      });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/api/bfm/operations') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        return { ...(await loadBuildingFacilitiesOperations(c)), canManage: await canManageBuildingFacilities(c, user) };
      });
      return result ? json(res, 200, result) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'GET' && req.url === '/api/bfm/projects') {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        return { ...(await loadBuildingFacilitiesOperations(c, 'Projects')), canManage: await canManageBuildingFacilities(c, user) };
      });
      return result ? json(res, 200, result) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'POST' && req.url === '/api/bfm/facilities') {
      const token = bearerToken(req);
      const manager = await requireBuildingFacilitiesManager(token);
      if (!manager) return json(res, 403, { error: 'Building and Facilities EDIT or ADMIN access is required to add facilities.' });
      const body = await readBody(req);
      const name = normalize(body.name);
      const type = normalize(body.type) || 'Facility';
      const parentId = nullableNormalize(body.parentId);
      const description = nullableNormalize(body.description);
      const location = nullableNormalize(body.location);
      const facilityScope = body.scope === 'Projects' ? 'Projects' : 'Operations';
      if (!name) return json(res, 400, { error: 'Facility name is required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        if (parentId) {
          const parent = await c.execute(`SELECT facility_uid FROM bes_bfm_facilities WHERE facility_uid=:parentId AND facility_scope=:facilityScope AND is_active='Y'`, { parentId, facilityScope });
          if (!parent.rows[0]) throw Object.assign(new Error('Parent facility not found.'), { statusCode: 404 });
        }
        const facilityUid = `BFM-FAC-${Date.now()}`;
        await c.execute(`INSERT INTO bes_bfm_facilities
          (facility_uid,parent_facility_uid,facility_name,facility_type,description,location,sort_order,facility_scope,created_by_user_id,updated_by_user_id)
          VALUES (:facilityUid,:parentId,:name,:type,:description,:location,
            (SELECT NVL(MAX(sort_order),0)+10 FROM bes_bfm_facilities WHERE NVL(parent_facility_uid,'-')=NVL(:parentId,'-')),
            :facilityScope,:userId,:userId)`, { facilityUid, parentId, name, type, description, location, facilityScope, userId: user.USER_ID });
        await c.commit();
        return loadBuildingFacilitiesOperations(c, facilityScope);
      });
      return result ? json(res, 201, result) : json(res, 401, { error: 'Session expired.' });
    }
    const bfmFacilityMatch = url.pathname.match(/^\/api\/bfm\/facilities\/([^/]+)$/);
    if (req.method === 'PATCH' && bfmFacilityMatch) {
      const token = bearerToken(req);
      const manager = await requireBuildingFacilitiesManager(token);
      if (!manager) return json(res, 403, { error: 'Building and Facilities EDIT or ADMIN access is required to edit facilities.' });
      const facilityUid = decodeURIComponent(bfmFacilityMatch[1]);
      const body = await readBody(req);
      const name = normalize(body.name);
      const type = normalize(body.type) || 'Facility';
      const description = nullableNormalize(body.description);
      const location = nullableNormalize(body.location);
      const facilityScope = body.scope === 'Projects' ? 'Projects' : 'Operations';
      if (!name) return json(res, 400, { error: 'Facility name is required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const updated = await c.execute(`UPDATE bes_bfm_facilities SET facility_name=:name,facility_type=:type,
          description=:description,location=:location,updated_by_user_id=:userId,updated_at=SYSTIMESTAMP
          WHERE facility_uid=:facilityUid AND facility_scope=:facilityScope AND is_active='Y'`, { name, type, description, location, userId: user.USER_ID, facilityUid, facilityScope });
        if (!updated.rowsAffected) return false;
        await c.commit();
        return loadBuildingFacilitiesOperations(c, facilityScope);
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      return result ? json(res, 200, result) : json(res, 404, { error: 'Facility not found.' });
    }
    if (req.method === 'DELETE' && bfmFacilityMatch) {
      const token = bearerToken(req);
      const manager = await requireBuildingFacilitiesManager(token);
      if (!manager) return json(res, 403, { error: 'Building and Facilities EDIT or ADMIN access is required to delete facilities.' });
      const facilityUid = decodeURIComponent(bfmFacilityMatch[1]);
      const facilityScope = url.searchParams.get('scope') === 'Projects' ? 'Projects' : 'Operations';
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const removed = await c.execute(`DELETE FROM bes_bfm_facilities WHERE facility_uid=:facilityUid AND facility_scope=:facilityScope`, { facilityUid, facilityScope });
        if (!removed.rowsAffected) return false;
        await c.commit();
        return loadBuildingFacilitiesOperations(c, facilityScope);
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      return result ? json(res, 200, result) : json(res, 404, { error: 'Facility not found.' });
    }
    if (req.method === 'POST' && req.url === '/api/bfm/personnel') {
      const token = bearerToken(req);
      const manager = await requireBuildingFacilitiesManager(token);
      if (!manager) return json(res, 403, { error: 'Building and Facilities EDIT or ADMIN access is required to add personnel.' });
      const body = await readBody(req);
      const name = normalize(body.name);
      if (!name) return json(res, 400, { error: 'Personnel name is required.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        await c.execute(`INSERT INTO bes_bfm_personnel
          (personnel_uid,personnel_name,employee_no,position_title,contact_info,created_by_user_id,updated_by_user_id)
          VALUES (:personnelUid,:personnelName,:employeeNo,:positionTitle,:contactInfo,:userId,:userId)`, {
          personnelUid: `BFM-PER-${Date.now()}`, personnelName: name, employeeNo: nullableNormalize(body.employeeNo),
          positionTitle: nullableNormalize(body.position), contactInfo: nullableNormalize(body.contact), userId: user.USER_ID,
        });
        await c.commit();
        return loadBuildingFacilitiesOperations(c);
      });
      return result ? json(res, 201, result) : json(res, 401, { error: 'Session expired.' });
    }
    if (req.method === 'POST' && req.url === '/api/bfm/todos') {
      const token = bearerToken(req);
      const manager = await requireBuildingFacilitiesManager(token);
      if (!manager) return json(res, 403, { error: 'Building and Facilities EDIT or ADMIN access is required to add facility tasks.' });
      const body = await readBody(req);
      const facilityId = normalize(body.facilityId);
      const title = normalize(body.title);
      const category = normalize(body.category) || 'General';
      const frequency = normalize(body.frequency) || 'As Needed';
      const customDays = frequency === 'Custom' && Array.isArray(body.customDays)
        ? [...new Set(body.customDays.map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b)
        : [];
      const priority = normalize(body.priority) || 'Normal';
      const dueDate = normalize(body.dueDate);
      const workerIds = Array.isArray(body.workerIds) ? [...new Set(body.workerIds.map(normalize).filter(Boolean))] : [];
      if (!facilityId || !title || !['Low','Normal','High','Urgent'].includes(priority) || (frequency === 'Custom' && !customDays.length) || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
        return json(res, 400, { error: 'Facility, task title, and a valid priority are required.' });
      }
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const facility = await c.execute(`SELECT facility_uid FROM bes_bfm_facilities WHERE facility_uid=:facilityId AND is_active='Y'`, { facilityId });
        if (!facility.rows[0]) throw Object.assign(new Error('Facility not found.'), { statusCode: 404 });
        const todoUid = `BFM-TODO-${Date.now()}`;
        await c.execute(`INSERT INTO bes_bfm_todos
          (todo_uid,facility_uid,todo_title,description,category,frequency,custom_days,priority,due_date,created_by_user_id,updated_by_user_id)
          VALUES (:todoUid,:facilityId,:title,:description,:category,:frequency,:customDays,:priority,
            CASE WHEN :dueDate IS NULL THEN NULL ELSE TO_DATE(:dueDate,'YYYY-MM-DD') END,:userId,:userId)`, {
          todoUid, facilityId, title, description: nullableNormalize(body.description), category, frequency, customDays: customDays.join(',') || null, priority,
          dueDate: dueDate || null, userId: user.USER_ID,
        });
        for (const personnelUid of workerIds) await c.execute(`INSERT INTO bes_bfm_todo_workers (todo_uid,personnel_uid,assigned_by_user_id)
          SELECT :todoUid,:personnelUid,:userId FROM dual WHERE EXISTS
          (SELECT 1 FROM bes_bfm_personnel WHERE personnel_uid=:personnelUid AND is_active='Y')`, { todoUid, personnelUid, userId: user.USER_ID });
        await c.commit();
        return loadBuildingFacilitiesOperations(c);
      });
      return result ? json(res, 201, result) : json(res, 401, { error: 'Session expired.' });
    }
    const bfmTodoMatch = url.pathname.match(/^\/api\/bfm\/todos\/([^/]+)$/);
    if (req.method === 'PATCH' && bfmTodoMatch) {
      const token = bearerToken(req);
      const manager = await requireBuildingFacilitiesManager(token);
      if (!manager) return json(res, 403, { error: 'Building and Facilities EDIT or ADMIN access is required to edit facility tasks.' });
      const todoUid = decodeURIComponent(bfmTodoMatch[1]);
      const body = await readBody(req);
      const title = normalize(body.title);
      const category = normalize(body.category) || 'General';
      const frequency = normalize(body.frequency) || 'As Needed';
      const customDays = frequency === 'Custom' && Array.isArray(body.customDays)
        ? [...new Set(body.customDays.map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b)
        : [];
      const priority = normalize(body.priority) || 'Normal';
      const dueDate = normalize(body.dueDate);
      const workerIds = Array.isArray(body.workerIds) ? [...new Set(body.workerIds.map(normalize).filter(Boolean))] : [];
      if (!title || !['Low','Normal','High','Urgent'].includes(priority) || (frequency === 'Custom' && !customDays.length) || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
        return json(res, 400, { error: 'Task title and a valid priority are required.' });
      }
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const updated = await c.execute(`UPDATE bes_bfm_todos SET todo_title=:title,description=:description,
          category=:category,frequency=:frequency,custom_days=:customDays,priority=:priority,
          due_date=CASE WHEN :dueDate IS NULL THEN NULL ELSE TO_DATE(:dueDate,'YYYY-MM-DD') END,
          updated_by_user_id=:userId,updated_at=SYSTIMESTAMP
          WHERE todo_uid=:todoUid AND is_active='Y'`, {
          title, description: nullableNormalize(body.description), category, frequency, customDays: customDays.join(',') || null, priority,
          dueDate: dueDate || null, userId: user.USER_ID, todoUid,
        });
        if (!updated.rowsAffected) return false;
        await c.execute(`DELETE FROM bes_bfm_todo_workers WHERE todo_uid=:todoUid`, { todoUid });
        for (const personnelUid of workerIds) await c.execute(`INSERT INTO bes_bfm_todo_workers (todo_uid,personnel_uid,assigned_by_user_id)
          SELECT :todoUid,:personnelUid,:userId FROM dual WHERE EXISTS
          (SELECT 1 FROM bes_bfm_personnel WHERE personnel_uid=:personnelUid AND is_active='Y')`, { todoUid, personnelUid, userId: user.USER_ID });
        await c.commit();
        return loadBuildingFacilitiesOperations(c);
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      return result ? json(res, 200, result) : json(res, 404, { error: 'Facility task not found.' });
    }
    if (req.method === 'DELETE' && bfmTodoMatch) {
      const token = bearerToken(req);
      const manager = await requireBuildingFacilitiesManager(token);
      if (!manager) return json(res, 403, { error: 'Building and Facilities EDIT or ADMIN access is required to delete facility tasks.' });
      const todoUid = decodeURIComponent(bfmTodoMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const removed = await c.execute(`DELETE FROM bes_bfm_todos WHERE todo_uid=:todoUid`, { todoUid });
        if (!removed.rowsAffected) return false;
        await c.commit();
        return loadBuildingFacilitiesOperations(c);
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      return result ? json(res, 200, result) : json(res, 404, { error: 'Facility task not found.' });
    }
    const bfmTodoStatusMatch = url.pathname.match(/^\/api\/bfm\/todos\/([^/]+)\/status$/);
    if (req.method === 'PATCH' && bfmTodoStatusMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const todoUid = decodeURIComponent(bfmTodoStatusMatch[1]);
      const body = await readBody(req);
      const status = normalize(body.status);
      const workerId = nullableNormalize(body.workerId);
      const note = nullableNormalize(body.note);
      const workDate = normalize(body.workDate);
      if (!['Pending','In Progress','Completed','Deferred'].includes(status) || (workDate && !/^\d{4}-\d{2}-\d{2}$/.test(workDate))) return json(res, 400, { error: 'Select a valid task status and work date.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const found = await c.execute(`SELECT todo_status FROM bes_bfm_todos WHERE todo_uid=:todoUid AND is_active='Y'`, { todoUid });
        if (!found.rows[0]) return false;
        if (workerId) {
          const worker = await c.execute(`SELECT personnel_uid FROM bes_bfm_personnel WHERE personnel_uid=:workerId AND is_active='Y'`, { workerId });
          if (!worker.rows[0]) throw Object.assign(new Error('Selected personnel was not found.'), { statusCode: 404 });
        }
        const previousStatus = found.rows[0].TODO_STATUS;
        await c.execute(`UPDATE bes_bfm_todos SET todo_status=:nextStatus,
          last_completed_at=CASE WHEN :nextStatus='Completed' THEN SYSTIMESTAMP ELSE last_completed_at END,
          updated_by_user_id=:userId,updated_at=SYSTIMESTAMP WHERE todo_uid=:todoUid`, { nextStatus: status, userId: user.USER_ID, todoUid });
        await c.execute(`INSERT INTO bes_bfm_activity
          (activity_uid,todo_uid,previous_status,new_status,work_note,work_date,performed_for_personnel_uid,updated_by_user_id)
          VALUES (:activityUid,:todoUid,:previousStatus,:nextStatus,:workNote,
            CASE WHEN :workDate IS NULL THEN TRUNC(SYSDATE) ELSE TO_DATE(:workDate,'YYYY-MM-DD') END,:workerId,:userId)`, {
          activityUid: `BFM-ACT-${Date.now()}`, todoUid, previousStatus, nextStatus: status, workNote: note,
          workDate: workDate || null, workerId, userId: user.USER_ID,
        });
        await c.commit();
        return loadBuildingFacilitiesOperations(c);
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      return result ? json(res, 200, result) : json(res, 404, { error: 'Facility task not found.' });
    }
    const bfmWorkDetailsMatch = url.pathname.match(/^\/api\/bfm\/todos\/([^/]+)\/work-details$/);
    if (req.method === 'PUT' && bfmWorkDetailsMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const todoUid = decodeURIComponent(bfmWorkDetailsMatch[1]);
      const body = await readBody(req);
      const workDate = normalize(body.workDate);
      const findingsText = nullableNormalize(body.findings);
      const actionTakenText = nullableNormalize(body.actionTaken);
      const materialsUsedText = nullableNormalize(body.materialsUsed);
      const recommendationText = nullableNormalize(body.recommendation);
      const convertedTaskId = nullableNormalize(body.convertedTaskId);
      const values = [findingsText, actionTakenText, materialsUsedText, recommendationText];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return json(res, 400, { error: 'Select a valid work date.' });
      if (values.some((value) => value && value.length > 4000)) return json(res, 400, { error: 'Each maintenance detail must be 4,000 characters or fewer.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const todo = await c.execute(`SELECT todo_uid FROM bes_bfm_todos WHERE todo_uid=:todoUid AND is_active='Y'`, { todoUid });
        if (!todo.rows[0]) return false;
        const existing = await c.execute(`SELECT detail_uid FROM bes_bfm_work_details
          WHERE todo_uid=:todoUid AND work_date=TO_DATE(:workDate,'YYYY-MM-DD')`, { todoUid, workDate });
        if (existing.rows[0]) {
          await c.execute(`UPDATE bes_bfm_work_details SET findings=:findingsText,action_taken=:actionTakenText,
            materials_used=:materialsUsedText,recommendation=:recommendationText,
            converted_task_uid=COALESCE(:convertedTaskId,converted_task_uid),updated_by_user_id=:userId,updated_at=SYSTIMESTAMP
            WHERE detail_uid=:detailUid`, {
            findingsText, actionTakenText, materialsUsedText, recommendationText, convertedTaskId,
            userId: user.USER_ID, detailUid: existing.rows[0].DETAIL_UID,
          });
        } else {
          await c.execute(`INSERT INTO bes_bfm_work_details
            (detail_uid,todo_uid,work_date,findings,action_taken,materials_used,recommendation,converted_task_uid,created_by_user_id,updated_by_user_id)
            VALUES (:detailUid,:todoUid,TO_DATE(:workDate,'YYYY-MM-DD'),:findingsText,:actionTakenText,
              :materialsUsedText,:recommendationText,:convertedTaskId,:userId,:userId)`, {
            detailUid: `BFM-DET-${Date.now()}`, todoUid, workDate, findingsText, actionTakenText,
            materialsUsedText, recommendationText, convertedTaskId, userId: user.USER_ID,
          });
        }
        // Keep an inactive registry marker when every grant is removed. Without
        // this row, /api/tools cannot distinguish "configured with no access"
        // from an unconfigured seeded tool, and the client fallback restores the
        // default owner-department grant on its next refresh.
        if (uniqueAccess.size === 0) {
          await c.execute(`INSERT INTO bes_tool_access
              (tool_access_id,tool_code,tool_name,department_code,office_name,position_name,access_level,tool_status,owner_department_code,access_note,is_active)
            VALUES ((SELECT NVL(MAX(tool_access_id),0)+1 FROM bes_tool_access),:toolCode,:toolName,:departmentCode,NULL,NULL,'VIEW',:toolStatus,:ownerDepartmentCode,:accessNote,'N')`, {
            toolCode, toolName, departmentCode: ownerDepartmentId,
            toolStatus: status, ownerDepartmentCode: ownerDepartmentId,
            accessNote: 'Configured with no department access.',
          });
        }
        await c.commit();
        return loadBuildingFacilitiesOperations(c);
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      return result ? json(res, 200, result) : json(res, 404, { error: 'Facility task not found.' });
    }
    if (req.method === 'POST' && req.url === '/api/bfm/projects') {
      const token = bearerToken(req);
      const manager = await requireBuildingFacilitiesManager(token);
      if (!manager) return json(res, 403, { error: 'Building and Facilities EDIT or ADMIN access is required to add projects.' });
      const body = await readBody(req);
      const facilityId = normalize(body.facilityId);
      const title = normalize(body.title);
      const priority = ['Low','Normal','High','Urgent'].includes(normalize(body.priority)) ? normalize(body.priority) : 'Normal';
      const status = ['Planned','In Progress','On Hold','Completed','Cancelled'].includes(normalize(body.status)) ? normalize(body.status) : 'Planned';
      const startDate = normalize(body.startDate);
      const targetDate = normalize(body.targetDate);
      const budgetAmountText = normalize(body.budgetAmount);
      const budgetAmount = budgetAmountText === '' ? null : Number(budgetAmountText);
      const budgetStatus = ['Available','For Realignment','For Budgeting'].includes(normalize(body.budgetStatus)) ? normalize(body.budgetStatus) : 'For Budgeting';
      if (!facilityId || !title || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return json(res, 400, { error: 'Facility, project title, and target date are required.' });
      if (budgetAmount !== null && (!Number.isFinite(budgetAmount) || budgetAmount < 0)) return json(res, 400, { error: 'Budget amount must be a valid non-negative number.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const projectUid = `BFM-PRJ-${Date.now()}`;
        await c.execute(`INSERT INTO bes_bfm_projects
          (project_uid,facility_uid,project_title,description,category,priority,project_status,start_date,target_date,budget_amount,budget_status,assigned_personnel,created_by_user_id,updated_by_user_id)
          SELECT :projectUid,:facilityId,:title,:description,:category,:priority,:projectStatus,
            CASE WHEN :startDate IS NULL THEN NULL ELSE TO_DATE(:startDate,'YYYY-MM-DD') END,TO_DATE(:targetDate,'YYYY-MM-DD'),:budgetAmount,:budgetStatus,:workerIds,:userId,:userId
          FROM dual WHERE EXISTS (SELECT 1 FROM bes_bfm_facilities WHERE facility_uid=:facilityId AND facility_scope='Projects' AND is_active='Y')`, {
          projectUid, facilityId, title, description: nullableNormalize(body.description), category: normalize(body.category) || 'General',
          priority, projectStatus: status, startDate: /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null,
          targetDate, budgetAmount: { val: budgetAmount, type: oracledb.NUMBER }, budgetStatus, workerIds: { val: JSON.stringify(Array.isArray(body.workerIds) ? body.workerIds : []), type: oracledb.CLOB }, userId: user.USER_ID,
        });
        await c.commit();
        return loadBuildingFacilitiesOperations(c, 'Projects');
      });
      return result ? json(res, 201, result) : json(res, 401, { error: 'Session expired.' });
    }
    const bfmProjectMatch = url.pathname.match(/^\/api\/bfm\/projects\/([^/]+)$/);
    if (req.method === 'PATCH' && bfmProjectMatch) {
      const token = bearerToken(req);
      const manager = await requireBuildingFacilitiesManager(token);
      if (!manager) return json(res, 403, { error: 'Building and Facilities EDIT or ADMIN access is required to edit projects.' });
      const projectUid = decodeURIComponent(bfmProjectMatch[1]);
      const body = await readBody(req);
      const status = ['Planned','In Progress','On Hold','Completed','Cancelled'].includes(normalize(body.status)) ? normalize(body.status) : null;
      const targetDate = normalize(body.targetDate);
      const hasBudgetAmount = Object.prototype.hasOwnProperty.call(body, 'budgetAmount');
      const budgetAmountText = normalize(body.budgetAmount);
      const budgetAmount = budgetAmountText === '' ? null : Number(budgetAmountText);
      const budgetStatus = ['Available','For Realignment','For Budgeting'].includes(normalize(body.budgetStatus)) ? normalize(body.budgetStatus) : null;
      if (hasBudgetAmount && budgetAmount !== null && (!Number.isFinite(budgetAmount) || budgetAmount < 0)) return json(res, 400, { error: 'Budget amount must be a valid non-negative number.' });
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const updated = await c.execute(`UPDATE bes_bfm_projects SET
          project_title=COALESCE(:title,project_title),description=:description,category=COALESCE(:category,category),
          priority=COALESCE(:priority,priority),project_status=COALESCE(:projectStatus,project_status),
          start_date=CASE WHEN :startDate IS NULL THEN start_date ELSE TO_DATE(:startDate,'YYYY-MM-DD') END,
          target_date=CASE WHEN :targetDate IS NULL THEN target_date ELSE TO_DATE(:targetDate,'YYYY-MM-DD') END,
          budget_amount=CASE WHEN :hasBudgetAmount=1 THEN :budgetAmount ELSE budget_amount END,
          budget_status=COALESCE(:budgetStatus,budget_status),
          assigned_personnel=COALESCE(:workerIds,assigned_personnel),updated_by_user_id=:userId,updated_at=SYSTIMESTAMP
          WHERE project_uid=:projectUid AND is_active='Y'`, {
          title: nullableNormalize(body.title), description: nullableNormalize(body.description), category: nullableNormalize(body.category),
          priority: ['Low','Normal','High','Urgent'].includes(normalize(body.priority)) ? normalize(body.priority) : null,
          projectStatus: status, startDate: /^\d{4}-\d{2}-\d{2}$/.test(normalize(body.startDate)) ? normalize(body.startDate) : null,
          targetDate: /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : null,
          hasBudgetAmount: hasBudgetAmount ? 1 : 0, budgetAmount: { val: budgetAmount, type: oracledb.NUMBER }, budgetStatus,
          workerIds: Array.isArray(body.workerIds) ? { val: JSON.stringify(body.workerIds), type: oracledb.CLOB } : null,
          userId: user.USER_ID, projectUid,
        });
        if (!updated.rowsAffected) return false;
        await c.commit();
        return loadBuildingFacilitiesOperations(c, 'Projects');
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      return result ? json(res, 200, result) : json(res, 404, { error: 'Project not found.' });
    }
    if (req.method === 'DELETE' && bfmProjectMatch) {
      const token = bearerToken(req);
      const manager = await requireBuildingFacilitiesManager(token);
      if (!manager) return json(res, 403, { error: 'Building and Facilities EDIT or ADMIN access is required to delete projects.' });
      const projectUid = decodeURIComponent(bfmProjectMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const removed = await c.execute(`DELETE FROM bes_bfm_projects WHERE project_uid=:projectUid`, { projectUid });
        if (!removed.rowsAffected) return false;
        await c.commit();
        return loadBuildingFacilitiesOperations(c, 'Projects');
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      return result ? json(res, 200, result) : json(res, 404, { error: 'Project not found.' });
    }
    const bfmProjectResourcesMatch = url.pathname.match(/^\/api\/bfm\/projects\/([^/]+)\/resources$/);
    if (req.method === 'GET' && bfmProjectResourcesMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const projectUid = decodeURIComponent(bfmProjectResourcesMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return null;
        const project = await c.execute(`SELECT project_uid FROM bes_bfm_projects WHERE project_uid=:projectUid AND is_active='Y'`, { projectUid });
        if (!project.rows[0]) return false;
        const [folders, resources] = await Promise.all([
          c.execute(`SELECT folder_uid,folder_name,created_at FROM bes_bfm_project_folders WHERE project_uid=:projectUid ORDER BY folder_name`, { projectUid }),
          c.execute(`SELECT resource_uid,folder_uid,resource_type,resource_name,relative_path,external_url,mime_type,file_size,created_at
            FROM bes_bfm_project_resources WHERE project_uid=:projectUid ORDER BY resource_name`, { projectUid }),
        ]);
        return {
          folders: folders.rows.map((row) => ({ id: row.FOLDER_UID, name: row.FOLDER_NAME, createdAt: localIso(row.CREATED_AT) })),
          resources: resources.rows.map((row) => ({ id: row.RESOURCE_UID, folderId: row.FOLDER_UID || undefined, type: row.RESOURCE_TYPE === 'LINK' ? 'link' : 'file', name: row.RESOURCE_NAME, relativePath: row.RELATIVE_PATH || '', url: row.EXTERNAL_URL || '', mimeType: row.MIME_TYPE || '', size: row.FILE_SIZE == null ? undefined : Number(row.FILE_SIZE), createdAt: localIso(row.CREATED_AT) })),
        };
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      return result ? json(res, 200, result) : json(res, 404, { error: 'Project not found.' });
    }
    const bfmProjectFoldersMatch = url.pathname.match(/^\/api\/bfm\/projects\/([^/]+)\/folders$/);
    if (req.method === 'POST' && bfmProjectFoldersMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const projectUid = decodeURIComponent(bfmProjectFoldersMatch[1]); const body = await readBody(req, 20_000); const folderName = normalize(body.name);
      if (!folderName) return json(res, 400, { error: 'Folder name is required.' });
      const folderUid = `BFM-FLD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        const inserted = await c.execute(`INSERT INTO bes_bfm_project_folders (folder_uid,project_uid,folder_name,created_by_user_id)
          SELECT :folderUid,:projectUid,:folderName,:actorUserId FROM dual WHERE EXISTS (SELECT 1 FROM bes_bfm_projects WHERE project_uid=:projectUid AND is_active='Y')`, { folderUid, projectUid, folderName, actorUserId: user.USER_ID });
        if (!inserted.rowsAffected) throw Object.assign(new Error('Project not found.'), { statusCode: 404 }); await c.commit();
      });
      return json(res, 201, { id: folderUid, name: folderName });
    }
    const bfmProjectLinksMatch = url.pathname.match(/^\/api\/bfm\/projects\/([^/]+)\/links$/);
    if (req.method === 'POST' && bfmProjectLinksMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const projectUid = decodeURIComponent(bfmProjectLinksMatch[1]); const body = await readBody(req, 30_000);
      const resourceName = normalize(body.name); const externalUrl = normalize(body.url); const folderUid = nullableNormalize(body.folderId);
      if (!resourceName || !/^https?:\/\//i.test(externalUrl)) return json(res, 400, { error: 'Link name and a valid http(s) URL are required.' });
      const resourceUid = `BFM-RES-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        await c.execute(`INSERT INTO bes_bfm_project_resources (resource_uid,project_uid,folder_uid,resource_type,resource_name,external_url,created_by_user_id)
          VALUES (:resourceUid,:projectUid,:folderUid,'LINK',:resourceName,:externalUrl,:actorUserId)`, { resourceUid, projectUid, folderUid, resourceName, externalUrl, actorUserId: user.USER_ID }); await c.commit();
      });
      return json(res, 201, { id: resourceUid });
    }
    const bfmProjectFilesMatch = url.pathname.match(/^\/api\/bfm\/projects\/([^/]+)\/files$/);
    if (req.method === 'POST' && bfmProjectFilesMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' });
      const projectUid = decodeURIComponent(bfmProjectFilesMatch[1]); let originalName = ''; let relativePath = ''; let folderName = '';
      try { originalName = decodeURIComponent(normalize(req.headers['x-file-name'])); relativePath = decodeURIComponent(normalize(req.headers['x-relative-path'])); folderName = decodeURIComponent(normalize(req.headers['x-folder-name'])); } catch { return json(res, 400, { error: 'The file or folder name is invalid.' }); }
      if (!originalName) return json(res, 400, { error: 'File name is required.' });
      const file = await readBinaryBody(req, 25 * 1024 * 1024, 'Project file'); if (!file.length) return json(res, 400, { error: 'The selected file is empty.' });
      const resourceUid = `BFM-RES-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; const mimeType = normalize(req.headers['content-type']) || 'application/octet-stream';
      await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) throw Object.assign(new Error('Session expired.'), { statusCode: 401 });
        let folderUid = null;
        if (folderName) {
          const found = await c.execute(`SELECT folder_uid FROM bes_bfm_project_folders WHERE project_uid=:projectUid AND folder_name=:folderName`, { projectUid, folderName });
          folderUid = found.rows[0]?.FOLDER_UID || `BFM-FLD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          if (!found.rows[0]) await c.execute(`INSERT INTO bes_bfm_project_folders (folder_uid,project_uid,folder_name,created_by_user_id) VALUES (:folderUid,:projectUid,:folderName,:actorUserId)`, { folderUid, projectUid, folderName, actorUserId: user.USER_ID });
        }
        await c.execute(`INSERT INTO bes_bfm_project_resources (resource_uid,project_uid,folder_uid,resource_type,resource_name,relative_path,mime_type,file_size,file_blob,created_by_user_id)
          VALUES (:resourceUid,:projectUid,:folderUid,'FILE',:resourceName,:relativePath,:mimeType,:fileSize,:fileBlob,:actorUserId)`, { resourceUid, projectUid, folderUid, resourceName: safeFileName(originalName), relativePath: nullableNormalize(relativePath), mimeType, fileSize: file.length, fileBlob: file, actorUserId: user.USER_ID }); await c.commit();
      });
      return json(res, 201, { id: resourceUid });
    }
    const bfmProjectResourceMatch = url.pathname.match(/^\/api\/bfm\/project-resources\/([^/]+)$/);
    if (req.method === 'GET' && bfmProjectResourceMatch) {
      const token = bearerToken(req); if (!token) return json(res, 401, { error: 'Session required.' }); const resourceUid = decodeURIComponent(bfmProjectResourceMatch[1]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token); if (!user) return null;
        const found = await c.execute(`SELECT resource_name,mime_type,file_size,file_blob FROM bes_bfm_project_resources WHERE resource_uid=:resourceUid AND resource_type='FILE'`, { resourceUid }); const row = found.rows[0];
        if (!row) return false; return { ...row, BODY: Buffer.isBuffer(row.FILE_BLOB) ? row.FILE_BLOB : await row.FILE_BLOB.getData() };
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' }); if (!result) return json(res, 404, { error: 'File not found.' });
      res.writeHead(200, { 'content-type': result.MIME_TYPE || 'application/octet-stream', 'content-length': result.FILE_SIZE, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.RESOURCE_NAME)}`, 'cache-control': 'private, no-store' }); return res.end(result.BODY);
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
        const role = normalize(user.APP_ROLE);
        const enterpriseScope = ['Administrator', 'General Manager'].includes(role) ? 1 : 0;
        // Every employee can collaborate on work assigned to their own
        // department. The department code remains the hard visibility boundary.
        const departmentScope = user.DEPARTMENT_CODE ? 1 : 0;
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
              OR :enterpriseScope = 1
              OR (:departmentScope = 1 AND :departmentCode IS NOT NULL AND t.department_code = :departmentCode)
            )
          ORDER BY NVL(t.due_date, TRUNC(t.created_at)) DESC, t.created_at DESC`, {
          userId: user.USER_ID,
          enterpriseScope,
          departmentScope,
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
              OR :enterpriseScope = 1
              OR (:departmentScope = 1 AND :departmentCode IS NOT NULL AND t.department_code = :departmentCode)
            )
          ORDER BY wc.created_at`, {
          userId: user.USER_ID,
          enterpriseScope,
          departmentScope,
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
    const workTaskAttachmentMatch = url.pathname.match(/^\/api\/work\/tasks\/([^/]+)\/attachments\/(\d+)$/);
    if (req.method === 'GET' && workTaskAttachmentMatch) {
      const token = bearerToken(req);
      if (!token) return json(res, 401, { error: 'Session required.' });
      const taskUid = decodeURIComponent(workTaskAttachmentMatch[1]);
      const attachmentIndex = Number(workTaskAttachmentMatch[2]);
      const result = await withConnection(async (c) => {
        const user = await currentSessionUser(c, token);
        if (!user) return null;
        const found = await c.execute(`SELECT attachments, created_by_user_id, assigned_to_user_id, department_code
          FROM bes_work_tasks WHERE task_uid=:taskUid AND is_active='Y'`, { taskUid });
        const task = found.rows[0];
        if (!task) return false;
        const allowed = Number(task.CREATED_BY_USER_ID) === Number(user.USER_ID)
          || Number(task.ASSIGNED_TO_USER_ID) === Number(user.USER_ID)
          || task.DEPARTMENT_CODE === user.DEPARTMENT_CODE
          || isTaskModerator(user);
        if (!allowed) throw Object.assign(new Error('You are not allowed to download this attachment.'), { statusCode: 403 });
        const records = JSON.parse(String(task.ATTACHMENTS || '[]'));
        return records[attachmentIndex] || false;
      });
      if (result === null) return json(res, 401, { error: 'Session expired.' });
      if (!result) return json(res, 404, { error: 'Attachment not found.' });
      const match = normalize(result.dataUrl).match(/^data:([^;,]+);base64,(.+)$/i);
      if (!match) return json(res, 410, { error: 'This legacy attachment has no stored file content.' });
      const file = Buffer.from(match[2], 'base64');
      res.writeHead(200, {
        'content-type': result.type || match[1] || 'application/octet-stream',
        'content-length': file.length,
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(result.name || 'attachment'))}`,
      });
      return res.end(file);
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
          ? JSON.stringify(workTaskAttachmentRecords(taskUid, body.attachments))
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
          attachments: { val: attachments, type: oracledb.CLOB },
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
        const attachments = JSON.stringify(workTaskAttachmentRecords(taskUid, body.attachments));
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
          attachments: { val: attachments, type: oracledb.CLOB },
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
            dataUrl: /^data:[^;,]+;base64,[a-z0-9+/=\r\n]+$/i.test(normalize(file.dataUrl)) && normalize(file.dataUrl).length <= 5_600_000
              ? normalize(file.dataUrl)
              : undefined,
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
          attachments: { val: attachments, type: oracledb.CLOB },
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
            dataUrl: /^data:[^;,]+;base64,[a-z0-9+/=\r\n]+$/i.test(normalize(file.dataUrl)) && normalize(file.dataUrl).length <= 5_600_000
              ? normalize(file.dataUrl)
              : undefined,
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
          attachments: { val: attachments, type: oracledb.CLOB },
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
    if (error?.errorNum === 1) return json(res, 409, { error: 'A record with the same unique scope already exists. Refresh the page and try saving again.' });
    console.error(error);
    if (isLocalDevelopmentRequest(req)) {
      const code = normalize(error?.code);
      const message = normalize(error?.message) || 'Unknown database error.';
      return json(res, 500, { error: [code, message].filter(Boolean).join(': ') });
    }
    return json(res, 500, { error: 'The server could not complete the request.' });
  }
}

await initializeDatabase();
http.createServer(handle).listen(config.port, config.host, () => console.log(`BES server listening on http://${config.host}:${config.port}`));
