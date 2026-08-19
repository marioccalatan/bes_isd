import oracledb from 'oracledb';
import { config } from './config.mjs';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

export async function withConnection(work) {
  const connection = await oracledb.getConnection(config);
  try { return await work(connection); } finally { await connection.close(); }
}

async function runDdl(connection, sql) {
  try { await connection.execute(sql); } catch (error) { if (error.errorNum !== 955) throw error; }
}

async function addColumn(connection, sql) {
  try { await connection.execute(sql); } catch (error) { if (error.errorNum !== 1430) throw error; }
}

const ROLES = [
  ['Employee', 'Employee', 10],
  ['Supervisor', 'Supervisor', 20],
  ['Department Manager', 'Department Manager', 30],
  ['General Manager', 'General Manager', 40],
  ['Board Member', 'Board Member', 50],
  ['Process Owner', 'Process Owner', 60],
  ['Auditor', 'Auditor', 70],
  ['Administrator', 'Administrator', 80],
];

const PERMISSIONS = [
  ['file_personal_requests', 'File personal requests', 10],
  ['approve_team_requests', 'Approve team requests', 20],
  ['view_department_reports', 'View department reports', 30],
  ['view_enterprise_reports', 'View enterprise reports', 40],
  ['access_board_documents', 'Access Board-restricted documents', 50],
  ['access_audit_records', 'Access confidential audit records', 60],
  ['publish_news_memos', 'Publish news and memos', 70],
  ['manage_technical_admin', 'Manage technical administration', 80],
];

const ROLE_PERMISSIONS = {
  Employee: ['file_personal_requests'],
  Supervisor: ['file_personal_requests', 'approve_team_requests'],
  'Department Manager': ['file_personal_requests', 'approve_team_requests', 'view_department_reports', 'manage_technical_admin'],
  'General Manager': ['file_personal_requests', 'approve_team_requests', 'view_department_reports', 'view_enterprise_reports', 'access_board_documents', 'manage_technical_admin'],
  'Board Member': ['file_personal_requests', 'view_department_reports', 'view_enterprise_reports', 'access_board_documents'],
  'Process Owner': ['file_personal_requests', 'view_department_reports'],
  Auditor: ['file_personal_requests', 'view_department_reports', 'view_enterprise_reports', 'access_audit_records'],
  Administrator: ['file_personal_requests', 'approve_team_requests', 'view_department_reports', 'view_enterprise_reports', 'publish_news_memos', 'manage_technical_admin'],
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
};

const BASELINE_CALENDAR_EVENTS = [
  ['EVT-001', 'Monthly Management Committee Meeting', 'Management', '2026-08-18 09:00', '2026-08-18 11:00', 'Boardroom, 4th Floor', null, 'Regular monthly meeting of the Management Committee to review operational performance and pending matters.'],
  ['EVT-002', 'Board Regular Meeting', 'Management', '2026-08-21 14:00', '2026-08-21 17:00', 'Board Room', null, 'Regular meeting of the Board of Directors.'],
  ['EVT-003', 'Employee Orientation Program', 'Training', '2026-08-19 08:00', '2026-08-19 12:00', 'Training Hall', null, 'Orientation for newly hired employees covering policies, benefits, and code of conduct.'],
  ['EVT-004', 'Safety Awareness Seminar', 'Training', '2026-08-23 13:00', '2026-08-23 16:00', 'Training Hall', 'PGD', 'Annual safety awareness seminar for field and plant personnel.'],
  ['EVT-005', 'Department Planning Workshop — ISD', 'Department', '2026-08-25 09:00', '2026-08-25 15:00', 'ISD Conference Room', 'ISD', 'Institutional Services Department annual planning workshop.'],
  ['EVT-006', 'Submission of Monthly Accomplishment Reports', 'Compliance', '2026-08-20 17:00', '2026-08-20 17:30', null, null, 'Deadline for all departments to submit monthly accomplishment reports to Corporate Planning.'],
  ['EVT-007', 'Preventive Maintenance Activity — Substation 3', 'Maintenance', '2026-08-22 07:00', '2026-08-22 15:00', 'Substation 3', 'NSD', 'Scheduled preventive maintenance; expect brief service interruption in the coverage area.'],
  ['EVT-008', 'Community Electrification Program — Barangay Ambiong', 'Enterprise-wide', '2026-08-27 08:00', '2026-08-27 13:00', 'Barangay Ambiong', 'ISD', 'Community electrification and member outreach activity.'],
  ['EVT-009', 'Regulatory Compliance Deadline — ERC Report', 'Compliance', '2026-08-29 17:00', '2026-08-29 17:30', null, 'CPD', 'Deadline for quarterly regulatory report submission to the Energy Regulatory Commission.'],
  ['EVT-010', 'BAC Meeting — Bid Evaluation', 'Management', '2026-08-16 10:00', '2026-08-16 12:00', 'Procurement Office', null, 'Bids and Awards Committee meeting for evaluation of procurement bids.'],
  ['EVT-011', 'New Employee Benefits Briefing', 'Training', '2026-08-31 10:00', '2026-08-31 12:00', 'HR Training Room', null, null],
  ['EVT-012', 'Line Crew Deployment Briefing', 'Department', '2026-08-17 06:00', '2026-08-17 07:00', 'NSD Operations Center', 'NSD', null],
  ['EVT-013', 'Generation Facility Inspection', 'Maintenance', '2026-08-24 08:00', '2026-08-24 12:00', 'Hydro Facility', 'PGD', null],
  ['EVT-014', 'Corporate Planning KPI Review', 'Department', '2026-08-26 13:00', '2026-08-26 15:00', null, 'CPD', null],
  ['EVT-015', 'Internal Audit Exit Conference — NNSD', 'Compliance', '2026-08-30 09:00', '2026-08-30 11:00', 'Audit Conference Room', 'AUD', null],
  ['EVT-016', 'Data Privacy Refresher Training', 'Training', '2026-09-04 09:00', '2026-09-04 12:00', 'Training Hall', null, null],
  ['EVT-017', 'BES Governance Committee Sync', 'Projects', '2026-08-20 15:00', '2026-08-20 16:00', 'ISD Conference Room / MS Teams', 'ISD', 'Monthly sync of the BES Governance and Adoption working group.'],
  ['EVT-018', 'Payroll Processing Cutoff', 'Compliance', '2026-08-23 17:00', '2026-08-23 17:30', null, 'NNSD', null],
  ['EVT-019', 'Fleet Vehicle Preventive Maintenance', 'Maintenance', '2026-09-06 08:00', '2026-09-06 11:00', null, 'NNSD', null],
  ['EVT-020', 'Member-Consumer Assembly — District 2', 'Enterprise-wide', '2026-09-08 08:00', '2026-09-08 14:00', 'District 2 Gymnasium', 'ISD', null],
  ['EVT-021', 'Records Disposal Review Committee Meeting', 'Department', '2026-08-14 10:00', '2026-08-14 12:00', null, 'ISD', null],
];

async function seedCalendarEvents(connection) {
  for (const [eventUid, title, layer, startAt, endAt, location, departmentCode, description] of BASELINE_CALENDAR_EVENTS) {
    await connection.execute(`MERGE INTO bes_calendar_events e
      USING (SELECT :eventUid event_uid FROM dual) src
      ON (e.event_uid = src.event_uid)
      WHEN MATCHED THEN UPDATE SET
        title = :title,
        layer = :layer,
        start_at = TO_TIMESTAMP(:startAt, 'YYYY-MM-DD HH24:MI'),
        end_at = TO_TIMESTAMP(:endAt, 'YYYY-MM-DD HH24:MI'),
        location = :location,
        department_code = :departmentCode,
        description = :description,
        color = :color,
        is_active = 'Y',
        updated_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT
        (event_uid, title, layer, start_at, end_at, location, department_code, description, color, source_name, editable, is_active)
        VALUES
        (:eventUid, :title, :layer, TO_TIMESTAMP(:startAt, 'YYYY-MM-DD HH24:MI'), TO_TIMESTAMP(:endAt, 'YYYY-MM-DD HH24:MI'), :location, :departmentCode, :description, :color, 'Oracle baseline / Sheet import pending', 'N', 'Y')`, {
      eventUid,
      title,
      layer,
      startAt,
      endAt,
      location,
      departmentCode,
      description,
      color: CALENDAR_LAYER_COLOR[layer] ?? '#475569',
    });
  }
}

async function seedAccessControl(connection) {
  for (const [code, name, sortOrder] of ROLES) {
    await connection.execute(`MERGE INTO bes_roles r
      USING (SELECT :code role_code, :name role_name, :sortOrder sort_order FROM dual) src
      ON (r.role_code = src.role_code)
      WHEN MATCHED THEN UPDATE SET role_name = src.role_name, sort_order = src.sort_order
      WHEN NOT MATCHED THEN INSERT (role_code, role_name, sort_order) VALUES (src.role_code, src.role_name, src.sort_order)`, { code, name, sortOrder });
  }
  for (const [code, name, sortOrder] of PERMISSIONS) {
    await connection.execute(`MERGE INTO bes_permissions p
      USING (SELECT :code permission_code, :name permission_name, :sortOrder sort_order FROM dual) src
      ON (p.permission_code = src.permission_code)
      WHEN MATCHED THEN UPDATE SET permission_name = src.permission_name, sort_order = src.sort_order
      WHEN NOT MATCHED THEN INSERT (permission_code, permission_name, sort_order) VALUES (src.permission_code, src.permission_name, src.sort_order)`, { code, name, sortOrder });
  }
  for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    for (const [permissionCode] of PERMISSIONS) {
      await connection.execute(`MERGE INTO bes_role_permissions rp
        USING (SELECT :roleCode role_code, :permissionCode permission_code, :isGranted is_granted FROM dual) src
        ON (rp.role_code = src.role_code AND rp.permission_code = src.permission_code)
        WHEN MATCHED THEN UPDATE SET is_granted = src.is_granted
        WHEN NOT MATCHED THEN INSERT (role_code, permission_code, is_granted) VALUES (src.role_code, src.permission_code, src.is_granted)`, {
        roleCode, permissionCode, isGranted: permissionCodes.includes(permissionCode) ? 'Y' : 'N',
      });
    }
  }
  await connection.execute(`MERGE INTO bes_user_roles ur
    USING (
      SELECT u.user_id, 'Administrator' role_code, CAST(NULL AS VARCHAR2(30)) department_code, 'Primary BES system administrator' assignment_note
      FROM bes_users u WHERE LOWER(u.username) = 'mario.calatan'
    ) src
    ON (ur.user_id = src.user_id AND ur.role_code = src.role_code AND NVL(ur.scope_department_code, '-') = NVL(src.department_code, '-'))
    WHEN MATCHED THEN UPDATE SET is_active = 'Y', assignment_note = src.assignment_note
    WHEN NOT MATCHED THEN INSERT (user_id, role_code, scope_department_code, is_active, assignment_note)
      VALUES (src.user_id, src.role_code, src.department_code, 'Y', src.assignment_note)`);
  await connection.execute(`MERGE INTO bes_user_roles ur
    USING (
      SELECT u.user_id, 'Department Manager' role_code, 'ISD' department_code, 'Institutional Services Department manager' assignment_note
      FROM bes_users u WHERE LOWER(u.username) = 'mario.calatan'
    ) src
    ON (ur.user_id = src.user_id AND ur.role_code = src.role_code AND NVL(ur.scope_department_code, '-') = NVL(src.department_code, '-'))
    WHEN MATCHED THEN UPDATE SET is_active = 'Y', assignment_note = src.assignment_note
    WHEN NOT MATCHED THEN INSERT (user_id, role_code, scope_department_code, is_active, assignment_note)
      VALUES (src.user_id, src.role_code, src.department_code, 'Y', src.assignment_note)`);
  await connection.execute(`UPDATE bes_users SET app_role = 'Administrator', department_code = 'ISD', position_title = COALESCE(position_title, 'OIC- ISD Manager'), updated_at = SYSTIMESTAMP WHERE LOWER(username) = 'mario.calatan'`);
}

export async function initializeDatabase() {
  await withConnection(async (connection) => {
    await runDdl(connection, `CREATE TABLE bes_users (
      user_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      employee_no VARCHAR2(30) NOT NULL UNIQUE,
      username VARCHAR2(60) NOT NULL UNIQUE,
      email VARCHAR2(254) NOT NULL UNIQUE,
      password_hash VARCHAR2(128) NOT NULL,
      password_salt VARCHAR2(64) NOT NULL,
      first_name VARCHAR2(100) NOT NULL,
      middle_name VARCHAR2(100),
      last_name VARCHAR2(100) NOT NULL,
      suffix VARCHAR2(30),
      position_title VARCHAR2(150),
      designation VARCHAR2(180),
      department_code VARCHAR2(30),
      unit_name VARCHAR2(150),
      mobile_no VARCHAR2(40),
      employment_status VARCHAR2(30) DEFAULT 'Active' NOT NULL,
      account_status VARCHAR2(20) DEFAULT 'ACTIVE' NOT NULL,
      app_role VARCHAR2(40) DEFAULT 'Employee' NOT NULL,
      date_hired DATE,
      work_location VARCHAR2(150),
      supervisor_employee_no VARCHAR2(30),
      last_login_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_user_account_status CHECK (account_status IN ('PENDING','ACTIVE','LOCKED','DISABLED'))
    )`);
    await addColumn(connection, `ALTER TABLE bes_users ADD (designation VARCHAR2(180))`);
    await addColumn(connection, `ALTER TABLE bes_users ADD (profile_photo_data_url CLOB)`);
    await runDdl(connection, `CREATE TABLE bes_auth_sessions (
      session_hash VARCHAR2(128) PRIMARY KEY,
      user_id NUMBER NOT NULL REFERENCES bes_users(user_id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await runDdl(connection, `CREATE TABLE bes_password_resets (
      reset_hash VARCHAR2(128) PRIMARY KEY,
      user_id NUMBER NOT NULL REFERENCES bes_users(user_id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await runDdl(connection, `CREATE TABLE bes_roles (
      role_code VARCHAR2(60) PRIMARY KEY,
      role_name VARCHAR2(100) NOT NULL,
      sort_order NUMBER DEFAULT 0 NOT NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_roles_active CHECK (is_active IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE TABLE bes_permissions (
      permission_code VARCHAR2(80) PRIMARY KEY,
      permission_name VARCHAR2(160) NOT NULL,
      sort_order NUMBER DEFAULT 0 NOT NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_permissions_active CHECK (is_active IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE TABLE bes_role_permissions (
      role_code VARCHAR2(60) NOT NULL REFERENCES bes_roles(role_code) ON DELETE CASCADE,
      permission_code VARCHAR2(80) NOT NULL REFERENCES bes_permissions(permission_code) ON DELETE CASCADE,
      is_granted CHAR(1) DEFAULT 'N' NOT NULL,
      CONSTRAINT pk_bes_role_permissions PRIMARY KEY (role_code, permission_code),
      CONSTRAINT chk_bes_role_permissions_granted CHECK (is_granted IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE TABLE bes_user_roles (
      assignment_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      user_id NUMBER NOT NULL REFERENCES bes_users(user_id) ON DELETE CASCADE,
      role_code VARCHAR2(60) NOT NULL REFERENCES bes_roles(role_code),
      scope_department_code VARCHAR2(30),
      scope_unit_name VARCHAR2(150),
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      assignment_note VARCHAR2(250),
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_user_roles_active CHECK (is_active IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE UNIQUE INDEX ux_bes_user_roles_scope ON bes_user_roles (
      user_id,
      role_code,
      NVL(scope_department_code, '-'),
      NVL(scope_unit_name, '-')
    )`);
    await runDdl(connection, `CREATE TABLE bes_calendar_events (
      event_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      event_uid VARCHAR2(80) NOT NULL UNIQUE,
      title VARCHAR2(300) NOT NULL,
      layer VARCHAR2(30) DEFAULT 'Enterprise-wide' NOT NULL,
      start_at TIMESTAMP NOT NULL,
      end_at TIMESTAMP NOT NULL,
      all_day CHAR(1) DEFAULT 'N' NOT NULL,
      location VARCHAR2(250),
      meeting_link VARCHAR2(500),
      description CLOB,
      attendees CLOB,
      attachments CLOB,
      visibility VARCHAR2(30) DEFAULT 'All employees' NOT NULL,
      visible_to_users CLOB,
      is_done CHAR(1) DEFAULT 'N' NOT NULL,
      done_at TIMESTAMP,
      done_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      department_code VARCHAR2(30),
      office_assignment VARCHAR2(180),
      owner_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      editable CHAR(1) DEFAULT 'N' NOT NULL,
      recurring VARCHAR2(20) DEFAULT 'none',
      color VARCHAR2(20),
      source_name VARCHAR2(120),
      source_row_key VARCHAR2(120),
      raw_source CLOB,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_cal_all_day CHECK (all_day IN ('Y','N')),
      CONSTRAINT chk_bes_cal_done CHECK (is_done IN ('Y','N')),
      CONSTRAINT chk_bes_cal_editable CHECK (editable IN ('Y','N')),
      CONSTRAINT chk_bes_cal_active CHECK (is_active IN ('Y','N'))
    )`);
    await addColumn(connection, `ALTER TABLE bes_calendar_events ADD (attachments CLOB)`);
    await addColumn(connection, `ALTER TABLE bes_calendar_events ADD (visibility VARCHAR2(30) DEFAULT 'All employees' NOT NULL)`);
    await addColumn(connection, `ALTER TABLE bes_calendar_events ADD (visible_to_users CLOB)`);
    await addColumn(connection, `ALTER TABLE bes_calendar_events ADD (is_done CHAR(1) DEFAULT 'N' NOT NULL)`);
    await addColumn(connection, `ALTER TABLE bes_calendar_events ADD (done_at TIMESTAMP)`);
    await addColumn(connection, `ALTER TABLE bes_calendar_events ADD (done_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL)`);
    await addColumn(connection, `ALTER TABLE bes_calendar_events ADD (office_assignment VARCHAR2(180))`);
    await runDdl(connection, `CREATE INDEX ix_bes_calendar_events_start ON bes_calendar_events (start_at, layer, is_active)`);
    await runDdl(connection, `CREATE TABLE bes_work_tasks (
      task_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      task_uid VARCHAR2(80) NOT NULL UNIQUE,
      calendar_event_uid VARCHAR2(80),
      control_number VARCHAR2(80),
      title VARCHAR2(300) NOT NULL,
      description CLOB,
      department_code VARCHAR2(30),
      office_assignment VARCHAR2(180),
      task_subject VARCHAR2(180),
      municipality VARCHAR2(120),
      barangay VARCHAR2(180),
      address VARCHAR2(500),
      attachments CLOB,
      priority VARCHAR2(20) DEFAULT 'Normal' NOT NULL,
      status VARCHAR2(30) DEFAULT 'In Progress' NOT NULL,
      due_date DATE,
      assigned_to_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_work_task_active CHECK (is_active IN ('Y','N'))
    )`);
    await addColumn(connection, `ALTER TABLE bes_work_tasks ADD (control_number VARCHAR2(80))`);
    await addColumn(connection, `ALTER TABLE bes_work_tasks ADD (office_assignment VARCHAR2(180))`);
    await addColumn(connection, `ALTER TABLE bes_work_tasks ADD (task_subject VARCHAR2(180))`);
    await addColumn(connection, `ALTER TABLE bes_work_tasks ADD (municipality VARCHAR2(120))`);
    await addColumn(connection, `ALTER TABLE bes_work_tasks ADD (barangay VARCHAR2(180))`);
    await addColumn(connection, `ALTER TABLE bes_work_tasks ADD (address VARCHAR2(500))`);
    await addColumn(connection, `ALTER TABLE bes_work_tasks ADD (attachments CLOB)`);
    await runDdl(connection, `CREATE INDEX ix_bes_work_tasks_assignee ON bes_work_tasks (assigned_to_user_id, status, is_active)`);
    await runDdl(connection, `CREATE INDEX ix_bes_work_tasks_creator ON bes_work_tasks (created_by_user_id, status, is_active)`);
    await runDdl(connection, `CREATE TABLE bes_work_comments (
      comment_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      comment_uid VARCHAR2(80) NOT NULL UNIQUE,
      task_uid VARCHAR2(80) NOT NULL REFERENCES bes_work_tasks(task_uid) ON DELETE CASCADE,
      parent_comment_uid VARCHAR2(80),
      author_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      message CLOB,
      is_deleted CHAR(1) DEFAULT 'N' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_work_comments_deleted CHECK (is_deleted IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE INDEX ix_bes_work_comments_task ON bes_work_comments (task_uid, created_at)`);
    await seedAccessControl(connection);
    await seedCalendarEvents(connection);
    await connection.commit();
  });
}
