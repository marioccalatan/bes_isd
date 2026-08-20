import { addDays, addHours, formatISO, subDays, subMonths, format } from 'date-fns';
import type {
  AppNotification,
  AppTool,
  AttendanceRecord,
  AuditLogEntry,
  BesModule,
  CalendarEvent,
  ChatConversation,
  ChatMessage,
  Comment,
  Department,
  DepartmentId,
  EmailMessage,
  Employee,
  NewsPost,
  NewsReadState,
  OrgChart,
  Payslip,
  GmKpiData,
  PolicyDocument,
  QmsDocument,
  QmsFlowchart,
  StorageItem,
  StorageQuota,
  StrategicProject,
  SupportTicket,
  ToolAccessGrant,
  ToolAccessLevel,
  WorkItem,
} from './types';

// ---------------------------------------------------------------------------
// Anchor "today" — the prototype is authored around this date so that
// "due today" / "this week" data reads naturally. Falls back gracefully
// to the real current date for anything computed at runtime.
// ---------------------------------------------------------------------------
export const DEMO_TODAY = new Date();

const iso = (d: Date) => formatISO(d, { representation: 'date' });
const isoDT = (d: Date) => formatISO(d);

let refCounter: Record<string, number> = {};
export function nextRef(prefix: string): string {
  refCounter[prefix] = (refCounter[prefix] ?? 0) + 1;
  const year = DEMO_TODAY.getFullYear();
  return `BES-${prefix}-${year}-${String(refCounter[prefix]).padStart(5, '0')}`;
}
export function resetRefCounter() {
  refCounter = {};
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------
export const DEPARTMENTS: Department[] = [
  {
    id: 'ISD',
    name: 'Institutional Services Department',
    shortName: 'ISD',
    mandate:
      'Manages human resources, institutional communications, member-consumer programs, records, and organizational development for the cooperative.',
    managerId: 'BENECO-00127',
    employeeCount: 34,
    units: [
      'Human Resource Office',
      'Community Relations Office',
      'General Services Office',
      'Material Equipment Management Office',
    ],
    contactEmail: 'isd@beneco.example.ph',
    contactLocal: '221',
    location: 'BENECO Main Office, 2nd Floor',
    responsibilities: [
      'Human resource management and employee welfare',
      'Recruitment, onboarding, and workforce planning',
      'Learning, development, and performance management',
      'Institutional communications and public information',
      'Member-consumer and community electrification programs',
      'Corporate records management',
      'BES governance and organization-wide digital adoption',
    ],
    color: 'brand',
  },
  {
    id: 'NSD',
    name: 'Network Services Department',
    shortName: 'NSD',
    mandate:
      'Operates and maintains the electric distribution network, including line maintenance, outage management, and service restoration.',
    managerId: 'BENECO-00201',
    employeeCount: 118,
    units: [
      'Network Operations',
      'Line Maintenance',
      'Outage Management',
      'Crew Deployment',
      'Substation & Line Records',
      'Technical Projects',
    ],
    contactEmail: 'nsd@beneco.example.ph',
    contactLocal: '312',
    location: 'BENECO Technical Operations Center',
    responsibilities: [
      'Distribution line construction and maintenance',
      'Outage management and service restoration',
      'Crew deployment and work order dispatch',
      'Substation and line asset records',
      'Safety inspections of network facilities',
      'Technical infrastructure projects',
    ],
    color: 'green',
  },
  {
    id: 'NNSD',
    name: 'Non-Network Services Department',
    shortName: 'NNSD',
    mandate:
      'Handles finance, billing and collection, procurement, warehousing, fleet, and general administrative support services.',
    managerId: 'BENECO-00301',
    employeeCount: 96,
    units: [
      'Finance & Accounting',
      'Budget',
      'Billing & Collection',
      'Treasury',
      'Procurement',
      'Warehousing & Inventory',
      'Property & Assets',
      'Fleet Management',
      'General Services',
    ],
    contactEmail: 'nnsd@beneco.example.ph',
    contactLocal: '405',
    location: 'BENECO Main Office, 1st Floor',
    responsibilities: [
      'Financial management and accounting',
      'Billing, collection, and treasury operations',
      'Procurement and supply management',
      'Warehousing, inventory, and property/asset custody',
      'Fleet management and general administrative services',
    ],
    color: 'gold',
  },
  {
    id: 'AUD',
    name: 'Audit Department',
    shortName: 'AUD',
    mandate:
      'Provides independent, risk-based internal audit assurance and advisory services to the Board and Management.',
    managerId: 'BENECO-00401',
    employeeCount: 14,
    units: ['Internal Audit', 'Risk-Based Audit', 'Compliance Review'],
    contactEmail: 'audit@beneco.example.ph',
    contactLocal: '150',
    location: 'BENECO Main Office, 3rd Floor',
    responsibilities: [
      'Annual risk-based audit planning and execution',
      'Findings, recommendations, and corrective action monitoring',
      'Management response evaluation',
      'Governance, risk, and control advisory',
    ],
    color: 'slate',
  },
  {
    id: 'CPD',
    name: 'Corporate Planning Department',
    shortName: 'CPD',
    mandate:
      'Leads strategic planning, corporate performance monitoring, project management, and regulatory reporting.',
    managerId: 'BENECO-00501',
    employeeCount: 21,
    units: [
      'Strategic Planning',
      'Corporate Performance Monitoring',
      'Project Management',
      'Risk Management',
      'Regulatory Affairs',
      'Research & Policy Studies',
    ],
    contactEmail: 'cpd@beneco.example.ph',
    contactLocal: '160',
    location: 'BENECO Main Office, 3rd Floor',
    responsibilities: [
      'Corporate strategic plan formulation and monitoring',
      'Department commitments and KPI tracking',
      'Project monitoring and evaluation',
      'Enterprise risk register maintenance',
      'Regulatory submissions and research/policy studies',
    ],
    color: 'brand',
  },
  {
    id: 'PGD',
    name: 'Power Generation Department',
    shortName: 'PGD',
    mandate:
      'Operates and maintains BENECO-owned power generation facilities and monitors production performance and compliance.',
    managerId: 'BENECO-00601',
    employeeCount: 38,
    units: [
      'Generation Operations',
      'Production Monitoring',
      'Plant Maintenance',
      'Equipment Records',
      'Safety & Environmental Compliance',
      'Generation Projects',
    ],
    contactEmail: 'pgd@beneco.example.ph',
    contactLocal: '512',
    location: 'BENECO Hydro Facility',
    responsibilities: [
      'Generation facility operations and production monitoring',
      'Preventive and corrective maintenance of generation equipment',
      'Incident reporting and safety/environmental compliance',
      'Generation capacity and expansion projects',
      'Regulatory submissions to energy authorities',
    ],
    color: 'green',
  },
];

export const DEPT_MAP: Record<DepartmentId, Department> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d])
) as Record<DepartmentId, Department>;

// ---------------------------------------------------------------------------
// Organizational charts — editable position/reporting-line trees, seeded
// from BENECO's approved staffing pattern charts (one per department, plus
// an enterprise-wide chart for the Office of the General Manager). Authored
// here as nested trees and flattened into React-Flow-ready node/edge lists
// with a simple top-down tree layout (leaves get sequential columns, parents
// center above their children).
// ---------------------------------------------------------------------------
interface OrgTreeInput {
  label: string;
  sublabel?: string;
  children?: OrgTreeInput[];
}

function layoutOrgTree(root: OrgTreeInput, idPrefix: string): OrgChart {
  const nodes: OrgChart['nodes'] = [];
  const edges: OrgChart['edges'] = [];
  const ROW_H = 130;
  const COL_W = 210;
  let counter = 0;
  let leafCounter = 0;

  function place(node: OrgTreeInput, depth: number, parentId?: string): { id: string; x: number } {
    const id = `${idPrefix}-${counter++}`;
    let x: number;
    if (!node.children || node.children.length === 0) {
      x = leafCounter * COL_W;
      leafCounter += 1;
    } else {
      const childInfo = node.children.map((c) => place(c, depth + 1, id));
      x = (childInfo[0].x + childInfo[childInfo.length - 1].x) / 2;
    }
    nodes.push({ id, label: node.label, sublabel: node.sublabel, position: { x, y: depth * ROW_H } });
    if (parentId) edges.push({ id: `e-${parentId}-${id}`, source: parentId, target: id });
    return { id, x };
  }

  place(root, 0);
  return { nodes, edges };
}

const ORG_TREES: Record<DepartmentId, OrgTreeInput> = {
  ISD: {
    label: 'Institutional Services Department Manager', sublabel: '[1] SG 18,19,20',
    children: [
      { label: 'Secretary', sublabel: '[1] SG 5,6,7,8' },
      {
        label: 'General Services Officer', sublabel: '[1] SG 14,15,16',
        children: [
          { label: 'Mechanic', sublabel: '[4] SG 4,5,6,7' },
          { label: 'Courier', sublabel: '[1] SG 2,3,4,5' },
          { label: 'Utility', sublabel: '[1] SG 1,2,3,4' },
          { label: 'Building and Ground Maintenance', sublabel: 'Service Provider' },
          { label: 'On-call Drivers' },
        ],
      },
      {
        label: 'Materials and Equipment Management Officer', sublabel: '[1] SG 13,14,15',
        children: [{ label: 'Materials Inventory Associate', sublabel: '[1] SG 4,5,6,7' }],
      },
      {
        label: 'Community Relations Officer', sublabel: '[1] SG 13,14,15',
        children: [{ label: 'Community Relations Associate', sublabel: '[4] SG 7,8,9,10' }],
      },
      {
        label: 'Human Resource Officer', sublabel: '[1] SG 14,15,16',
        children: [{ label: 'HR Associate', sublabel: '[1] SG 9,10,11,12' }],
      },
    ],
  },
  NSD: {
    label: 'Network Services Department Manager', sublabel: '[1] SG 19,20',
    children: [
      { label: 'Executive and Consumer Associate', sublabel: '[2] SG 8,9,10,11' },
      {
        label: 'System Planning and Design Officer', sublabel: '[1] SG 16,17,18',
        children: [{
          label: 'System Planning and Design Engineer', sublabel: '[12] SG 10,11,12,13',
          children: [{ label: 'Engineering Associate', sublabel: '[4] SG 9,10,11,12' }],
        }],
      },
      {
        label: 'Construction and Maintenance Officer', sublabel: '[4] SG 16,17,18',
        children: [{
          label: 'Lineman', sublabel: '[98] SG 9,10,11,12',
          children: [{ label: 'Construction and Light Maintenance', sublabel: 'Service Provider' }],
        }],
      },
      {
        label: 'System Control and Protection Officer', sublabel: '[1] SG 16,17,18',
        children: [{ label: 'System Control and Protection Engineer', sublabel: '[7] SG 10,11,12,13' }],
      },
      {
        label: 'Special Equipment and Metering Officer', sublabel: '[1] SG 16,17,18',
        children: [{
          label: 'Special Equipment and Metering Engineer', sublabel: '[7] SG 10,11,12,13',
          children: [{
            label: 'Special Equipment and Metering Associate', sublabel: '[2] SG 9,10,11,12',
            children: [{ label: 'Meter Installation', sublabel: 'Service Provider' }],
          }],
        }],
      },
    ],
  },
  NNSD: {
    label: 'Non-Network Services Department Manager', sublabel: '[1] SG 18,19,20',
    children: [
      { label: 'Secretary', sublabel: '[1] SG 5,6,7,8' },
      {
        label: 'Accounting Officer', sublabel: '[1] SG 15,16,17',
        children: [
          { label: 'Accounting Associate', sublabel: '[3] SG 9,10,11,12' },
          { label: 'Rate Analyst', sublabel: '[1] SG 9,10,11,12' },
          { label: 'Procurement Associate', sublabel: '[1] SG 8,9,10,11' },
        ],
      },
      {
        label: 'Collection Officer', sublabel: '[1] SG 13,14,15',
        children: [
          { label: 'Collection Associate', sublabel: '[15] SG 6,7,8,9' },
          { label: 'Collecting Agents' },
        ],
      },
      {
        label: 'Consumer Welfare Officer', sublabel: '[1] SG 15,16,17',
        children: [{ label: 'Consumer Welfare and Call Center Associate', sublabel: '[9] SG 8,9,10,11' }],
      },
      {
        label: 'Meter Reading, Billing, and Disconnection Officer', sublabel: '[4] SG 13,14,15',
        children: [
          {
            label: 'Meter Reader', sublabel: '[43] SG 7,8,9,10',
            children: [{ label: 'Meter Reading', sublabel: 'Service Provider' }],
          },
          { label: 'Disconnection', sublabel: 'Service Provider' },
        ],
      },
    ],
  },
  AUD: {
    label: 'Internal Auditor', sublabel: '[1] SG 18,19,20',
    children: [{
      label: 'Internal Audit Supervisor', sublabel: '[1] SG 18,19',
      children: [
        { label: 'Operations Auditor', sublabel: '[3] SG 9,10,11,12' },
        { label: 'Technical Auditor', sublabel: '[1] SG 10,11,12,13' },
        { label: 'Seasonal Inventory', sublabel: 'Contractual Employees' },
      ],
    }],
  },
  PGD: {
    label: 'Power Generation Department Manager', sublabel: '[1] SG 18,19,20',
    children: [
      { label: 'Compliance and Records Officer', sublabel: '[1] SG 3,4,5,6' },
      { label: 'Forrester, Pollution Control and Safety Officer', sublabel: '[1] SG 6,7,8,9' },
      {
        label: 'Hydro-electric Power Plant Operations Superintendent', sublabel: '[1] SG 15,16,17',
        children: [{
          label: 'Power Plant Shift Engineer', sublabel: '[5] SG 8,9,10,11',
          children: [{ label: 'Power Plant Facilities Maintenance Associate', sublabel: '[5] SG 6,7,8,9' }],
        }],
      },
    ],
  },
  CPD: {
    label: 'Corporate Planning Department Manager', sublabel: '[1] SG 18,19,20',
    children: [
      { label: 'Secretary', sublabel: '[1] SG 5,6,7,8' },
      {
        label: 'Power Supply and Energy Trading Officer', sublabel: '[1] SG 15,16,17',
        children: [{ label: 'Power Supply and Energy Trading Associate', sublabel: '[2] SG 10,11,12,13' }],
      },
      {
        label: 'Business Development & Regulatory Compliance Officer', sublabel: '[1] SG 15,16,17',
        children: [{ label: 'Business Development & Regulatory Compliance Associate', sublabel: '[3] SG 10,11,12,13' }],
      },
    ],
  },
};

export const ORG_CHARTS: Record<DepartmentId, OrgChart> = Object.fromEntries(
  (Object.keys(ORG_TREES) as DepartmentId[]).map((id) => [id, layoutOrgTree(ORG_TREES[id], id.toLowerCase())])
) as Record<DepartmentId, OrgChart>;

const ENTERPRISE_ORG_TREE: OrgTreeInput = {
  label: 'Board of Directors',
  children: [{
    label: 'General Manager',
    children: [
      {
        label: 'Executive Secretary', sublabel: '[1] SG 10,11,12,13',
        children: [
          { label: 'Secretary to the Board', sublabel: '[1] SG 9,10,11,12' },
          { label: 'Transcriber' },
        ],
      },
      {
        label: 'Assistant General Manager', sublabel: '[1] SG 21',
        children: [{
          label: 'Health & Safety Officer', sublabel: '[1] SG 14,15,16',
          children: [
            { label: 'Safety Associate', sublabel: '[2] SG 10,11,12,13' },
            { label: 'Company Nurse', sublabel: '[1] SG 8,9,10,11' },
          ],
        }],
      },
      { label: 'Legal Officer', sublabel: '[1] SG 15,16,17' },
      {
        label: 'Management Information and Communication Systems Officer', sublabel: '[1] SG 15,16,17',
        children: [{
          label: 'Information Systems Associate', sublabel: '[4] SG 9,10,11,12',
          children: [{ label: 'Information Technology Associate', sublabel: '[4] SG 9,10,11,12' }],
        }],
      },
      { label: "GM's Driver", sublabel: '[1] SG 5,6,7,8' },
      { label: 'Institutional Services Department', sublabel: 'ISD' },
      { label: 'Network Services Department', sublabel: 'NSD' },
      { label: 'Non-Network Services Department', sublabel: 'NNSD' },
      { label: 'Audit Department', sublabel: 'AUD' },
      { label: 'Corporate Planning Department', sublabel: 'CPD' },
      { label: 'Power Generation Department', sublabel: 'PGD' },
    ],
  }],
};

export const ENTERPRISE_ORG_CHART: OrgChart = layoutOrgTree(ENTERPRISE_ORG_TREE, 'ent');

// ---------------------------------------------------------------------------
// Employees (40+)
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  'Maria', 'Jose', 'Juan', 'Ana', 'Pedro', 'Rosario', 'Antonio', 'Cristina',
  'Ramon', 'Corazon', 'Eduardo', 'Marivic', 'Nestor', 'Teresita', 'Roberto',
  'Ligaya', 'Danilo', 'Josefina', 'Ricardo', 'Emelda', 'Bienvenido', 'Perla',
  'Rodolfo', 'Aurora', 'Wilfredo', 'Norma', 'Alejandro', 'Divina', 'Reynaldo',
  'Leticia', 'Bayani', 'Consolacion', 'Ferdinand', 'Milagros', 'Gregorio',
  'Fe', 'Alfredo', 'Remedios', 'Benjamin', 'Angelica', 'Michael', 'Grace',
];
const LAST_NAMES = [
  'Dela Cruz', 'Santos', 'Reyes', 'Bautista', 'Villanueva', 'Aquino', 'Ramos',
  'Garcia', 'Mendoza', 'Torres', 'Flores', 'Castro', 'Gonzales', 'Rivera',
  'Fernandez', 'Aganon', 'Pacheco', 'Cariño', 'Bugnosen', 'Wangdali',
  'Fianza', 'Lomibao', 'Balanoba', 'Chaya', 'Ampaguey', 'Tauli',
];
const POSITIONS_BY_DEPT: Record<DepartmentId, string[]> = {
  ISD: ['HR Officer', 'Records Officer', 'Training Coordinator', 'Communications Specialist', 'Community Programs Officer', 'Admin Aide'],
  NSD: ['Lineman', 'Line Foreman', 'Electrical Engineer', 'Substation Technician', 'Outage Coordinator', 'Field Inspector'],
  NNSD: ['Accountant', 'Billing Clerk', 'Procurement Officer', 'Warehouse Custodian', 'Fleet Coordinator', 'Collection Officer'],
  AUD: ['Internal Auditor', 'Audit Associate', 'Compliance Reviewer'],
  CPD: ['Planning Officer', 'Project Monitoring Officer', 'Research Analyst', 'Risk Officer'],
  PGD: ['Plant Operator', 'Maintenance Engineer', 'Equipment Technician', 'Safety Officer'],
};
const AVATAR_COLORS = ['brand', 'green', 'gold', 'slate'];

function buildEmployees(): Employee[] {
  const list: Employee[] = [];

  // Demo user — Institutional Services Department Manager
  list.push({
    id: 'BENECO-00127',
    name: 'Alex M. Dela Cruz',
    firstName: 'Alex',
    lastName: 'Dela Cruz',
    position: 'Institutional Department Manager',
    departmentId: 'ISD',
    unit: 'Office of the Department Manager',
    email: 'alex.delacruz@beneco.example.ph',
    local: '221',
    mobile: '0917-000-0127',
    status: 'Active',
    dateHired: '2011-06-13',
    location: 'BENECO Main Office',
    roles: ['Department Manager', 'BES Institutional Lead', 'Management Committee Member', 'BAC Member'],
    avatarColor: 'brand',
    isManager: true,
  });

  const otherManagers: [DepartmentId, string, string][] = [
    ['NSD', 'BENECO-00201', 'Eduardo R. Santiago'],
    ['NNSD', 'BENECO-00301', 'Marivic T. Bautista'],
    ['AUD', 'BENECO-00401', 'Corazon P. Villanueva'],
    ['CPD', 'BENECO-00501', 'Ramon B. Aquino'],
    ['PGD', 'BENECO-00601', 'Nestor D. Ramos'],
  ];
  otherManagers.forEach(([dept, id, name], idx) => {
    const [firstName, ...rest] = name.replace(/ [A-Z]\.\s?/, ' ').split(' ');
    list.push({
      id,
      name,
      firstName,
      lastName: rest.join(' '),
      position: 'Department Manager',
      departmentId: dept,
      unit: 'Office of the Department Manager',
      email: `${id.toLowerCase()}@beneco.example.ph`,
      local: String(300 + idx * 10),
      mobile: `0917-000-0${200 + idx}`,
      status: 'Active',
      dateHired: '2009-03-01',
      location: DEPT_MAP[dept]?.location ?? 'BENECO Main Office',
      roles: ['Department Manager', 'Management Committee Member'],
      avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
      isManager: true,
    });
  });

  // General Manager
  list.push({
    id: 'BENECO-00001',
    name: 'Herminio C. Padilla Jr.',
    firstName: 'Herminio',
    lastName: 'Padilla Jr.',
    position: 'General Manager',
    departmentId: 'CPD',
    unit: 'Office of the General Manager',
    email: 'gm.office@beneco.example.ph',
    local: '100',
    mobile: '0917-000-0001',
    status: 'Active',
    dateHired: '2005-01-10',
    location: 'BENECO Main Office',
    roles: ['General Manager', 'Management Committee Chair', 'BAC Chairperson'],
    avatarColor: 'brand',
    isManager: true,
  });

  const depts: DepartmentId[] = ['ISD', 'NSD', 'NNSD', 'AUD', 'CPD', 'PGD'];
  let seq = 700;
  let ni = 0;
  const targetTotal = 42;
  while (list.length < targetTotal) {
    const dept = depts[list.length % depts.length];
    const firstName = FIRST_NAMES[ni % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(ni * 3 + 1) % LAST_NAMES.length];
    const positions = POSITIONS_BY_DEPT[dept];
    const position = positions[ni % positions.length];
    seq += 1;
    ni += 1;
    const id = `BENECO-0${seq}`;
    list.push({
      id,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      position,
      departmentId: dept,
      unit: DEPT_MAP[dept].units[ni % DEPT_MAP[dept].units.length],
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}@beneco.example.ph`,
      local: String(200 + (seq % 300)),
      mobile: `09${String(170000000 + seq * 37).slice(0, 9)}`,
      status: ni % 17 === 0 ? 'On Leave' : ni % 23 === 0 ? 'Probationary' : 'Active',
      dateHired: iso(subDays(DEMO_TODAY, 400 + ni * 61)),
      location: DEPT_MAP[dept].location,
      supervisorId: DEPT_MAP[dept].managerId,
      roles: ni % 11 === 0 ? ['Process Owner'] : [],
      avatarColor: AVATAR_COLORS[ni % AVATAR_COLORS.length],
    });
  }
  return list;
}

export const EMPLOYEES: Employee[] = buildEmployees();
export const EMPLOYEE_MAP: Record<string, Employee> = Object.fromEntries(
  EMPLOYEES.map((e) => [e.id, e])
);

export const CURRENT_EMPLOYEE = EMPLOYEE_MAP['BENECO-00127'];

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------
const LAYER_COLOR: Record<CalendarEvent['layer'], string> = {
  'Enterprise-wide': '#1a4fd6',
  Management: '#7c3aed',
  Department: '#158055',
  Training: '#cf8f1c',
  Compliance: '#c1272d',
  Projects: '#0d9488',
  Maintenance: '#ea580c',
  Personal: '#475569',
};

function ev(
  id: string,
  title: string,
  layer: CalendarEvent['layer'],
  dayOffset: number,
  startHour: number,
  durationHours: number,
  opts: Partial<CalendarEvent> = {}
): CalendarEvent {
  const start = addHours(new Date(DEMO_TODAY.getFullYear(), DEMO_TODAY.getMonth(), DEMO_TODAY.getDate()), 0);
  const day = addDays(start, dayOffset);
  const s = addHours(day, startHour);
  const e = addHours(day, startHour + durationHours);
  return {
    id,
    title,
    layer,
    start: isoDT(s),
    end: isoDT(e),
    editable: layer === 'Personal',
    color: LAYER_COLOR[layer],
    ...opts,
  };
}

export function buildCalendarEvents(): CalendarEvent[] {
  return [
    ev('EVT-001', 'Monthly Management Committee Meeting', 'Management', 1, 9, 2, {
      location: 'Boardroom, 4th Floor', attendees: ['Department Managers', 'General Manager'],
      description: 'Regular monthly meeting of the Management Committee to review operational performance and pending matters.',
    }),
    ev('EVT-002', 'Board Regular Meeting', 'Management', 4, 14, 3, {
      location: 'Board Room', description: 'Quarterly regular meeting of the Board of Directors.',
    }),
    ev('EVT-003', 'Employee Orientation Program', 'Training', 2, 8, 4, {
      location: 'Training Hall', description: 'Orientation for newly hired employees covering policies, benefits, and code of conduct.',
    }),
    ev('EVT-004', 'Safety Awareness Seminar', 'Training', 6, 13, 3, {
      location: 'Training Hall', departmentId: 'PGD',
      description: 'Annual safety awareness seminar for field and plant personnel.',
    }),
    ev('EVT-005', 'Department Planning Workshop — ISD', 'Department', 8, 9, 6, {
      location: 'ISD Conference Room', departmentId: 'ISD',
      description: 'Institutional Services Department annual planning workshop.',
    }),
    ev('EVT-006', 'Submission of Monthly Accomplishment Reports', 'Compliance', 3, 17, 0, {
      allDay: true, description: 'Deadline for all departments to submit monthly accomplishment reports to Corporate Planning.',
    }),
    ev('EVT-007', 'Preventive Maintenance Activity — Substation 3', 'Maintenance', 5, 7, 8, {
      location: 'Substation 3', departmentId: 'NSD',
      description: 'Scheduled preventive maintenance; expect brief service interruption in the coverage area.',
    }),
    ev('EVT-008', 'Community Electrification Program — Barangay Ambiong', 'Enterprise-wide', 10, 8, 5, {
      location: 'Barangay Ambiong', departmentId: 'ISD',
      description: 'Community electrification and member outreach activity.',
    }),
    ev('EVT-009', 'Regulatory Compliance Deadline — ERC Report', 'Compliance', 12, 17, 0, {
      allDay: true, departmentId: 'CPD', description: 'Deadline for quarterly regulatory report submission to the Energy Regulatory Commission.',
    }),
    ev('EVT-010', 'BAC Meeting — Bid Evaluation', 'Management', -1, 10, 2, {
      location: 'Procurement Office', description: 'Bids and Awards Committee meeting for evaluation of procurement bids.',
    }),
    ev('EVT-011', 'New Employee Benefits Briefing', 'Training', 15, 10, 2, { location: 'HR Training Room' }),
    ev('EVT-012', 'Line Crew Deployment Briefing', 'Department', 0, 6, 1, { departmentId: 'NSD', location: 'NSD Operations Center' }),
    ev('EVT-013', 'Generation Facility Inspection', 'Maintenance', 7, 8, 4, { departmentId: 'PGD', location: 'Hydro Facility' }),
    ev('EVT-014', 'Corporate Planning KPI Review', 'Department', 9, 13, 2, { departmentId: 'CPD' }),
    ev('EVT-015', 'Internal Audit Exit Conference — NNSD', 'Compliance', 14, 9, 2, { departmentId: 'AUD', location: 'Audit Conference Room' }),
    ev('EVT-016', 'Data Privacy Refresher Training', 'Training', 18, 9, 3, { location: 'Training Hall' }),
    ev('EVT-017', 'BES Governance Committee Sync', 'Projects', 3, 15, 1, {
      departmentId: 'ISD', location: 'ISD Conference Room / MS Teams', meetingLink: 'https://meet.beneco.example.ph/bes-governance',
      description: 'Monthly sync of the BES Governance and Adoption working group chaired by the BES Institutional Lead.',
    }),
    ev('EVT-018', 'Payroll Processing Cutoff', 'Compliance', 6, 17, 0, { allDay: true, departmentId: 'NNSD' }),
    ev('EVT-019', 'Fleet Vehicle Preventive Maintenance', 'Maintenance', 20, 8, 3, { departmentId: 'NNSD' }),
    ev('EVT-020', 'Member-Consumer Assembly — District 2', 'Enterprise-wide', 22, 8, 6, { departmentId: 'ISD', location: 'District 2 Gymnasium' }),
    ev('EVT-021', 'Records Disposal Review Committee Meeting', 'Department', -3, 10, 2, { departmentId: 'ISD' }),
    ev('EVT-022', 'Dentist / Wellness Check', 'Personal', 2, 14, 1, { ownerId: 'BENECO-00127', location: 'BENECO Clinic' }),
    ev('EVT-023', 'One-on-one with GM — Institutional Update', 'Personal', 5, 10, 1, { ownerId: 'BENECO-00127', location: "GM's Office" }),
  ];
}

// ---------------------------------------------------------------------------
// News, memos, and advisories
// ---------------------------------------------------------------------------
function post(
  id: string,
  category: NewsPost['category'],
  title: string,
  issuingOffice: string,
  dayOffset: number,
  priority: NewsPost['priority'],
  recipients: string,
  body: string,
  opts: Partial<NewsPost> = {}
): NewsPost {
  return {
    id,
    category,
    title,
    issuingOffice,
    date: iso(subDays(DEMO_TODAY, -dayOffset)),
    priority,
    recipients,
    body,
    hasAttachment: false,
    requiresAcknowledgment: false,
    status: 'Published',
    ...opts,
  };
}

export function buildNewsPosts(): NewsPost[] {
  return [
    post('NWS-001', 'Memorandum', 'Revised Guidelines on Flexible Work Arrangements', 'Institutional Services Department', -1, 'High', 'All Employees',
      'Effective the first Monday of next month, revised guidelines on flexible work arrangements shall take effect. All department managers are directed to disseminate the attached guidelines to their respective staff.',
      { hasAttachment: true, attachmentName: 'Memo_FWA_Guidelines_2026.pdf', requiresAcknowledgment: true }),
    post('NWS-002', 'Office Order', 'Designation of Officer-in-Charge, Institutional Services Department', 'Office of the General Manager', -3, 'Normal', 'Department Managers',
      'Pursuant to operational requirements, an Officer-in-Charge is hereby designated for the Institutional Services Department during the absence of the Department Manager.',
      { hasAttachment: true, attachmentName: 'OO-2026-014.pdf' }),
    post('NWS-003', 'Safety Bulletin', 'Reminder: Personal Protective Equipment Compliance for Field Personnel', 'Network Services Department', -2, 'Urgent', 'Field Personnel',
      'All field and line crew personnel are reminded to strictly comply with PPE requirements when performing energized and de-energized line work. Non-compliance shall be subject to disciplinary action.',
      { requiresAcknowledgment: true }),
    post('NWS-004', 'Advisory', 'Scheduled Power Interruption — Substation 3 Maintenance', 'Network Services Department', 2, 'High', 'Affected Areas',
      'A scheduled power interruption will be implemented to allow preventive maintenance of Substation 3. Please see the attached coverage map and schedule.',
      { hasAttachment: true, attachmentName: 'PowerInterruption_Advisory_Sub3.pdf' }),
    post('NWS-005', 'News', 'BENECO Recognized for Excellence in Rural Electrification', 'Institutional Services Department', -5, 'Normal', 'All Employees',
      'BENECO was recognized during the National Electrification Administration awards for outstanding performance in rural electrification and member-consumer service.'),
    post('NWS-006', 'Memorandum', 'Submission Deadline for Monthly Accomplishment Reports', 'Corporate Planning Department', -1, 'High', 'Department Managers',
      'All departments are reminded to submit their Monthly Accomplishment Reports on or before the 3rd working day of the following month through the designated channel.',
      { requiresAcknowledgment: true }),
    post('NWS-007', 'Emergency Notice', 'Weather Advisory — Possible Line Outages Due to Inclement Weather', 'Network Services Department', 0, 'Urgent', 'All Employees',
      'Due to incoming inclement weather, field crews are placed on standby. Employees are advised to monitor official channels for updates on possible service interruptions.',
      { requiresAcknowledgment: true }),
    post('NWS-008', 'Advisory', 'Change in Payroll Processing Schedule for the Month', 'Non-Network Services Department', 1, 'Normal', 'All Employees',
      'Due to the upcoming holiday, payroll processing for the current cutoff shall be advanced by one working day.'),
    post('NWS-009', 'Office Order', 'Creation of BES Governance and Adoption Working Group', 'Office of the General Manager', -10, 'Normal', 'Management Committee',
      'A working group is hereby created to oversee the governance, adoption, and continuous improvement of the BENECO Enterprise System (BES).',
      { hasAttachment: true, attachmentName: 'OO-2026-009_BES_Governance.pdf' }),
    post('NWS-010', 'Memorandum', 'Mandatory Data Privacy Refresher Training', 'Institutional Services Department', 4, 'High', 'All Employees',
      'All employees are required to attend the Data Privacy Refresher Training. Attendance shall be monitored and reflected in individual training records.',
      { requiresAcknowledgment: true }),
    post('NWS-011', 'Safety Bulletin', 'Fire Drill Schedule — Main Office', 'Institutional Services Department', 6, 'Normal', 'Main Office Employees',
      'A scheduled fire drill will be conducted at the Main Office premises. All employees are enjoined to participate and follow evacuation procedures.'),
    post('NWS-012', 'News', 'New Community Electrification Project Launched in District 2', 'Institutional Services Department', -7, 'Normal', 'All Employees',
      'BENECO officially launched a new community electrification project aimed at extending service to unserved areas within District 2.'),
    post('NWS-013', 'Advisory', 'Updated Guidelines on Gate Pass and Property Withdrawal', 'Non-Network Services Department', -4, 'Normal', 'All Employees',
      'Please be guided by the updated procedures on gate pass issuance and property withdrawal to strengthen internal control over company assets.',
      { hasAttachment: true, attachmentName: 'GatePass_Guidelines_v2.pdf' }),
    post('NWS-014', 'Memorandum', 'Conduct of Annual Risk-Based Audit', 'Audit Department', -2, 'Normal', 'Department Managers',
      'The Audit Department shall commence the conduct of the Annual Risk-Based Audit across departments per the approved audit plan. Cooperation from all offices is requested.',
      { requiresAcknowledgment: true }),
    post('NWS-015', 'Office Order', 'BAC Composition for CY 2026', 'Office of the General Manager', -15, 'Normal', 'BAC Members', 'The composition of the Bids and Awards Committee for CY 2026 is hereby confirmed.',
      { hasAttachment: true, attachmentName: 'OO-2026-002_BAC.pdf' }),
  ];
}

// ---------------------------------------------------------------------------
// Attendance, payroll
// ---------------------------------------------------------------------------
export function buildAttendance(): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  for (let i = 15; i >= 1; i--) {
    const d = subDays(DEMO_TODAY, i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const roll = i % 9;
    let status: AttendanceRecord['status'] = 'Present';
    let timeIn: string | undefined = '07:55';
    let timeOut: string | undefined = '17:05';
    let hoursRendered = 8;
    let remarks: string | undefined;
    if (roll === 3) { status = 'Late'; timeIn = '08:41'; remarks = 'Traffic — heavy rain'; hoursRendered = 7.3; }
    else if (roll === 6) { status = 'Undertime'; timeOut = '15:30'; remarks = 'Approved early departure'; hoursRendered = 6.5; }
    else if (roll === 8) { status = 'Official Business'; timeIn = undefined; timeOut = undefined; remarks = 'Field visit — Barangay Ambiong'; hoursRendered = 8; }
    records.push({ id: `ATT-${iso(d)}`, date: iso(d), timeIn, timeOut, status, hoursRendered, remarks });
  }
  return records.reverse();
}

export function buildPayslips(): Payslip[] {
  const periods = [
    'February 1–15, 2026', 'February 16–29, 2026', 'March 1–15, 2026',
    'March 16–31, 2026', 'April 1–15, 2026', 'April 16–30, 2026',
  ];
  return periods.map((period, i) => {
    const basicPay = 42350;
    const allowances = [
      { label: 'Representation Allowance', amount: 3500 },
      { label: 'Rice Subsidy', amount: 2000 },
      { label: 'Cost of Living Allowance', amount: 1500 },
    ];
    const deductions = [
      { label: 'Withholding Tax', amount: 5820 },
      { label: 'SSS Contribution', amount: 1350 },
      { label: 'PhilHealth Contribution', amount: 950 },
      { label: 'Pag-IBIG Contribution', amount: 200 },
      { label: 'BENECO Multi-Purpose Cooperative', amount: 2500 },
    ];
    const grossPay = basicPay + allowances.reduce((s, a) => s + a.amount, 0);
    const netPay = grossPay - deductions.reduce((s, d) => s + d.amount, 0);
    return {
      id: `PAY-2026-${String(i + 1).padStart(2, '0')}`,
      period,
      payDate: period,
      basicPay,
      allowances,
      deductions,
      netPay,
    };
  });
}

// ---------------------------------------------------------------------------
// Work items (tasks, requests, approvals) — the unified process engine data
// ---------------------------------------------------------------------------
function chain(steps: { stepName: string; approverName: string; status: 'Pending' | 'Approved' | 'Returned' | 'Rejected' | 'Skipped'; actedAt?: string; remarks?: string }[]): WorkItem['approvalChain'] {
  return steps.map((s, idx) => ({ id: `AP-${idx}`, ...s }));
}
function actLog(entries: { action: string; actor: string; dayOffset: number; detail?: string }[]): WorkItem['activity'] {
  return entries.map((e, idx) => ({
    id: `ACT-${idx}`,
    timestamp: isoDT(subDays(DEMO_TODAY, -e.dayOffset)),
    actor: e.actor,
    action: e.action,
    detail: e.detail,
  }));
}
function cmt(author: string, dayOffset: number, message: string): Comment {
  return { id: `C-${author}-${dayOffset}-${Math.round(Math.random() * 1e6)}`, author, timestamp: isoDT(subDays(DEMO_TODAY, -dayOffset)), message };
}

export function buildWorkItems(): WorkItem[] {
  const items: WorkItem[] = [];
  const me = CURRENT_EMPLOYEE;

  // --- Items requested BY the current user (My Requests) ---
  items.push({
    id: nextRef('LVE'), processType: 'leave', title: 'Vacation Leave — Family Event',
    requestorId: me.id, requestorName: me.name, departmentId: me.departmentId,
    dateSubmitted: iso(subDays(DEMO_TODAY, 6)), status: 'Approved', priority: 'Normal',
    purpose: 'Attend family event in Baguio City',
    fields: { leaveType: 'Vacation Leave', dateFrom: iso(addDays(DEMO_TODAY, 10)), dateTo: iso(addDays(DEMO_TODAY, 12)), workingDays: 3, reason: 'Attend family event in Baguio City' },
    attachments: [],
    approvalChain: chain([
      { stepName: 'Supervisor', approverName: 'Herminio C. Padilla Jr.', status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 5)), remarks: 'Approved, noted staffing coverage.' },
    ]),
    comments: [], activity: actLog([{ action: 'Submitted request', actor: me.name, dayOffset: -6 }, { action: 'Approved', actor: 'Herminio C. Padilla Jr.', dayOffset: -5 }]),
  });

  items.push({
    id: nextRef('TRV'), processType: 'travel-order', title: 'Travel Order — DILG Regional Coordination Meeting',
    requestorId: me.id, requestorName: me.name, departmentId: me.departmentId,
    dateSubmitted: iso(subDays(DEMO_TODAY, 2)), status: 'Pending Approval', priority: 'High',
    purpose: 'Represent BENECO in the DILG regional coordination meeting on community electrification',
    fields: { destination: 'DILG Regional Office, Baguio City', dateFrom: iso(addDays(DEMO_TODAY, 5)), dateTo: iso(addDays(DEMO_TODAY, 5)), transportation: 'Service Vehicle', estimatedExpenses: 3500, cashAdvance: true, fundingSource: 'ISD Operating Budget', participants: 'Alex M. Dela Cruz' },
    attachments: ['Invitation_Letter_DILG.pdf'],
    approvalChain: chain([
      { stepName: 'Department Manager', approverName: 'Alex M. Dela Cruz (self)', status: 'Skipped' },
      { stepName: 'General Manager', approverName: 'Herminio C. Padilla Jr.', status: 'Pending' },
    ]),
    comments: [], activity: actLog([{ action: 'Submitted request', actor: me.name, dayOffset: -2 }]),
  });

  items.push({
    id: nextRef('OB'), processType: 'official-business', title: 'Official Business — Site Visit, Barangay Ambiong',
    requestorId: me.id, requestorName: me.name, departmentId: me.departmentId,
    dateSubmitted: iso(subDays(DEMO_TODAY, 1)), status: 'Submitted', priority: 'Normal',
    purpose: 'Coordinate community electrification program launch',
    fields: { date: iso(addDays(DEMO_TODAY, 3)), timeFrom: '08:00', timeTo: '17:00', destination: 'Barangay Ambiong', transportation: 'Service Vehicle', expectedOutput: 'Coordination minutes and community sign-up list', participants: 'Alex M. Dela Cruz, ISD Community Programs Officer' },
    attachments: [],
    approvalChain: chain([{ stepName: 'Supervisor', approverName: 'Herminio C. Padilla Jr.', status: 'Pending' }]),
    comments: [], activity: actLog([{ action: 'Submitted request', actor: me.name, dayOffset: -1 }]),
  });

  items.push({
    id: nextRef('GP'), processType: 'gate-pass', title: 'Gate Pass — Laptop for Off-site Presentation',
    requestorId: me.id, requestorName: me.name, departmentId: me.departmentId,
    dateSubmitted: iso(subDays(DEMO_TODAY, 4)), status: 'Approved', priority: 'Low',
    purpose: 'Bring department laptop for BES demonstration to management',
    fields: { passType: 'Property', dateOut: iso(subDays(DEMO_TODAY, 4)), expectedReturn: iso(subDays(DEMO_TODAY, 4)), destination: 'BENECO Boardroom', propertyList: [{ item: 'Lenovo ThinkPad Laptop', qty: 1, assetNo: 'ISD-IT-0042' }] },
    attachments: [],
    approvalChain: chain([
      { stepName: 'Department Manager', approverName: 'Alex M. Dela Cruz (self)', status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 4)) },
      { stepName: 'Security Validation', approverName: 'Main Gate Security', status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 4)) },
    ]),
    comments: [], activity: actLog([{ action: 'Submitted request', actor: me.name, dayOffset: -4 }, { action: 'Approved and validated at gate', actor: 'Main Gate Security', dayOffset: -4 }]),
  });

  items.push({
    id: nextRef('OT'), processType: 'overtime', title: 'Overtime — BES Demo Preparation',
    requestorId: me.id, requestorName: me.name, departmentId: me.departmentId,
    dateSubmitted: iso(subDays(DEMO_TODAY, 3)), status: 'Returned', priority: 'Normal',
    purpose: 'Prepare materials for management demonstration',
    fields: { date: iso(subDays(DEMO_TODAY, 3)), timeFrom: '17:00', timeTo: '20:00', totalHours: 3, reason: 'Prepare materials for management demonstration', expectedOutput: 'Finalized presentation deck', supervisor: 'Herminio C. Padilla Jr.' },
    attachments: [],
    approvalChain: chain([{ stepName: 'Supervisor', approverName: 'Herminio C. Padilla Jr.', status: 'Returned', actedAt: iso(subDays(DEMO_TODAY, 2)), remarks: 'Please attach the accomplished overtime authorization form before resubmission.' }]),
    comments: [cmt('Herminio C. Padilla Jr.', -2, 'Please attach the accomplished overtime authorization form before resubmission.')],
    activity: actLog([{ action: 'Submitted request', actor: me.name, dayOffset: -3 }, { action: 'Returned for revision', actor: 'Herminio C. Padilla Jr.', dayOffset: -2 }]),
  });

  items.push({
    id: nextRef('PRS'), processType: 'personnel-request', title: 'Certificate of Employment Request',
    requestorId: me.id, requestorName: me.name, departmentId: me.departmentId,
    dateSubmitted: iso(subDays(DEMO_TODAY, 8)), status: 'Completed', priority: 'Low',
    purpose: 'For bank loan application requirements',
    fields: { documentType: 'Certificate of Employment', purpose: 'For bank loan application requirements' },
    attachments: [],
    approvalChain: chain([{ stepName: 'HR Processing', approverName: 'ISD Records Officer', status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 6)) }]),
    comments: [], activity: actLog([{ action: 'Submitted request', actor: me.name, dayOffset: -8 }, { action: 'Document released', actor: 'ISD Records Officer', dayOffset: -6 }]),
  });

  items.push({
    id: nextRef('SVC'), processType: 'service-request-it', title: 'IT Support — Laptop Battery Replacement',
    requestorId: me.id, requestorName: me.name, departmentId: me.departmentId,
    dateSubmitted: iso(subDays(DEMO_TODAY, 5)), status: 'In Progress', priority: 'Normal',
    purpose: 'Laptop battery no longer holds charge beyond 20 minutes',
    fields: { category: 'Hardware', description: 'Laptop battery no longer holds charge beyond 20 minutes', assetNo: 'ISD-IT-0042' },
    attachments: [],
    approvalChain: chain([{ stepName: 'IT Triage', approverName: 'IT Support Desk', status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 4)), remarks: 'Replacement part ordered.' }]),
    comments: [cmt('IT Support Desk', -4, 'Replacement part ordered, ETA 3 working days.')],
    activity: actLog([{ action: 'Submitted request', actor: me.name, dayOffset: -5 }, { action: 'Accepted and in progress', actor: 'IT Support Desk', dayOffset: -4 }]),
  });

  items.push({
    id: nextRef('SVC'), processType: 'service-request-supplies', title: 'Office Supplies Request — ISD Bond Paper & Ink',
    requestorId: me.id, requestorName: me.name, departmentId: me.departmentId,
    dateSubmitted: '', status: 'Draft', priority: 'Low',
    purpose: 'Replenish office supplies for the quarter',
    fields: { category: 'Office Supplies', description: 'Bond paper (10 reams), printer ink (4 cartridges)' },
    attachments: [], approvalChain: [], comments: [], activity: actLog([{ action: 'Draft created', actor: me.name, dayOffset: -1 }]),
  });

  // --- Approvals awaiting the current user (manager) ---
  const teamMembers = EMPLOYEES.filter((e) => e.departmentId === 'ISD' && e.id !== me.id).slice(0, 8);
  const leaveTypes = ['Vacation Leave', 'Sick Leave', 'Special Privilege Leave'];
  teamMembers.slice(0, 4).forEach((emp, idx) => {
    items.push({
      id: nextRef('LVE'), processType: 'leave', title: `${leaveTypes[idx % leaveTypes.length]} Request`,
      requestorId: emp.id, requestorName: emp.name, departmentId: emp.departmentId,
      dateSubmitted: iso(subDays(DEMO_TODAY, idx + 1)), status: 'Pending Approval', priority: idx === 0 ? 'High' : 'Normal',
      purpose: idx % 2 === 0 ? 'Personal matters' : 'Medical consultation and rest',
      fields: { leaveType: leaveTypes[idx % leaveTypes.length], dateFrom: iso(addDays(DEMO_TODAY, 2 + idx)), dateTo: iso(addDays(DEMO_TODAY, 2 + idx + (idx % 2))), workingDays: 1 + (idx % 2), reason: idx % 2 === 0 ? 'Personal matters' : 'Medical consultation and rest' },
      attachments: idx % 2 === 1 ? ['Medical_Certificate.pdf'] : [],
      approvalChain: chain([{ stepName: 'Department Manager', approverName: me.name, status: 'Pending' }]),
      comments: [], activity: actLog([{ action: 'Submitted request', actor: emp.name, dayOffset: -(idx + 1) }]),
    });
  });
  teamMembers.slice(4, 6).forEach((emp, idx) => {
    items.push({
      id: nextRef('OT'), processType: 'overtime', title: 'Overtime Authorization Request',
      requestorId: emp.id, requestorName: emp.name, departmentId: emp.departmentId,
      dateSubmitted: iso(subDays(DEMO_TODAY, idx + 2)), status: 'Pending Approval', priority: 'Normal',
      purpose: 'Complete pending case documentation',
      fields: { date: iso(subDays(DEMO_TODAY, idx)), timeFrom: '17:00', timeTo: '19:00', totalHours: 2, reason: 'Complete pending case documentation', expectedOutput: 'Finalized case file', supervisor: me.name },
      attachments: [], approvalChain: chain([{ stepName: 'Department Manager', approverName: me.name, status: 'Pending' }]),
      comments: [], activity: actLog([{ action: 'Submitted request', actor: emp.name, dayOffset: -(idx + 2) }]),
    });
  });
  items.push({
    id: nextRef('SVC'), processType: 'service-request-records', title: 'Records Request — 201 File Retrieval',
    requestorId: teamMembers[6]?.id ?? teamMembers[0].id, requestorName: teamMembers[6]?.name ?? teamMembers[0].name, departmentId: 'ISD',
    dateSubmitted: iso(subDays(DEMO_TODAY, 1)), status: 'Pending Approval', priority: 'Normal',
    purpose: 'Retrieve 201 file for verification',
    fields: { category: 'Records', description: 'Retrieve 201 file of a resigned employee for legal verification' },
    attachments: [], approvalChain: chain([{ stepName: 'Department Manager', approverName: me.name, status: 'Pending' }]),
    comments: [], activity: actLog([{ action: 'Submitted request', actor: teamMembers[6]?.name ?? teamMembers[0].name, dayOffset: -1 }]),
  });
  items.push({
    id: nextRef('DOC'), processType: 'document-routing', title: 'Route: Revised Employee Handbook for Manager Review',
    requestorId: 'BENECO-00001', requestorName: 'Herminio C. Padilla Jr.', departmentId: 'ISD',
    dateSubmitted: iso(subDays(DEMO_TODAY, 2)), status: 'Pending Approval', priority: 'High',
    purpose: 'Review and endorse revised employee handbook prior to board presentation',
    fields: { documentTitle: 'Revised Employee Handbook 2026', documentType: 'Policy Document', originatingOffice: 'Office of the General Manager', recipients: 'ISD Department Manager', actionRequested: 'Review and Endorse', dueDate: iso(addDays(DEMO_TODAY, 3)), confidentiality: 'Management Restricted' },
    attachments: ['Employee_Handbook_Draft_v3.pdf'],
    approvalChain: chain([
      { stepName: 'Originating Office', approverName: 'Herminio C. Padilla Jr.', status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 2)) },
      { stepName: 'Department Manager Review', approverName: me.name, status: 'Pending' },
    ]),
    comments: [], activity: actLog([{ action: 'Routed for review', actor: 'Herminio C. Padilla Jr.', dayOffset: -2 }]),
  });

  // --- Team items visible to manager (Assigned to My Team) ---
  teamMembers.slice(0, 5).forEach((emp, idx) => {
    items.push({
      id: nextRef('SVC'), processType: idx % 2 === 0 ? 'service-request-it' : 'service-request-facilities',
      title: idx % 2 === 0 ? 'Printer Not Working — 2nd Floor' : 'Aircon Maintenance — ISD Office',
      requestorId: emp.id, requestorName: emp.name, departmentId: emp.departmentId,
      dateSubmitted: iso(subDays(DEMO_TODAY, idx + 3)), status: idx < 2 ? 'In Progress' : 'Completed', priority: 'Normal',
      purpose: idx % 2 === 0 ? 'Printer jams frequently, needs servicing' : 'Aircon unit needs cleaning and freon check',
      fields: { category: idx % 2 === 0 ? 'Hardware' : 'HVAC', description: idx % 2 === 0 ? 'Printer jams frequently, needs servicing' : 'Aircon unit needs cleaning and freon check' },
      attachments: [], approvalChain: chain([{ stepName: 'Facilities/IT Processing', approverName: idx % 2 === 0 ? 'IT Support Desk' : 'Facilities Team', status: idx < 2 ? 'Approved' : 'Approved', actedAt: iso(subDays(DEMO_TODAY, idx + 1)) }]),
      comments: [], activity: actLog([{ action: 'Submitted request', actor: emp.name, dayOffset: -(idx + 3) }]),
      isTeamItem: true, assigneeId: emp.id, assigneeName: emp.name,
    });
  });

  // --- Rejected / cancelled samples for completeness ---
  items.push({
    id: nextRef('TRV'), processType: 'travel-order', title: 'Travel Order — Unbudgeted Seminar Attendance',
    requestorId: teamMembers[1]?.id ?? teamMembers[0].id, requestorName: teamMembers[1]?.name ?? teamMembers[0].name, departmentId: 'ISD',
    dateSubmitted: iso(subDays(DEMO_TODAY, 20)), status: 'Rejected', priority: 'Low',
    purpose: 'Attend private seminar not aligned with approved training plan',
    fields: { destination: 'Manila', dateFrom: iso(subDays(DEMO_TODAY, 5)), dateTo: iso(subDays(DEMO_TODAY, 3)), transportation: 'Bus', estimatedExpenses: 8000, cashAdvance: true, fundingSource: 'ISD Training Budget' },
    attachments: [], approvalChain: chain([{ stepName: 'Department Manager', approverName: me.name, status: 'Rejected', actedAt: iso(subDays(DEMO_TODAY, 18)), remarks: 'Not aligned with the approved annual training plan and budget.' }]),
    comments: [cmt(me.name, -18, 'Not aligned with the approved annual training plan and budget.')],
    activity: actLog([{ action: 'Submitted request', actor: teamMembers[1]?.name ?? teamMembers[0].name, dayOffset: -20 }, { action: 'Rejected', actor: me.name, dayOffset: -18 }]),
  });
  items.push({
    id: nextRef('GP'), processType: 'gate-pass', title: 'Gate Pass — Cancelled Equipment Loan',
    requestorId: teamMembers[2]?.id ?? teamMembers[0].id, requestorName: teamMembers[2]?.name ?? teamMembers[0].name, departmentId: 'ISD',
    dateSubmitted: iso(subDays(DEMO_TODAY, 9)), status: 'Cancelled', priority: 'Low', purpose: 'Borrow projector for external event (event postponed)',
    fields: { passType: 'Property', dateOut: iso(subDays(DEMO_TODAY, 7)), expectedReturn: iso(subDays(DEMO_TODAY, 7)), destination: 'External Venue', propertyList: [{ item: 'Projector', qty: 1, assetNo: 'ISD-IT-0018' }] },
    attachments: [], approvalChain: [], comments: [], activity: actLog([{ action: 'Submitted request', actor: teamMembers[2]?.name ?? teamMembers[0].name, dayOffset: -9 }, { action: 'Cancelled by requestor', actor: teamMembers[2]?.name ?? teamMembers[0].name, dayOffset: -8 }]),
  });

  // --- Shared workflow demo instances ---
  items.push({
    id: nextRef('PRC'), processType: 'procurement-request', title: 'Procurement — Laptops for ISD Training Program',
    requestorId: me.id, requestorName: me.name, departmentId: 'ISD',
    dateSubmitted: iso(subDays(DEMO_TODAY, 7)), status: 'Pending Approval', priority: 'High',
    purpose: 'Replace aging training laptops for Learning & Development sessions',
    fields: { requestingDepartment: 'Institutional Services Department', items: 'Laptop, 14-inch, i5, 16GB RAM', quantity: 5, estimatedCost: 225000, requiredDate: iso(addDays(DEMO_TODAY, 30)), budgetCode: 'ISD-CAP-2026-0034', specifications: 'Intel Core i5 12th Gen or higher, 16GB RAM, 512GB SSD, 3-year warranty' },
    attachments: ['Technical_Specifications.pdf'],
    approvalChain: chain([
      { stepName: 'Supervisor', approverName: 'ISD Unit Head', status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 6)) },
      { stepName: 'Department Manager', approverName: me.name, status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 5)) },
      { stepName: 'Budget Review', approverName: 'NNSD Budget Officer', status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 3)) },
      { stepName: 'Procurement', approverName: 'NNSD Procurement Officer', status: 'Pending' },
      { stepName: 'General Manager', approverName: 'Herminio C. Padilla Jr.', status: 'Pending' },
    ]),
    comments: [], activity: actLog([{ action: 'Submitted request', actor: me.name, dayOffset: -7 }, { action: 'Approved by supervisor', actor: 'ISD Unit Head', dayOffset: -6 }, { action: 'Approved by department manager', actor: me.name, dayOffset: -5 }, { action: 'Approved by budget review', actor: 'NNSD Budget Officer', dayOffset: -3 }]),
  });
  items.push({
    id: nextRef('DOC'), processType: 'document-routing', title: 'Route: Data Sharing Agreement with LGU Baguio',
    requestorId: me.id, requestorName: me.name, departmentId: 'ISD',
    dateSubmitted: iso(subDays(DEMO_TODAY, 4)), status: 'In Progress', priority: 'Normal',
    purpose: 'Legal review and approval of data sharing agreement for community electrification program',
    fields: { documentTitle: 'Data Sharing Agreement — LGU Baguio Community Electrification', documentType: 'Agreement', originatingOffice: 'Institutional Services Department', recipients: 'Legal / Corporate Planning', actionRequested: 'Review and Approve', dueDate: iso(addDays(DEMO_TODAY, 7)), confidentiality: 'Department Restricted' },
    attachments: ['Draft_DSA_LGU_Baguio.pdf'],
    approvalChain: chain([
      { stepName: 'Originating Office', approverName: me.name, status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 4)) },
      { stepName: 'Receiving Office (Legal)', approverName: 'Corporate Planning — Legal Review', status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 2)) },
      { stepName: 'Reviewer', approverName: 'CPD Department Manager', status: 'Pending' },
      { stepName: 'Approving Authority', approverName: 'Herminio C. Padilla Jr.', status: 'Pending' },
      { stepName: 'Records', approverName: 'ISD Records Officer', status: 'Pending' },
    ]),
    comments: [], activity: actLog([{ action: 'Routed to legal review', actor: me.name, dayOffset: -4 }, { action: 'Reviewed and endorsed', actor: 'Corporate Planning — Legal Review', dayOffset: -2 }]),
  });
  items.push({
    id: nextRef('PRJ'), processType: 'project-proposal', title: 'Project Proposal — Employee Wellness and Resilience Program',
    requestorId: me.id, requestorName: me.name, departmentId: 'ISD',
    dateSubmitted: iso(subDays(DEMO_TODAY, 12)), status: 'In Progress', priority: 'High',
    purpose: 'Establish a structured employee wellness program to reduce absenteeism and improve morale',
    fields: {
      projectTitle: 'Employee Wellness and Resilience Program', proponent: me.name,
      strategicObjective: 'Improve workforce well-being and organizational resilience',
      background: 'Increasing workload and field exposure have raised concerns on employee wellness. A structured program is proposed to address this gap.',
      expectedOutputs: 'Quarterly wellness activities, mental health helpline, resilience training modules',
      targetBeneficiaries: 'All BENECO employees', schedule: 'Q3 2026 – Q2 2027', estimatedBudget: 850000,
      risks: 'Budget constraints; competing operational priorities',
    },
    attachments: ['Project_Proposal_Wellness.pdf'],
    approvalChain: chain([
      { stepName: 'Department Manager', approverName: me.name, status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 11)) },
      { stepName: 'Corporate Planning', approverName: 'Ramon B. Aquino', status: 'Approved', actedAt: iso(subDays(DEMO_TODAY, 6)) },
      { stepName: 'Budget / Finance', approverName: 'NNSD Budget Officer', status: 'Pending' },
      { stepName: 'General Manager', approverName: 'Herminio C. Padilla Jr.', status: 'Pending' },
    ]),
    comments: [cmt('Ramon B. Aquino', -6, 'Aligned with the 2026-2028 Strategic Plan pillar on workforce development. Endorsed for budget review.')],
    activity: actLog([{ action: 'Submitted proposal', actor: me.name, dayOffset: -12 }, { action: 'Endorsed by department manager', actor: me.name, dayOffset: -11 }, { action: 'Endorsed by Corporate Planning', actor: 'Ramon B. Aquino', dayOffset: -6 }]),
  });

  return items;
}

// ---------------------------------------------------------------------------
// Documents & policies
// ---------------------------------------------------------------------------
export function buildDocuments(): PolicyDocument[] {
  const cats: { title: string; category: string; classification: PolicyDocument['classification']; ack: boolean }[] = [
    { title: 'Code of Conduct and Discipline', category: 'Human Resources', classification: 'Public to All Employees', ack: true },
    { title: 'Manual on Recruitment, Selection, and Placement', category: 'Human Resources', classification: 'Public to All Employees', ack: false },
    { title: 'Leave Administration Policy', category: 'Human Resources', classification: 'Public to All Employees', ack: false },
    { title: 'Flexible Work Arrangement Guidelines', category: 'Human Resources', classification: 'Public to All Employees', ack: true },
    { title: 'Board Policy on Delegation of Authority', category: 'Board Policies', classification: 'Board Restricted', ack: false },
    { title: 'Board Resolution — Approval of Annual Budget CY 2026', category: 'Board Policies', classification: 'Board Restricted', ack: false },
    { title: 'Corporate Governance Manual', category: 'Management Policies', classification: 'Management Restricted', ack: true },
    { title: 'Records Management and Retention Policy', category: 'Operations', classification: 'Public to All Employees', ack: false },
    { title: 'Procurement Manual (Revised)', category: 'Procurement', classification: 'Department Restricted', ack: false },
    { title: 'Financial Management and Internal Control Manual', category: 'Finance', classification: 'Management Restricted', ack: false },
    { title: 'Occupational Safety and Health Policy', category: 'Safety', classification: 'Public to All Employees', ack: true },
    { title: 'Data Privacy Manual', category: 'Data Privacy', classification: 'Public to All Employees', ack: true },
    { title: 'Information Systems Security Policy', category: 'Information Systems', classification: 'Management Restricted', ack: false },
    { title: 'Gate Pass and Property Withdrawal Procedure', category: 'Operations', classification: 'Public to All Employees', ack: false },
    { title: 'Travel and Official Business Guidelines', category: 'Operations', classification: 'Public to All Employees', ack: false },
    { title: 'Employee Performance Management System Guidelines', category: 'Human Resources', classification: 'Public to All Employees', ack: false },
    { title: 'Leave Request Form', category: 'Forms and Templates', classification: 'Public to All Employees', ack: false },
    { title: 'Travel Order Form', category: 'Forms and Templates', classification: 'Public to All Employees', ack: false },
    { title: 'Annual Internal Audit Manual', category: 'Operations', classification: 'Confidential', ack: false },
    { title: 'Emergency Response and Business Continuity Manual', category: 'Manuals', classification: 'Management Restricted', ack: true },
    { title: 'Superseded: Leave Administration Policy (2019 Edition)', category: 'Archived Documents', classification: 'Public to All Employees', ack: false },
    { title: 'Superseded: Code of Conduct (2015 Edition)', category: 'Archived Documents', classification: 'Public to All Employees', ack: false },
  ];
  return cats.map((c, i) => ({
    id: `DOC-${String(i + 1).padStart(3, '0')}`,
    title: c.title,
    category: c.category,
    version: c.category === 'Archived Documents' ? '1.0' : `${1 + (i % 3)}.${i % 4}`,
    owner: DEPARTMENTS[i % DEPARTMENTS.length].shortName,
    effectivityDate: iso(subDays(DEMO_TODAY, 200 + i * 40)),
    reviewDate: iso(addDays(DEMO_TODAY, 120 + i * 15)),
    status: c.category === 'Archived Documents' ? 'Superseded' : i % 9 === 0 ? 'Under Review' : 'Active',
    classification: c.classification,
    requiresAcknowledgment: c.ack,
    summary: `Institutional document governing ${c.title.toLowerCase()} across BENECO operations.`,
    versionHistory: [
      { version: '1.0', date: iso(subDays(DEMO_TODAY, 600)), note: 'Initial issuance' },
      { version: `${1 + (i % 3)}.${i % 4}`, date: iso(subDays(DEMO_TODAY, 200 + i * 40)), note: 'Revision approved by Management Committee' },
    ],
  }));
}

// ---------------------------------------------------------------------------
// Strategic projects
// ---------------------------------------------------------------------------
export function buildProjects(): StrategicProject[] {
  const raw: [string, DepartmentId, StrategicProject['status'], number, string, number][] = [
    ['BES — Enterprise Portal Rollout', 'ISD', 'On Track', 62, 'Alex M. Dela Cruz', 4200000],
    ['Rural Electrification Expansion — District 2', 'NSD', 'On Track', 48, 'Eduardo R. Santiago', 18500000],
    ['Substation Upgrade Program', 'NSD', 'At Risk', 35, 'Eduardo R. Santiago', 32000000],
    ['Hydro Facility Rehabilitation', 'PGD', 'On Track', 70, 'Nestor D. Ramos', 45000000],
    ['Enterprise Risk Management Rollout', 'CPD', 'On Track', 55, 'Ramon B. Aquino', 950000],
    ['Billing System Modernization', 'NNSD', 'Delayed', 28, 'Marivic T. Bautista', 6200000],
    ['Fleet Modernization Program', 'NNSD', 'On Track', 40, 'Marivic T. Bautista', 8800000],
    ['Risk-Based Audit Digitalization', 'AUD', 'At Risk', 30, 'Corazon P. Villanueva', 650000],
    ['Employee Wellness and Resilience Program', 'ISD', 'In Progress' as StrategicProject['status'], 22, 'Alex M. Dela Cruz', 850000],
    ['Solar-Diesel Hybrid Feasibility Study', 'PGD', 'On Track', 15, 'Nestor D. Ramos', 1200000],
  ];
  return raw.map(([title, dept, status, progress, owner, budget], i) => ({
    id: `PROJ-${String(i + 1).padStart(3, '0')}`,
    title, departmentId: dept, status: status === ('In Progress' as StrategicProject['status']) ? 'On Track' : status, progress, owner,
    startDate: iso(subDays(DEMO_TODAY, 90 + i * 20)),
    targetDate: iso(addDays(DEMO_TODAY, 120 + i * 25)),
    budget,
    description: `Strategic initiative under the ${DEPT_MAP[dept].shortName} portfolio, monitored quarterly by Corporate Planning.`,
  }));
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export function buildNotifications(workItems: WorkItem[], news: NewsPost[]): AppNotification[] {
  const notifs: AppNotification[] = [];
  let n = 0;
  const pendingApprovals = workItems.filter((w) => w.status === 'Pending Approval' && w.approvalChain.some((a) => a.approverName === CURRENT_EMPLOYEE.name && a.status === 'Pending'));
  pendingApprovals.slice(0, 5).forEach((w) => {
    n += 1;
    notifs.push({ id: `NOTIF-${n}`, category: 'Approval Required', title: `${w.title}`, message: `${w.requestorName} submitted a request awaiting your approval.`, timestamp: isoDT(subDays(DEMO_TODAY, -0)), read: n > 3, linkType: 'work-item', linkId: w.id });
  });
  const requiresAck = news.filter((p) => p.requiresAcknowledgment);
  requiresAck.slice(0, 3).forEach((p) => {
    n += 1;
    notifs.push({ id: `NOTIF-${n}`, category: 'Memo', title: p.title, message: `New ${p.category.toLowerCase()} from ${p.issuingOffice} requires acknowledgment.`, timestamp: isoDT(subDays(DEMO_TODAY, 1)), read: n % 2 === 0, linkType: 'news', linkId: p.id });
  });
  n += 1; notifs.push({ id: `NOTIF-${n}`, category: 'Calendar Reminder', title: 'Monthly Management Committee Meeting', message: 'Tomorrow, 9:00 AM at the Boardroom, 4th Floor.', timestamp: isoDT(subDays(DEMO_TODAY, 0)), read: false, linkType: 'event', linkId: 'EVT-001' });
  n += 1; notifs.push({ id: `NOTIF-${n}`, category: 'Deadline', title: 'Monthly Accomplishment Report', message: 'Due in 3 days. Submit to Corporate Planning Department.', timestamp: isoDT(subDays(DEMO_TODAY, 2)), read: false, linkType: 'none' });
  n += 1; notifs.push({ id: `NOTIF-${n}`, category: 'Request Update', title: 'Overtime Request Returned', message: 'Your overtime request was returned for revision.', timestamp: isoDT(subDays(DEMO_TODAY, 2)), read: true, linkType: 'none' });
  n += 1; notifs.push({ id: `NOTIF-${n}`, category: 'Assignment', title: 'BES Governance Committee Sync', message: 'You have been assigned as facilitator for the upcoming sync meeting.', timestamp: isoDT(subDays(DEMO_TODAY, 3)), read: true, linkType: 'event', linkId: 'EVT-017' });
  n += 1; notifs.push({ id: `NOTIF-${n}`, category: 'System Message', title: 'Scheduled Maintenance', message: 'BES will undergo scheduled maintenance this weekend, 10:00 PM–2:00 AM.', timestamp: isoDT(subDays(DEMO_TODAY, 4)), read: true, linkType: 'none' });
  n += 1; notifs.push({ id: `NOTIF-${n}`, category: 'Request Update', title: 'Travel Order Submitted', message: 'Your travel order for DILG Regional Coordination Meeting was submitted successfully.', timestamp: isoDT(subDays(DEMO_TODAY, 2)), read: true, linkType: 'none' });
  return notifs;
}

// ---------------------------------------------------------------------------
// BES module registry
// ---------------------------------------------------------------------------
export function buildModules(): BesModule[] {
  const raw: [string, string, string, DepartmentId, BesModule['status'], BesModule['priority'], string, number][] = [
    ['Enterprise Calendar & Scheduling', 'Alex M. Dela Cruz', 'IT Systems Unit', 'ISD', 'Active', 'High', 'Released', 92],
    ['News, Memos & Advisories Center', 'Alex M. Dela Cruz', 'IT Systems Unit', 'ISD', 'Active', 'High', 'Released', 88],
    ['Employee Self-Service (Leave, OB, OT)', 'Marivic T. Bautista', 'IT Systems Unit', 'NNSD', 'Active', 'High', 'Released', 81],
    ['Digital Payslip & Payroll Viewer', 'Marivic T. Bautista', 'Finance Systems Team', 'NNSD', 'Active', 'Normal', 'Released', 75],
    ['Shared Workflow Engine (Procurement, Routing)', 'Ramon B. Aquino', 'IT Systems Unit', 'CPD', 'In Development', 'High', 'Q4 2026', 34],
    ['Reports & Analytics Dashboard', 'Alex M. Dela Cruz', 'Corporate Planning MIS', 'CPD', 'In Development', 'High', 'Q4 2026', 41],
    ['Document & Policy Library', 'Alex M. Dela Cruz', 'IT Systems Unit', 'ISD', 'Active', 'Normal', 'Released', 69],
    ['Mobile Field Work Order App', 'Eduardo R. Santiago', 'NSD Technical Projects', 'NSD', 'Proposed', 'High', 'Q2 2027', 0],
    ['Asset & Property Tracking Module', 'Marivic T. Bautista', 'IT Systems Unit', 'NNSD', 'Proposed', 'Normal', 'Q1 2027', 0],
    ['Audit Findings & Corrective Action Tracker', 'Corazon P. Villanueva', 'Audit MIS', 'AUD', 'Deferred', 'Low', 'TBD', 0],
  ];
  return raw.map(([name, biz, tech, dept, status, priority, target, adoption], i) => ({
    id: `MOD-${String(i + 1).padStart(3, '0')}`,
    name, businessOwner: biz, technicalOwner: tech, departmentId: dept, status, priority, targetRelease: target,
    adoptionRate: adoption, lastReviewDate: iso(subDays(DEMO_TODAY, 10 + i * 7)),
    description: `${name} — part of the BES phased rollout under the governance of the BES Institutional Lead.`,
  }));
}

// ---------------------------------------------------------------------------
// Department "Application Portal" tools
// ---------------------------------------------------------------------------
export function buildTools(): AppTool[] {
  const nsdOnly = (level: ToolAccessLevel): ToolAccessGrant[] => [{ departmentId: 'NSD', level }];
  const tools: AppTool[] = [
    { code: 'GIS', name: 'Geographic Information System', description: 'Network and asset mapping across the franchise area.', iconKey: 'Map', ownerDepartmentId: 'NSD', access: nsdOnly('ADMIN') },
    { code: 'NMS', name: 'Network Management System', description: 'Real-time monitoring and control of the distribution network.', iconKey: 'Network', ownerDepartmentId: 'NSD', access: nsdOnly('ADMIN') },
    { code: 'CRS', name: 'Compliance Reporting System', description: 'Regulatory and technical compliance report generation.', iconKey: 'FileCheck', ownerDepartmentId: 'NSD', access: nsdOnly('ADMIN') },
    { code: 'TDR', name: 'Technical Data Repository', description: 'Central repository for technical drawings and specifications.', iconKey: 'Database', ownerDepartmentId: 'NSD', access: nsdOnly('VIEW') },
    { code: 'MRMS', name: 'Meter Replacement Management System', description: 'Tracks scheduled and emergency meter replacements.', iconKey: 'Gauge', ownerDepartmentId: 'NSD', access: nsdOnly('SOON') },
    { code: 'MIMS', name: 'Meter Installation Management System', description: 'Manages new service meter installation workflows.', iconKey: 'Wrench', ownerDepartmentId: 'NSD', access: nsdOnly('ADMIN') },
    { code: 'MIIS', name: 'Meter Inventory and Issuance System', description: 'Warehouse inventory and issuance tracking for meters.', iconKey: 'ClipboardList', ownerDepartmentId: 'NSD', access: nsdOnly('NEW') },
    { code: 'TMS', name: 'Transformer Management System', description: 'Asset records and loading history for distribution transformers.', iconKey: 'Zap', ownerDepartmentId: 'NSD', access: nsdOnly('ADMIN') },
    { code: 'CMS', name: 'Calibration Management System', description: 'Meter testing and calibration scheduling and records.', iconKey: 'SlidersHorizontal', ownerDepartmentId: 'NSD', access: nsdOnly('ADMIN') },
    { code: 'CRM', name: 'Customer Request Monitoring', description: 'Tracks member-consumer service and connection requests.', iconKey: 'MessageSquare', ownerDepartmentId: 'NSD', access: nsdOnly('EDIT') },
    { code: 'MDMS', name: 'Meter Data Management System', description: 'Consumption data collection and validation from field meters.', iconKey: 'HardDrive', ownerDepartmentId: 'NSD', access: nsdOnly('ADMIN') },
    { code: 'MDMSG', name: 'MDMS for GeoP Customers and Man-Asok Power Plant', description: 'Meter data management for generation-linked accounts.', iconKey: 'Factory', ownerDepartmentId: 'NSD', access: nsdOnly('SOON') },
    { code: 'ISO', name: 'ISO Management System', description: 'Quality management system documentation and audit tracking.', iconKey: 'BadgeCheck', ownerDepartmentId: 'NSD', access: nsdOnly('SOON') },
    { code: 'DMS', name: 'Distribution Management System', description: 'Feeder-level distribution network operations dashboard.', iconKey: 'GitBranch', ownerDepartmentId: 'NSD', access: nsdOnly('NEW') },
    { code: 'NRC', name: 'Network Reference Center', description: 'Reference library of network standards and procedures.', iconKey: 'BookOpen', ownerDepartmentId: 'NSD', access: nsdOnly('VIEW') },
    { code: 'OMS', name: 'Outage Management System', description: 'Outage logging, crew dispatch, and restoration tracking.', iconKey: 'AlertTriangle', ownerDepartmentId: 'NSD', access: nsdOnly('EDIT') },
    { code: 'Quick Slides', name: 'Presentation Builder', description: 'Build quick presentation decks from network reports.', iconKey: 'Presentation', ownerDepartmentId: 'NSD', access: nsdOnly('OPEN') },
    { code: 'Settings', name: 'Administrative Settings', description: 'Department-level system configuration.', iconKey: 'Settings', ownerDepartmentId: 'NSD', access: nsdOnly('ADMIN') },
    {
      code: 'WIS', name: 'Warehouse Inventory System',
      description: 'Tracks warehouse stock levels, material issuances, and inventory reconciliation for network materials.',
      iconKey: 'Warehouse', ownerDepartmentId: 'NSD',
      access: [
        { departmentId: 'NSD', level: 'ADMIN' },
        { departmentId: 'AUD', level: 'VIEW' },
        { departmentId: 'ISD', level: 'EXISTING', note: 'Handled by the existing warehouse system for now.' },
      ],
    },
    // ISD Management System — HR, Community Relations, and Motorpool offices.
    { code: 'Community Relations', name: 'Community Relations Office System', description: 'Community engagement, outreach, and program tracking.', iconKey: 'Users', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }] },
    { code: 'General Services Office', name: 'General Services Office System', description: 'General services, vehicle dispatch, maintenance, and facilities support.', iconKey: 'Car', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }] },

    // ISD Modules — mirrors the Institutional Services Modules workspace grid.
    { code: 'Human Resources', name: 'Human Resources Module', description: 'Employee 201 files, benefits administration, and workforce records.', iconKey: 'Users', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }], taskSubjects: ['Human Resource'] },
    { code: 'Recruitment and Onboarding', name: 'Recruitment and Onboarding Module', description: 'Manage vacancies, applicant screening, and new employee onboarding.', iconKey: 'UserPlus', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }], taskSubjects: ['Application Letter'] },
    { code: 'Learning and Development', name: 'Learning and Development Module', description: 'Training programs, competency development, and learning records.', iconKey: 'GraduationCap', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }], taskSubjects: ['Learning and Development'] },
    { code: 'Performance Management', name: 'Performance Management Module', description: 'Goal setting, appraisal cycles, and performance ratings.', iconKey: 'TrendingUp', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }], taskSubjects: ['Performance Management'] },
    { code: 'Employee Relations', name: 'Employee Relations Module', description: 'Grievance handling, disciplinary cases, and employee welfare.', iconKey: 'HeartHandshake', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }], taskSubjects: ['Employee Relations'] },
    { code: 'Institutional Communications', name: 'Institutional Communications Module', description: 'Public information, internal communications, and brand management.', iconKey: 'Megaphone', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }], taskSubjects: ['Institutional Communications'] },
    { code: 'Member-Consumer and Community Programs', name: 'Member-Consumer and Community Programs Module', description: 'Community electrification, outreach, and member-consumer engagement.', iconKey: 'HandHeart', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }], taskSubjects: ['Member-Consumer and Community Programs'] },
    { code: 'Records Management', name: 'Records Management Module', description: 'Corporate records, retention schedules, and document custody.', iconKey: 'Archive', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }], taskSubjects: ['Records Management'] },
    { code: 'Policies and Issuances', name: 'Policies and Issuances Module', description: 'Drafting, review, and dissemination of institutional policies.', iconKey: 'FileStack', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }], taskSubjects: ['Policy Related'] },
    { code: 'Events Management', name: 'Events Management Module', description: 'Corporate events, seminars, and institutional activities.', iconKey: 'CalendarRange', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }], taskSubjects: ['Events Management'] },
    { code: 'Building and Facilities Management System', name: 'Building and Facilities Management System', description: 'Building operations, facility maintenance, space management, and service tracking.', iconKey: 'Building2', ownerDepartmentId: 'ISD', access: [{ departmentId: 'ISD', level: 'ADMIN' }], taskSubjects: ['Building and Facilities Management System'] },
  ];
  return tools.map((tool) => ({ ...tool, status: tool.access.some((grant) => grant.level === 'SOON') ? 'SOON' : 'ENABLED' }));
}

// ---------------------------------------------------------------------------
// Personal File Storage

export const DEFAULT_STORAGE_QUOTA_BYTES = 500 * 1024 * 1024; // 500 MB

export function buildStorageItems(ownerId: string): StorageItem[] {
  const day = (n: number) => isoDT(subDays(DEMO_TODAY, n));
  const folder = (id: string, name: string, parentId: string | null, ageDays: number): StorageItem => ({
    id, name, type: 'folder', parentId, ownerId, sizeBytes: 0, createdAt: day(ageDays), modifiedAt: day(ageDays),
  });
  const file = (id: string, name: string, parentId: string | null, sizeBytes: number, mimeType: string, ageDays: number, modifiedDays = ageDays): StorageItem => ({
    id, name, type: 'file', parentId, ownerId, sizeBytes, mimeType, createdAt: day(ageDays), modifiedAt: day(modifiedDays),
  });

  return [
    folder('FS-001', 'Personal Documents', null, 120),
    folder('FS-002', 'Scanned Signed Documents', null, 90),
    folder('FS-003', 'Templates', null, 150),
    file('FS-004', 'Certificate of Employment.pdf', 'FS-001', 245_000, 'application/pdf', 118, 118),
    file('FS-005', 'Updated Resume.docx', 'FS-001', 89_000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 60, 12),
    file('FS-006', 'Signed MOA - Community Outreach.pdf', 'FS-002', 1_800_000, 'application/pdf', 21, 21),
    file('FS-007', 'Signed Travel Order - August.pdf', 'FS-002', 640_000, 'application/pdf', 5, 5),
    file('FS-008', 'Memo Template.docx', 'FS-003', 34_000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 150, 150),
    file('FS-009', 'Leave Form Template.xlsx', 'FS-003', 52_000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 150, 150),
  ];
}

export function buildStorageQuotas(employees: Employee[]): StorageQuota[] {
  return employees.map((e) => ({ employeeId: e.id, quotaBytes: DEFAULT_STORAGE_QUOTA_BYTES }));
}

// ---------------------------------------------------------------------------
// ISO 9001:2015 QMS — Controlled Document Registry
// Modeled directly on BENECO's actual Network Services Department procedure
// manuals (2022 Revised QMS Manual Ver 05), including their real document
// numbers, revision numbers, and sign-off chain.

const NSDM = { name: 'Eduardo R. Santiago', position: 'Department Manager' };
const ISO_OFFICER = { name: 'Atty. Simeon P. Villaverde', position: 'ISO Officer' };

function stubFlowchart(): QmsFlowchart {
  return {
    nodes: [
      { id: 'n-start', type: 'start', label: 'Start', position: { x: 280, y: 0 } },
      { id: 'n-end', type: 'end', label: 'End', position: { x: 280, y: 220 } },
    ],
    edges: [],
  };
}

// PM-NSD-07's Section 4.0 Process Flowchart, reconstructed from the controlled copy.
function calibrationProcedureFlowchart(): QmsFlowchart {
  return {
    nodes: [
      { id: 'start', type: 'start', label: 'Start', position: { x: 320, y: 0 } },
      { id: 'p1', type: 'process', label: 'Purchased test equipment', position: { x: 320, y: 90 } },
      { id: 'p2', type: 'process', label: 'Include test equipment in the list of calibration plan schedule', responsibility: 'SEME', position: { x: 320, y: 190 } },
      { id: 'p3', type: 'process', label: 'Identify and prepares test equipment with accessories due for calibration', responsibility: 'SEME', position: { x: 320, y: 300 } },
      { id: 'd1', type: 'decision', label: 'Needs Outsourced Calibrator?', responsibility: 'SEME', position: { x: 320, y: 420 } },
      { id: 'p4', type: 'process', label: 'SEMO conducts calibration', responsibility: 'SEMO', position: { x: 620, y: 420 } },
      { id: 'p5', type: 'process', label: 'Calibration provider receives test equipment and conducts calibration', responsibility: 'Calibrator', position: { x: 320, y: 540 } },
      { id: 'd2', type: 'decision', label: 'Within Calibration Limits?', responsibility: 'Calibrator', position: { x: 320, y: 670 } },
      { id: 'p6', type: 'process', label: 'Calibration Provider provides certificate of calibration / SEMO provides calibration report', responsibility: 'Calibrator', position: { x: 320, y: 790 } },
      { id: 'p7', type: 'process', label: 'Certificate of calibration for record filing', responsibility: 'SEMO', position: { x: 320, y: 900 }, interfaceRef: 'GL-NSD-03 — Test Equipment Calibration Plan' },
      { id: 'p8', type: 'process', label: 'SEMO prepares recommendation if equipment is for repair or replacement', responsibility: 'SEMO', position: { x: 620, y: 790 } },
      { id: 'p9', type: 'process', label: 'SEMO to safe keep the equipment and tag as "Defective"', responsibility: 'SEMO', position: { x: 620, y: 900 } },
      { id: 'end', type: 'end', label: 'End', position: { x: 320, y: 1000 } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'p1' },
      { id: 'e2', source: 'p1', target: 'p2' },
      { id: 'e3', source: 'p2', target: 'p3' },
      { id: 'e4', source: 'p3', target: 'd1' },
      { id: 'e5', source: 'd1', target: 'p5', label: 'YES' },
      { id: 'e6', source: 'd1', target: 'p4', label: 'NO', sourceHandle: 'right' },
      { id: 'e7', source: 'p4', target: 'd2' },
      { id: 'e8', source: 'p5', target: 'd2' },
      { id: 'e9', source: 'd2', target: 'p6', label: 'YES' },
      { id: 'e10', source: 'd2', target: 'p8', label: 'NO', sourceHandle: 'right' },
      { id: 'e11', source: 'p6', target: 'p7' },
      { id: 'e12', source: 'p7', target: 'end' },
      { id: 'e13', source: 'p8', target: 'p9' },
      { id: 'e14', source: 'p9', target: 'end' },
    ],
  };
}

export function buildQmsDocuments(): QmsDocument[] {
  const eff = '2022-06-01';
  return [
    {
      id: 'PM-NSD-01', code: 'PM-NSD-01', title: 'Power Service Connection', type: 'Procedure Manual', departmentId: 'NSD',
      revisionNo: '04', effectiveDate: eff, pageCount: 3, status: 'Controlled',
      objective: 'To ensure that all the requirements for application for service connections are timely attended to and in accordance with the provision of Distribution Services and Open Access Rules, Philippine Distribution Code, Philippine Electrical Code and BENECO Policy.',
      scope: 'The procedure covers all the activities done by the metering services office from the evaluation of requirements for application for service connection up to the endorsement to the Non-Network Services Department for meter reading, billing and collection.',
      definitions: [
        { term: 'ASC', meaning: 'Application for Service Connection' },
        { term: 'SEMO', meaning: 'Special Equipment and Metering Office' },
        { term: 'PMES', meaning: 'Pre-membership Education Seminar' },
        { term: 'CFEI', meaning: 'Certificate of Final Electrical Inspection' },
        { term: 'CEI', meaning: 'Certificate of Electrical Inspection' },
        { term: 'AEP', meaning: 'Accredited Electrical Practitioner' },
        { term: 'NNSD', meaning: 'Non-Network Services Department' },
      ],
      referenceRecords: [],
      preparedByName: 'Engr. Rafael D. Manalo', preparedByPosition: 'Special Equipment and Metering Officer',
      approvedByName: NSDM.name, approvedByPosition: NSDM.position, notedByName: ISO_OFFICER.name, notedByPosition: ISO_OFFICER.position,
      flowchart: stubFlowchart(),
    },
    {
      id: 'PM-NSD-02', code: 'PM-NSD-02', title: 'Distribution System Planning and Design', type: 'Procedure Manual', departmentId: 'NSD',
      revisionNo: '03', effectiveDate: eff, pageCount: 4, status: 'Controlled',
      objective: 'To ensure a stable, reliable and safe BENECO electric distribution system and to address systematically the consumer network related requirements, and to comply with BENECO’s obligation and performance standards at the least cost as required by the Philippine Distribution Code and Philippine Grid Code.',
      scope: 'This procedure defines the activities and personnel responsible in preparing the Capital Expenditure Plan in consonance with the Philippine Distribution Code and Philippine Grid Code.',
      definitions: [
        { term: 'CAPEX Plan', meaning: 'Capital Expenditure Plan' },
        { term: 'SPDE', meaning: 'System Planning and Design Engineer' },
        { term: 'SPDO', meaning: 'System Planning and Design Officer' },
        { term: 'AM/FM/GIS', meaning: 'Automated Mapping/Facilities Management/Geographic Information System' },
        { term: 'ERC', meaning: 'Energy Regulatory Commission' },
        { term: 'MFSR', meaning: 'Monthly Financial and Statistical Report' },
      ],
      referenceRecords: [],
      preparedByName: 'Engr. Katrina S. Domingo', preparedByPosition: 'System Planning and Design Officer',
      approvedByName: NSDM.name, approvedByPosition: NSDM.position, notedByName: ISO_OFFICER.name, notedByPosition: ISO_OFFICER.position,
      flowchart: stubFlowchart(),
    },
    {
      id: 'PM-NSD-03', code: 'PM-NSD-03', title: 'Distribution System Project Implementation', type: 'Procedure Manual', departmentId: 'NSD',
      revisionNo: '03', effectiveDate: eff, pageCount: 4, status: 'Controlled',
      objective: 'To ensure that all approved projects for implementation/construction adhere to construction standards.',
      scope: 'This procedure covers the activities and the persons responsible in implementing approved projects for implementation.',
      definitions: [
        { term: 'NOSPI', meaning: 'Notice of Scheduled Power Interruption' },
        { term: 'CMO', meaning: 'Construction and Maintenance Officer' },
        { term: 'SPDO', meaning: 'System Planning & Design Officer' },
        { term: 'SPDE', meaning: 'System Planning & Design Engineer' },
        { term: 'NSDM', meaning: 'Network Services Department Manager' },
        { term: 'ROWW', meaning: 'Right of Way Waiver or Certificate of Consent of Property Owners' },
        { term: 'DDP', meaning: 'Distribution Development Plan' },
        { term: 'MRS', meaning: 'Material Requisition Slip' },
        { term: 'LCS', meaning: 'Line Construction Standards' },
        { term: 'CSS', meaning: 'Construction Safety Standards' },
        { term: 'JO', meaning: 'Job Order' },
      ],
      referenceRecords: [
        'F-NSD-13 — Job Order', 'F-NSD-14 — Inspection / Evaluation Report', 'F-NSD-15 — Certification of Final Inspection',
        'F-NSD-16 — Material Requisition Slip', 'F-NSD-17 — Accomplishment Report', 'F-NSD-18 — Installation of New Streetlights',
        'F-NSD-37 — Material Credit Excess Form', 'F-NSD-38 — Material Credit Retired Form',
        'GL-NSD-07 — Material/Equipment Specification', 'WI-NSD-05 — Work Instruction on Isolation/Restoration of BENECO Distribution System',
      ],
      preparedByName: 'Engr. Joseph M. Aguilar', preparedByPosition: 'Construction and Maintenance Officer',
      approvedByName: NSDM.name, approvedByPosition: NSDM.position, notedByName: ISO_OFFICER.name, notedByPosition: ISO_OFFICER.position,
      flowchart: stubFlowchart(),
    },
    {
      id: 'PM-NSD-04', code: 'PM-NSD-04', title: 'Operations and Maintenance of Distribution System', type: 'Procedure Manual', departmentId: 'NSD',
      revisionNo: '04', effectiveDate: eff, pageCount: 3, status: 'Controlled',
      objective: 'To ensure effective & efficient operation and maintenance of BENECO electric distribution system.',
      scope: 'This procedure covers the operation and preventive process of the electric distribution system and its appurtenances.',
      definitions: [
        { term: 'DDP', meaning: 'Distribution Development Plan' },
        { term: 'CMO', meaning: 'Construction and Maintenance Officer' },
        { term: 'NSDM', meaning: 'Network Services Department Manager' },
        { term: 'SPDO', meaning: 'System Planning and Design Office' },
        { term: 'SEMO', meaning: 'Special Equipment and Metering Office' },
        { term: 'SCPO', meaning: 'System Control and Protection Office' },
        { term: 'CWO', meaning: 'Consumer Welfare Officer' },
        { term: 'CWCCA', meaning: 'Consumer Welfare and Call Center Associate' },
      ],
      referenceRecords: [],
      preparedByName: 'Engr. Joseph M. Aguilar', preparedByPosition: 'Construction and Maintenance Officer',
      approvedByName: NSDM.name, approvedByPosition: NSDM.position, notedByName: ISO_OFFICER.name, notedByPosition: ISO_OFFICER.position,
      flowchart: stubFlowchart(),
    },
    {
      id: 'PM-NSD-05', code: 'PM-NSD-05', title: 'Pilferage Detection & Apprehension', type: 'Procedure Manual', departmentId: 'NSD',
      revisionNo: '02', effectiveDate: eff, pageCount: 4, status: 'Controlled',
      objective: 'To reduce non-technical loss by eliminating pilferage of electricity, and to deter any act of power pilferages.',
      scope: 'The system and procedure starts from report of alleged VOC’s and review of consumer’s record/history until it is verified and apprehension conducted due to violation.',
      definitions: [
        { term: 'VOC', meaning: 'Violation of Contract — infractions committed by the member-consumer in defiance of the service contract signed after installation of electrical service connection.' },
        { term: 'OL', meaning: 'Officer of the Law — authorized law enforcers and elected public officials authorized to assist in apprehension procedures per RA 7832 IRR.' },
        { term: 'CWMS', meaning: 'Consumer Welfare Management System utilized by the Consumer Welfare Office' },
        { term: 'MMO', meaning: 'Meter Reading Monitoring Officer' },
        { term: 'SEMO', meaning: 'Special Equipment and Metering Office' },
        { term: 'NNSD', meaning: 'Non Network Services Department' },
        { term: 'SEME', meaning: 'Special Equipment and Metering Engineer' },
      ],
      referenceRecords: [],
      preparedByName: 'Engr. Rafael D. Manalo', preparedByPosition: 'Special Equipment and Metering Officer',
      approvedByName: NSDM.name, approvedByPosition: NSDM.position, notedByName: ISO_OFFICER.name, notedByPosition: ISO_OFFICER.position,
      flowchart: stubFlowchart(),
    },
    {
      id: 'PM-NSD-06', code: 'PM-NSD-06', title: 'Material Quality Acceptance', type: 'Procedure Manual', departmentId: 'NSD',
      revisionNo: '02', effectiveDate: eff, pageCount: 2, status: 'Controlled',
      objective: 'To ensure that all delivered line hardware materials, kilowatt-hour meters, instrument transformers and other special equipment are compliant to all the technical specification specified by BENECO.',
      scope: 'The procedure covers all the activities done by the metering services office from the inspection, evaluation and testing of all incoming deliveries of line hardware materials, kilowatt-hour meters, instrument transformers and other special equipment up to the submission of certificate of inspection and evaluation.',
      definitions: [
        { term: 'DR', meaning: 'Delivery Report' },
        { term: 'SEMO', meaning: 'Special Equipment and Metering Office' },
        { term: 'SEME', meaning: 'Special Equipment and Metering Engineer' },
        { term: 'NSDM', meaning: 'Network Services Department Manager' },
      ],
      referenceRecords: [],
      preparedByName: 'Engr. Rafael D. Manalo', preparedByPosition: 'Special Equipment and Metering Officer',
      approvedByName: NSDM.name, approvedByPosition: NSDM.position, notedByName: ISO_OFFICER.name, notedByPosition: ISO_OFFICER.position,
      flowchart: stubFlowchart(),
    },
    {
      id: 'PM-NSD-07', code: 'PM-NSD-07', title: 'Calibration Procedure', type: 'Procedure Manual', departmentId: 'NSD',
      revisionNo: '01', effectiveDate: eff, pageCount: 2, status: 'Controlled',
      objective: 'To ensure that all test equipment are calibrated on a regular basis specified in the calibration plan schedule, making sure that each test equipment is compliant under the technical specification specified by the equipment manufacturer.',
      scope: 'The procedure covers all the activities done by the metering services office from the pre-inspection of test equipment due for calibration, delivery of test equipment to the local calibration provider, and post-inspection upon receipt of the test equipment.',
      definitions: [
        { term: 'SEMO', meaning: 'Special Equipment and Metering Office' },
        { term: 'SEME', meaning: 'Special Equipment and Metering Engineer' },
        { term: 'NSDM', meaning: 'Network Services Department Manager' },
        { term: 'LTCP', meaning: 'Local Testing and Calibration Provider — preferably referred by test equipment manufacturer/distributor' },
      ],
      referenceRecords: ['GL-NSD-03 — Test Equipment Calibration Plan'],
      preparedByName: 'Engr. Rafael D. Manalo', preparedByPosition: 'Special Equipment and Metering Officer I',
      approvedByName: NSDM.name, approvedByPosition: NSDM.position, notedByName: ISO_OFFICER.name, notedByPosition: ISO_OFFICER.position,
      flowchart: calibrationProcedureFlowchart(),
    },
  ];
}

// ---------------------------------------------------------------------------
// General Manager Home KPI dashboard

export function buildGmKpiData(): GmKpiData {
  const monthTrend = (base: number, step: number, volatility: number): { month: string; value: number }[] =>
    Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(DEMO_TODAY, 5 - i);
      const wiggle = (i % 2 === 0 ? 1 : -1) * volatility;
      return { month: format(d, 'MMM'), value: Math.round((base + step * i + wiggle) * 100) / 100 };
    });

  return {
    asOf: iso(DEMO_TODAY),
    technical: {
      systemsLossPct: 8.7,
      systemsLossCapPct: 13.0,
      systemsLossTrend: monthTrend(10.1, -0.28, 0.35),
      powerFactor: 0.94,
      loadFactor: 0.68,
      substations: [
        { name: 'Irisan S/s', units: '1 x 20 MVA', capacityMVA: 20, peakLoadMVA: 15.6 },
        { name: 'NSC S/s', units: '2 x 50 MVA', capacityMVA: 100, peakLoadMVA: 74.3 },
        { name: 'Lamut S/s', units: '1 x 20 MVA, 1 x 50 MVA', capacityMVA: 70, peakLoadMVA: 48.9 },
        { name: 'Atok S/s', units: '1 x 5 MVA, 1 x 20 MVA', capacityMVA: 25, peakLoadMVA: 16.2 },
        { name: 'Sinipsip S/s', units: '1 x 10 MVA', capacityMVA: 10, peakLoadMVA: 6.4 },
        { name: 'Mankayan S/s', units: '1 x 10 MVA', capacityMVA: 10, peakLoadMVA: 7.8 },
      ],
      miniHydroCapacityMW: 3.24,
      energyProducedMWh: 1842,
      saifi: 3.85,
      saidi: 312,
      maifi: 1.42,
    },
    nonTechnical: {
      meterReadingCompletionPct: 98.4,
      manpowerCount: 341,
      ascAverageDays: 2.3,
      customerRequests: [
        { category: 'New Connection', count: 186 },
        { category: 'Billing Concern', count: 142 },
        { category: 'Disconnection Appeal', count: 58 },
        { category: 'Meter Testing', count: 34 },
        { category: 'Others', count: 71 },
      ],
    },
    financial: {
      collectionEfficiencyPct: 96.8,
      collectionEfficiencyTrend: monthTrend(94.6, 0.42, 0.4),
      currentCollectionsPhp: 142_850_000,
      pesoRates: [
        { customerClass: 'Residential', rate: 11.85 },
        { customerClass: 'Commercial', rate: 11.2 },
        { customerClass: 'Big Commercial', rate: 10.45 },
        { customerClass: 'High Voltage', rate: 9.8 },
        { customerClass: 'Industrial', rate: 10.05 },
      ],
      debtRatioPct: 42.3,
    },
  };
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export function buildAuditLog(): AuditLogEntry[] {
  const raw: [string, string, string, AuditLogEntry['category']][] = [
    ['admin', 'User login', 'Authentication system', 'Authentication'],
    ['Alex M. Dela Cruz', 'Approved leave request', 'LVE-2026-00002', 'Workflow'],
    ['System', 'Scheduled report generated', 'Monthly Accomplishment Report', 'Data Change'],
    ['admin', 'Published memorandum', 'NWS-001', 'Administration'],
    ['Herminio C. Padilla Jr.', 'Approved procurement request', 'PRC-2026-00001', 'Workflow'],
    ['admin', 'Updated role permission matrix', 'Department Manager role', 'Administration'],
    ['Corazon P. Villanueva', 'Accessed restricted audit record', 'AUD-ENG-2026-014', 'Access'],
    ['admin', 'Reset demo data', 'System-wide', 'Administration'],
    ['Marivic T. Bautista', 'Rejected travel order', 'TRV-2026-00002', 'Workflow'],
    ['admin', 'Created user account', 'BENECO-00742', 'Administration'],
  ];
  return raw.map(([actor, action, target, category], i) => ({
    id: `LOG-${String(i + 1).padStart(4, '0')}`,
    timestamp: isoDT(subDays(DEMO_TODAY, 30 - i * 3)),
    actor, action, target, category,
    ipAddress: `10.20.${(i % 8) + 1}.${(i * 7) % 250}`,
  }));
}

// ---------------------------------------------------------------------------
// Support tickets (seed empty — user-generated)
// ---------------------------------------------------------------------------
export function buildSupportTickets(): SupportTicket[] {
  return [
    { id: 'TCK-2026-00001', type: 'Support', subject: 'Unable to download payslip PDF', description: 'The download button on the payslip detail modal does not respond on mobile.', status: 'Resolved', submittedBy: 'Danilo P. Fianza', dateSubmitted: iso(subDays(DEMO_TODAY, 15)) },
    { id: 'TCK-2026-00002', type: 'Enhancement Request', subject: 'Add dark mode to BES', description: 'Requesting a dark mode option for extended use during night shift monitoring.', status: 'Open', submittedBy: 'Josefina R. Cariño', dateSubmitted: iso(subDays(DEMO_TODAY, 5)) },
  ];
}

// ---------------------------------------------------------------------------
// Internal email (Inbox → Mail)
// ---------------------------------------------------------------------------
function email(
  id: string,
  folder: EmailMessage['folder'],
  fromName: string,
  toNames: string[],
  subject: string,
  body: string,
  dayOffset: number,
  opts: Partial<EmailMessage> = {}
): EmailMessage {
  return {
    id,
    threadId: opts.threadId ?? id,
    fromId: fromName === CURRENT_EMPLOYEE.name ? CURRENT_EMPLOYEE.id : `EMP-${fromName}`,
    fromName,
    toNames,
    ccNames: [],
    subject,
    body,
    timestamp: isoDT(subDays(DEMO_TODAY, -dayOffset)),
    read: true,
    starred: false,
    folder,
    attachments: [],
    ...opts,
  };
}

export function buildEmails(): EmailMessage[] {
  const me = CURRENT_EMPLOYEE.name;
  return [
    email('MAIL-001', 'inbox', 'Herminio C. Padilla Jr.', [me], 'Monthly Management Committee Meeting — Agenda', 'Good day Alex,\n\nAttached is the agenda for this month\'s Management Committee meeting. Kindly review the ISD action items prior to the meeting.\n\nRegards,\nHerminio', -1, { read: false, starred: true, attachments: ['MANCOM_Agenda_August.pdf'] }),
    email('MAIL-002', 'inbox', 'Ramon B. Aquino', [me], 'RE: Employee Wellness and Resilience Program — Budget Endorsement', 'Hi Alex,\n\nThe proposal has been endorsed to Budget/Finance for review. I noted strong alignment with the 2026-2028 Strategic Plan. Let\'s sync once the budget team responds.\n\nRamon', -6, { read: true, threadId: 'MAIL-T-002' }),
    email('MAIL-003', 'inbox', 'Corazon P. Villanueva', [me], 'Annual Risk-Based Audit — ISD Walkthrough Schedule', 'Alex,\n\nWe would like to schedule the ISD process walkthrough for the annual audit next week. Please advise on your team\'s availability.\n\nThank you,\nCorazon', -2, { read: false }),
    email('MAIL-004', 'inbox', 'Marivic T. Bautista', [me], 'Procurement Request PRC-2026-00001 — Pending Your Confirmation', 'Hi Alex,\n\nBudget review has cleared the laptop procurement request for ISD. Procurement will proceed once you confirm the final quantity.\n\nMarivic', -3, { read: true }),
    email('MAIL-005', 'inbox', 'Eduardo R. Santiago', [me], 'Community Electrification Coordination — Barangay Ambiong', 'Alex,\n\nNSD can provide a technical crew to support the community electrification launch. Let me know the confirmed date so we can allocate resources.\n\nEduardo', -4, { read: true }),
    email('MAIL-006', 'inbox', 'ISD Records Officer', [me], 'Records Disposal Review — Committee Sign-off Needed', 'Good day Sir Alex,\n\nThe CY2018 records disposal list is ready for your review and signature. Please see attached inventory.\n\nThank you.', -5, { read: false, attachments: ['Records_Disposal_CY2018.xlsx'] }),
    email('MAIL-007', 'inbox', 'ISD HR Officer', [me], 'New Hire Onboarding — August Batch Confirmation', 'Hi Alex,\n\nThree new hires are confirmed for onboarding on the 17th. Orientation materials are ready. Please confirm your availability to give the welcome remarks.', -7, { read: true }),
    email('MAIL-008', 'inbox', 'IT Support Desk', [me], 'Your IT Support Request Has Been Updated', 'Hello,\n\nYour ticket regarding laptop battery replacement is now In Progress. Replacement part ETA is 3 working days.\n\nIT Support Desk', -4, { read: true }),
    email('MAIL-009', 'inbox', 'General Manager\'s Office', [me], 'Reminder: Submission of Monthly Accomplishment Report', 'All Department Managers,\n\nKindly submit your Monthly Accomplishment Report on or before the 3rd working day of the following month.\n\nThank you.', 0, { read: false, starred: true }),
    email('MAIL-010', 'inbox', 'Josefina R. Cariño', [me], 'Question on Flexible Work Arrangement Guidelines', 'Hi Sir Alex,\n\nCould you clarify if the new FWA guidelines apply to field-based Community Programs staff as well? Thank you.', -1, { read: false }),
    email('MAIL-011', 'sent', me, ['Ramon B. Aquino'], 'RE: Employee Wellness and Resilience Program — Budget Endorsement', 'Hi Ramon,\n\nThank you for the quick endorsement. I\'ll follow up with the Budget team directly and keep you posted.\n\nAlex', -6, { threadId: 'MAIL-T-002' }),
    email('MAIL-012', 'sent', me, ['Corazon P. Villanueva'], 'RE: Annual Risk-Based Audit — ISD Walkthrough Schedule', 'Hi Corazon,\n\nOur team is available Tuesday and Wednesday next week, morning slots preferred. Let us know what works.\n\nAlex', -2, {}),
    email('MAIL-013', 'sent', me, ['ISD Records Officer'], 'RE: Records Disposal Review — Committee Sign-off Needed', 'Noted, I will review the inventory today and sign off by tomorrow. Thanks for the reminder.', -4, {}),
    email('MAIL-014', 'sent', me, ['Eduardo R. Santiago', 'ISD Community Programs Officer'], 'Community Electrification Coordination — Barangay Ambiong', 'Eduardo, ISD Community Programs Officer,\n\nLooping you both in — the community electrification activity is confirmed for August 24. Please coordinate crew and materials accordingly.\n\nAlex', -4, {}),
    email('MAIL-015', 'drafts', me, ['Herminio C. Padilla Jr.'], 'BES Governance — Q3 Adoption Update (Draft)', 'Sir,\n\nHere is a preliminary summary of BES adoption across departments for Q3. I will finalize this after the next governance committee sync.\n\n[Draft — figures pending]', -1, { read: true }),
    email('MAIL-016', 'trash', 'Facilities Team', [me], 'Aircon Maintenance Schedule — Completed', 'Hi Alex,\n\nAircon maintenance for the ISD office has been completed as scheduled. No further action needed.', -8, { read: true }),
  ];
}

// ---------------------------------------------------------------------------
// Internal messaging (Inbox → Messages)
// ---------------------------------------------------------------------------
export function buildConversations(): ChatConversation[] {
  return [
    { id: 'CHAT-001', participantIds: ['BENECO-00001'], participantNames: ['Herminio C. Padilla Jr.'], isGroup: false },
    { id: 'CHAT-002', participantIds: ['BENECO-00301'], participantNames: ['Marivic T. Bautista'], isGroup: false },
    { id: 'CHAT-003', participantIds: ['BENECO-00201'], participantNames: ['Eduardo R. Santiago'], isGroup: false },
    { id: 'CHAT-004', participantIds: ['BENECO-00501'], participantNames: ['Ramon B. Aquino'], isGroup: false },
    { id: 'CHAT-005', participantIds: ['BENECO-00001', 'BENECO-00301', 'BENECO-00201', 'BENECO-00501', 'BENECO-00401', 'BENECO-00601'], participantNames: ['Herminio C. Padilla Jr.', 'Marivic T. Bautista', 'Eduardo R. Santiago', 'Ramon B. Aquino', 'Corazon P. Villanueva', 'Nestor D. Ramos'], isGroup: true, title: 'Management Committee' },
    { id: 'CHAT-006', participantIds: ['BENECO-00701', 'BENECO-00702'], participantNames: ['ISD Team'], isGroup: true, title: 'ISD Team' },
  ];
}

function chatMsg(id: string, conversationId: string, senderId: string, senderName: string, body: string, dayOffset: number, hour: number, minute: number, read = true): ChatMessage {
  return {
    id, conversationId, senderId, senderName, body,
    timestamp: isoDT(addHours(addDays(new Date(DEMO_TODAY.getFullYear(), DEMO_TODAY.getMonth(), DEMO_TODAY.getDate()), dayOffset), hour) ),
    read,
  };
}

export function buildChatMessages(): ChatMessage[] {
  const me = CURRENT_EMPLOYEE;
  return [
    chatMsg('CM-001', 'CHAT-001', 'BENECO-00001', 'Herminio C. Padilla Jr.', 'Alex, do you have a moment before MANCOM to align on the BES rollout talking points?', -1, 9, 5),
    chatMsg('CM-002', 'CHAT-001', me.id, me.name, 'Yes sir, I\'m free after 2pm today. I\'ll bring the adoption dashboard.', -1, 9, 20),
    chatMsg('CM-003', 'CHAT-001', 'BENECO-00001', 'Herminio C. Padilla Jr.', 'Perfect, see you then.', -1, 9, 22),
    chatMsg('CM-004', 'CHAT-001', 'BENECO-00001', 'Herminio C. Padilla Jr.', 'Also — great job on the demo walkthrough yesterday.', 0, 8, 10, false),

    chatMsg('CM-010', 'CHAT-002', 'BENECO-00301', 'Marivic T. Bautista', 'The laptop procurement just cleared budget review on my end.', -3, 10, 0),
    chatMsg('CM-011', 'CHAT-002', me.id, me.name, 'Great news, thank you! I\'ll confirm the final quantity today.', -3, 10, 15),
    chatMsg('CM-012', 'CHAT-002', 'BENECO-00301', 'Marivic T. Bautista', 'Sounds good, I\'ll forward to Procurement once you do.', -3, 10, 17, false),

    chatMsg('CM-020', 'CHAT-003', 'BENECO-00201', 'Eduardo R. Santiago', 'Can NSD borrow your training hall next week for a line crew briefing?', -2, 13, 0),
    chatMsg('CM-021', 'CHAT-003', me.id, me.name, 'Sure, just coordinate the schedule with our Events Management unit.', -2, 13, 30),

    chatMsg('CM-030', 'CHAT-004', 'BENECO-00501', 'Ramon B. Aquino', 'Endorsed the wellness program proposal to budget — noted strong alignment with the strategic plan.', -6, 15, 0),
    chatMsg('CM-031', 'CHAT-004', me.id, me.name, 'Appreciate it, Ramon. Will keep you posted.', -6, 15, 10),

    chatMsg('CM-040', 'CHAT-005', 'BENECO-00001', 'Herminio C. Padilla Jr.', 'Reminder: Monthly Management Committee Meeting tomorrow, 9:00 AM, Boardroom.', -1, 16, 0),
    chatMsg('CM-041', 'CHAT-005', 'BENECO-00401', 'Corazon P. Villanueva', 'Noted, I\'ll bring the preliminary audit findings summary.', -1, 16, 5),
    chatMsg('CM-042', 'CHAT-005', 'BENECO-00601', 'Nestor D. Ramos', 'Confirmed, will attend.', -1, 16, 20, false),

    chatMsg('CM-050', 'CHAT-006', 'BENECO-00701', 'ISD Team', 'Reminder: Community electrification site visit materials are ready for pickup.', 0, 8, 0, false),
  ];
}

export function buildNewsReadStates(news: NewsPost[]): NewsReadState[] {
  return news.map((p, i) => {
    const acknowledged = p.requiresAcknowledgment ? i % 4 === 0 : false;
    return {
      postId: p.id,
      read: acknowledged ? true : i % 3 !== 0,
      bookmarked: i === 2 || i === 8,
      acknowledged,
      acknowledgedAt: acknowledged ? isoDT(subDays(DEMO_TODAY, 2 + (i % 5))) : undefined,
    };
  });
}
