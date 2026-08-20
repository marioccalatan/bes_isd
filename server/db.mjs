import oracledb from 'oracledb';
import { config } from './config.mjs';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

const localDatabaseConfig = Object.freeze({
  user: config.user,
  password: config.password,
  connectString: config.connectString,
});

let activeDatabase = 'local';
let serverDatabaseConfig = null;

export function getDatabaseRuntimeStatus() {
  return {
    activeDatabase,
    local: {
      user: localDatabaseConfig.user,
      connectString: localDatabaseConfig.connectString,
    },
    server: serverDatabaseConfig ? {
      user: serverDatabaseConfig.user,
      connectString: serverDatabaseConfig.connectString,
    } : null,
  };
}

export function useLocalDatabase() {
  activeDatabase = 'local';
}

export function useServerDatabase(databaseConfig) {
  serverDatabaseConfig = {
    user: databaseConfig.user,
    password: databaseConfig.password,
    connectString: databaseConfig.connectString,
  };
  activeDatabase = 'server';
}

export async function withLocalConnection(work) {
  const connection = await oracledb.getConnection(localDatabaseConfig);
  try { return await work(connection); } finally { await connection.close(); }
}

export async function withConnection(work) {
  const connectionConfig = activeDatabase === 'server' && serverDatabaseConfig
    ? serverDatabaseConfig
    : localDatabaseConfig;
  const connection = await oracledb.getConnection(connectionConfig);
  try { return await work(connection); } finally { await connection.close(); }
}

async function runDdl(connection, sql) {
  try { await connection.execute(sql); } catch (error) { if (![955, 1408].includes(error.errorNum)) throw error; }
}

async function addColumn(connection, sql) {
  try { await connection.execute(sql); } catch (error) { if (error.errorNum !== 1430) throw error; }
}

async function renameTable(connection, oldName, newName) {
  try { await connection.execute(`ALTER TABLE ${oldName} RENAME TO ${newName}`); } catch (error) { if (![942, 955].includes(error.errorNum)) throw error; }
}

async function dropConstraint(connection, tableName, constraintName) {
  try { await connection.execute(`ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName}`); } catch (error) { if (error.errorNum !== 2443) throw error; }
}

async function makeColumnNullable(connection, tableName, columnName) {
  try { await connection.execute(`ALTER TABLE ${tableName} MODIFY (${columnName} NULL)`); } catch (error) { if (error.errorNum !== 1451) throw error; }
}

async function dropIndex(connection, indexName) {
  try { await connection.execute(`DROP INDEX ${indexName}`); } catch (error) { if (error.errorNum !== 1418) throw error; }
}

const ROLES = [
  ['Employee', 'Employee', 10],
  ['Supervisor', 'Supervisor', 20],
  ['Office Secretary', 'Office Secretary', 25],
  ['Department Secretary', 'Department Secretary', 27],
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
  'Office Secretary': ['file_personal_requests'],
  'Department Secretary': ['file_personal_requests', 'approve_team_requests'],
  'Department Manager': ['file_personal_requests', 'approve_team_requests', 'view_department_reports', 'manage_technical_admin'],
  'General Manager': ['file_personal_requests', 'approve_team_requests', 'view_department_reports', 'view_enterprise_reports', 'access_board_documents', 'manage_technical_admin'],
  'Board Member': ['file_personal_requests', 'view_department_reports', 'view_enterprise_reports', 'access_board_documents'],
  'Process Owner': ['file_personal_requests', 'view_department_reports'],
  Auditor: ['file_personal_requests', 'view_department_reports', 'view_enterprise_reports', 'access_audit_records'],
  Administrator: ['file_personal_requests', 'approve_team_requests', 'view_department_reports', 'view_enterprise_reports', 'publish_news_memos', 'manage_technical_admin'],
};

const NSD_TOOLS = [
  ['GIS', 'Geographic Information System'], ['NMS', 'Network Management System'], ['CRS', 'Compliance Reporting System'],
  ['TDR', 'Technical Data Repository'], ['MRMS', 'Meter Replacement Management System'], ['MIMS', 'Meter Installation Management System'],
  ['MIIS', 'Meter Inventory and Issuance System'], ['TMS', 'Transformer Management System'], ['CMS', 'Calibration Management System'],
  ['CRM', 'Customer Request Monitoring'], ['MDMS', 'Meter Data Management System'], ['MDMSG', 'MDMS for GeoP Customers and Man-Asok Power Plant'],
  ['ISO', 'ISO Management System'], ['DMS', 'Distribution Management System'], ['NRC', 'Network Reference Center'],
  ['OMS', 'Outage Management System'], ['Quick Slides', 'Presentation Builder'], ['Settings', 'Administrative Settings'],
];

const ISD_TOOLS = [
  ['Community Relations', 'Community Relations Office System'], ['General Services Office', 'General Services Office System'],
  ['Human Resources', 'Human Resources Module'], ['Recruitment and Onboarding', 'Recruitment and Onboarding Module'],
  ['Learning and Development', 'Learning and Development Module'], ['Performance Management', 'Performance Management Module'],
  ['Employee Relations', 'Employee Relations Module'], ['Institutional Communications', 'Institutional Communications Module'],
  ['Member-Consumer and Community Programs', 'Member-Consumer and Community Programs Module'], ['Records Management', 'Records Management Module'],
  ['Policies and Issuances', 'Policies and Issuances Module'], ['Events Management', 'Events Management Module'],
  ['Building and Facilities Management System', 'Building and Facilities Management System'],
];

const BASELINE_TOOL_ACCESS = [
  ...NSD_TOOLS.map(([code, name]) => [code, name, 'NSD', null, code === 'TDR' || code === 'NRC' ? 'VIEW' : code === 'MRMS' || code === 'MDMSG' || code === 'ISO' ? 'SOON' : code === 'MIIS' || code === 'DMS' ? 'NEW' : code === 'CRM' || code === 'OMS' ? 'EDIT' : code === 'Quick Slides' ? 'OPEN' : 'ADMIN', 'NSD']),
  ['WIS', 'Warehouse Inventory System', 'NSD', null, 'ADMIN', 'NSD'],
  ['WIS', 'Warehouse Inventory System', 'AUD', null, 'VIEW', 'NSD'],
  ['WIS', 'Warehouse Inventory System', 'ISD', null, 'EXISTING', 'NSD'],
  ...ISD_TOOLS.map(([code, name]) => [code, name, 'ISD', null, 'ADMIN', 'ISD']),
];

const BASELINE_TOOL_SUBJECTS = [
  ['Human Resources', 'Human Resource'], ['Recruitment and Onboarding', 'Application Letter'],
  ['Learning and Development', 'Learning and Development'], ['Performance Management', 'Performance Management'],
  ['Employee Relations', 'Employee Relations'], ['Institutional Communications', 'Institutional Communications'],
  ['Member-Consumer and Community Programs', 'Member-Consumer and Community Programs'], ['Records Management', 'Records Management'],
  ['Policies and Issuances', 'Policy Related'], ['Events Management', 'Events Management'],
  ['Building and Facilities Management System', 'Building and Facilities Management System'],
];

const BASELINE_DEPARTMENTS = [
  ['ISD', 'Institutional Services Department'], ['NSD', 'Network Services Department'],
  ['NNSD', 'Non-Network Services Department'], ['AUD', 'Audit Department'],
  ['CPD', 'Corporate Planning Department'], ['PGD', 'Power Generation Department'],
];

const BASELINE_OFFICES = {
  ISD: ['Human Resource Office', 'Community Relations Office', 'General Services Office', 'Material Equipment Management Office'],
  NSD: ['Network Operations', 'Line Maintenance', 'Outage Management', 'Crew Deployment', 'Substation & Line Records', 'Technical Projects'],
  NNSD: ['Finance & Accounting', 'Budget', 'Billing & Collection', 'Treasury', 'Procurement', 'Warehousing & Inventory', 'Property & Assets', 'Fleet Management', 'General Services'],
  AUD: ['Internal Audit', 'Risk-Based Audit', 'Compliance Review'],
  CPD: ['Strategic Planning', 'Corporate Performance Monitoring', 'Project Management', 'Risk Management', 'Regulatory Affairs', 'Research & Policy Studies'],
  PGD: ['Generation Operations', 'Production Monitoring', 'Plant Maintenance', 'Equipment Records', 'Safety & Environmental Compliance', 'Generation Projects'],
};

const BASELINE_POSITIONS = [
  ['ISD', null, 'Institutional Services Department Manager', 'DEPARTMENT_MANAGER'], ['ISD', null, 'Secretary', 'DEPARTMENT_SECRETARY'],
  ['ISD', 'General Services Office', 'General Services Officer', 'SUPERVISOR'], ['ISD', 'General Services Office', 'Mechanic', 'RAF'], ['ISD', 'General Services Office', 'Courier', 'RAF'], ['ISD', 'General Services Office', 'Utility', 'RAF'], ['ISD', 'General Services Office', 'Building and Ground Maintenance', 'RAF'], ['ISD', 'General Services Office', 'On-call Drivers', 'RAF'],
  ['ISD', 'Material Equipment Management Office', 'Materials and Equipment Management Officer', 'SUPERVISOR'], ['ISD', 'Material Equipment Management Office', 'Materials Inventory Associate', 'RAF'],
  ['ISD', 'Community Relations Office', 'Community Relations Officer', 'SUPERVISOR'], ['ISD', 'Community Relations Office', 'Community Relations Associate', 'RAF'],
  ['ISD', 'Human Resource Office', 'Human Resource Officer', 'SUPERVISOR'], ['ISD', 'Human Resource Office', 'HR Associate', 'RAF'],
  ['NSD', null, 'Network Services Department Manager', 'DEPARTMENT_MANAGER'], ['NSD', 'Network Operations', 'Executive and Consumer Associate', 'RAF'],
  ['NSD', 'Technical Projects', 'System Planning and Design Officer', 'SUPERVISOR'], ['NSD', 'Technical Projects', 'System Planning and Design Engineer', 'RAF'], ['NSD', 'Technical Projects', 'Engineering Associate', 'RAF'],
  ['NSD', 'Line Maintenance', 'Construction and Maintenance Officer', 'SUPERVISOR'], ['NSD', 'Line Maintenance', 'Lineman', 'RAF'], ['NSD', 'Line Maintenance', 'Construction and Light Maintenance', 'RAF'],
  ['NSD', 'Network Operations', 'System Control and Protection Officer', 'SUPERVISOR'], ['NSD', 'Network Operations', 'System Control and Protection Engineer', 'RAF'],
  ['NSD', 'Substation & Line Records', 'Special Equipment and Metering Officer', 'SUPERVISOR'], ['NSD', 'Substation & Line Records', 'Special Equipment and Metering Engineer', 'RAF'], ['NSD', 'Substation & Line Records', 'Special Equipment and Metering Associate', 'RAF'], ['NSD', 'Substation & Line Records', 'Meter Installation', 'RAF'],
  ['NNSD', null, 'Non-Network Services Department Manager', 'DEPARTMENT_MANAGER'], ['NNSD', null, 'Secretary', 'DEPARTMENT_SECRETARY'],
  ['NNSD', 'Finance & Accounting', 'Accounting Officer', 'SUPERVISOR'], ['NNSD', 'Finance & Accounting', 'Accounting Associate', 'RAF'], ['NNSD', 'Finance & Accounting', 'Rate Analyst', 'RAF'], ['NNSD', 'Procurement', 'Procurement Associate', 'RAF'],
  ['NNSD', 'Billing & Collection', 'Collection Officer', 'SUPERVISOR'], ['NNSD', 'Billing & Collection', 'Collection Associate', 'RAF'], ['NNSD', 'Billing & Collection', 'Collecting Agents', 'RAF'], ['NNSD', 'General Services', 'Consumer Welfare Officer', 'SUPERVISOR'], ['NNSD', 'General Services', 'Consumer Welfare and Call Center Associate', 'RAF'],
  ['NNSD', 'Billing & Collection', 'Meter Reading, Billing, and Disconnection Officer', 'SUPERVISOR'], ['NNSD', 'Billing & Collection', 'Meter Reader', 'RAF'], ['NNSD', 'Billing & Collection', 'Meter Reading', 'RAF'], ['NNSD', 'Billing & Collection', 'Disconnection', 'RAF'],
  ['AUD', null, 'Internal Auditor', 'DEPARTMENT_MANAGER'], ['AUD', 'Internal Audit', 'Internal Audit Supervisor', 'SUPERVISOR'], ['AUD', 'Internal Audit', 'Operations Auditor', 'RAF'], ['AUD', 'Internal Audit', 'Technical Auditor', 'RAF'], ['AUD', 'Internal Audit', 'Seasonal Inventory', 'RAF'],
  ['PGD', null, 'Power Generation Department Manager', 'DEPARTMENT_MANAGER'], ['PGD', 'Equipment Records', 'Compliance and Records Officer', 'SUPERVISOR'], ['PGD', 'Safety & Environmental Compliance', 'Forrester, Pollution Control and Safety Officer', 'SUPERVISOR'], ['PGD', 'Generation Operations', 'Hydro-electric Power Plant Operations Superintendent', 'SUPERVISOR'], ['PGD', 'Generation Operations', 'Power Plant Shift Engineer', 'RAF'], ['PGD', 'Plant Maintenance', 'Power Plant Facilities Maintenance Associate', 'RAF'],
  ['CPD', null, 'Corporate Planning Department Manager', 'DEPARTMENT_MANAGER'], ['CPD', null, 'Secretary', 'DEPARTMENT_SECRETARY'], ['CPD', 'Strategic Planning', 'Power Supply and Energy Trading Officer', 'SUPERVISOR'], ['CPD', 'Strategic Planning', 'Power Supply and Energy Trading Associate', 'RAF'], ['CPD', 'Regulatory Affairs', 'Business Development & Regulatory Compliance Officer', 'SUPERVISOR'], ['CPD', 'Regulatory Affairs', 'Business Development & Regulatory Compliance Associate', 'RAF'],
];

async function seedOrganizationalStructure(connection) {
  for (const [departmentCode, departmentName] of BASELINE_DEPARTMENTS) {
    await connection.execute(`MERGE INTO bes_departments d USING (SELECT :departmentCode department_code FROM dual) src
      ON (d.department_code = src.department_code)
      WHEN MATCHED THEN UPDATE SET department_name = :departmentName, is_active = 'Y', updated_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (department_code, department_name, is_active) VALUES (:departmentCode, :departmentName, 'Y')`, { departmentCode, departmentName });
    for (const officeName of BASELINE_OFFICES[departmentCode] ?? []) {
      await connection.execute(`MERGE INTO bes_offices o
        USING (SELECT d.department_id, :officeName office_name FROM bes_departments d WHERE d.department_code = :departmentCode) src
        ON (o.department_id = src.department_id AND UPPER(o.office_name) = UPPER(src.office_name))
        WHEN MATCHED THEN UPDATE SET is_active = 'Y', updated_at = SYSTIMESTAMP
        WHEN NOT MATCHED THEN INSERT (department_id, office_name, is_active) VALUES (src.department_id, src.office_name, 'Y')`, { departmentCode, officeName });
    }
  }
  for (const [departmentCode, officeName, positionTitle, employeeClass] of BASELINE_POSITIONS) {
    if (officeName) {
      await connection.execute(`MERGE INTO bes_positions p USING (
          SELECT o.office_id, :positionTitle position_title FROM bes_offices o JOIN bes_departments d ON d.department_id=o.department_id
          WHERE d.department_code=:departmentCode AND UPPER(o.office_name)=UPPER(:officeName)
        ) src ON (p.office_id=src.office_id AND UPPER(p.position_title)=UPPER(src.position_title))
        WHEN MATCHED THEN UPDATE SET employee_class=:employeeClass, department_id=NULL, is_active='Y', updated_at=SYSTIMESTAMP
        WHEN NOT MATCHED THEN INSERT (office_id,position_title,employee_class,is_active) VALUES (src.office_id,src.position_title,:employeeClass,'Y')`, { departmentCode, officeName, positionTitle, employeeClass });
    } else {
      await connection.execute(`MERGE INTO bes_positions p USING (
          SELECT d.department_id, :positionTitle position_title FROM bes_departments d WHERE d.department_code=:departmentCode
        ) src ON (p.department_id=src.department_id AND p.office_id IS NULL AND UPPER(p.position_title)=UPPER(src.position_title))
        WHEN MATCHED THEN UPDATE SET employee_class=:employeeClass, is_active='Y', updated_at=SYSTIMESTAMP
        WHEN NOT MATCHED THEN INSERT (department_id,position_title,employee_class,is_active) VALUES (src.department_id,src.position_title,:employeeClass,'Y')`, { departmentCode, positionTitle, employeeClass });
    }
  }
}

async function seedToolRegistry(connection) {
  await connection.execute(`DELETE FROM bes_task_subjects WHERE tool_code = 'HR Office'`);
  await connection.execute(`DELETE FROM bes_tool_access WHERE tool_code = 'HR Office'`);
  await connection.execute(`UPDATE bes_task_subjects SET tool_code = 'General Services Office', updated_at = SYSTIMESTAMP WHERE tool_code = 'Motorpool'`);
  await connection.execute(`DELETE FROM bes_tool_access WHERE tool_code = 'Motorpool'`);
  await connection.execute(`UPDATE bes_tool_access SET office_name = 'General Services Office', updated_at = SYSTIMESTAMP WHERE office_name = 'Motorpool'`);
  const accessCount = await connection.execute(`SELECT COUNT(*) row_count FROM bes_tool_access`);
  if (Number(accessCount.rows[0]?.ROW_COUNT ?? 0) === 0) {
    for (const [toolCode, toolName, departmentCode, officeName, accessLevel, ownerDepartmentCode] of BASELINE_TOOL_ACCESS) {
      const toolStatus = accessLevel === 'SOON' ? 'SOON' : 'ENABLED';
      await connection.execute(`INSERT INTO bes_tool_access
          (tool_code,tool_name,department_code,office_name,access_level,owner_department_code,tool_status,is_active)
        VALUES (:toolCode,:toolName,:departmentCode,:officeName,:accessLevel,:ownerDepartmentCode,:toolStatus,'Y')`, {
        toolCode, toolName, departmentCode, officeName, accessLevel, ownerDepartmentCode, toolStatus,
      });
    }
  }
  const subjectCount = await connection.execute(`SELECT COUNT(*) row_count FROM bes_task_subjects`);
  if (Number(subjectCount.rows[0]?.ROW_COUNT ?? 0) === 0) {
    for (const [toolCode, taskSubject] of BASELINE_TOOL_SUBJECTS) {
      await connection.execute(`INSERT INTO bes_task_subjects (tool_code,task_subject,is_active) VALUES (:toolCode,:taskSubject,'Y')`, { toolCode, taskSubject });
    }
  }
}

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

const BASELINE_POLICY_RECORDS = [
  ['POL-REC-001', 'Revised Employee Handbook 2026', 'HR-MAN-2026-001', 'Policy', '3', '2026-08-12', 'Consolidated employee handbook covering employment policies, benefits, conduct, and workplace procedures.', 'Human Resources'],
  ['POL-REC-002', 'Flexible Work Arrangement Guidelines', 'HR-POL-2026-014', 'Guidelines', '1', '2026-08-13', 'Guidelines for requesting, approving, monitoring, and reviewing flexible work arrangements.', 'Human Resources'],
  ['POL-REC-003', 'Data Privacy Manual — Annual Review', 'DPO-MAN-2026-003', 'Policy', '2', '2026-09-15', 'Annual review of the cooperative data privacy manual and personal-information handling controls.', 'Legal and Compliance'],
];

const HRO_TOOL_TASK_TABLES = [
  'bes_hro_rec_task_processing',
  'bes_hro_hr_task_processing',
  'bes_hro_ld_task_processing',
  'bes_hro_pm_task_processing',
  'bes_hro_er_task_processing',
  'bes_hro_ic_task_processing',
  'bes_hro_mcp_task_processing',
  'bes_hro_rm_task_processing',
  'bes_hro_em_task_processing',
];

async function createHroToolTaskTables(connection) {
  for (const tableName of HRO_TOOL_TASK_TABLES) {
    await runDdl(connection, `CREATE TABLE ${tableName} (
      processing_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      source_task_uid VARCHAR2(80) NOT NULL UNIQUE REFERENCES bes_work_tasks(task_uid) ON DELETE CASCADE,
      workflow_status VARCHAR2(40) DEFAULT 'Received' NOT NULL,
      action_taken CLOB,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_${tableName}_status CHECK (workflow_status IN ('Received','Under Review','For Approval','Approved','Issued','Completed','Returned'))
    )`);
    await runDdl(connection, `CREATE INDEX ix_${tableName}_status ON ${tableName} (workflow_status, updated_at)`);
  }
}

async function seedPolicyRecords(connection) {
  for (const [recordUid, title, documentNumber, documentType, revisionNumber, effectivityDate, contents, nature] of BASELINE_POLICY_RECORDS) {
    await connection.execute(`MERGE INTO bes_policy_records p
      USING (SELECT :recordUid record_uid FROM dual) src
      ON (p.record_uid = src.record_uid)
      WHEN MATCHED THEN UPDATE SET p.document_type = :documentType
      WHEN NOT MATCHED THEN INSERT
        (record_uid, title, document_number, document_type, revision_number, effectivity_date, contents, nature, is_active)
        VALUES
        (:recordUid, :title, :documentNumber, :documentType, :revisionNumber, TO_DATE(:effectivityDate, 'YYYY-MM-DD'), :contents, :nature, 'Y')`, {
      recordUid, title, documentNumber, documentType, revisionNumber, effectivityDate, contents, nature,
    });
  }
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
    await runDdl(connection, `CREATE TABLE bes_hro_recruitment_and_onboarding (
      recruitment_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      recruitment_uid VARCHAR2(80) NOT NULL UNIQUE,
      source_task_uid VARCHAR2(80) NOT NULL UNIQUE REFERENCES bes_work_tasks(task_uid) ON DELETE CASCADE,
      workflow_status VARCHAR2(40) DEFAULT 'Received' NOT NULL,
      action_taken VARCHAR2(100),
      position_applying VARCHAR2(200),
      remarks CLOB,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (last_name VARCHAR2(120))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (first_name VARCHAR2(120))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (middle_name VARCHAR2(120))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (suffix VARCHAR2(30))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (birth_date DATE)`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (sex VARCHAR2(20))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (civil_status VARCHAR2(30))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (email VARCHAR2(254))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (mobile_no VARCHAR2(40))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (municipality VARCHAR2(120))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (barangay VARCHAR2(180))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (address VARCHAR2(500))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (highest_education VARCHAR2(200))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (school_name VARCHAR2(250))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (year_graduated VARCHAR2(10))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (application_source VARCHAR2(100))`);
    await addColumn(connection, `ALTER TABLE bes_hro_recruitment_and_onboarding ADD (is_active CHAR(1) DEFAULT 'Y' NOT NULL)`);
    await runDdl(connection, `CREATE TABLE bes_departments (
      department_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      department_code VARCHAR2(30) NOT NULL UNIQUE,
      department_name VARCHAR2(180) NOT NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_departments_active CHECK (is_active IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE UNIQUE INDEX ux_bes_department_name ON bes_departments (UPPER(department_name))`);
    await runDdl(connection, `CREATE TABLE bes_offices (
      office_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      department_id NUMBER NOT NULL REFERENCES bes_departments(department_id),
      parent_office_id NUMBER REFERENCES bes_offices(office_id),
      office_name VARCHAR2(180) NOT NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_offices_active CHECK (is_active IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE UNIQUE INDEX ux_bes_office_dept_name ON bes_offices (department_id, UPPER(office_name))`);
    await runDdl(connection, `CREATE TABLE bes_positions (
      position_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      department_id NUMBER REFERENCES bes_departments(department_id),
      office_id NUMBER REFERENCES bes_offices(office_id),
      position_title VARCHAR2(180) NOT NULL,
      employee_class VARCHAR2(20) DEFAULT 'RAF' NOT NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_position_class CHECK (employee_class IN ('DEPARTMENT_MANAGER','DEPARTMENT_SECRETARY','OFFICE_SECRETARY','SUPERVISOR','RAF')),
      CONSTRAINT chk_bes_position_scope CHECK ((department_id IS NOT NULL AND office_id IS NULL) OR (department_id IS NULL AND office_id IS NOT NULL)),
      CONSTRAINT chk_bes_positions_active CHECK (is_active IN ('Y','N'))
    )`);
    await addColumn(connection, `ALTER TABLE bes_positions ADD (department_id NUMBER REFERENCES bes_departments(department_id))`);
    await makeColumnNullable(connection, 'BES_POSITIONS', 'OFFICE_ID');
    await dropConstraint(connection, 'BES_POSITIONS', 'CHK_BES_POSITION_CLASS');
    await runDdl(connection, `ALTER TABLE bes_positions ADD CONSTRAINT chk_bes_position_class CHECK (employee_class IN ('DEPARTMENT_MANAGER','DEPARTMENT_SECRETARY','OFFICE_SECRETARY','SUPERVISOR','RAF'))`);
    await dropConstraint(connection, 'BES_POSITIONS', 'CHK_BES_POSITION_SCOPE');
    await runDdl(connection, `ALTER TABLE bes_positions ADD CONSTRAINT chk_bes_position_scope CHECK ((department_id IS NOT NULL AND office_id IS NULL) OR (department_id IS NULL AND office_id IS NOT NULL))`);
    await dropIndex(connection, 'UX_BES_POSITION_OFFICE');
    await runDdl(connection, `CREATE UNIQUE INDEX ux_bes_position_scope ON bes_positions (NVL(department_id, -1), NVL(office_id, -1), UPPER(position_title))`);
    await renameTable(connection, 'BES_ISD_TOOL_ACCESS', 'BES_TOOL_ACCESS');
    await renameTable(connection, 'BES_ISD_TASK_SUBJECTS', 'BES_TASK_SUBJECTS');
    await runDdl(connection, `CREATE TABLE bes_tool_access (
      tool_access_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      tool_code VARCHAR2(120) NOT NULL,
      tool_name VARCHAR2(200) NOT NULL,
      department_code VARCHAR2(30) NOT NULL,
      office_name VARCHAR2(150),
      position_name VARCHAR2(180),
      access_level VARCHAR2(20) DEFAULT 'VIEW' NOT NULL,
      tool_status VARCHAR2(20) DEFAULT 'ENABLED' NOT NULL,
      owner_department_code VARCHAR2(30) NOT NULL,
      access_note VARCHAR2(500),
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_isd_tool_level CHECK (access_level IN ('ADMIN','NEW','VIEW','EDIT','OPEN','SOON','EXISTING')),
      CONSTRAINT chk_bes_tool_status CHECK (tool_status IN ('SOON','ENABLED','DISABLED')),
      CONSTRAINT chk_bes_isd_tool_active CHECK (is_active IN ('Y','N'))
    )`);
    await addColumn(connection, `ALTER TABLE bes_tool_access ADD (position_name VARCHAR2(180))`);
    await addColumn(connection, `ALTER TABLE bes_tool_access ADD (tool_status VARCHAR2(20) DEFAULT 'ENABLED' NOT NULL)`);
    await dropConstraint(connection, 'BES_TOOL_ACCESS', 'CHK_BES_TOOL_STATUS');
    await runDdl(connection, `ALTER TABLE bes_tool_access ADD CONSTRAINT chk_bes_tool_status CHECK (tool_status IN ('SOON','ENABLED','DISABLED'))`);
    await dropIndex(connection, 'UX_BES_TOOL_ACCESS');
    await dropIndex(connection, 'UX_BES_ISD_TOOL_ACCESS');
    await runDdl(connection, `CREATE UNIQUE INDEX ux_bes_tool_access_scope ON bes_tool_access (tool_code, department_code, NVL(office_name, '-'), NVL(position_name, '-'))`);
    await runDdl(connection, `CREATE INDEX ix_bes_tool_dept ON bes_tool_access (department_code, office_name, is_active)`);
    await runDdl(connection, `CREATE TABLE bes_task_subjects (
      tool_subject_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      tool_code VARCHAR2(120) NOT NULL,
      task_subject VARCHAR2(180) NOT NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_isd_subject_active CHECK (is_active IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE UNIQUE INDEX ux_bes_tool_subject ON bes_task_subjects (tool_code, UPPER(task_subject))`);
    await runDdl(connection, `CREATE INDEX ix_bes_subject_lookup ON bes_task_subjects (UPPER(task_subject), is_active)`);
    await runDdl(connection, `CREATE TABLE bes_module_registry (
      module_path VARCHAR2(180) PRIMARY KEY,
      module_label VARCHAR2(180) NOT NULL,
      admin_only CHAR(1) DEFAULT 'N' NOT NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_module_admin CHECK (admin_only IN ('Y','N')),
      CONSTRAINT chk_bes_module_active CHECK (is_active IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE TABLE bes_module_access (
      module_path VARCHAR2(180) NOT NULL REFERENCES bes_module_registry(module_path) ON DELETE CASCADE,
      department_code VARCHAR2(30) NOT NULL,
      is_enabled CHAR(1) DEFAULT 'Y' NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT pk_bes_module_access PRIMARY KEY (module_path, department_code),
      CONSTRAINT chk_bes_module_enabled CHECK (is_enabled IN ('Y','N'))
    )`);
    const sidebarModules = [
      ['/home','Enterprise Home','N'],['/inbox','Inbox','N'],['/my-work','My Work','N'],['/services','Employee Services','N'],
      ['/workspace','My Workspace','N'],['/workflows','Shared Workflows','N'],['/calendar','Calendar','N'],['/news','News and Memos','N'],
      ['/documents','Documents and Policies','N'],['/storage','My Storage','N'],['/iso','ISO / QMS','N'],['/organization','Organization','N'],
      ['/reports','Reports and Analytics','N'],['/help','Help and Support','N'],['/admin','Administration','Y'],
    ];
    for (const [modulePath, moduleLabel, adminOnly] of sidebarModules) {
      await connection.execute(`MERGE INTO bes_module_registry m USING (SELECT :modulePath module_path FROM dual) src ON (m.module_path=src.module_path)
        WHEN NOT MATCHED THEN INSERT (module_path,module_label,admin_only) VALUES (:modulePath,:moduleLabel,:adminOnly)`, { modulePath, moduleLabel, adminOnly });
      if (adminOnly === 'N') for (const departmentCode of ['ISD','NSD','NNSD','AUD','CPD','PGD']) {
        await connection.execute(`MERGE INTO bes_module_access a USING (SELECT :modulePath module_path,:departmentCode department_code FROM dual) src
          ON (a.module_path=src.module_path AND a.department_code=src.department_code)
          WHEN NOT MATCHED THEN INSERT (module_path,department_code,is_enabled) VALUES (:modulePath,:departmentCode,'Y')`, { modulePath, departmentCode });
      }
    }
    await runDdl(connection, `CREATE INDEX ix_bes_hro_recruitment_status ON bes_hro_recruitment_and_onboarding (workflow_status, updated_at)`);
    await runDdl(connection, `CREATE TABLE bes_hro_recruitment_positions (
      position_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      position_name VARCHAR2(200) NOT NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_hro_positions_active CHECK (is_active IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE UNIQUE INDEX ux_bes_hro_position_name ON bes_hro_recruitment_positions (UPPER(position_name))`);
    await runDdl(connection, `INSERT INTO bes_hro_recruitment_positions (position_name)
      SELECT DISTINCT position_applying
      FROM bes_hro_recruitment_and_onboarding
      WHERE position_applying IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM bes_hro_recruitment_positions p
          WHERE UPPER(p.position_name) = UPPER(bes_hro_recruitment_and_onboarding.position_applying)
        )`);
    await runDdl(connection, `CREATE TABLE bes_hro_recruitment_comments (
      comment_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      comment_uid VARCHAR2(80) NOT NULL UNIQUE,
      recruitment_uid VARCHAR2(80) NOT NULL REFERENCES bes_hro_recruitment_and_onboarding(recruitment_uid) ON DELETE CASCADE,
      author_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      message CLOB NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await runDdl(connection, `CREATE INDEX ix_bes_hro_recruitment_comments ON bes_hro_recruitment_comments (recruitment_uid, created_at)`);
    await runDdl(connection, `CREATE TABLE bes_policy_records (
      policy_record_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      record_uid VARCHAR2(80) NOT NULL UNIQUE,
      title VARCHAR2(300) NOT NULL,
      document_number VARCHAR2(120) NOT NULL,
      document_type VARCHAR2(30) DEFAULT 'Policy' NOT NULL,
      policy_status VARCHAR2(20) DEFAULT 'Effective' NOT NULL,
      revision_number VARCHAR2(60) NOT NULL,
        effectivity_date DATE,
      contents CLOB NOT NULL,
      nature VARCHAR2(40) NOT NULL,
      attachment_name VARCHAR2(255),
      attachment_mime_type VARCHAR2(150),
      attachment_size NUMBER,
      attachment_blob BLOB,
      attachment_data CLOB,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_policy_records_nature CHECK (nature IN ('Financial','Human Resources','Legal and Compliance','Public Relations','Operations')),
      CONSTRAINT chk_bes_policy_records_type CHECK (document_type IN ('Policy','Issuance','Guidelines')),
      CONSTRAINT chk_bes_policy_records_status CHECK (policy_status IN ('Effective','Draft','Amended','Rescinded')),
      CONSTRAINT chk_bes_policy_records_active CHECK (is_active IN ('Y','N'))
    )`);
    await addColumn(connection, `ALTER TABLE bes_policy_records ADD (attachment_size NUMBER)`);
    await addColumn(connection, `ALTER TABLE bes_policy_records ADD (attachment_blob BLOB)`);
    await addColumn(connection, `ALTER TABLE bes_policy_records ADD (document_type VARCHAR2(30) DEFAULT 'Policy' NOT NULL)`);
  await addColumn(connection, `ALTER TABLE bes_policy_records ADD (policy_status VARCHAR2(20) DEFAULT 'Effective' NOT NULL)`);
  await makeColumnNullable(connection, 'BES_POLICY_RECORDS', 'EFFECTIVITY_DATE');
  await dropConstraint(connection, 'BES_POLICY_RECORDS', 'CHK_BES_POLICY_RECORDS_STATUS');
  await runDdl(
    connection,
    `ALTER TABLE bes_policy_records ADD CONSTRAINT chk_bes_policy_records_status
       CHECK (policy_status IN ('Effective', 'Draft', 'Amended', 'Rescinded'))`,
  );
    await runDdl(connection, `CREATE UNIQUE INDEX ux_bes_policy_document_number ON bes_policy_records (document_number)`);
    await runDdl(connection, `CREATE INDEX ix_bes_policy_records_nature ON bes_policy_records (nature, effectivity_date, is_active)`);
    await runDdl(connection, `CREATE TABLE bes_policy_task_processing (
      processing_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      source_task_uid VARCHAR2(80) NOT NULL UNIQUE REFERENCES bes_work_tasks(task_uid) ON DELETE CASCADE,
      workflow_status VARCHAR2(40) DEFAULT 'Received' NOT NULL,
      action_taken CLOB,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_policy_task_status CHECK (workflow_status IN ('Received','Under Review','For Approval','Approved','Issued','Completed','Returned'))
    )`);
    await runDdl(connection, `CREATE INDEX ix_bes_policy_task_status ON bes_policy_task_processing (workflow_status, updated_at)`);
    await createHroToolTaskTables(connection);
    await seedAccessControl(connection);
    await seedOrganizationalStructure(connection);
    await seedToolRegistry(connection);
    await seedCalendarEvents(connection);
    await seedPolicyRecords(connection);
    await connection.commit();
  });
}
