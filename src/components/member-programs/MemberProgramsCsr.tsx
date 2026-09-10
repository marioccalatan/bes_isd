import { useEffect, useMemo, useState, type ClipboardEvent, type MouseEvent, type ReactNode } from 'react';
import { BarChart3, BookOpen, Check, ChevronLeft, ChevronRight, File, Plus, Printer, Settings, Trash2, Upload, X } from 'lucide-react';
import benecoLogo from '@/assets/brand/beneco-logo.png';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Toolbar } from '@/components/shared/Toolbar';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { addCsrProjectEvent, createCsrSector, deleteCsrAttachment, deleteCsrBudgetAllocation, deleteCsrRequest, downloadCsrAttachment, fetchBarangayLocations, fetchCsrAttachments, fetchCsrBudgetAllocations, fetchCsrProjectEvents, fetchCsrRequests, fetchCsrSectors, fetchUserDirectory, saveCsrBudgetAllocation, saveCsrRequest, uploadCsrAttachment, type BarangayLocation, type CsrAttachment, type CsrBudgetAllocation, type CsrProjectEvent, type CsrRequest, type DirectoryUser, type MemberProgramInput } from '@/lib/api';

const PROGRAM_TYPES = ['Environmental Sustainability Program', 'Livelihood Program', 'Skills Training Program', 'Pailaw sa Paaralan', 'Reforestation Program', 'NGO Partnership for Social Cause', 'Other Projects', 'Linkages'];
const COMMUNITY_RELATIONS_PROGRAM_TYPE = 'Linkages';
const COMMUNITY_RELATIONS_PROGRAM_TYPES = ['Partnership', 'Linkages', 'Networking'];
const CSR_BUDGET_DISTRICTS = ['INSTITUTIONAL'];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const emptyForm: Omit<CsrRequest, 'id' | 'updatedAt'> = { dateRequested: new Date().toISOString().slice(0, 10), programType: PROGRAM_TYPES[0], requestee: '', designation: '', organization: '', registrationDetails: '', sector: '', location: '', barangay: '', municipality: '', district: '', projectDetails: '', projectRequirement: '', pendingReason: '', withLetterReply: false, institutional: false, additionalRemarks: '', status: 'For evaluation', approvalStatus: 'For Evaluation', evaluationResult: [], evaluatedBy: '', dateApproved: '', amountFunding: '', pjrs: '', actualProjectCost: '' };

type MemberProgramsCsrProps = { onCountChange?: (count: number) => void; onAddToPrograms?: (program: MemberProgramInput) => void; programType?: string; title?: string; description?: string; requestLabel?: string };
type CsrReportFormat = 'date' | 'district' | 'municipality' | 'programType' | 'evaluationType';

const CSR_REPORT_FORMAT_LABELS: Record<CsrReportFormat, string> = {
  date: 'Sorted by Date',
  district: 'Grouped by District',
  municipality: 'Grouped by Municipality',
  programType: 'Grouped by Program Type',
  evaluationType: 'Grouped by Evaluation Type',
};

export function MemberProgramsCsr({ onCountChange, onAddToPrograms, programType, title = 'Corporate Social Responsibility', description = 'CSR requests, policy evaluation, project requirements, and funding.', requestLabel = 'CSR Request' }: MemberProgramsCsrProps) {
  const { token } = useAuth(); const { toast } = useToast();
  const [requests, setRequests] = useState<CsrRequest[]>([]); const [locations, setLocations] = useState<BarangayLocation[]>([]); const [sectors, setSectors] = useState<string[]>([]); const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof CsrRequest>('dateRequested'); const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc'); const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<CsrRequest | null>(null); const [open, setOpen] = useState(false); const [eventsOpen, setEventsOpen] = useState(false); const [sectorOpen, setSectorOpen] = useState(false); const [form, setForm] = useState(emptyForm); const [saving, setSaving] = useState(false); const [deleteOpen, setDeleteOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false); const [printDetails, setPrintDetails] = useState({ evaluatedName: '', evaluatedDesignation: 'Community Relations Officer', recommendingName: 'MARIO C. CALATAN', recommendingDesignation: 'OIC-ISD MANAGER' });
  const [reportPrintOpen, setReportPrintOpen] = useState(false); const [reportFormat, setReportFormat] = useState<CsrReportFormat>('date'); const [reportDateFrom, setReportDateFrom] = useState(''); const [reportDateTo, setReportDateTo] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [attachments, setAttachments] = useState<CsrAttachment[]>([]); const [pendingFiles, setPendingFiles] = useState<File[]>([]); const [attachmentDragging, setAttachmentDragging] = useState(false);
  const [evaluatorSuggestions, setEvaluatorSuggestions] = useState<DirectoryUser[]>([]);
  const [hoveredCsr, setHoveredCsr] = useState<CsrRequest | null>(null); const [showDetailsOnHover, setShowDetailsOnHover] = useState(true); const [csrContextMenu, setCsrContextMenu] = useState<{ item: CsrRequest; x: number; y: number } | null>(null);
  async function load() { if (!token) return; try { const [csrRequests, barangayLocations, csrSectors] = await Promise.all([fetchCsrRequests(token), fetchBarangayLocations(token), fetchCsrSectors(token)]); const scopedRequests = programType === COMMUNITY_RELATIONS_PROGRAM_TYPE ? csrRequests.filter((item) => COMMUNITY_RELATIONS_PROGRAM_TYPES.includes(item.programType)) : programType ? csrRequests.filter((item) => item.programType === programType) : csrRequests.filter((item) => !COMMUNITY_RELATIONS_PROGRAM_TYPES.includes(item.programType)); setRequests(scopedRequests); onCountChange?.(scopedRequests.length); setLocations(barangayLocations); setSectors(csrSectors); } catch (error) { toast({ kind: 'error', title: `Unable to load ${requestLabel.toLowerCase()} records`, description: error instanceof Error ? error.message : 'Please try again.' }); } }
  useEffect(() => { void load(); }, [token, programType]);
  useEffect(() => { if (!open || !token) return; fetchUserDirectory(token).then((users) => setEvaluatorSuggestions(users.filter((directoryUser) => directoryUser.unitName?.trim().toLowerCase() === 'community relations office'))).catch(() => setEvaluatorSuggestions([])); }, [open, token]);
  useEffect(() => { if (!csrContextMenu) return; const close = () => setCsrContextMenu(null); window.addEventListener('click', close); window.addEventListener('scroll', close, true); return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); }; }, [csrContextMenu]);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = requests.filter((item) => {
      if (query && !Object.values(item).some((value) => String(value ?? '').toLowerCase().includes(query))) return false;
      return Object.entries(columnFilters).every(([column, filter]) => {
        if (!filter.trim()) return true;
        const value = String(item[column as keyof CsrRequest] ?? '').toLowerCase();
        const expected = filter.trim().toLowerCase();
        if (['district', 'municipality'].includes(column) && expected === '__unspecified__') return !value.trim();
        return ['programType', 'district', 'municipality'].includes(column) ? value === expected : value.includes(expected);
      });
    });
    return [...filtered].sort((a, b) => {
      const left = a[sortKey] ?? ''; const right = b[sortKey] ?? '';
      const comparison = ['amountFunding', 'actualProjectCost'].includes(sortKey) ? (Number(left) || 0) - (Number(right) || 0) : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [columnFilters, requests, search, sortDir, sortKey]);
  const programTypeOptions = useMemo(() => programType === COMMUNITY_RELATIONS_PROGRAM_TYPE ? COMMUNITY_RELATIONS_PROGRAM_TYPES : programType ? [programType] : [...new Set([...PROGRAM_TYPES.filter((value) => value !== COMMUNITY_RELATIONS_PROGRAM_TYPE), ...requests.map((item) => item.programType).filter(Boolean)])].sort((a, b) => a.localeCompare(b)), [programType, requests]);
  const formProgramTypes = programType === COMMUNITY_RELATIONS_PROGRAM_TYPE ? COMMUNITY_RELATIONS_PROGRAM_TYPES : programType ? [programType] : PROGRAM_TYPES.filter((value) => value !== COMMUNITY_RELATIONS_PROGRAM_TYPE);
  const districtOptions = useMemo(() => [{ label: 'Unspecified', value: '__unspecified__' }, ...[...new Set(requests.map((item) => item.district).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))], [requests]);
  const municipalityFilterOptions = useMemo(() => [{ label: 'Unspecified', value: '__unspecified__' }, ...[...new Set([...locations.map((item) => item.municipality), ...requests.map((item) => item.municipality)].filter(Boolean))].sort((a, b) => a.localeCompare(b))], [locations, requests]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, rows]);
  useEffect(() => { setPage(1); }, [columnFilters, search]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  function sortBy(key: string) {
    const nextKey = key as keyof CsrRequest;
    if (sortKey === nextKey) {
      setSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(nextKey);
      setSortDir('asc');
    }
    setPage(1);
  }
  const municipalities = useMemo(() => [...new Set(locations.map((item) => item.municipality))].sort((a, b) => a.localeCompare(b)), [locations]);
  const barangays = useMemo(() => locations.filter((item) => item.municipality === form.municipality).sort((a, b) => a.barangay.localeCompare(b.barangay)), [locations, form.municipality]);
  function add() { setEditing(null); setForm({ ...emptyForm, programType: programType === COMMUNITY_RELATIONS_PROGRAM_TYPE ? COMMUNITY_RELATIONS_PROGRAM_TYPES[0] : programType ?? emptyForm.programType }); setAttachments([]); setPendingFiles([]); setOpen(true); }
  function edit(item: CsrRequest) { setEditing(item); const { id: _id, updatedAt: _updatedAt, ...values } = item; const evaluated = item.status === 'Completed' && item.evaluationResult.length > 0; setForm({ ...values, evaluationResult: evaluated ? item.evaluationResult : [], approvalStatus: evaluated ? item.approvalStatus : 'For Evaluation', dateApproved: evaluated ? item.dateApproved : '' }); setPendingFiles([]); setAttachments([]); if (token) void fetchCsrAttachments(token, item.id).then(setAttachments).catch((error) => toast({ kind: 'error', title: 'Attachments not loaded', description: error instanceof Error ? error.message : 'Please try again.' })); setOpen(true); }
  async function save() { if (!token || !form.dateRequested || !form.programType || !form.requestee.trim() || (form.evaluationResult.length > 0 && form.approvalStatus === 'For Evaluation')) return; setSaving(true); try { const result = await saveCsrRequest(token, form, editing?.id); const csrId = editing?.id || result.id; if (csrId) for (const file of pendingFiles) await uploadCsrAttachment(token, csrId, file); await load(); setPendingFiles([]); setOpen(false); toast({ kind: 'success', title: editing ? `${requestLabel} updated` : `${requestLabel} added` }); } catch (error) { toast({ kind: 'error', title: `${requestLabel} was not saved`, description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSaving(false); } }
  function addAttachmentFiles(files: FileList | File[]) { const incoming = Array.from(files).filter((file) => file.size <= 15_000_000); if (incoming.length < files.length) toast({ kind: 'error', title: 'Some files were skipped', description: 'Each attachment must be 15 MB or smaller.' }); setPendingFiles((current) => [...current, ...incoming.filter((file) => !current.some((item) => item.name === file.name && item.size === file.size))]); }
  function pasteAttachmentImages(event: ClipboardEvent) { const images = Array.from(event.clipboardData.items).filter((item) => item.kind === 'file' && item.type.startsWith('image/')).map((item, index) => { const source = item.getAsFile(); if (!source) return null; const extension = source.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'; return new globalThis.File([source], `pasted-image-${Date.now()}-${index + 1}.${extension}`, { type: source.type, lastModified: Date.now() }); }).filter((file): file is globalThis.File => Boolean(file)); if (!images.length) return; event.preventDefault(); addAttachmentFiles(images); }
  async function removeAttachment(attachment: CsrAttachment) { if (!token || !editing) return; try { await deleteCsrAttachment(token, editing.id, attachment.id); setAttachments((current) => current.filter((item) => item.id !== attachment.id)); } catch (error) { toast({ kind: 'error', title: 'Attachment was not deleted', description: error instanceof Error ? error.message : 'Please try again.' }); } }
  async function remove() { if (!token || !editing) return; setSaving(true); try { await deleteCsrRequest(token, editing.id); await load(); setDeleteOpen(false); setOpen(false); toast({ kind: 'success', title: 'CSR request deleted' }); } catch (error) { toast({ kind: 'error', title: 'CSR request was not deleted', description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSaving(false); } }
  function reportGroupValue(item: CsrRequest, format: CsrReportFormat) {
    if (format === 'district') return item.district || 'Unspecified District';
    if (format === 'municipality') return item.municipality || 'Unspecified Municipality';
    if (format === 'programType') return item.programType || 'Unspecified Program Type';
    if (format === 'evaluationType') return item.evaluationResult.length ? item.evaluationResult.join(', ') : 'Not Evaluated';
    return item.dateRequested || 'No Date';
  }
  function openCsrContextMenu(item: CsrRequest, event: MouseEvent) { event.preventDefault(); setCsrContextMenu({ item, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 70) }); }
  async function copyCsrDetails(item: CsrRequest) {
    const text = formatCsrDetails(item);
    try {
      await navigator.clipboard.writeText(text);
      toast({ kind: 'success', title: 'CSR details copied' });
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast({ kind: 'success', title: 'CSR details copied' });
    }
    setCsrContextMenu(null);
  }
  function addCsrToPrograms(item: CsrRequest) {
    const scheduleDate = item.dateRequested || new Date().toISOString().slice(0, 10);
    setCsrContextMenu(null);
    onAddToPrograms?.({
      parentId: null,
      name: item.programType,
      activity: '',
      description: item.projectDetails,
      address: item.location,
      municipality: item.municipality,
      barangay: item.barangay,
      district: item.district,
      startDate: scheduleDate,
      endDate: scheduleDate,
      status: 'Planned',
    });
  }
  function sortedReportRows(format: CsrReportFormat, dateFrom = '', dateTo = '') {
    return rows.filter((item) => (!dateFrom || item.dateRequested >= dateFrom) && (!dateTo || item.dateRequested <= dateTo)).sort((a, b) => {
      if (format !== 'date') {
        const groupComparison = reportGroupValue(a, format).localeCompare(reportGroupValue(b, format), undefined, { numeric: true, sensitivity: 'base' });
        if (groupComparison !== 0) return groupComparison;
      }
      const dateComparison = String(b.dateRequested || '').localeCompare(String(a.dateRequested || ''), undefined, { numeric: true });
      if (dateComparison !== 0) return dateComparison;
      return String(a.requestee || '').localeCompare(String(b.requestee || ''), undefined, { sensitivity: 'base' });
    });
  }
  function reportTable(items: CsrRequest[], format: CsrReportFormat = 'date') { const headers = ['Item No.','Date Requested','Program Type','Requestee','Organization','Sector','Municipality','Barangay','District','Evaluation Status','Pending Reason','Evaluation Result','Approval Status','With Letter Reply','Institutional','Date Approved/Disapproved','Amount Funding','Actual Project Cost','Additional Remarks']; let currentGroup = ''; const grouped = format !== 'date'; const groupPrefix = CSR_REPORT_FORMAT_LABELS[format].replace('Grouped by ', ''); const body = items.map((item, index) => { const group = reportGroupValue(item, format); const groupRow = grouped && group !== currentGroup ? `<tr class="group-row"><td colspan="${headers.length}">${escapeHtml(groupPrefix)}: ${escapeHtml(group)}</td></tr>` : ''; if (grouped) currentGroup = group; return `${groupRow}<tr>${[index + 1,item.dateRequested,item.programType,item.requestee,item.organization,item.sector,item.municipality,item.barangay,item.district,item.status,item.pendingReason,item.evaluationResult.length ? item.evaluationResult.join(', ') : 'Not Evaluated',item.approvalStatus,item.withLetterReply ? 'Yes' : 'No',item.institutional ? 'Yes' : 'No',item.dateApproved,item.amountFunding ? Number(item.amountFunding).toLocaleString('en-PH',{ style:'currency',currency:'PHP' }) : '',item.actualProjectCost ? Number(item.actualProjectCost).toLocaleString('en-PH',{ style:'currency',currency:'PHP' }) : '',item.additionalRemarks].map((value) => `<td>${escapeHtml(String(value || '—'))}</td>`).join('')}</tr>`; }).join(''); return `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`; }
  function printEvaluationForm() {
    const popup = window.open('', '_blank', 'width=900,height=1100'); if (!popup) return;
    const value = (text: unknown) => escapeHtml(String(text || '—'));
    const checked = (condition: boolean) => condition ? '☒' : '☐';
    const formattedDate = form.dateRequested ? new Date(`${form.dateRequested}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
    const funding = form.amountFunding ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(form.amountFunding)) : '—';
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><title>CSR Program Evaluation Form</title><style>@page{size:letter;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:Arial,sans-serif;font-size:11px}.sheet{max-width:190mm;margin:auto}.header{display:grid;grid-template-columns:72px 1fr 210px;border:1.5px solid #111}.logo{grid-column:1;grid-row:1/5;display:flex;align-items:center;justify-content:center;border-right:1px solid #111}.logo img{width:58px;height:58px;object-fit:contain}.head-title{grid-column:2;grid-row:1;display:flex;align-items:center;justify-content:center;border-right:1px solid #111;border-bottom:1px solid #111;font-weight:700}.head-title.main{grid-column:2;grid-row:2/5;font-size:15px;text-align:center}.meta{grid-column:3;display:grid;grid-template-columns:105px 1fr;border-bottom:1px solid #111}.meta.doc{grid-row:1}.meta.revision{grid-row:2}.meta.effective{grid-row:3}.meta.page{grid-row:4}.meta.page,.head-title.main{border-bottom:0}.meta b,.meta span{padding:4px 6px}.meta b{border-right:1px solid #111}.date{text-align:right;margin:10px 0 7px}.section-title{margin:9px 0 4px;font-weight:700}.fields{width:100%;border-collapse:collapse}.fields td{border:1px solid #111;padding:5px 7px}.fields td:first-child{width:34%;font-weight:700}.focus{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;padding:3px 4px}.line{margin:5px 0;white-space:pre-wrap}.box{min-height:48px;border:1px solid #111;padding:7px;white-space:pre-wrap}.checks{display:grid;gap:5px;padding:3px 4px}.signatures{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #111;margin-top:11px}.signature{min-height:92px;padding:6px;text-align:center;border-right:1px solid #111}.signature:last-child{border-right:0}.signature .role{font-weight:700;text-align:left;min-height:40px}.signature .name{font-weight:700;margin-top:15px}.note{margin-top:8px;font-size:9px;line-height:1.35}.actions{margin:12px 0;text-align:right}.actions button{padding:8px 14px;border:0;border-radius:5px;background:#047857;color:white;font-weight:700;cursor:pointer}@media print{.actions{display:none}}</style></head><body><div class="sheet"><div class="actions"><button onclick="window.print()">Print</button></div><div class="header"><div class="logo"><img src="${benecoLogo}" alt="BENECO"></div><div class="head-title">ISD FORM</div><div class="meta doc"><b>Doc. No.:</b><span></span></div><div class="head-title main">CSR PROGRAM EVALUATION FORM</div><div class="meta revision"><b>Revision No.:</b><span>00</span></div><div class="meta effective"><b>Effective Date:</b><span>January 23, 2026</span></div><div class="meta page"><b>Page:</b><span>Page 1 of 1</span></div></div><div class="date"><b>Date:</b> ${value(formattedDate)}</div><table class="fields"><tr><td>Name / Requestee</td><td>${value(form.requestee)}</td></tr><tr><td>Designation</td><td>${value(form.designation)}</td></tr><tr><td>Name of Organization</td><td>${value(form.organization)}</td></tr><tr><td>Registration Details</td><td>${value(form.registrationDetails)}</td></tr><tr><td>Sector</td><td>${value(form.sector)}</td></tr><tr><td>BENECO Membership Details</td><td>${value([form.municipality, form.barangay, form.district].filter(Boolean).join(', '))}</td></tr></table><div class="section-title">Area of Focus of the Proposed CSR Program:</div><div class="focus">${PROGRAM_TYPES.map((type) => `<div>${checked(form.programType === type)} ${value(type)}</div>`).join('')}</div><div class="section-title">Project Details:</div><div class="box">${value(form.projectDetails)}</div><div class="section-title">Project Requirement:</div><div class="box">${value(form.projectRequirement)}</div><div class="section-title">Supporting Documents</div><div class="checks"><div>☐ Project Proposal / Request</div><div>☐ Project Costing</div><div>☐ Others: ________________________________</div></div><div class="section-title">Evaluation Result:</div><div class="checks"><div>${checked(form.evaluationResult.includes('Within CSR Policy'))} Within CSR Policy</div><div>${checked(form.evaluationResult.includes('Not Within CSR Policy'))} Not Within CSR Policy</div><div>${checked(form.evaluationResult.length === 0)} Not Evaluated</div></div><div class="line"><b>Recommended Funding for the Project:</b> ${value(funding)}</div><div class="line"><b>Evaluation Status:</b> ${value(form.status)} &nbsp;&nbsp; <b>Approval Status:</b> ${value(form.approvalStatus)} &nbsp;&nbsp; <b>Date Approved/Disapproved:</b> ${value(form.dateApproved)}</div><div class="signatures"><div class="signature"><div class="role">Evaluated by:</div><div class="name">${value(printDetails.evaluatedName)}</div><div>${value(printDetails.evaluatedDesignation)}</div></div><div class="signature"><div class="role">Recommending Approval/Disapproval:</div><div class="name">${value(printDetails.recommendingName)}</div><div>${value(printDetails.recommendingDesignation)}</div></div><div class="signature"><div class="role">Approved/Disapproved:</div><div class="name">MELCHOR S. LICOBEN</div><div>GENERAL MANAGER</div></div></div><div class="note"><b>Note:</b> Memorandum of Agreement between BENECO and the Beneficiary will be required for approved Livelihood Programs and Partnership with NGOs for Social Cause.</div></div></body></html>`);
    popup.document.close();
    const projectRequirementTitle = Array.from(popup.document.querySelectorAll<HTMLElement>('.section-title')).find((element) => element.textContent?.trim() === 'Project Requirement:');
    let reportAnchor = projectRequirementTitle?.nextElementSibling;
    const supplementalFields: Array<[string, string]> = [
      ...(form.status === 'Pending' ? [['Pending Reason:', form.pendingReason] as [string, string]] : []),
      ['Additional Remarks:', form.additionalRemarks],
    ];
    supplementalFields.forEach(([label, content]) => {
      if (!reportAnchor) return;
      const title = popup.document.createElement('div');
      title.className = 'section-title';
      title.textContent = label;
      const box = popup.document.createElement('div');
      box.className = 'box';
      box.textContent = content || '—';
      reportAnchor.after(title, box);
      reportAnchor = box;
    });
    popup.focus(); setTimeout(() => popup.print(), 300);
  }
  function printReport(format: CsrReportFormat = reportFormat, dateFrom = reportDateFrom, dateTo = reportDateTo) { const reportRows = sortedReportRows(format, dateFrom, dateTo); const dateRangeLabel = dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : dateFrom ? `From ${dateFrom}` : dateTo ? `Through ${dateTo}` : 'All dates'; const popup = window.open('', '_blank', 'width=1400,height=900'); if (!popup) return; popup.opener = null; popup.document.write(`<!doctype html><html><head><title>CSR Requests Report</title><style>@page{size:landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#111}.report-header{display:flex;align-items:center;gap:14px;margin-bottom:14px}.report-logo{height:62px;width:62px;object-fit:contain}.report-title h1{margin:0 0 4px;font-size:26px}.report-title p{margin:0;color:#555}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #999;padding:6px;text-align:left;vertical-align:top}th{background:#dfeee5}.group-row td{background:#eef7f1;font-weight:700;font-size:10px}</style></head><body><header class="report-header"><img class="report-logo" src="${benecoLogo}" alt="BENECO logo"><div class="report-title"><h1>BENECO Corporate Social Responsibility Report</h1><p>Generated ${escapeHtml(new Date().toLocaleString('en-PH'))} · ${reportRows.length} request(s) · ${escapeHtml(CSR_REPORT_FORMAT_LABELS[format])} · ${escapeHtml(dateRangeLabel)}</p></div></header>${reportTable(reportRows, format)}</body></html>`); popup.document.close(); popup.focus(); popup.print(); }
  function exportExcel() { const workbook = `<html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:6px}th{background:#dfeee5}</style></head><body><h2>BENECO Corporate Social Responsibility Report</h2>${reportTable(rows)}</body></html>`; const url = URL.createObjectURL(new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `csr-requests-${new Date().toISOString().slice(0,10)}.xls`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function openSummary() { const query = programType === COMMUNITY_RELATIONS_PROGRAM_TYPE ? '?programType=community-relations' : programType ? `?programType=${encodeURIComponent(programType)}` : ''; window.open(`/workspace/member-programs/csr-summary${query}`, '_blank', 'noopener,noreferrer'); }
  const columns: Column<CsrRequest>[] = [
    { key: 'dateRequested', header: 'Date Requested', sortable: true, filterable: true, render: (item) => item.dateRequested },
    { key: 'institutional', header: 'Institutional', className: 'text-center', sortable: true, filterable: true, filterOptions: [{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }], render: (item) => item.institutional ? <Check className="mx-auto h-5 w-5 text-emerald-500" aria-label="Institutional" /> : '—' },
    { key: 'programType', header: 'Program Type', sortable: true, filterable: true, filterOptions: programTypeOptions, render: (item) => <span className="font-medium text-slate-800">{item.programType}</span> },
    { key: 'requestee', header: 'Requestee', sortable: true, filterable: true, render: (item) => <div><p>{item.requestee}</p><p className="text-xs text-slate-500">{item.organization || item.designation || '—'}</p></div> },
    { key: 'projectDetails', header: 'Project Details', sortable: true, filterable: true, render: (item) => <span className="line-clamp-2 text-sm text-slate-700" title={item.projectDetails || undefined}>{item.projectDetails || '—'}</span> },
    { key: 'district', header: 'District', sortable: true, filterable: true, filterOptions: districtOptions, render: (item) => item.district || '—' },
    { key: 'barangay', header: 'Barangay', sortable: true, filterable: true, render: (item) => item.barangay || '—' },
    { key: 'municipality', header: 'Municipality', sortable: true, filterable: true, filterOptions: municipalityFilterOptions, render: (item) => item.municipality || '—' },
    { key: 'status', header: 'Evaluation Status', sortable: true, filterable: true, render: (item) => <Badge>{item.status}</Badge> },
    { key: 'evaluationResult', header: 'Evaluation', sortable: true, filterable: true, render: (item) => item.evaluationResult.length ? item.evaluationResult.join(', ') : 'Not Evaluated' },
    { key: 'approvalStatus', header: 'Approval Status', sortable: true, filterable: true, filterOptions: ['Approved', 'Disapproved', 'For Evaluation'], render: (item) => <Badge>{item.approvalStatus}</Badge> },
    { key: 'withLetterReply', header: 'Letter Reply', className: 'text-center', sortable: true, filterable: true, filterOptions: [{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }], render: (item) => item.withLetterReply ? <Check className="mx-auto h-5 w-5 text-emerald-500" aria-label="With letter reply" /> : '—' },
    { key: 'dateApproved', header: 'Date Approved/Disapproved', sortable: true, filterable: true, render: (item) => item.dateApproved || '—' },
    { key: 'amountFunding', header: 'Amount Funding', sortable: true, filterable: true, render: (item) => item.amountFunding ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(item.amountFunding)) : '—' },
    { key: 'actualProjectCost', header: 'Actual Project Cost', sortable: true, filterable: true, render: (item) => item.actualProjectCost ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(item.actualProjectCost)) : '—' },
  ];
  return <><Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3">
      <div><CardTitle>{title}</CardTitle><p className="mt-1 text-sm text-slate-500">{description}</p></div>
      <Button onClick={add}><Plus className="h-4 w-4" /> Add {requestLabel}</Button>
    </CardHeader>
    <CardContent>
      <Toolbar search={search} onSearchChange={setSearch} placeholder={programType ? 'Search Requests' : 'Search CSR requests…'} onExport={exportExcel} exportLabel="Export to Excel" onPrint={() => setReportPrintOpen(true)}>
        <Button variant="outline" size="sm" onClick={openSummary}><BarChart3 className="h-3.5 w-3.5" /> Summary</Button>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings className="h-3.5 w-3.5" /> Settings</Button>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600"><Checkbox checked={showDetailsOnHover} onChange={(event) => { setShowDetailsOnHover(event.target.checked); if (!event.target.checked) setHoveredCsr(null); }} />Show details on hover</label>
      </Toolbar>
      <DataTable columns={columns} rows={pagedRows} getRowId={(item) => item.id} onRowClick={edit} onRowMouseEnter={(item) => showDetailsOnHover && setHoveredCsr(item)} onRowMouseLeave={() => setHoveredCsr(null)} onRowContextMenu={openCsrContextMenu} cardTitle={(item) => item.programType} sortKey={sortKey} sortDir={sortDir} onSort={sortBy} columnFilters={columnFilters} onColumnFilterChange={(key, value) => setColumnFilters((current) => ({ ...current, [key]: value }))} minWidthPx={2050} emptyTitle={programType ? 'No requests' : 'No CSR requests'} emptyDescription={programType ? 'Add the first Linkages request.' : 'Add the first Corporate Social Responsibility request.'} />
      {rows.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><p className="text-sm text-slate-500">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} of {rows.length}</p><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-sm text-slate-500">Rows<Select className="h-9 w-20" value={String(pageSize)} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{PAGE_SIZE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="h-4 w-4" /> Previous</Button><span className="min-w-24 text-center text-sm text-slate-600">Page {page} of {pageCount}</span><Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next <ChevronRight className="h-4 w-4" /></Button></div></div>}
    </CardContent>
  </Card>
  {hoveredCsr && !open && <CsrHoverSummary request={hoveredCsr} />}
  {csrContextMenu && <div className="fixed z-[70] min-w-48 rounded-lg border border-slate-200 bg-surface p-1 shadow-xl" style={{ left: csrContextMenu.x, top: csrContextMenu.y }} onClick={(event) => event.stopPropagation()}><button type="button" className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void copyCsrDetails(csrContextMenu.item)}>Copy details</button><button type="button" className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void addCsrToPrograms(csrContextMenu.item)}>Add to Programs</button></div>}
  <Dialog open={open} onClose={() => { if (!saving) setOpen(false); }} title={editing ? 'Edit CSR Request' : 'Add CSR Request'} description="Record the request, location, policy evaluation, requirements, and funding." size="xl" footer={<div className="flex w-full items-center justify-between gap-2">{editing ? <div className="flex gap-2"><Button variant="outline" disabled={saving} onClick={() => { setPrintDetails((current) => ({ ...current, evaluatedName: form.evaluatedBy || current.evaluatedName })); setPrintOpen(true); }}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" disabled={saving} onClick={() => setEventsOpen(true)}><BookOpen className="h-4 w-4" /> Events</Button><Button variant="destructive" disabled={saving} onClick={() => setDeleteOpen(true)}>Delete</Button></div> : <span className="text-xs text-slate-500">Save the CSR request before adding project events.</span>}<div className="flex gap-2"><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving || !form.dateRequested || !form.programType || !form.requestee.trim() || (form.status === 'Pending' && !form.pendingReason.trim()) || (form.evaluationResult.length > 0 && form.approvalStatus === 'For Evaluation')} onClick={() => void save()}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add CSR Request'}</Button></div></div>}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onPaste={pasteAttachmentImages}><Field label="Date Requested" required><Input type="date" value={form.dateRequested} onChange={(e) => setForm({ ...form, dateRequested: e.target.value })} /></Field><Field label="Program Type" required><Select value={form.programType} onChange={(e) => setForm({ ...form, programType: e.target.value })}>{formProgramTypes.map((value) => <option key={value}>{value}</option>)}</Select></Field><Field label="Requestee" required><Input value={form.requestee} onChange={(e) => setForm({ ...form, requestee: e.target.value })} /></Field><Field label="Designation"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field><Field label="Organization"><Input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></Field><Field label="Registration Details"><Input value={form.registrationDetails} onChange={(e) => setForm({ ...form, registrationDetails: e.target.value })} placeholder="Registration number or details" /></Field><Field label="Sector"><Select value={form.sector} onChange={(e) => { if (e.target.value === '__create_sector__') { setSectorOpen(true); return; } setForm({ ...form, sector: e.target.value }); }}><option value="">Select sector</option>{form.sector && !sectors.includes(form.sector) ? <option value={form.sector}>{form.sector}</option> : null}{sectors.map((value) => <option key={value} value={value}>{value}</option>)}<option value="__create_sector__">+ Create Sector</option></Select></Field><Field label="Municipality"><Select value={form.municipality} onChange={(e) => setForm({ ...form, municipality: e.target.value, barangay: '', district: '' })}><option value="">Select municipality</option>{form.municipality && !municipalities.includes(form.municipality) ? <option value={form.municipality}>{form.municipality}</option> : null}{municipalities.map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field><Field label="Barangay"><Select value={form.barangay} disabled={!form.municipality} onChange={(e) => { const selected = locations.find((item) => item.municipality === form.municipality && item.barangay === e.target.value); setForm({ ...form, barangay: e.target.value, district: selected?.district ?? '' }); }}><option value="">{form.municipality ? 'Select barangay' : 'Select municipality first'}</option>{form.barangay && !barangays.some((item) => item.barangay === form.barangay) ? <option value={form.barangay}>{form.barangay}</option> : null}{barangays.map((item) => <option key={item.barangay} value={item.barangay}>{item.barangay}</option>)}</Select></Field><Field label="District"><Input value={form.district} readOnly placeholder="Filled from the selected barangay" /></Field><Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field><Field label="Evaluation Status"><Select value={form.status} onChange={(e) => { const status = e.target.value as CsrRequest['status']; setForm({ ...form, status, pendingReason: status === 'Pending' ? form.pendingReason : '', evaluationResult: status === 'Completed' ? form.evaluationResult : [], approvalStatus: status === 'Completed' && form.evaluationResult.length ? form.approvalStatus : 'For Evaluation', dateApproved: status === 'Completed' && form.evaluationResult.length ? form.dateApproved : '' }); }}>{['For evaluation','Pending','Completed'].map((value) => <option key={value}>{value}</option>)}</Select></Field>{form.status === 'Pending' && <Field label="Pending Reason" required><Textarea className="min-h-32 resize-y" value={form.pendingReason} onChange={(e) => setForm({ ...form, pendingReason: e.target.value })} placeholder="Enter reason the evaluation is pending" /></Field>}<Field label="Evaluated By"><Input list="csr-evaluator-suggestions" value={form.evaluatedBy} onChange={(e) => setForm({ ...form, evaluatedBy: e.target.value })} placeholder="Name of evaluator or evaluation committee" autoComplete="off" /><datalist id="csr-evaluator-suggestions">{evaluatorSuggestions.map((directoryUser) => <option key={directoryUser.id} value={evaluatorDisplayName(directoryUser)}>{directoryUser.position || directoryUser.unitName}</option>)}</datalist></Field><Field label="Evaluation Result">{form.status === 'Completed' ? <Select value={form.evaluationResult[0] ?? ''} onChange={(e) => { const evaluationResult = e.target.value ? [e.target.value] as CsrRequest['evaluationResult'] : []; setForm({ ...form, evaluationResult, approvalStatus: evaluationResult.length ? (form.approvalStatus === 'For Evaluation' ? 'Approved' : form.approvalStatus) : 'For Evaluation', dateApproved: evaluationResult.length ? form.dateApproved : '' }); }} aria-label="Select evaluation result"><option value="">Select evaluation result</option><option>Within CSR Policy</option><option>Not Within CSR Policy</option></Select> : <Input value="Not Evaluated" disabled readOnly />}</Field><Field label="Approval Status">{form.evaluationResult.length ? <Select value={form.approvalStatus === 'For Evaluation' ? '' : form.approvalStatus} onChange={(e) => setForm({ ...form, approvalStatus: e.target.value as CsrRequest['approvalStatus'] })}><option value="" disabled>Select approval status</option><option>Approved</option><option>Disapproved</option></Select> : <Input value="For Evaluation" disabled readOnly />}</Field><Field label="Date Approved/Disapproved"><Input type="date" disabled={!form.evaluationResult.length} value={form.dateApproved} onChange={(e) => setForm({ ...form, dateApproved: e.target.value })} /></Field><Field label="Amount Funding"><Input type="number" min="0" step="0.01" value={form.amountFunding} onChange={(e) => setForm({ ...form, amountFunding: e.target.value })} /></Field><Field label="PJRS"><Input value={form.pjrs} onChange={(e) => setForm({ ...form, pjrs: e.target.value })} placeholder="Enter PJRS reference" /></Field><Field label="Actual Project Cost"><Input type="number" min="0" step="0.01" value={form.actualProjectCost} onChange={(e) => setForm({ ...form, actualProjectCost: e.target.value })} /></Field><div className="flex items-end pb-2"><label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700"><Checkbox checked={form.withLetterReply} onChange={(e) => setForm({ ...form, withLetterReply: e.target.checked })} />With Letter Reply</label></div><div className="flex items-end pb-2"><label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700"><Checkbox checked={form.institutional} onChange={(e) => setForm({ ...form, institutional: e.target.checked })} />Institutional</label></div><div className="sm:col-span-2 lg:col-span-3"><Label>Project Details</Label><Textarea className="min-h-24" value={form.projectDetails} onChange={(e) => setForm({ ...form, projectDetails: e.target.value })} /></div><div className="sm:col-span-2 lg:col-span-3"><Label>Project Requirement</Label><Textarea className="min-h-24" value={form.projectRequirement} onChange={(e) => setForm({ ...form, projectRequirement: e.target.value })} /></div><div className="sm:col-span-2 lg:col-span-3"><Label>Additional Remarks</Label><Textarea className="min-h-20" value={form.additionalRemarks} onChange={(e) => setForm({ ...form, additionalRemarks: e.target.value })} placeholder="Enter additional remarks" /></div><div className="sm:col-span-2 lg:col-span-3"><Label>Attachments</Label><label onDragOver={(event) => { event.preventDefault(); setAttachmentDragging(true); }} onDragLeave={() => setAttachmentDragging(false)} onDrop={(event) => { event.preventDefault(); setAttachmentDragging(false); addAttachmentFiles(event.dataTransfer.files); }} className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${attachmentDragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-brand-50/40'}`}><Upload className="mb-2 h-6 w-6 text-brand-600" /><span className="text-sm font-medium text-slate-700">Drag and drop files here, paste an image, or click to browse</span><span className="mt-1 text-xs text-slate-500">Maximum 15 MB per file</span><input type="file" multiple className="hidden" onChange={(event) => { if (event.target.files) addAttachmentFiles(event.target.files); event.target.value = ''; }} /></label>{attachments.length > 0 || pendingFiles.length > 0 ? <div className="mt-3 divide-y overflow-hidden rounded-lg border border-slate-200">{attachments.map((attachment) => <div key={attachment.id} className="flex items-center gap-3 px-3 py-2"><AttachmentThumbnail attachment={attachment} token={token} csrId={editing?.id} /><button type="button" className="min-w-0 flex-1 truncate text-left text-sm text-slate-700 hover:text-brand-700 hover:underline" onClick={() => token && editing && void downloadCsrAttachment(token, editing.id, attachment)}>{attachment.fileName}</button><span className="text-xs text-slate-400">{formatFileSize(attachment.fileSize)}</span><button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => void removeAttachment(attachment)} aria-label={`Delete ${attachment.fileName}`}><X className="h-4 w-4" /></button></div>)}{pendingFiles.map((file, index) => <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 px-3 py-2"><AttachmentThumbnail file={file} /><span className="min-w-0 flex-1 truncate text-sm text-slate-700">{file.name}</span><span className="rounded-full bg-gold-50 px-2 py-0.5 text-[11px] text-gold-800">Pending save</span><span className="text-xs text-slate-400">{formatFileSize(file.size)}</span><button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}><X className="h-4 w-4" /></button></div>)}</div> : null}</div></div></Dialog>
  <Dialog open={reportPrintOpen} onClose={() => setReportPrintOpen(false)} title="Print CSR Report" description="Choose how the printed report should be arranged." size="sm" footer={<div className="flex w-full justify-between gap-2"><Button variant="ghost" onClick={() => { setReportDateFrom(''); setReportDateTo(''); }}>Clear Dates</Button><div className="flex gap-2"><Button variant="outline" onClick={() => setReportPrintOpen(false)}>Cancel</Button><Button onClick={() => { setReportPrintOpen(false); printReport(reportFormat, reportDateFrom, reportDateTo); }}><Printer className="h-4 w-4" /> Print</Button></div></div>}><div className="space-y-4"><Field label="Report Format"><Select value={reportFormat} onChange={(event) => setReportFormat(event.target.value as CsrReportFormat)}><option value="date">Sorted by Date</option><option value="district">Grouped by District</option><option value="municipality">Grouped by Municipality</option><option value="programType">Grouped by Program Type</option><option value="evaluationType">Grouped by Evaluation Type</option></Select></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Date From"><Input type="date" value={reportDateFrom} max={reportDateTo || undefined} onChange={(event) => setReportDateFrom(event.target.value)} /></Field><Field label="Date To"><Input type="date" value={reportDateTo} min={reportDateFrom || undefined} onChange={(event) => setReportDateTo(event.target.value)} /></Field></div>{!reportDateFrom && !reportDateTo && <p className="text-xs text-slate-500">All time date will be printed.</p>}</div></Dialog>
  <CsrSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} programTypeOptions={programTypeOptions} districtOptions={districtOptions.map((item) => typeof item === 'string' ? item : item.label).filter((item) => item !== 'Unspecified')} />
  <Dialog open={printOpen} onClose={() => setPrintOpen(false)} title="Prepare CSR Evaluation Form" description="Define the signatories that will appear on the printed evaluation form." size="lg" footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" onClick={() => setPrintOpen(false)}>Cancel</Button><Button disabled={!printDetails.evaluatedName.trim() || !printDetails.evaluatedDesignation.trim() || !printDetails.recommendingName.trim() || !printDetails.recommendingDesignation.trim()} onClick={() => { setPrintOpen(false); printEvaluationForm(); }}><Printer className="h-4 w-4" /> Print</Button></div>}><div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2"><h4 className="font-semibold text-slate-800 sm:col-span-2">Evaluated By</h4><Field label="Name" required><Input value={printDetails.evaluatedName} onChange={(event) => setPrintDetails({ ...printDetails, evaluatedName: event.target.value })} placeholder="Evaluator name" /></Field><Field label="Designation" required><Input value={printDetails.evaluatedDesignation} onChange={(event) => setPrintDetails({ ...printDetails, evaluatedDesignation: event.target.value })} placeholder="Evaluator designation" /></Field></div><div className="grid gap-3 sm:grid-cols-2"><h4 className="font-semibold text-slate-800 sm:col-span-2">Recommending Approval/Disapproval</h4><Field label="Name" required><Input value={printDetails.recommendingName} onChange={(event) => setPrintDetails({ ...printDetails, recommendingName: event.target.value })} placeholder="Recommending approver name" /></Field><Field label="Designation" required><Input value={printDetails.recommendingDesignation} onChange={(event) => setPrintDetails({ ...printDetails, recommendingDesignation: event.target.value })} placeholder="Recommending approver designation" /></Field></div></div></Dialog>
  <CsrEventsDialog request={editing} open={eventsOpen} onClose={() => setEventsOpen(false)} />
  <CreateSectorDialog open={sectorOpen} onClose={() => setSectorOpen(false)} onCreated={(sector) => { setSectors((current) => [...new Set([...current, sector])].sort((a, b) => a.localeCompare(b))); setForm((current) => ({ ...current, sector })); }} />
  <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={() => void remove()} title="Delete CSR Request?" description="This CSR request will be permanently removed." confirmLabel="Delete Request" destructive /></>;
}

type BudgetDraft = { id?: string; year: string; district: string; programType: string; budget: string };

const currentBudgetYear = String(new Date().getFullYear());
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function CsrSettingsDialog({ open, onClose, programTypeOptions, districtOptions }: { open: boolean; onClose: () => void; programTypeOptions: string[]; districtOptions: string[] }) {
  const { token } = useAuth(); const { toast } = useToast();
  const [tab, setTab] = useState<'budget'>('budget');
  const [allocations, setAllocations] = useState<CsrBudgetAllocation[]>([]);
  const [draft, setDraft] = useState<BudgetDraft>({ year: currentBudgetYear, district: '', programType: programTypeOptions[0] || '', budget: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState(currentBudgetYear);
  const [budgetColumnFilters, setBudgetColumnFilters] = useState({ id: '', year: '', district: '', programType: '', budget: '' });
  const [selectedBudgetIds, setSelectedBudgetIds] = useState<string[]>([]);
  const [budgetContextMenu, setBudgetContextMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const [applyBudgetDialog, setApplyBudgetDialog] = useState<{ ids: string[]; districts: string[] } | null>(null);
  const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false);
  const uniqueDistricts = useMemo(() => [...new Set([...CSR_BUDGET_DISTRICTS, ...districtOptions.filter(Boolean)])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [districtOptions]);
  const applyDistrictOptions = useMemo(() => uniqueDistricts.filter((district) => district.trim().toUpperCase() !== 'INSTITUTIONAL'), [uniqueDistricts]);
  const uniqueProgramTypes = useMemo(() => [...new Set(programTypeOptions.filter(Boolean))].sort((a, b) => a.localeCompare(b)), [programTypeOptions]);
  const yearOptions = useMemo(() => [...new Set([Number(currentBudgetYear), ...allocations.map((item) => item.year), Number(draft.year)].filter((year) => Number.isInteger(year)))].sort((a, b) => b - a), [allocations, draft.year]);
  const yearScopedAllocations = useMemo(() => allocations.filter((item) => String(item.year) === yearFilter), [allocations, yearFilter]);
  const filteredAllocations = useMemo(() => yearScopedAllocations.filter((item, index) => {
    const id = budgetColumnFilters.id.trim().toLowerCase();
    const year = budgetColumnFilters.year.trim().toLowerCase();
    const district = budgetColumnFilters.district.trim().toLowerCase();
    const programType = budgetColumnFilters.programType.trim().toLowerCase();
    const budget = budgetColumnFilters.budget.trim().toLowerCase();
    return (!id || String(index + 1).includes(id))
      && (!year || String(item.year).toLowerCase().includes(year))
      && (!district || item.district.toLowerCase().includes(district))
      && (!programType || item.programType.toLowerCase().includes(programType))
      && (!budget || String(item.budget).toLowerCase().includes(budget) || money.format(item.budget).toLowerCase().includes(budget));
  }), [budgetColumnFilters, yearScopedAllocations]);
  const totalBudget = useMemo(() => filteredAllocations.reduce((sum, item) => sum + (Number(item.budget) || 0), 0), [filteredAllocations]);
  const availableProgramTypes = useMemo(() => {
    const selectedYear = Number(draft.year);
    const selectedDistrict = draft.district.trim().toLowerCase();
    const usedProgramTypes = new Set(allocations.filter((item) => item.id !== editingId && item.year === selectedYear && item.district.trim().toLowerCase() === selectedDistrict).map((item) => item.programType.trim().toLowerCase()));
    const remaining = uniqueProgramTypes.filter((value) => !usedProgramTypes.has(value.trim().toLowerCase()));
    return draft.programType && editingId && !remaining.some((value) => value.trim().toLowerCase() === draft.programType.trim().toLowerCase()) ? [draft.programType, ...remaining] : remaining;
  }, [allocations, draft.district, draft.programType, draft.year, editingId, uniqueProgramTypes]);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setAllocations(await fetchCsrBudgetAllocations(token));
    } catch (error) {
      toast({ kind: 'error', title: 'Budget allocations not loaded', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (open) void load(); }, [open, token]);
  useEffect(() => { setSelectedBudgetIds((current) => current.filter((id) => filteredAllocations.some((item) => item.id === id))); }, [filteredAllocations]);
  useEffect(() => { if (!budgetContextMenu) return; const close = () => setBudgetContextMenu(null); window.addEventListener('click', close); window.addEventListener('scroll', close, true); return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); }; }, [budgetContextMenu]);
  useEffect(() => {
    if (!open) return;
    setDraft((current) => ({
      ...current,
      district: current.district || uniqueDistricts[0] || '',
      programType: current.programType || availableProgramTypes[0] || '',
    }));
  }, [availableProgramTypes, open, uniqueDistricts]);
  useEffect(() => {
    if (!open || editingId) return;
    setDraft((current) => {
      if (!current.programType || availableProgramTypes.some((value) => value.trim().toLowerCase() === current.programType.trim().toLowerCase())) return current;
      return { ...current, programType: availableProgramTypes[0] || '' };
    });
  }, [availableProgramTypes, editingId, open]);

  function resetDraft() {
    setEditingId(null);
    const defaultDistrict = uniqueDistricts[0] || '';
    const usedProgramTypes = new Set(allocations.filter((item) => item.year === Number(currentBudgetYear) && item.district.trim().toLowerCase() === defaultDistrict.trim().toLowerCase()).map((item) => item.programType.trim().toLowerCase()));
    const defaultProgramType = uniqueProgramTypes.find((value) => !usedProgramTypes.has(value.trim().toLowerCase())) || '';
    setDraft({ year: currentBudgetYear, district: defaultDistrict, programType: defaultProgramType, budget: '' });
  }
  function editAllocation(item: CsrBudgetAllocation) {
    setEditingId(item.id);
    setDraft({ id: item.id, year: String(item.year), district: item.district, programType: item.programType, budget: String(item.budget.toFixed(2)) });
  }
  function toggleBudgetSelection(id: string) {
    setSelectedBudgetIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function toggleAllBudgetSelection(checked: boolean) {
    setSelectedBudgetIds(checked ? filteredAllocations.map((item) => item.id) : []);
  }
  function openBudgetContextMenu(item: CsrBudgetAllocation, event: MouseEvent) {
    event.preventDefault();
    const ids = selectedBudgetIds.includes(item.id) ? selectedBudgetIds : [item.id];
    setSelectedBudgetIds(ids);
    setBudgetContextMenu({ ids, x: Math.min(event.clientX, window.innerWidth - 260), y: Math.min(event.clientY, window.innerHeight - 80) });
  }
  function openApplyBudgetDialog(ids = budgetContextMenu?.ids ?? selectedBudgetIds) {
    const selected = allocations.filter((item) => ids.includes(item.id) && item.district.trim().toUpperCase() !== 'INSTITUTIONAL');
    if (!selected.length) return toast({ kind: 'error', title: 'Select budget rows first' });
    const years = [...new Set(selected.map((item) => item.year))];
    if (years.length !== 1) return toast({ kind: 'error', title: 'Select rows within the same year only' });
    const programTypes = new Set<string>();
    for (const item of selected) {
      const key = item.programType.trim().toLowerCase();
      if (programTypes.has(key)) return toast({ kind: 'error', title: 'Select one budget per program type' });
      programTypes.add(key);
    }
    setBudgetContextMenu(null);
    setApplyBudgetDialog({ ids, districts: applyDistrictOptions });
  }
  async function saveDraft() {
    if (!token) return;
    const year = Number(draft.year); const budget = Number(draft.budget);
    if (!Number.isInteger(year) || year < 1900 || year > 2999) return toast({ kind: 'error', title: 'Enter a valid budget year' });
    if (!draft.district.trim() || !draft.programType.trim()) return toast({ kind: 'error', title: 'District and Program Type are required' });
    if (!Number.isFinite(budget) || budget < 0) return toast({ kind: 'error', title: 'Budget must be a valid non-negative amount' });
    const previousYear = String(year);
    const previousDistrict = draft.district.trim();
    const wasEditing = Boolean(editingId);
    setSaving(true);
    try {
      await saveCsrBudgetAllocation(token, { year, district: previousDistrict, programType: draft.programType.trim(), budget }, editingId ?? undefined);
      await load();
      setYearFilter(previousYear);
      if (wasEditing) {
        resetDraft();
      } else {
        setDraft({ year: previousYear, district: previousDistrict, programType: '', budget: '' });
      }
      toast({ kind: 'success', title: editingId ? 'Budget allocation updated' : 'Budget allocation added' });
    } catch (error) {
      toast({ kind: 'error', title: 'Budget allocation was not saved', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }
  async function removeAllocation(item: CsrBudgetAllocation) {
    if (!token) return;
    setSaving(true);
    try {
      await deleteCsrBudgetAllocation(token, item.id);
      if (editingId === item.id) resetDraft();
      await load();
      toast({ kind: 'success', title: 'Budget allocation removed' });
    } catch (error) {
      toast({ kind: 'error', title: 'Budget allocation was not removed', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }
  async function removeSelectedAllocations(ids = budgetContextMenu?.ids ?? selectedBudgetIds) {
    if (!token) return;
    const selected = allocations.filter((item) => ids.includes(item.id));
    if (!selected.length) return toast({ kind: 'error', title: 'Select budget rows first' });
    setBudgetContextMenu(null);
    setSaving(true);
    try {
      for (const item of selected) {
        await deleteCsrBudgetAllocation(token, item.id);
        setAllocations((current) => current.filter((allocation) => allocation.id !== item.id));
      }
      setSelectedBudgetIds((current) => current.filter((id) => !ids.includes(id)));
      if (editingId && ids.includes(editingId)) resetDraft();
      await load();
      toast({ kind: 'success', title: `${selected.length} budget allocation${selected.length === 1 ? '' : 's'} removed` });
    } catch (error) {
      toast({ kind: 'error', title: 'Budget allocations were not removed', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }
  async function applySelectedToAllDistricts(ids = budgetContextMenu?.ids ?? selectedBudgetIds, targetDistricts = applyDistrictOptions) {
    if (!token) return;
    const selected = allocations.filter((item) => ids.includes(item.id) && item.district.trim().toUpperCase() !== 'INSTITUTIONAL');
    if (!selected.length) return toast({ kind: 'error', title: 'Select budget rows first' });
    const years = [...new Set(selected.map((item) => item.year))];
    if (years.length !== 1) return toast({ kind: 'error', title: 'Select rows within the same year only' });
    const districts = [...new Set(targetDistricts.map((district) => district.trim()).filter((district) => district && district.toUpperCase() !== 'INSTITUTIONAL'))];
    if (!districts.length) return toast({ kind: 'error', title: 'No districts available' });
    const programTypes = new Set<string>();
    for (const item of selected) {
      const key = item.programType.trim().toLowerCase();
      if (programTypes.has(key)) return toast({ kind: 'error', title: 'Select one budget per program type' });
      programTypes.add(key);
    }
    setBudgetContextMenu(null);
    setApplyBudgetDialog(null);
    setSaving(true);
    try {
      let workingAllocations = [...allocations];
      for (const source of selected) {
        for (const district of districts) {
          const existing = workingAllocations.find((item) => item.year === source.year && item.district.trim().toLowerCase() === district.trim().toLowerCase() && item.programType.trim().toLowerCase() === source.programType.trim().toLowerCase());
          if (existing && existing.id === source.id && Number(existing.budget) === Number(source.budget)) continue;
          const result = await saveCsrBudgetAllocation(token, { year: source.year, district, programType: source.programType, budget: source.budget }, existing?.id);
          const updatedRow: CsrBudgetAllocation = { id: existing?.id ?? result.id ?? `${source.year}-${district}-${source.programType}`, year: source.year, district, programType: source.programType, budget: source.budget };
          workingAllocations = existing ? workingAllocations.map((item) => item.id === existing.id ? { ...item, ...updatedRow } : item) : [...workingAllocations, updatedRow];
          setAllocations(workingAllocations);
        }
      }
      await load();
      toast({ kind: 'success', title: 'Budget applied' });
    } catch (error) {
      toast({ kind: 'error', title: 'Budgets were not applied', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return <>
  <Dialog open={open} onClose={onClose} title="CSR Settings" description="Configure CSR report and planning settings." size="2xl" footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" onClick={onClose}>Close</Button></div>}>
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200">
        <button type="button" onClick={() => setTab('budget')} className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === 'budget' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Budget Allocation</button>
      </div>
      {tab === 'budget' && <div className="space-y-4">
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[120px_1fr_1fr_160px_auto] md:items-end">
          <Field label="Year" required><Input type="number" min="1900" max="2999" value={draft.year} onChange={(event) => setDraft({ ...draft, year: event.target.value })} /></Field>
          <Field label="District" required><Select value={draft.district} onChange={(event) => setDraft({ ...draft, district: event.target.value })}><option value="">Select district</option>{draft.district && !uniqueDistricts.includes(draft.district) ? <option value={draft.district}>{draft.district}</option> : null}{uniqueDistricts.map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>
          <Field label="Program Type" required><Select value={draft.programType} onChange={(event) => setDraft({ ...draft, programType: event.target.value })}><option value="">{availableProgramTypes.length ? 'Select program type' : 'No remaining program types'}</option>{draft.programType && !availableProgramTypes.includes(draft.programType) ? <option value={draft.programType}>{draft.programType}</option> : null}{availableProgramTypes.map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>
          <Field label="Budget" required><Input type="number" min="0" step="0.01" value={draft.budget} onChange={(event) => setDraft({ ...draft, budget: event.target.value })} placeholder="0.00" /></Field>
          <div className="flex gap-2">
            {editingId && <Button variant="outline" disabled={saving} onClick={resetDraft}>Cancel</Button>}
            <Button disabled={saving} onClick={() => void saveDraft()}>{saving ? 'Saving…' : editingId ? 'Save' : 'Add'}</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">Budget Allocation List</p>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">Year<Select className="h-9 w-28" value={yearFilter} onChange={(event) => { setYearFilter(event.target.value); setSelectedBudgetIds([]); }} aria-label="Filter budget allocations by year">{yearOptions.map((year) => <option key={year} value={String(year)}>{year}</option>)}</Select></label>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[44px_70px_130px_minmax(180px,1fr)_minmax(180px,1fr)_130px_92px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span><Checkbox checked={filteredAllocations.length > 0 && selectedBudgetIds.length === filteredAllocations.length} onChange={(event) => toggleAllBudgetSelection(event.target.checked)} aria-label="Select all budget allocations" /></span><span>ID</span><span>Year</span><span>District</span><span>Program Type</span><span className="text-right">Budget</span><span className="text-right">Actions</span>
          </div>
          <div className="grid grid-cols-[44px_70px_130px_minmax(180px,1fr)_minmax(180px,1fr)_130px_92px] gap-0 border-b border-slate-200 bg-slate-50/70 px-4 py-2">
            <span />
            <Input className="h-8 text-xs" value={budgetColumnFilters.id} onChange={(event) => setBudgetColumnFilters((current) => ({ ...current, id: event.target.value }))} onClick={(event) => event.stopPropagation()} placeholder="Filter ID" aria-label="Filter budget allocation ID" />
            <Input className="h-8 text-xs" value={budgetColumnFilters.year} onChange={(event) => setBudgetColumnFilters((current) => ({ ...current, year: event.target.value }))} onClick={(event) => event.stopPropagation()} placeholder="Filter Year" aria-label="Filter budget allocation year" />
            <Input className="h-8 text-xs" value={budgetColumnFilters.district} onChange={(event) => setBudgetColumnFilters((current) => ({ ...current, district: event.target.value }))} onClick={(event) => event.stopPropagation()} placeholder="Filter District" aria-label="Filter budget allocation district" />
            <Input className="h-8 text-xs" value={budgetColumnFilters.programType} onChange={(event) => setBudgetColumnFilters((current) => ({ ...current, programType: event.target.value }))} onClick={(event) => event.stopPropagation()} placeholder="Filter Program Type" aria-label="Filter budget allocation program type" />
            <Input className="h-8 text-xs text-right" value={budgetColumnFilters.budget} onChange={(event) => setBudgetColumnFilters((current) => ({ ...current, budget: event.target.value }))} onClick={(event) => event.stopPropagation()} placeholder="Filter Budget" aria-label="Filter budget allocation amount" />
            <span />
          </div>
          {loading ? <div className="px-4 py-10 text-center text-sm text-slate-500">Loading budget allocations…</div> : filteredAllocations.length ? <><div className="max-h-[45vh] divide-y divide-slate-200 overflow-y-auto">
            {filteredAllocations.map((item) => { const rowNumber = yearScopedAllocations.findIndex((allocation) => allocation.id === item.id) + 1; return <div key={item.id} onClick={() => toggleBudgetSelection(item.id)} onContextMenu={(event) => openBudgetContextMenu(item, event)} className={`grid cursor-pointer grid-cols-[44px_70px_130px_minmax(180px,1fr)_minmax(180px,1fr)_130px_92px] items-center gap-0 px-4 py-3 text-sm ${selectedBudgetIds.includes(item.id) ? 'bg-brand-50/70' : 'hover:bg-slate-50'}`}>
              <span onClick={(event) => event.stopPropagation()}><Checkbox checked={selectedBudgetIds.includes(item.id)} onChange={() => toggleBudgetSelection(item.id)} aria-label={`Select budget allocation ${rowNumber}`} /></span>
              <span className="font-mono text-xs text-slate-500">{rowNumber}</span>
              <span>{item.year}</span>
              <span className="font-medium text-slate-800">{item.district}</span>
              <span>{item.programType}</span>
              <span className="text-right font-semibold text-slate-800">{money.format(item.budget)}</span>
              <span className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}><Button variant="outline" size="sm" disabled={saving} onClick={() => editAllocation(item)}>Edit</Button><Button variant="outline" size="icon" disabled={saving} onClick={() => void removeAllocation(item)}><Trash2 className="h-4 w-4 text-red-600" /></Button></span>
            </div>; })}
          </div><div className="grid grid-cols-[44px_70px_130px_minmax(180px,1fr)_minmax(180px,1fr)_130px_92px] items-center border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900"><span className="col-span-5 text-right">Running Total Budget</span><span className="text-right">{money.format(totalBudget)}</span><span /></div></> : <div className="px-4 py-10 text-center text-sm text-slate-500">No budget allocations for {yearFilter}.</div>}
        </div>
        {budgetContextMenu && <div className="fixed z-[80] min-w-64 rounded-lg border border-slate-200 bg-surface p-1 shadow-xl" style={{ left: budgetContextMenu.x, top: budgetContextMenu.y }} onClick={(event) => event.stopPropagation()}><button type="button" className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => openApplyBudgetDialog(budgetContextMenu.ids)}>Apply To All</button><button type="button" className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50" onClick={() => void removeSelectedAllocations(budgetContextMenu.ids)}>Bulk Delete</button></div>}
      </div>}
    </div>
  </Dialog>
  <Dialog
    open={Boolean(applyBudgetDialog)}
    onClose={() => { if (!saving) setApplyBudgetDialog(null); }}
    title="Apply To All"
    description="Choose the districts where the selected budget rows will be applied."
    size="sm"
    footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setApplyBudgetDialog(null)}>Cancel</Button><Button disabled={saving || !applyBudgetDialog?.districts.length} onClick={() => applyBudgetDialog && void applySelectedToAllDistricts(applyBudgetDialog.ids, applyBudgetDialog.districts)}>{saving ? 'Applying...' : 'Apply'}</Button></div>}
  >
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-sm font-medium text-slate-700">Districts</span>
        <button
          type="button"
          className="text-xs font-semibold text-brand-700 hover:text-brand-800"
          onClick={() => setApplyBudgetDialog((current) => current ? { ...current, districts: current.districts.length === applyDistrictOptions.length ? [] : applyDistrictOptions } : current)}
        >
          {applyBudgetDialog?.districts.length === applyDistrictOptions.length ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {applyDistrictOptions.length ? applyDistrictOptions.map((district) => <label key={district} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          <Checkbox
            checked={Boolean(applyBudgetDialog?.districts.includes(district))}
            onChange={(event) => setApplyBudgetDialog((current) => current ? { ...current, districts: event.target.checked ? [...current.districts, district] : current.districts.filter((item) => item !== district) } : current)}
          />
          <span>{district}</span>
        </label>) : <p className="px-3 py-6 text-center text-sm text-slate-500">No districts available.</p>}
      </div>
    </div>
  </Dialog>
  </>;
}

function evaluatorDisplayName(directoryUser: DirectoryUser) { const middleInitial = directoryUser.middleName?.trim().charAt(0); return [directoryUser.firstName?.trim(), middleInitial ? `${middleInitial.toUpperCase()}.` : '', directoryUser.lastName?.trim()].filter(Boolean).join(' '); }

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) { const fullWidth = label === 'Pending Reason'; return <div className={fullWidth ? 'col-span-full' : undefined} style={fullWidth ? { gridColumn: '1 / -1' } : undefined}><Label required={required}>{label}</Label>{children}</div>; }

function csrDetailFields(item: CsrRequest): Array<[string, string]> {
  const currency = (value: string | number | null | undefined) => value ? Number(value).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' }) : '';
  return [
    ['Date Requested', item.dateRequested],
    ['Program Type', item.programType],
    ['Requestee', item.requestee],
    ['Designation', item.designation],
    ['Organization', item.organization],
    ['Registration Details', item.registrationDetails],
    ['Sector', item.sector],
    ['Location', item.location],
    ['Municipality', item.municipality],
    ['Barangay', item.barangay],
    ['District', item.district],
    ['Project Details', item.projectDetails],
    ['Project Requirement', item.projectRequirement],
    ['Evaluation Status', item.status],
    ['Pending Reason', item.pendingReason],
    ['Evaluated By', item.evaluatedBy],
    ['Evaluation Result', item.evaluationResult.length ? item.evaluationResult.join(', ') : 'Not Evaluated'],
    ['Approval Status', item.approvalStatus],
    ['Date Approved/Disapproved', item.dateApproved],
    ['Amount Funding', currency(item.amountFunding)],
    ['Actual Project Cost', currency(item.actualProjectCost)],
    ['PJRS', item.pjrs],
    ['With Letter Reply', item.withLetterReply ? 'Yes' : 'No'],
    ['Institutional', item.institutional ? 'Yes' : 'No'],
    ['Additional Remarks', item.additionalRemarks],
  ];
}

function formatCsrDetails(item: CsrRequest) { return csrDetailFields(item).map(([field, value]) => `${field}: ${value || '—'}`).join('\n'); }

function CsrHoverSummary({ request }: { request: CsrRequest }) {
  return <div className="pointer-events-none fixed right-8 top-24 z-50 hidden w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-surface p-4 shadow-2xl md:block"><div className="mb-3 border-b border-slate-200 pb-2"><p className="text-sm font-semibold text-slate-900">CSR Details</p><p className="truncate text-xs text-slate-500">{request.requestee || request.programType}</p></div><dl className="max-h-[70vh] space-y-2 overflow-y-auto pr-1 text-sm">{csrDetailFields(request).map(([field, value]) => <div key={field} className="grid grid-cols-[135px_1fr] gap-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{field}</dt><dd className="whitespace-pre-wrap break-words text-slate-700">{value || '—'}</dd></div>)}</dl></div>;
}

function AttachmentThumbnail({ file, attachment, token, csrId }: { file?: File; attachment?: CsrAttachment; token?: string | null; csrId?: string }) {
  const [url, setUrl] = useState('');
  const isImage = file?.type.startsWith('image/') || attachment?.mimeType.startsWith('image/');
  useEffect(() => {
    if (!isImage) { setUrl(''); return; }
    let objectUrl = '';
    let cancelled = false;
    if (file) { objectUrl = URL.createObjectURL(file); setUrl(objectUrl); }
    else if (attachment && token && csrId) void fetch(`/api/member-programs/csr/${encodeURIComponent(csrId)}/attachments/${encodeURIComponent(attachment.id)}`, { headers: { authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.blob() : Promise.reject(new Error('Preview unavailable'))).then((blob) => { if (cancelled) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => setUrl(''));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment, csrId, file, isImage, token]);
  return url ? <button type="button" className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} title="Open image preview"><img src={url} alt={file?.name || attachment?.fileName || 'Attachment preview'} className="h-full w-full object-cover" /></button> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50"><File className="h-5 w-5 text-brand-600" /></div>;
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character); }

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CreateSectorDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (sector: string) => void }) {
  const { token } = useAuth(); const { toast } = useToast(); const [sector, setSector] = useState(''); const [saving, setSaving] = useState(false);
  async function create() { const value = sector.trim(); if (!token || !value) return; setSaving(true); try { const result = await createCsrSector(token, value); onCreated(result.sector); setSector(''); onClose(); toast({ kind: 'success', title: 'Sector added to the shared list' }); } catch (error) { toast({ kind: 'error', title: 'Sector was not saved', description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSaving(false); } }
  return <Dialog open={open} onClose={() => { if (!saving) onClose(); }} title="Create Sector" description="Add a standardized sector value for future CSR requests." size="sm" footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || !sector.trim()} onClick={() => void create()}>{saving ? 'Creating…' : 'Create Sector'}</Button></div>}><Field label="Sector Name" required><Input autoFocus value={sector} onChange={(event) => setSector(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void create(); } }} placeholder="Enter the standardized sector name" /></Field></Dialog>;
}

function CsrEventsDialog({ request, open, onClose }: { request: CsrRequest | null; open: boolean; onClose: () => void }) {
  const { token } = useAuth(); const { toast } = useToast();
  const [events, setEvents] = useState<CsrProjectEvent[]>([]); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [projectEvent, setProjectEvent] = useState(''); const [inspectedBy, setInspectedBy] = useState('');
  async function loadEvents() { if (!token || !request) return; setLoading(true); try { setEvents(await fetchCsrProjectEvents(token, request.id)); } catch (error) { toast({ kind: 'error', title: 'Unable to load project events', description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setLoading(false); } }
  useEffect(() => { if (open && request) void loadEvents(); }, [open, request?.id, token]);
  async function addEvent() { if (!token || !request || !date || !projectEvent.trim() || !inspectedBy.trim()) return; setSaving(true); try { await addCsrProjectEvent(token, request.id, { date, projectEvent: projectEvent.trim(), inspectedBy: inspectedBy.trim() }); setProjectEvent(''); setInspectedBy(''); await loadEvents(); toast({ kind: 'success', title: 'Project event added' }); } catch (error) { toast({ kind: 'error', title: 'Project event was not saved', description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSaving(false); } }
  return <Dialog open={open && Boolean(request)} onClose={() => { if (!saving) onClose(); }} title="CSR Project Events" description={request ? `Progress diary for ${request.programType} — ${request.requestee}.` : ''} size="lg" footer={<div className="flex w-full justify-end"><Button variant="outline" disabled={saving} onClick={onClose}>Close</Button></div>}><div className="space-y-5"><div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"><Field label="Date" required><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label="Inspected By" required><Input value={inspectedBy} onChange={(event) => setInspectedBy(event.target.value)} placeholder="Name of inspector" /></Field><div className="sm:col-span-2"><Label required>Project Event</Label><Textarea className="min-h-24" value={projectEvent} onChange={(event) => setProjectEvent(event.target.value)} placeholder="Record progress, findings, decisions, or status changes" /></div><div className="sm:col-span-2 flex justify-end"><Button disabled={saving || !date || !projectEvent.trim() || !inspectedBy.trim()} onClick={() => void addEvent()}><Plus className="h-4 w-4" /> {saving ? 'Adding…' : 'Add Event'}</Button></div></div><div><h4 className="mb-2 font-semibold text-slate-800">Event History</h4>{loading ? <p className="py-6 text-center text-sm text-slate-500">Loading events…</p> : events.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">No project events recorded yet.</div> : <div className="divide-y overflow-hidden rounded-xl border border-slate-200">{events.map((event) => <div key={event.id} className="p-4"><div className="mb-1 flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-800">{event.date}</span><span className="text-xs text-slate-500">Inspected by {event.inspectedBy}</span></div><p className="whitespace-pre-wrap text-sm text-slate-700">{event.projectEvent}</p></div>)}</div>}</div></div></Dialog>;
}
