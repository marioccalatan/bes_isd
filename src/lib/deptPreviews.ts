import type { DepartmentId } from './types';
import type { WorkspaceRecord } from './workspace';

export interface DeptPreview {
  deptId: DepartmentId;
  modules: string[];
  kpis: { label: string; value: string }[];
  activities: { title: string; date: string; detail: string }[];
  workQueue: WorkspaceRecord[];
}

export const DEPT_PREVIEWS: DeptPreview[] = [
  {
    deptId: 'NSD',
    modules: ['Network Operations', 'Work Orders', 'Maintenance Planning', 'Outage Management', 'Service Restoration', 'Crew Deployment', 'Substation & Line Records', 'Safety Inspections', 'Materials Requests', 'Technical Projects'],
    kpis: [{ label: 'Active Work Orders', value: '46' }, { label: 'Avg. Restoration Time', value: '2.4 hrs' }, { label: 'Crews Deployed Today', value: '9' }, { label: 'SAIDI (YTD)', value: '3.1 hrs' }],
    activities: [
      { title: 'Line patrol completed — Feeder 3, District 2', date: '2026-08-13', detail: 'Routine line patrol identified two leaning poles for corrective maintenance.' },
      { title: 'Emergency crew dispatched — Barangay Trancoville', date: '2026-08-12', detail: 'Downed line reported due to fallen tree branch; crew dispatched within 20 minutes.' },
      { title: 'Substation 3 preventive maintenance scheduled', date: '2026-08-19', detail: 'Scheduled maintenance to include transformer inspection and relay testing.' },
    ],
    workQueue: [
      { id: 'NSD-WO-001', title: 'Work Order — Pole Replacement, Km 4 Marcos Highway', subtitle: 'Priority: High', tag: 'Work Order', date: '2026-08-15', status: 'Pending', description: 'Replacement of a structurally compromised utility pole flagged during routine inspection.' },
      { id: 'NSD-WO-002', title: 'Outage Report — Transformer Overload, Barangay Irisan', subtitle: 'Under investigation', tag: 'Outage', date: '2026-08-13', status: 'Ongoing', description: 'Reported intermittent outage possibly due to transformer overload during peak hours.' },
      { id: 'NSD-WO-003', title: 'Materials Request — Crossarms and Insulators', subtitle: 'For Substation 3 maintenance', tag: 'Materials', date: '2026-08-11', status: 'Pending', description: 'Materials request in support of the scheduled Substation 3 preventive maintenance activity.' },
      { id: 'NSD-WO-004', title: 'Safety Inspection — District 1 Line Crew', subtitle: 'Quarterly inspection', tag: 'Safety', date: '2026-08-05', status: 'Completed', description: 'Quarterly safety inspection of PPE compliance and work procedures for the District 1 line crew.' },
    ],
  },
  {
    deptId: 'NNSD',
    modules: ['Finance and Accounting', 'Budget', 'Billing and Collection', 'Treasury', 'Procurement', 'Warehousing and Inventory', 'Property and Assets', 'Fleet Management', 'General Services'],
    kpis: [{ label: 'Collection Efficiency', value: '96.2%' }, { label: 'Open Procurement Requests', value: '8' }, { label: 'Fleet Availability', value: '92%' }, { label: 'Inventory Turnover (YTD)', value: '4.1x' }],
    activities: [
      { title: 'Monthly billing run completed', date: '2026-08-10', detail: 'Billing statements generated and released for all member-consumers for the current cycle.' },
      { title: 'Bid opening — Substation equipment supply', date: '2026-08-09', detail: 'Bid opening conducted by the BAC for the substation equipment supply contract.' },
      { title: 'Fleet vehicle preventive maintenance completed', date: '2026-08-06', detail: 'Scheduled preventive maintenance completed for 6 service vehicles.' },
    ],
    workQueue: [
      { id: 'NNSD-FIN-001', title: 'Payment Request — Substation Equipment Supplier', subtitle: 'PHP 1,850,000.00', tag: 'Payment', date: '2026-08-12', status: 'Pending', description: 'Payment request for delivered substation equipment per approved purchase order.' },
      { id: 'NNSD-FIN-002', title: 'Budget Realignment Request — NSD Materials', subtitle: 'PHP 320,000.00', tag: 'Budget', date: '2026-08-11', status: 'Ongoing', description: 'Budget realignment request to cover additional line materials for emergency repairs.' },
      { id: 'NNSD-FIN-003', title: 'Warehouse Stock Count — Q3', subtitle: 'Main warehouse', tag: 'Inventory', date: '2026-08-01', status: 'Completed', description: 'Quarterly physical stock count and reconciliation of the main warehouse inventory.' },
      { id: 'NNSD-FIN-004', title: 'Vehicle Request — Site Visit, Barangay Ambiong', subtitle: 'ISD Community Programs', tag: 'Fleet', date: '2026-08-14', status: 'Pending', description: 'Service vehicle request supporting the ISD community electrification site visit.' },
    ],
  },
  {
    deptId: 'AUD',
    modules: ['Annual Audit Plan', 'Audit Engagements', 'Findings and Recommendations', 'Management Responses', 'Corrective Action Monitoring', 'Risk-Based Audit Universe'],
    kpis: [{ label: 'Engagements This Year', value: '11' }, { label: 'Open Findings', value: '7' }, { label: 'Overdue Corrective Actions', value: '2' }, { label: 'Audit Plan Completion', value: '58%' }],
    activities: [
      { title: 'Exit conference conducted — NNSD Procurement Audit', date: '2026-08-01', detail: 'Exit conference conducted with NNSD management to discuss preliminary audit findings.' },
      { title: 'Risk assessment updated — CY 2027 Audit Universe', date: '2026-07-28', detail: 'Annual update of the risk-based audit universe used for CY 2027 audit planning.' },
    ],
    workQueue: [
      { id: 'AUD-ENG-001', title: 'Audit Engagement — Procurement Process Review, NNSD', subtitle: 'Fieldwork stage', tag: 'Engagement', date: '2026-08-01', status: 'Ongoing', description: 'Risk-based audit engagement covering the procurement process of the Non-Network Services Department.', restricted: true },
      { id: 'AUD-ENG-002', title: 'Finding — Delayed Reconciliation of Petty Cash Fund', subtitle: 'Management response pending', tag: 'Finding', date: '2026-07-15', status: 'Pending', description: 'Audit finding on delayed monthly reconciliation of the petty cash fund in a field office.', restricted: true },
      { id: 'AUD-ENG-003', title: 'Corrective Action Monitoring — Warehouse Access Controls', subtitle: 'Due 2026-09-30', tag: 'Corrective Action', date: '2026-08-10', status: 'Ongoing', description: 'Monitoring of management\'s corrective action plan on warehouse physical access controls.', restricted: true },
      { id: 'AUD-ENG-004', title: 'Annual Audit Plan CY 2026 — Board Approved', subtitle: 'Approved by the Board of Directors', tag: 'Audit Plan', date: '2026-01-15', status: 'Completed', description: 'The annual risk-based audit plan for CY 2026 as approved by the Board of Directors.' },
    ],
  },
  {
    deptId: 'CPD',
    modules: ['Strategic Plan', 'Corporate Targets', 'Department Commitments', 'Key Performance Indicators', 'Project Monitoring', 'Risk Register', 'Management Reports', 'Regulatory Submissions', 'Research and Policy Studies'],
    kpis: [{ label: 'Strategic Initiatives On Track', value: '7 / 10' }, { label: 'KPI Attainment (YTD)', value: '82%' }, { label: 'Open Risk Items', value: '5' }, { label: 'Regulatory Deadlines This Month', value: '2' }],
    activities: [
      { title: 'Quarterly KPI review conducted with Management Committee', date: '2026-08-09', detail: 'Presented Q2 corporate KPI attainment and department commitments to the Management Committee.' },
      { title: 'ERC quarterly report drafted', date: '2026-08-08', detail: 'Drafted the quarterly regulatory report for submission to the Energy Regulatory Commission.' },
    ],
    workQueue: [
      { id: 'CPD-PRJ-001', title: 'Project Monitoring — Hydro Facility Rehabilitation', subtitle: '70% complete', tag: 'Project', date: '2026-08-05', status: 'Ongoing', description: 'Quarterly project monitoring update for the hydro facility rehabilitation initiative.' },
      { id: 'CPD-PRJ-002', title: 'Risk Register Update — Cybersecurity Exposure', subtitle: 'High impact, medium likelihood', tag: 'Risk Register', date: '2026-08-04', status: 'Pending', description: 'Enterprise risk register update flagging increased cybersecurity exposure from digital initiatives.' },
      { id: 'CPD-PRJ-003', title: 'Regulatory Submission — ERC Quarterly Report', subtitle: 'Due 2026-08-26', tag: 'Regulatory', date: '2026-08-08', status: 'Pending', description: 'Quarterly regulatory compliance report due for submission to the Energy Regulatory Commission.' },
      { id: 'CPD-PRJ-004', title: 'Research Study — Rural Electrification Impact Assessment', subtitle: 'Draft under review', tag: 'Research', date: '2026-07-30', status: 'Ongoing', description: 'Policy research study assessing the socioeconomic impact of recent rural electrification projects.' },
    ],
  },
  {
    deptId: 'PGD',
    modules: ['Generation Operations', 'Production Monitoring', 'Facility Performance', 'Maintenance Schedule', 'Equipment Records', 'Incident Reporting', 'Safety and Environmental Compliance', 'Generation Projects', 'Regulatory Submissions'],
    kpis: [{ label: 'Plant Availability', value: '97.4%' }, { label: 'Generation Output (MTD)', value: '4.2 GWh' }, { label: 'Open Incident Reports', value: '1' }, { label: 'Preventive Maintenance Compliance', value: '94%' }],
    activities: [
      { title: 'Daily generation output logged', date: '2026-08-14', detail: 'Hydro facility daily output logged at 138 MWh, within normal seasonal range.' },
      { title: 'Turbine inspection completed — Unit 2', date: '2026-08-11', detail: 'Scheduled inspection of Unit 2 turbine completed with no major findings.' },
    ],
    workQueue: [
      { id: 'PGD-GEN-001', title: 'Maintenance Schedule — Unit 1 Overhaul', subtitle: 'Scheduled Q4 2026', tag: 'Maintenance', date: '2026-08-01', status: 'Scheduled', description: 'Major overhaul of Unit 1 scheduled for the fourth quarter to maintain generation reliability.' },
      { id: 'PGD-GEN-002', title: 'Incident Report — Minor Oil Leak, Unit 2', subtitle: 'Contained, under review', tag: 'Incident', date: '2026-08-07', status: 'Ongoing', description: 'Minor oil leak detected and contained during routine inspection; root cause analysis ongoing.' },
      { id: 'PGD-GEN-003', title: 'Environmental Compliance Monitoring Report', subtitle: 'Q3 submission', tag: 'Compliance', date: '2026-08-13', status: 'Pending', description: 'Quarterly environmental compliance monitoring report for regulatory submission.' },
      { id: 'PGD-GEN-004', title: 'Solar-Diesel Hybrid Feasibility Study', subtitle: '15% complete', tag: 'Generation Project', date: '2026-07-20', status: 'Ongoing', description: 'Feasibility study for a proposed solar-diesel hybrid generation facility.' },
    ],
  },
];

export function findDeptPreview(deptId: string) {
  return DEPT_PREVIEWS.find((p) => p.deptId === deptId);
}
