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
  try { await connection.execute(sql); } catch (error) {
    if ([955, 1408].includes(error.errorNum)) return;
    if (error.errorNum === 54) {
      const match = sql.match(/^\s*CREATE\s+(TABLE|INDEX)\s+([A-Z0-9_$#]+)/i);
      if (match) {
        const objectType = match[1].toUpperCase();
        const objectName = match[2].toUpperCase();
        const existing = await connection.execute(`SELECT 1 FROM user_objects WHERE object_name=:objectName AND object_type=:objectType`, { objectName, objectType });
        if (existing.rows[0]) return;
      }
    }
    throw error;
  }
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
  ['Member-Consumer and Community Programs', 'Community Programs'], ['Records Management', 'Records Management'],
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

async function seedPositionDrPl(connection) {
  const levels = ['Department Secretary I', 'Department Secretary II', 'Department Secretary III', 'Department Secretary IV'];
  const secretaryLevels = ['DS I', 'DS II', 'DS III', 'DS IV'];
  const duties = [
    ['Document Circulation/tracking', 60, 'Receives and/or routes documents, circulars, reports and other documents through available channels, including hardcopies, Zimbra local email, and email.', 'Working knowledge of the in-house system', 'DS I: 2 · DS II: 3 · DS III–IV: 4'],
    ['Document Circulation/tracking', 60, 'Logs document details for future tracking needs.', 'Records management skills', 'DS I: 2 · DS II: 3 · DS III–IV: 4'],
    ['Document Circulation/tracking', 60, 'Maintains scanned copies of routed documents to facilitate efficient tracing.', 'Records management skills; working knowledge of office equipment', 'DS I: 2 · DS II: 3 · DS III–IV: 4'],
    ['Document Circulation/tracking', 60, 'Prints and transmits copies of documents to all indicated recipients.', 'Working knowledge of office equipment', 'DS I: 2 · DS II: 3 · DS III–IV: 4'],
    ['Administrative Efficiency', 35, 'Takes dictation, transcribes, and types letters and reports.', 'Report writing skills; working knowledge of MS Word and MS Excel', 'DS I: 2 · DS II: 3 · DS III–IV: 4'],
    ['Administrative Efficiency', 35, 'Takes the department minutes of meetings.', 'Report writing skills', 'DS I: 2 · DS II: 3 · DS III–IV: 4'],
    ['Administrative Efficiency', 35, 'Receives and/or places telephone calls and messages from and to other departments and employees.', 'Verbal communication skills', 'DS I: 2 · DS II: 3 · DS III–IV: 4'],
    ['Administrative Efficiency', 35, 'Encodes data for monthly time-slip generation through the respective system channels, including Gate Pass and Travel Order, in preparation of payroll data.', 'Working knowledge of the in-house system', 'DS I: 2 · DS II: 3 · DS III–IV: 4'],
    ['Administrative Efficiency', 35, 'Tracks and controls Gas Slip issuance.', 'Working knowledge of the in-house system', 'DS I: 2 · DS II: 3 · DS III–IV: 4'],
    ['Administrative Efficiency', 35, 'Coordinates, monitors, and reminds the Department Manager of appointments.', 'Record keeping skills', 'DS I: 2 · DS II: 3 · DS III–IV: 4'],
    ['Administrative Efficiency', 35, 'Maintains an efficient inventory level of office supplies needed by the Department and keeps records of the same.', 'Record keeping skills', 'DS I: 2 · DS II: 3 · DS III–IV: 4'],
    ['QMS related responsibilities', 5, 'Conforms with the Quality Policy and related Quality Objectives.', 'ISO awareness', 'Level 3'],
    ['QMS related responsibilities', 5, 'Conforms with related Quality Procedures and supporting documents.', 'ISO awareness', 'Level 3'],
  ].map(([kra, kraWeight, description, competency, levelRequirement], index) => ({ id: `ISD-DS-${index + 1}`, kra, kraWeight, description, applicableLevels: secretaryLevels, competency, levelRequirement }));
  await connection.execute(`MERGE INTO bes_position_dr_pl profile USING (
      SELECT p.position_id FROM bes_positions p JOIN bes_departments d ON d.department_id=p.department_id
      WHERE d.department_code='ISD' AND p.office_id IS NULL AND UPPER(p.position_title)='SECRETARY'
    ) src ON (profile.position_id=src.position_id)
    WHEN NOT MATCHED THEN INSERT (position_id,position_purpose,employment_level,reports_to,area_of_work,position_levels_json,duties_json,source_document)
      VALUES (src.position_id,:purpose,:employmentLevel,:reportsTo,:areaOfWork,:positionLevels,:duties,:sourceDocument)`, {
    purpose: 'Responsible for ensuring an orderly office and providing efficient and reliable secretarial services, including HR records management, handling confidential information, and keeping vital information and documents needed by the Department Manager in making operational decisions.',
    employmentLevel: 'Rank and File', reportsTo: 'Department Manager', areaOfWork: 'Head Office',
    positionLevels: JSON.stringify(levels), duties: JSON.stringify(duties), sourceDocument: 'Department Secretary-03272024.docx',
  });
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
  await connection.execute(`DELETE FROM bes_task_subjects old_subject WHERE old_subject.tool_code='Member-Consumer and Community Programs' AND old_subject.task_subject='Member-Consumer and Community Programs' AND EXISTS (SELECT 1 FROM bes_task_subjects current_subject WHERE current_subject.tool_code=old_subject.tool_code AND current_subject.task_subject='Community Programs')`);
  await connection.execute(`UPDATE bes_task_subjects SET task_subject='Community Programs' WHERE tool_code='Member-Consumer and Community Programs' AND task_subject='Member-Consumer and Community Programs'`);
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
      CONSTRAINT chk_bes_policy_records_status CHECK (policy_status IN ('Effective','New (Draft)','Amended (Draft)','Amended','Rescinded')),
      CONSTRAINT chk_bes_policy_records_active CHECK (is_active IN ('Y','N'))
    )`);
    await addColumn(connection, `ALTER TABLE bes_policy_records ADD (attachment_size NUMBER)`);
    await addColumn(connection, `ALTER TABLE bes_policy_records ADD (attachment_blob BLOB)`);
    await addColumn(connection, `ALTER TABLE bes_policy_records ADD (document_type VARCHAR2(30) DEFAULT 'Policy' NOT NULL)`);
  await addColumn(connection, `ALTER TABLE bes_policy_records ADD (policy_status VARCHAR2(20) DEFAULT 'Effective' NOT NULL)`);
  await makeColumnNullable(connection, 'BES_POLICY_RECORDS', 'EFFECTIVITY_DATE');
  await dropConstraint(connection, 'BES_POLICY_RECORDS', 'CHK_BES_POLICY_RECORDS_STATUS');
  await connection.execute(
    `UPDATE bes_policy_records SET policy_status = 'New (Draft)' WHERE policy_status = 'Draft'`,
  );
  await runDdl(
    connection,
    `ALTER TABLE bes_policy_records ADD CONSTRAINT chk_bes_policy_records_status
       CHECK (policy_status IN ('Effective', 'New (Draft)', 'Amended (Draft)', 'Amended', 'Rescinded'))`,
  );
    await runDdl(connection, `CREATE UNIQUE INDEX ux_bes_policy_document_number ON bes_policy_records (document_number)`);
    await runDdl(connection, `CREATE INDEX ix_bes_policy_records_nature ON bes_policy_records (nature, effectivity_date, is_active)`);
    await runDdl(connection, `CREATE TABLE bes_fleet_store (
      data_key VARCHAR2(40) PRIMARY KEY,
      payload CLOB NOT NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await runDdl(connection, `CREATE TABLE bes_fleet_vehicle_models (
      vehicle_uid VARCHAR2(80) PRIMARY KEY,
      file_name VARCHAR2(255) NOT NULL,
      mime_type VARCHAR2(120) DEFAULT 'model/gltf-binary' NOT NULL,
      file_size NUMBER NOT NULL,
      file_blob BLOB NOT NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await runDdl(connection, `CREATE TABLE bes_fleet_model_library (
      model_uid VARCHAR2(80) PRIMARY KEY,
      vehicle_type VARCHAR2(80) NOT NULL,
      brand VARCHAR2(120) NOT NULL,
      model VARCHAR2(160) NOT NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_bes_fleet_model_brand UNIQUE (brand, model)
    )`);
    await runDdl(connection, `CREATE TABLE bes_fleet_schedules (
      schedule_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      schedule_uid VARCHAR2(80) NOT NULL UNIQUE,
      vehicle_master_id NUMBER NOT NULL,
      schedule_type VARCHAR2(40) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      actual_maintenance_date DATE,
      schedule_status VARCHAR2(30) DEFAULT 'Scheduled' NOT NULL,
      notes VARCHAR2(2000),
      created_by_user_id NUMBER,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await addColumn(connection, `ALTER TABLE bes_fleet_schedules ADD (actual_maintenance_date DATE)`);
    await runDdl(connection, `CREATE INDEX ix_bes_fleet_schedules_vehicle ON bes_fleet_schedules (vehicle_master_id, start_date)`);
    await runDdl(connection, `CREATE TABLE bes_fleet_renewal_receipts (
      receipt_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      schedule_uid VARCHAR2(80) NOT NULL UNIQUE,
      or_number VARCHAR2(120),
      receipt_date DATE,
      amount_paid NUMBER(15,2),
      issuing_office VARCHAR2(240),
      file_name VARCHAR2(255),
      mime_type VARCHAR2(120),
      file_size NUMBER,
      file_blob BLOB,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT fk_fleet_receipt_schedule FOREIGN KEY (schedule_uid) REFERENCES bes_fleet_schedules(schedule_uid) ON DELETE CASCADE
    )`);
    await runDdl(connection, `CREATE TABLE bes_fleet_inspections (
      inspection_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      inspection_uid VARCHAR2(80) NOT NULL UNIQUE,
      vehicle_master_id NUMBER NOT NULL,
      inspection_date DATE NOT NULL,
      inspected_by VARCHAR2(200) NOT NULL,
      inspection_status VARCHAR2(40) NOT NULL,
      findings VARCHAR2(4000),
      action_taken VARCHAR2(4000),
      recommendation VARCHAR2(4000),
      annotations_json CLOB,
      snapshot_name VARCHAR2(255),
      snapshot_mime_type VARCHAR2(120),
      snapshot_blob BLOB,
      created_by_user_id NUMBER,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await addColumn(connection, `ALTER TABLE bes_fleet_inspections ADD (annotations_json CLOB)`);
    await addColumn(connection, `ALTER TABLE bes_fleet_inspections ADD (snapshot_name VARCHAR2(255))`);
    await addColumn(connection, `ALTER TABLE bes_fleet_inspections ADD (snapshot_mime_type VARCHAR2(120))`);
    await addColumn(connection, `ALTER TABLE bes_fleet_inspections ADD (snapshot_blob BLOB)`);
    await runDdl(connection, `CREATE INDEX ix_bes_fleet_inspections_vehicle ON bes_fleet_inspections (vehicle_master_id, inspection_date)`);
    await runDdl(connection, `CREATE TABLE bes_fleet_inspection_items (
      item_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      item_uid VARCHAR2(80) NOT NULL UNIQUE,
      inspection_uid VARCHAR2(80) NOT NULL,
      item_sequence NUMBER NOT NULL,
      activity VARCHAR2(300) NOT NULL,
      item_status VARCHAR2(80) NOT NULL,
      findings VARCHAR2(4000),
      action_taken VARCHAR2(4000),
      recommendation VARCHAR2(4000),
      annotations_json CLOB,
      snapshot_name VARCHAR2(255),
      snapshot_mime_type VARCHAR2(120),
      snapshot_blob BLOB,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT fk_fleet_inspection_item FOREIGN KEY (inspection_uid) REFERENCES bes_fleet_inspections(inspection_uid) ON DELETE CASCADE
    )`);
    await runDdl(connection, `CREATE INDEX ix_fleet_inspection_items ON bes_fleet_inspection_items (inspection_uid, item_sequence)`);
    await runDdl(connection, `CREATE TABLE bes_fleet_inspection_photos (
      photo_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      inspection_uid VARCHAR2(80) NOT NULL,
      item_uid VARCHAR2(80),
      file_name VARCHAR2(255) NOT NULL,
      mime_type VARCHAR2(120) NOT NULL,
      file_size NUMBER NOT NULL,
      file_blob BLOB NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT fk_fleet_inspection_photo FOREIGN KEY (inspection_uid) REFERENCES bes_fleet_inspections(inspection_uid) ON DELETE CASCADE
    )`);
    await addColumn(connection, `ALTER TABLE bes_fleet_inspection_photos ADD (item_uid VARCHAR2(80))`);
    await runDdl(connection, `CREATE INDEX ix_fleet_inspection_photos ON bes_fleet_inspection_photos (inspection_uid, photo_id)`);
    await runDdl(connection, `CREATE TABLE bes_csr_requests (
      csr_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      csr_uid VARCHAR2(80) NOT NULL UNIQUE,
      date_requested DATE NOT NULL,
      program_type VARCHAR2(120) NOT NULL,
      requestee VARCHAR2(200) NOT NULL,
      designation VARCHAR2(160),
      organization VARCHAR2(240),
      registration_details VARCHAR2(500),
      sector VARCHAR2(120),
      location VARCHAR2(300),
      barangay VARCHAR2(160),
      municipality VARCHAR2(160),
      district VARCHAR2(80),
      project_details VARCHAR2(4000),
      project_requirement VARCHAR2(4000),
      pending_reason VARCHAR2(2000),
      with_letter_reply CHAR(1) DEFAULT 'N' NOT NULL,
      additional_remarks VARCHAR2(4000),
      request_status VARCHAR2(30) DEFAULT 'For evaluation' NOT NULL,
      approval_status VARCHAR2(30) DEFAULT 'For Evaluation' NOT NULL,
      evaluation_result VARCHAR2(40),
      amount_funding NUMBER(15,2),
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_csr_request_status CHECK (request_status IN ('For evaluation','Pending','Completed')),
      CONSTRAINT chk_csr_approval_status CHECK (approval_status IN ('Approved','Disapproved','For Evaluation')),
      CONSTRAINT chk_csr_evaluation CHECK (evaluation_result IS NULL OR evaluation_result IN ('Within CSR Policy','Not Within CSR Policy'))
    )`);
    await runDdl(connection, `CREATE INDEX ix_csr_requests_date ON bes_csr_requests (date_requested, request_status)`);
    await addColumn(connection, `ALTER TABLE bes_csr_requests ADD (evaluated_by VARCHAR2(200))`);
    await addColumn(connection, `ALTER TABLE bes_csr_requests ADD (date_approved DATE)`);
    await addColumn(connection, `ALTER TABLE bes_csr_requests ADD (pjrs VARCHAR2(200))`);
    await addColumn(connection, `ALTER TABLE bes_csr_requests ADD (actual_project_cost NUMBER(15,2))`);
    await addColumn(connection, `ALTER TABLE bes_csr_requests ADD (approval_status VARCHAR2(30) DEFAULT 'For Evaluation' NOT NULL)`);
    await addColumn(connection, `ALTER TABLE bes_csr_requests ADD (registration_details VARCHAR2(500))`);
    await addColumn(connection, `ALTER TABLE bes_csr_requests ADD (pending_reason VARCHAR2(2000))`);
    await addColumn(connection, `ALTER TABLE bes_csr_requests ADD (with_letter_reply CHAR(1) DEFAULT 'N' NOT NULL)`);
    await addColumn(connection, `ALTER TABLE bes_csr_requests ADD (additional_remarks VARCHAR2(4000))`);
    await dropConstraint(connection, 'BES_CSR_REQUESTS', 'CHK_CSR_EVALUATION');
    await connection.execute(`ALTER TABLE bes_csr_requests MODIFY (evaluation_result VARCHAR2(200))`);
    await runDdl(connection, `CREATE TABLE bes_csr_events (
      event_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      event_uid VARCHAR2(80) NOT NULL UNIQUE,
      csr_id NUMBER NOT NULL REFERENCES bes_csr_requests(csr_id) ON DELETE CASCADE,
      event_date DATE NOT NULL,
      project_event VARCHAR2(4000) NOT NULL,
      inspected_by VARCHAR2(200) NOT NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await runDdl(connection, `CREATE INDEX ix_csr_events_request_date ON bes_csr_events (csr_id, event_date, event_id)`);
    await runDdl(connection, `CREATE TABLE bes_csr_attachments (
      attachment_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      attachment_uid VARCHAR2(80) NOT NULL UNIQUE,
      csr_id NUMBER NOT NULL REFERENCES bes_csr_requests(csr_id) ON DELETE CASCADE,
      file_name VARCHAR2(255) NOT NULL,
      mime_type VARCHAR2(160),
      file_size NUMBER NOT NULL,
      file_blob BLOB NOT NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await runDdl(connection, `CREATE INDEX ix_csr_attachments_request ON bes_csr_attachments (csr_id, attachment_id)`);
    await runDdl(connection, `CREATE TABLE bes_member_programs (
      program_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      program_uid VARCHAR2(80) NOT NULL UNIQUE,
      parent_program_id NUMBER REFERENCES bes_member_programs(program_id) ON DELETE CASCADE,
      program_name VARCHAR2(300) NOT NULL,
      program_description VARCHAR2(4000),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      program_status VARCHAR2(30) DEFAULT 'Planned' NOT NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_member_program_dates CHECK (end_date >= start_date),
      CONSTRAINT chk_member_program_status CHECK (program_status IN ('Planned','Ongoing','Completed','On Hold','Cancelled'))
    )`);
    await runDdl(connection, `CREATE INDEX ix_member_programs_parent ON bes_member_programs (parent_program_id, start_date, program_id)`);
    await runDdl(connection, `CREATE TABLE bes_member_ops_programs (
      program_uid VARCHAR2(100) PRIMARY KEY,
      parent_program_uid VARCHAR2(100) REFERENCES bes_member_ops_programs(program_uid) ON DELETE CASCADE,
      program_title VARCHAR2(300) NOT NULL,
      display_order NUMBER DEFAULT 0 NOT NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await runDdl(connection, `CREATE TABLE bes_member_ops_activities (
      activity_uid VARCHAR2(100) PRIMARY KEY,
      program_uid VARCHAR2(100) NOT NULL REFERENCES bes_member_ops_programs(program_uid) ON DELETE CASCADE,
      activity_name VARCHAR2(300) NOT NULL,
      activity_description VARCHAR2(4000),
      frequency VARCHAR2(30) NOT NULL,
      uniform_time CHAR(1) DEFAULT 'Y' NOT NULL,
      time_from VARCHAR2(5),
      time_to VARCHAR2(5),
      display_order NUMBER DEFAULT 0 NOT NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_member_ops_frequency CHECK (frequency IN ('Daily','Weekly','Monthly','Quarterly','Yearly','Custom')),
      CONSTRAINT chk_member_ops_uniform CHECK (uniform_time IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE TABLE bes_member_ops_schedules (
      activity_uid VARCHAR2(100) NOT NULL REFERENCES bes_member_ops_activities(activity_uid) ON DELETE CASCADE,
      weekday_name VARCHAR2(12) NOT NULL,
      time_from VARCHAR2(5) NOT NULL,
      time_to VARCHAR2(5) NOT NULL,
      display_order NUMBER DEFAULT 0 NOT NULL,
      CONSTRAINT pk_member_ops_schedules PRIMARY KEY (activity_uid,weekday_name)
    )`);
    await runDdl(connection, `CREATE TABLE bes_csr_sectors (
      sector_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      sector_name VARCHAR2(120) NOT NULL UNIQUE,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await runDdl(connection, `CREATE TABLE bes_barangay_locations (
      location_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      municipality VARCHAR2(160) NOT NULL,
      barangay VARCHAR2(160) NOT NULL,
      district VARCHAR2(80) NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_barangay_location UNIQUE (municipality, barangay)
    )`);
    await runDdl(connection, `CREATE INDEX ix_barangay_locations_lookup ON bes_barangay_locations (municipality, barangay, district)`);
    await runDdl(connection, `CREATE TABLE bes_bfm_facilities (
      facility_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      facility_uid VARCHAR2(80) NOT NULL UNIQUE,
      parent_facility_uid VARCHAR2(80) REFERENCES bes_bfm_facilities(facility_uid) ON DELETE CASCADE,
      facility_name VARCHAR2(200) NOT NULL,
      facility_type VARCHAR2(40) DEFAULT 'Facility' NOT NULL,
      description VARCHAR2(1000),
      location VARCHAR2(300),
      sort_order NUMBER DEFAULT 0 NOT NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bfm_facility_active CHECK (is_active IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE INDEX ix_bfm_facility_parent ON bes_bfm_facilities (parent_facility_uid, sort_order, facility_name)`);
    await addColumn(connection, `ALTER TABLE bes_bfm_facilities ADD (facility_scope VARCHAR2(20) DEFAULT 'Operations' NOT NULL)`);
    await runDdl(connection, `CREATE INDEX ix_bfm_facility_scope ON bes_bfm_facilities (facility_scope, parent_facility_uid, sort_order)`);
    await runDdl(connection, `CREATE TABLE bes_bfm_personnel (
      personnel_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      personnel_uid VARCHAR2(80) NOT NULL UNIQUE,
      personnel_name VARCHAR2(200) NOT NULL,
      employee_no VARCHAR2(40),
      position_title VARCHAR2(180),
      contact_info VARCHAR2(200),
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bfm_personnel_active CHECK (is_active IN ('Y','N'))
    )`);
    await runDdl(connection, `CREATE TABLE bes_bfm_todos (
      todo_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      todo_uid VARCHAR2(80) NOT NULL UNIQUE,
      facility_uid VARCHAR2(80) NOT NULL REFERENCES bes_bfm_facilities(facility_uid) ON DELETE CASCADE,
      todo_title VARCHAR2(300) NOT NULL,
      description VARCHAR2(1000),
      category VARCHAR2(60) DEFAULT 'General' NOT NULL,
      frequency VARCHAR2(60) DEFAULT 'As Needed' NOT NULL,
      custom_days VARCHAR2(30),
      priority VARCHAR2(20) DEFAULT 'Normal' NOT NULL,
      todo_status VARCHAR2(30) DEFAULT 'Pending' NOT NULL,
      due_date DATE,
      last_completed_at TIMESTAMP,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bfm_todo_status CHECK (todo_status IN ('Pending','In Progress','Completed','Deferred')),
      CONSTRAINT chk_bfm_todo_priority CHECK (priority IN ('Low','Normal','High','Urgent')),
      CONSTRAINT chk_bfm_todo_active CHECK (is_active IN ('Y','N'))
    )`);
    await addColumn(connection, `ALTER TABLE bes_bfm_todos ADD (custom_days VARCHAR2(30))`);
    await runDdl(connection, `CREATE INDEX ix_bfm_todo_facility ON bes_bfm_todos (facility_uid, todo_status, due_date)`);
    await runDdl(connection, `CREATE TABLE bes_bfm_todo_workers (
      todo_uid VARCHAR2(80) NOT NULL REFERENCES bes_bfm_todos(todo_uid) ON DELETE CASCADE,
      personnel_uid VARCHAR2(80) NOT NULL REFERENCES bes_bfm_personnel(personnel_uid) ON DELETE CASCADE,
      assigned_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      assigned_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT pk_bfm_todo_workers PRIMARY KEY (todo_uid, personnel_uid)
    )`);
    await runDdl(connection, `CREATE TABLE bes_bfm_activity (
      activity_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      activity_uid VARCHAR2(80) NOT NULL UNIQUE,
      todo_uid VARCHAR2(80) NOT NULL REFERENCES bes_bfm_todos(todo_uid) ON DELETE CASCADE,
      previous_status VARCHAR2(30),
      new_status VARCHAR2(30) NOT NULL,
      work_note VARCHAR2(1000),
      work_date DATE DEFAULT TRUNC(SYSDATE) NOT NULL,
      performed_for_personnel_uid VARCHAR2(80) REFERENCES bes_bfm_personnel(personnel_uid) ON DELETE SET NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await addColumn(connection, `ALTER TABLE bes_bfm_activity ADD (work_date DATE DEFAULT TRUNC(SYSDATE) NOT NULL)`);
    await runDdl(connection, `CREATE INDEX ix_bfm_activity_todo ON bes_bfm_activity (todo_uid, created_at)`);
    await runDdl(connection, `CREATE TABLE bes_bfm_work_details (
      detail_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      detail_uid VARCHAR2(80) NOT NULL UNIQUE,
      todo_uid VARCHAR2(80) NOT NULL REFERENCES bes_bfm_todos(todo_uid) ON DELETE CASCADE,
      work_date DATE NOT NULL,
      findings VARCHAR2(4000),
      action_taken VARCHAR2(4000),
      materials_used VARCHAR2(4000),
      recommendation VARCHAR2(4000),
      converted_task_uid VARCHAR2(80) REFERENCES bes_work_tasks(task_uid) ON DELETE SET NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT ux_bfm_work_details_scope UNIQUE (todo_uid, work_date)
    )`);
    await addColumn(connection, `ALTER TABLE bes_bfm_work_details ADD (converted_task_uid VARCHAR2(80) REFERENCES bes_work_tasks(task_uid) ON DELETE SET NULL)`);
    await runDdl(connection, `CREATE INDEX ix_bfm_work_details_date ON bes_bfm_work_details (work_date, todo_uid)`);
    await runDdl(connection, `CREATE TABLE bes_bfm_projects (
      project_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      project_uid VARCHAR2(80) NOT NULL UNIQUE,
      facility_uid VARCHAR2(80) NOT NULL REFERENCES bes_bfm_facilities(facility_uid) ON DELETE CASCADE,
      project_title VARCHAR2(300) NOT NULL,
      description VARCHAR2(2000),
      category VARCHAR2(80) DEFAULT 'General' NOT NULL,
      priority VARCHAR2(20) DEFAULT 'Normal' NOT NULL,
      project_status VARCHAR2(30) DEFAULT 'Planned' NOT NULL,
      start_date DATE,
      target_date DATE,
      budget_amount NUMBER(18,2),
      budget_status VARCHAR2(30) DEFAULT 'For Budgeting' NOT NULL,
      assigned_personnel CLOB,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bfm_project_status CHECK (project_status IN ('Planned','In Progress','On Hold','Completed','Cancelled')),
      CONSTRAINT chk_bfm_project_budget_status CHECK (budget_status IN ('Available','For Realignment','For Budgeting')),
      CONSTRAINT chk_bfm_project_active CHECK (is_active IN ('Y','N'))
    )`);
    await addColumn(connection, `ALTER TABLE bes_bfm_projects ADD (budget_amount NUMBER(18,2))`);
    await addColumn(connection, `ALTER TABLE bes_bfm_projects ADD (budget_status VARCHAR2(30) DEFAULT 'For Budgeting' NOT NULL)`);
    await runDdl(connection, `CREATE INDEX ix_bfm_project_facility ON bes_bfm_projects (facility_uid, target_date, project_status)`);
    await runDdl(connection, `CREATE TABLE bes_bfm_project_folders (
      folder_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      folder_uid VARCHAR2(80) NOT NULL UNIQUE,
      project_uid VARCHAR2(80) NOT NULL REFERENCES bes_bfm_projects(project_uid) ON DELETE CASCADE,
      folder_name VARCHAR2(240) NOT NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_bfm_project_folder UNIQUE (project_uid, folder_name)
    )`);
    await runDdl(connection, `CREATE TABLE bes_bfm_project_resources (
      resource_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      resource_uid VARCHAR2(80) NOT NULL UNIQUE,
      project_uid VARCHAR2(80) NOT NULL REFERENCES bes_bfm_projects(project_uid) ON DELETE CASCADE,
      folder_uid VARCHAR2(80) REFERENCES bes_bfm_project_folders(folder_uid) ON DELETE CASCADE,
      resource_type VARCHAR2(10) NOT NULL,
      resource_name VARCHAR2(255) NOT NULL,
      relative_path VARCHAR2(1000),
      external_url VARCHAR2(2000),
      mime_type VARCHAR2(160),
      file_size NUMBER,
      file_blob BLOB,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bfm_project_resource_type CHECK (resource_type IN ('FILE','LINK'))
    )`);
    await runDdl(connection, `CREATE INDEX ix_bfm_project_resource_scope ON bes_bfm_project_resources (project_uid, folder_uid, created_at)`);

    const facilitySeeds = [
      ['BFM-BUILDINGS', null, 'Buildings', 'Facility Group', 'BENECO building locations', null, 10],
      ['BFM-BLDG-SOUTHDRIVE', 'BFM-BUILDINGS', 'Southdrive', 'Building', null, 'South Drive', 10],
      ['BFM-BLDG-SOUTHDRIVE-BASEMENT', 'BFM-BLDG-SOUTHDRIVE', 'Basement', 'Floor', null, null, 10],
      ['BFM-BLDG-SOUTHDRIVE-BASEMENT-CR1', 'BFM-BLDG-SOUTHDRIVE-BASEMENT', 'Comfort Room 1', 'Room', null, null, 10],
      ['BFM-BLDG-SOUTHDRIVE-BASEMENT-CWO', 'BFM-BLDG-SOUTHDRIVE-BASEMENT', 'CWO Area', 'Area', null, null, 20],
      ['BFM-BLDG-SOUTHDRIVE-GROUND', 'BFM-BLDG-SOUTHDRIVE', 'Ground Floor', 'Floor', null, null, 20],
      ['BFM-BLDG-SOUTHDRIVE-SECOND', 'BFM-BLDG-SOUTHDRIVE', 'Second Floor', 'Floor', null, null, 30],
      ['BFM-BLDG-ALAPANG', 'BFM-BUILDINGS', 'Alapang', 'Building', null, 'Alapang', 20],
      ['BFM-BLDG-DPS', 'BFM-BUILDINGS', 'DPS', 'Building', null, 'DPS', 30],
      ['BFM-BLDG-BONUAN', 'BFM-BUILDINGS', 'Bonuan', 'Building', null, 'Bonuan', 40],
      ['BFM-BLDG-MAHARLIKA', 'BFM-BUILDINGS', 'Maharlika', 'Building', null, 'Maharlika', 50],
      ['BFM-BLDG-KM4-LTB', 'BFM-BUILDINGS', 'KM4 LTB', 'Building', null, 'KM4 LTB', 60],
      ['BFM-BLDG-ABATAN', 'BFM-BUILDINGS', 'Abatan', 'Building', null, 'Abatan', 70],
      ['BFM-SUBSTATIONS', null, 'Substations', 'Facility Group', 'BENECO substations', null, 20],
      ['BFM-SUB-NSC', 'BFM-SUBSTATIONS', 'NSC', 'Substation', null, 'NSC', 10],
      ['BFM-SUB-LAMUT', 'BFM-SUBSTATIONS', 'Lamut', 'Substation', null, 'Lamut', 20],
      ['BFM-SUB-IRISAN', 'BFM-SUBSTATIONS', 'Irisan', 'Substation', null, 'Irisan', 30],
      ['BFM-SUB-ATOK', 'BFM-SUBSTATIONS', 'Atok', 'Substation', null, 'Atok', 40],
      ['BFM-SUB-SINIPSIP', 'BFM-SUBSTATIONS', 'Sinipsip', 'Substation', null, 'Sinipsip', 50],
      ['BFM-SUB-BULALACAO', 'BFM-SUBSTATIONS', 'Bulalacao', 'Substation', null, 'Bulalacao', 60],
    ];
    for (const [facilityUid, parentFacilityUid, facilityName, facilityType, description, location, sortOrder] of facilitySeeds) {
      await connection.execute(`MERGE INTO bes_bfm_facilities f USING (SELECT :facilityUid facility_uid FROM dual) src
        ON (f.facility_uid=src.facility_uid)
        WHEN NOT MATCHED THEN INSERT (facility_uid,parent_facility_uid,facility_name,facility_type,description,location,sort_order)
        VALUES (:facilityUid,:parentFacilityUid,:facilityName,:facilityType,:description,:location,:sortOrder)`, {
        facilityUid, parentFacilityUid, facilityName, facilityType, description, location, sortOrder,
      });
    }
    for (const [facilityUid, parentFacilityUid, facilityName, facilityType, description, location, sortOrder] of facilitySeeds) {
      const projectFacilityUid = `BFM-PRJ-${facilityUid.slice(4)}`;
      const projectParentUid = parentFacilityUid ? `BFM-PRJ-${parentFacilityUid.slice(4)}` : null;
      await connection.execute(`MERGE INTO bes_bfm_facilities f USING (SELECT :facilityUid facility_uid FROM dual) src
        ON (f.facility_uid=src.facility_uid)
        WHEN NOT MATCHED THEN INSERT (facility_uid,parent_facility_uid,facility_name,facility_type,description,location,sort_order,facility_scope)
        VALUES (:facilityUid,:parentFacilityUid,:facilityName,:facilityType,:description,:location,:sortOrder,'Projects')`, {
        facilityUid: projectFacilityUid, parentFacilityUid: projectParentUid, facilityName, facilityType, description, location, sortOrder,
      });
    }
    await connection.execute(`UPDATE bes_bfm_projects p
      SET p.facility_uid='BFM-PRJ-' || SUBSTR(p.facility_uid,5)
      WHERE p.facility_uid LIKE 'BFM-%'
        AND EXISTS (SELECT 1 FROM bes_bfm_facilities f
          WHERE f.facility_uid='BFM-PRJ-' || SUBSTR(p.facility_uid,5) AND f.facility_scope='Projects')`);
    const todoSeeds = [
      ['BFM-TODO-BASEMENT-MOP', 'BFM-BLDG-SOUTHDRIVE-BASEMENT', 'Mopping of floors', 'Housekeeping', 'Daily'],
      ['BFM-TODO-CR1-TOILET', 'BFM-BLDG-SOUTHDRIVE-BASEMENT-CR1', 'Toilet Cleaning', 'Housekeeping', 'Daily'],
      ['BFM-TODO-CR1-SINK', 'BFM-BLDG-SOUTHDRIVE-BASEMENT-CR1', 'Sink Cleaning', 'Plumbing', 'Daily'],
    ];
    for (const [todoUid, facilityUid, todoTitle, category, frequency] of todoSeeds) {
      await connection.execute(`MERGE INTO bes_bfm_todos t USING (SELECT :todoUid todo_uid FROM dual) src
        ON (t.todo_uid=src.todo_uid)
        WHEN NOT MATCHED THEN INSERT (todo_uid,facility_uid,todo_title,category,frequency)
        VALUES (:todoUid,:facilityUid,:todoTitle,:category,:frequency)`, { todoUid, facilityUid, todoTitle, category, frequency });
    }
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
    await runDdl(connection, `CREATE TABLE bes_performance_plans (
      plan_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      employee_user_id NUMBER NOT NULL REFERENCES bes_users(user_id) ON DELETE CASCADE,
      cycle_label VARCHAR2(120) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      plan_status VARCHAR2(30) DEFAULT 'DRAFT' NOT NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_perf_plan_status CHECK (plan_status IN ('DRAFT','ACTIVE','COMPLETED','REVIEWED')),
      CONSTRAINT chk_bes_perf_plan_dates CHECK (period_end >= period_start)
    )`);
    await runDdl(connection, `CREATE UNIQUE INDEX ux_bes_perf_plan_employee_cycle ON bes_performance_plans (employee_user_id, UPPER(cycle_label))`);
    await runDdl(connection, `CREATE TABLE bes_performance_targets (
      target_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      plan_id NUMBER NOT NULL REFERENCES bes_performance_plans(plan_id) ON DELETE CASCADE,
      target_description CLOB NOT NULL,
      measure_type VARCHAR2(20) DEFAULT 'COUNT' NOT NULL,
      target_value NUMBER(14,2) NOT NULL,
      target_unit VARCHAR2(80) NOT NULL,
      target_weight NUMBER(6,2) DEFAULT 0 NOT NULL,
      due_date DATE,
      actual_value NUMBER(14,2),
      target_status VARCHAR2(30) DEFAULT 'NOT_STARTED' NOT NULL,
      sort_order NUMBER DEFAULT 10 NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_perf_target_type CHECK (measure_type IN ('COUNT','PERCENTAGE','MILESTONE','COMPLIANCE')),
      CONSTRAINT chk_bes_perf_target_value CHECK (target_value > 0),
      CONSTRAINT chk_bes_perf_target_weight CHECK (target_weight >= 0 AND target_weight <= 100)
    )`);
    await runDdl(connection, `CREATE INDEX ix_bes_perf_target_plan ON bes_performance_targets (plan_id, sort_order, target_id)`);
    await runDdl(connection, `CREATE TABLE bes_performance_accomplishments (
      accomplishment_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      target_id NUMBER NOT NULL REFERENCES bes_performance_targets(target_id) ON DELETE CASCADE,
      accomplishment_description CLOB NOT NULL,
      accomplished_quantity NUMBER(14,2) NOT NULL,
      accomplished_on DATE,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_perf_accomp_qty CHECK (accomplished_quantity > 0)
    )`);
    await runDdl(connection, `CREATE INDEX ix_bes_perf_accomp_target ON bes_performance_accomplishments (target_id, created_at, accomplishment_id)`);
    await runDdl(connection, `CREATE TABLE bes_performance_evidence (
      evidence_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      accomplishment_id NUMBER NOT NULL REFERENCES bes_performance_accomplishments(accomplishment_id) ON DELETE CASCADE,
      file_name VARCHAR2(255) NOT NULL,
      mime_type VARCHAR2(200) DEFAULT 'application/octet-stream' NOT NULL,
      file_size NUMBER NOT NULL,
      file_blob BLOB NOT NULL,
      uploaded_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await runDdl(connection, `CREATE INDEX ix_bes_perf_evidence_accomp ON bes_performance_evidence (accomplishment_id, evidence_id)`);
    await runDdl(connection, `CREATE TABLE bes_hr_service_records (
      service_record_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      employee_no VARCHAR2(30) NOT NULL,
      position_title VARCHAR2(200) NOT NULL,
      position_level VARCHAR2(30),
      monthly_salary NUMBER(14,2),
      effective_start DATE NOT NULL,
      effective_end DATE,
      remarks VARCHAR2(1000),
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_hr_service_dates CHECK (effective_end IS NULL OR effective_end >= effective_start),
      CONSTRAINT chk_hr_service_salary CHECK (monthly_salary IS NULL OR monthly_salary >= 0)
    )`);
    await runDdl(connection, `CREATE INDEX ix_hr_service_employee ON bes_hr_service_records (employee_no, effective_start, service_record_id)`);
    await runDdl(connection, `CREATE TABLE bes_hr_service_evidence (
      evidence_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      service_record_id NUMBER NOT NULL REFERENCES bes_hr_service_records(service_record_id) ON DELETE CASCADE,
      file_name VARCHAR2(255) NOT NULL,
      mime_type VARCHAR2(200) DEFAULT 'application/octet-stream' NOT NULL,
      file_size NUMBER NOT NULL,
      file_blob BLOB NOT NULL,
      uploaded_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await runDdl(connection, `CREATE INDEX ix_hr_service_evidence_record ON bes_hr_service_evidence (service_record_id, evidence_id)`);
    await runDdl(connection, `CREATE TABLE bes_performance_assignments (
      assignment_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      position_id NUMBER NOT NULL REFERENCES bes_positions(position_id) ON DELETE CASCADE,
      employee_user_id NUMBER NOT NULL REFERENCES bes_users(user_id) ON DELETE CASCADE,
      detail_order VARCHAR2(500),
      effective_start DATE,
      effective_end DATE,
      assignment_mode VARCHAR2(20) DEFAULT 'INCLUDE' NOT NULL,
      is_active CHAR(1) DEFAULT 'Y' NOT NULL,
      created_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT chk_bes_perf_assignment_active CHECK (is_active IN ('Y','N')),
      CONSTRAINT chk_bes_perf_assignment_mode CHECK (assignment_mode IN ('INCLUDE','EXCLUDE')),
      CONSTRAINT chk_bes_perf_assignment_dates CHECK (effective_end IS NULL OR effective_start IS NULL OR effective_end >= effective_start)
    )`);
    await runDdl(connection, `CREATE UNIQUE INDEX ux_bes_perf_assignment ON bes_performance_assignments (position_id, employee_user_id)`);
    await runDdl(connection, `CREATE INDEX ix_bes_perf_assignment_employee ON bes_performance_assignments (employee_user_id, is_active)`);
    await addColumn(connection, `ALTER TABLE bes_performance_assignments ADD (assignment_mode VARCHAR2(20) DEFAULT 'INCLUDE' NOT NULL)`);
    await addColumn(connection, `ALTER TABLE bes_performance_assignments ADD (current_level NUMBER(1))`);
    await dropConstraint(connection, 'BES_PERFORMANCE_ASSIGNMENTS', 'CHK_BES_PERF_ASSIGNMENT_MODE');
    await runDdl(connection, `ALTER TABLE bes_performance_assignments ADD CONSTRAINT chk_bes_perf_assignment_mode CHECK (assignment_mode IN ('INCLUDE','EXCLUDE'))`);
    await runDdl(connection, `CREATE TABLE bes_position_dr_pl (
      position_id NUMBER PRIMARY KEY REFERENCES bes_positions(position_id) ON DELETE CASCADE,
      position_purpose CLOB,
      employment_level VARCHAR2(120),
      reports_to VARCHAR2(180),
      area_of_work VARCHAR2(180),
      position_levels_json CLOB,
      max_level NUMBER(3) DEFAULT 4 NOT NULL,
      competency_notes_json CLOB,
      categories_json CLOB,
      duties_json CLOB,
      source_document VARCHAR2(500),
      updated_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    await addColumn(connection, `ALTER TABLE bes_position_dr_pl ADD (categories_json CLOB)`);
    await addColumn(connection, `ALTER TABLE bes_position_dr_pl ADD (max_level NUMBER(3) DEFAULT 4 NOT NULL)`);
    await addColumn(connection, `ALTER TABLE bes_position_dr_pl ADD (competency_notes_json CLOB)`);
    await runDdl(connection, `CREATE TABLE bes_employee_skill_checks (
      employee_user_id NUMBER NOT NULL REFERENCES bes_users(user_id) ON DELETE CASCADE,
      position_id NUMBER NOT NULL REFERENCES bes_positions(position_id) ON DELETE CASCADE,
      duty_id VARCHAR2(120) NOT NULL,
      attained CHAR(1) DEFAULT 'N' NOT NULL,
      remarks VARCHAR2(1000),
      assessed_by_user_id NUMBER REFERENCES bes_users(user_id) ON DELETE SET NULL,
      assessed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT pk_bes_employee_skill_checks PRIMARY KEY (employee_user_id,position_id,duty_id),
      CONSTRAINT chk_bes_skill_attained CHECK (attained IN ('Y','N'))
    )`);
    await addColumn(connection, `ALTER TABLE bes_employee_skill_checks ADD (level_2 CHAR(1) DEFAULT 'N' NOT NULL)`);
    await addColumn(connection, `ALTER TABLE bes_employee_skill_checks ADD (level_3 CHAR(1) DEFAULT 'N' NOT NULL)`);
    await addColumn(connection, `ALTER TABLE bes_employee_skill_checks ADD (level_4 CHAR(1) DEFAULT 'N' NOT NULL)`);
    await addColumn(connection, `ALTER TABLE bes_employee_skill_checks ADD (levels_json CLOB)`);
    await createHroToolTaskTables(connection);
    await seedAccessControl(connection);
    await seedOrganizationalStructure(connection);
    await seedPositionDrPl(connection);
    await seedToolRegistry(connection);
    await seedCalendarEvents(connection);
    await seedPolicyRecords(connection);
    await connection.commit();
  });
}
