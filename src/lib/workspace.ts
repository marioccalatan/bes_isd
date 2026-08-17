import {
  Users, UserPlus, GraduationCap, TrendingUp, HeartHandshake, Megaphone,
  HandHeart, Archive, FileStack, CalendarRange, LayoutGrid,
} from 'lucide-react';

export interface WorkspaceRecord {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  date: string;
  status: 'Active' | 'Pending' | 'Completed' | 'Ongoing' | 'Scheduled';
  description: string;
  restricted?: boolean;
}

export interface WorkspaceModuleDef {
  id: string;
  name: string;
  description: string;
  icon: typeof Users;
  stats: { label: string; value: string }[];
  records: WorkspaceRecord[];
}

export const ISD_MODULES: WorkspaceModuleDef[] = [
  {
    id: 'human-resources', name: 'Human Resources', description: 'Employee 201 files, benefits administration, and workforce records.',
    icon: Users,
    stats: [{ label: 'Active Employees', value: '312' }, { label: 'Pending 201 Updates', value: '6' }, { label: 'On Leave Today', value: '9' }],
    records: [
      { id: 'HR-001', title: '201 File Update — Maria S. Reyes', subtitle: 'Change of civil status', tag: 'Records Update', date: '2026-08-05', status: 'Pending', description: 'Employee submitted marriage certificate for civil status update in the 201 file.' },
      { id: 'HR-002', title: 'Benefits Enrollment — New Hires Batch 3', subtitle: '5 employees', tag: 'Benefits', date: '2026-08-02', status: 'Active', description: 'SSS, PhilHealth, and Pag-IBIG enrollment processing for the third batch of new hires this year.' },
      { id: 'HR-003', title: 'Annual Medical Examination Scheduling', subtitle: 'All departments', tag: 'Wellness', date: '2026-08-20', status: 'Scheduled', description: 'Coordination with BENECO Clinic for the annual mandatory medical examination of all employees.' },
      { id: 'HR-004', title: 'Retirement Processing — Wilfredo T. Garcia', subtitle: 'Network Services Department', tag: 'Separation', date: '2026-07-28', status: 'Ongoing', description: 'Processing of retirement benefits and clearance for a retiring NSD employee.' },
      { id: 'HR-005', title: 'HMO Provider Renewal Review', subtitle: 'Corporate-wide', tag: 'Benefits', date: '2026-09-01', status: 'Pending', description: 'Annual review and renewal negotiation with the HMO provider for employee health coverage.' },
    ],
  },
  {
    id: 'recruitment', name: 'Recruitment and Onboarding', description: 'Manage vacancies, applicant screening, and new employee onboarding.',
    icon: UserPlus,
    stats: [{ label: 'Open Vacancies', value: '4' }, { label: 'Applicants in Pipeline', value: '27' }, { label: 'Onboarding This Month', value: '3' }],
    records: [
      { id: 'REC-001', title: 'Electrical Engineer II — Network Services', subtitle: '2 vacancies', tag: 'Vacancy', date: '2026-08-01', status: 'Active', description: 'Open position for Electrical Engineer II under the Network Services Department, technical projects unit.' },
      { id: 'REC-002', title: 'Applicant Screening — Accounting Staff', subtitle: '14 applicants shortlisted', tag: 'Screening', date: '2026-08-10', status: 'Ongoing', description: 'Initial screening and evaluation of applicants for the Accounting Staff position under NNSD.' },
      { id: 'REC-003', title: 'Onboarding Program — August Batch', subtitle: '3 new hires', tag: 'Onboarding', date: '2026-08-17', status: 'Scheduled', description: 'Orientation and onboarding schedule for new employees joining in August.' },
      { id: 'REC-004', title: 'Job Fair Participation — Baguio City', subtitle: 'University partnership', tag: 'Sourcing', date: '2026-09-05', status: 'Scheduled', description: 'Participation in a local university job fair to source engineering and IT graduates.' },
    ],
  },
  {
    id: 'learning-development', name: 'Learning and Development', description: 'Training programs, competency development, and learning records.',
    icon: GraduationCap,
    stats: [{ label: 'Trainings This Quarter', value: '12' }, { label: 'Completion Rate', value: '84%' }, { label: 'Certifications Tracked', value: '58' }],
    records: [
      { id: 'LND-001', title: 'Data Privacy Refresher Training', subtitle: 'All employees', tag: 'Compliance Training', date: '2026-08-18', status: 'Scheduled', description: 'Mandatory refresher training on data privacy compliance for all employees.' },
      { id: 'LND-002', title: 'Leadership Development Program — Batch 2', subtitle: '15 supervisors', tag: 'Leadership', date: '2026-08-25', status: 'Ongoing', description: 'Second batch of the leadership development program for first-line supervisors.' },
      { id: 'LND-003', title: 'Technical Skills Upgrade — Line Crew', subtitle: 'NSD, 22 participants', tag: 'Technical', date: '2026-07-30', status: 'Completed', description: 'Technical skills training on updated line maintenance procedures for NSD field crews.' },
      { id: 'LND-004', title: 'BES Digital Literacy Orientation', subtitle: 'All departments', tag: 'Digital Skills', date: '2026-08-12', status: 'Ongoing', description: 'Orientation sessions on using the BENECO Enterprise System, part of the BES adoption rollout.' },
    ],
  },
  {
    id: 'performance-management', name: 'Performance Management', description: 'Goal setting, appraisal cycles, and performance ratings.',
    icon: TrendingUp,
    stats: [{ label: 'Appraisal Cycle', value: 'Q3 2026' }, { label: 'Submitted Ratings', value: '68%' }, { label: 'Overdue Appraisals', value: '11' }],
    records: [
      { id: 'PMS-001', title: 'Mid-Year Performance Review — ISD', subtitle: '34 employees', tag: 'Appraisal', date: '2026-07-31', status: 'Completed', description: 'Mid-year performance review cycle for all Institutional Services Department employees.' },
      { id: 'PMS-002', title: 'Goal Setting Workshop — Q3', subtitle: 'Department Managers', tag: 'Planning', date: '2026-08-08', status: 'Completed', description: 'Workshop to cascade corporate targets into individual and team performance goals for Q3.' },
      { id: 'PMS-003', title: 'Overdue Appraisal Follow-up', subtitle: '11 pending submissions', tag: 'Follow-up', date: '2026-08-14', status: 'Pending', description: 'Follow-up reminders sent to supervisors with overdue performance appraisal submissions.' },
    ],
  },
  {
    id: 'employee-relations', name: 'Employee Relations', description: 'Grievance handling, disciplinary cases, and employee welfare.',
    icon: HeartHandshake,
    stats: [{ label: 'Open Cases', value: '2' }, { label: 'Resolved This Year', value: '9' }, { label: 'Welfare Requests', value: '5' }],
    records: [
      { id: 'ER-001', title: 'Grievance Case #2026-014', subtitle: 'Confidential — mediation stage', tag: 'Grievance', date: '2026-08-01', status: 'Ongoing', description: 'Grievance case currently in the mediation stage between concerned parties, handled confidentially by ISD.' },
      { id: 'ER-002', title: 'Employee Welfare Assistance Request', subtitle: 'Medical assistance', tag: 'Welfare', date: '2026-08-06', status: 'Pending', description: 'Request for welfare assistance under the employee welfare program guidelines.' },
      { id: 'ER-003', title: 'Labor-Management Council Meeting', subtitle: 'Quarterly meeting', tag: 'LMC', date: '2026-08-28', status: 'Scheduled', description: 'Quarterly meeting of the Labor-Management Council to discuss workplace concerns.' },
    ],
  },
  {
    id: 'institutional-communications', name: 'Institutional Communications', description: 'Public information, internal communications, and brand management.',
    icon: Megaphone,
    stats: [{ label: 'Posts Published (30d)', value: '15' }, { label: 'Press Releases', value: '3' }, { label: 'Avg. Acknowledgment Rate', value: '76%' }],
    records: [
      { id: 'IC-001', title: 'Press Release — NEA Recognition Award', subtitle: 'External communications', tag: 'Press Release', date: '2026-08-09', status: 'Completed', description: 'Press release announcing BENECO recognition for excellence in rural electrification.' },
      { id: 'IC-002', title: 'Internal Newsletter — August Issue', subtitle: 'All employees', tag: 'Newsletter', date: '2026-08-15', status: 'Scheduled', description: 'Monthly internal newsletter covering department updates, milestones, and announcements.' },
      { id: 'IC-003', title: 'Social Media Content Calendar — Q3', subtitle: 'Public information', tag: 'Content Plan', date: '2026-08-03', status: 'Ongoing', description: 'Content calendar for BENECO official social media channels for the third quarter.' },
    ],
  },
  {
    id: 'member-programs', name: 'Member-Consumer and Community Programs', description: 'Community electrification, outreach, and member-consumer engagement.',
    icon: HandHeart,
    stats: [{ label: 'Active Programs', value: '6' }, { label: 'Communities Served (YTD)', value: '18' }, { label: 'Member Satisfaction', value: '91%' }],
    records: [
      { id: 'MCP-001', title: 'Community Electrification — Barangay Ambiong', subtitle: 'District 1', tag: 'Electrification', date: '2026-08-24', status: 'Scheduled', description: 'Community electrification and member sign-up activity for Barangay Ambiong.' },
      { id: 'MCP-002', title: 'Member-Consumer Assembly — District 2', subtitle: 'District 2 Gymnasium', tag: 'Assembly', date: '2026-09-05', status: 'Scheduled', description: 'District-level member-consumer assembly covering cooperative updates and Q&A.' },
      { id: 'MCP-003', title: 'Rural Electrification Satisfaction Survey', subtitle: '450 respondents', tag: 'Survey', date: '2026-07-20', status: 'Completed', description: 'Satisfaction survey conducted across served communities to assess service quality.' },
    ],
  },
  {
    id: 'records-management', name: 'Records Management', description: 'Corporate records, retention schedules, and document custody.',
    icon: Archive,
    stats: [{ label: 'Active Records', value: '4,820' }, { label: 'Due for Disposal', value: '112' }, { label: 'Digitized Records', value: '62%' }],
    records: [
      { id: 'RM-001', title: 'Records Disposal Review — CY 2018 Batch', subtitle: 'Committee review', tag: 'Disposal', date: '2026-08-11', status: 'Ongoing', description: 'Review of records eligible for disposal per the approved retention schedule for CY 2018.' },
      { id: 'RM-002', title: 'Digitization Project — HR 201 Files', subtitle: 'Phase 2', tag: 'Digitization', date: '2026-08-01', status: 'Ongoing', description: 'Second phase of the digitization project covering active employee 201 files.' },
      { id: 'RM-003', title: 'Records Retrieval Request Log', subtitle: '23 requests this month', tag: 'Retrieval', date: '2026-08-13', status: 'Active', description: 'Log of records retrieval requests processed by the Records Management unit this month.' },
    ],
  },
  {
    id: 'policies-issuances', name: 'Policies and Issuances', description: 'Drafting, review, and dissemination of institutional policies.',
    icon: FileStack,
    stats: [{ label: 'Policies Under Review', value: '5' }, { label: 'Issued This Year', value: '22' }, { label: 'Pending Board Approval', value: '2' }],
    records: [
      { id: 'PI-001', title: 'Revised Employee Handbook 2026', subtitle: 'Management review stage', tag: 'Policy Draft', date: '2026-08-12', status: 'Ongoing', description: 'Comprehensive revision of the employee handbook, currently under management committee review.' },
      { id: 'PI-002', title: 'Flexible Work Arrangement Guidelines', subtitle: 'Issued', tag: 'Issuance', date: '2026-08-13', status: 'Completed', description: 'New guidelines on flexible work arrangements issued to all departments.' },
      { id: 'PI-003', title: 'Data Privacy Manual — Annual Review', subtitle: 'Scheduled review', tag: 'Policy Review', date: '2026-09-15', status: 'Scheduled', description: 'Annual scheduled review of the Data Privacy Manual for regulatory alignment.' },
    ],
  },
  {
    id: 'events-management', name: 'Events Management', description: 'Corporate events, seminars, and institutional activities.',
    icon: CalendarRange,
    stats: [{ label: 'Events This Quarter', value: '9' }, { label: 'Upcoming Events', value: '4' }, { label: 'Avg. Attendance Rate', value: '88%' }],
    records: [
      { id: 'EVM-001', title: 'Employee Orientation Program', subtitle: 'Training Hall', tag: 'Orientation', date: '2026-08-16', status: 'Scheduled', description: 'Orientation program for newly hired employees covering policies and benefits.' },
      { id: 'EVM-002', title: 'BENECO Foundation Anniversary Program', subtitle: 'Main Office grounds', tag: 'Corporate Event', date: '2026-09-20', status: 'Scheduled', description: 'Annual foundation anniversary celebration program for all employees and guests.' },
      { id: 'EVM-003', title: 'Safety Awareness Seminar', subtitle: 'Training Hall', tag: 'Seminar', date: '2026-08-20', status: 'Scheduled', description: 'Annual safety awareness seminar for field and plant personnel.' },
    ],
  },
];

export const WORKSPACE_ICON: Record<string, typeof Users> = {
  governance: LayoutGrid,
};

export function findModule(id: string) {
  return ISD_MODULES.find((m) => m.id === id);
}
