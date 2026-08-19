import http from 'node:http';
import { config } from './config.mjs';
import { initializeDatabase, withConnection } from './db.mjs';
import { createOpaqueToken, hashPassword, hashToken, verifyPassword } from './security.mjs';

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
};
const readBody = async (req) => {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 2_000_000) throw new Error('Request too large'); }
  return raw ? JSON.parse(raw) : {};
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

const isTaskModerator = (user) => ['Department Manager', 'Secretary', 'Administrator'].includes(user?.APP_ROLE);

async function handle(req, res) {
  if (!req.url?.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
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
          (employee_no,username,email,password_hash,password_salt,first_name,last_name,position_title,department_code,account_status)
          VALUES (:employeeNo,:username,:email,:hash,:salt,:firstName,:lastName,:positionTitle,:departmentCode,'ACTIVE')`, {
          employeeNo, username, email, hash: secured.hash, salt: secured.salt, firstName, lastName,
          positionTitle: normalize(body.positionTitle) || null, departmentCode: normalize(body.departmentCode).toUpperCase() || null,
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
http.createServer(handle).listen(config.port, '127.0.0.1', () => console.log(`BES API listening on http://127.0.0.1:${config.port}`));
