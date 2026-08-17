# BENECO Enterprise System (BES)

A management-demonstration prototype of a centralized digital workplace for BENECO (Benguet Electric Cooperative). This application shows how a single portal could bring together an employee's calendar, requests, approvals, institutional communications, department workspaces, and management reporting.

## ⚠️ Prototype Disclaimer

**This is a conceptual management demonstration, not a production system.**

- All data — employees, transactions, amounts, and records — is entirely **fictional mock data**, generated for this demonstration only.
- No official BENECO personnel, payroll, operational, or consumer data is used or stored anywhere.
- All application state is kept in the browser's `localStorage`. Nothing is transmitted to a server.
- Workflows, approval routing, and access rules shown here are illustrative and require **formal validation** before any production use.
- A production implementation would require formal security, privacy, integration, records-management, and infrastructure reviews.

A persistent reminder of this is shown in the app footer and in the **About This Prototype** dialog (Profile menu → About This Prototype, or the footer link).

## Technology Stack

- **React 19** + **TypeScript**
- **Vite** (build tool and dev server)
- **Tailwind CSS v4** for styling, with a custom BENECO brand theme (dark green standard palette) and full **light/dark/system theme support**
- Hand-built, shadcn/ui-style component library (Button, Card, Dialog, Drawer, Tabs, DataTable, etc.) using Tailwind
- **Lucide React** for icons
- **Recharts** for charts and dashboards (theme-aware)
- **React Router v6** for client-side routing
- **date-fns** for date handling
- **localStorage** for all prototype data persistence — no backend, database, or external API

### Theme system

BES ships with a full light/dark theme (toggle from the sun/moon icon in the top bar, or "Appearance" in the profile menu — Light / Dark / System). The standard brand color is a dark green palette. Because Tailwind v4 compiles every color utility to a CSS custom property, the whole theme is driven centrally from `src/index.css` (`@theme` for light defaults, `:root[data-theme="dark"]` for dark overrides) — no per-page dark-mode classes were needed. The login page keeps a fixed glassmorphic look (photo background + frosted card) regardless of the app theme, matching BENECO's ISDMS visual identity.

## Installation and Local Run

Requires Node.js 18+ (tested on Node 24) and npm.

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

**Windows shortcut:** double-click `start-bes.bat` in the project root instead of using the terminal — it installs dependencies on first run (if `node_modules` is missing) and then starts the dev server.

To create a production build:

```bash
npm run build
npm run preview
```

### Deploying to Render

This repo includes a `render.yaml` Blueprint that deploys BES as a static site (it's a client-only SPA — no backend or database required):

1. On [Render](https://render.com), choose **New → Blueprint** and connect this GitHub repository.
2. Render will detect `render.yaml` and provision a single static site (`bes-client`) that runs `npm install && npm run build` and publishes `dist/`, with a catch-all rewrite to `index.html` so client-side routing (React Router) works on refresh and deep links.
3. No environment variables are required.

## Demo Credentials

| Field    | Value   |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

A "Show Demo Credentials" helper panel is also available on the login page. The login page displays a small note: *"Management Demonstration Prototype — Uses simulated data only."*

Login includes: username/password validation, a show/hide password toggle, a "Remember me" option, an invalid-credentials message, a loading state, session persistence (survives refresh), a working logout, and a simulated "Forgot password?" dialog.

## Application Structure

```
src/
  components/
    ui/            Reusable UI primitives (Button, Card, Dialog, Drawer, Tabs,
                    DataTable, Badge, Input, Dropdown, Pagination, etc.)
    layout/         AppShell, Sidebar, Topbar, MobileDrawer, RolePreviewBanner,
                    GuidedTour, AboutDialog, Footer, ProtectedRoute
    shared/         PageHeader, Toolbar, RequestForm (generic process engine
                    form), WorkflowStageTracker, EnterpriseCalendar
  context/          AuthContext, DataContext (all app state + actions),
                    RolePreviewContext, ToastContext, UIContext
  hooks/            useTableControls (search/sort/pagination), CSV export helper
  lib/              types.ts, mockData.ts (seed data generator), storage.ts,
                    permissions.ts, processDefs.ts (config-driven request/
                    approval "process engine"), services.ts, workflows.ts,
                    workspace.ts, deptPreviews.ts, nav.ts, search.ts, utils.ts
  pages/            One file per route (Home, Inbox, MyWork, WorkItemDetail,
                    RequestNew, ServicesCatalog, Attendance, Payroll, Leave,
                    Workspace, WorkspaceModule, WorkspacePreview, Workflows,
                    CalendarPage, News, NewsDetail, Documents, DocumentDetail,
                    Organization, OrganizationDepartment, OrganizationEmployee,
                    Reports, Notifications, Help, Admin, SearchPage, Profile,
                    Login, NotFound)
```

### Key architectural decisions

- **Generic process engine** (`lib/processDefs.ts` + `components/shared/RequestForm.tsx`): every request type (Leave, Travel Order, Gate Pass, Procurement, Document Routing, Project Proposal, etc.) is defined as a small config object (fields + approval chain), rendered by one reusable form and one reusable detail/approval page (`pages/WorkItemDetail.tsx`). This keeps ~25 distinct request types consistent and fully functional without duplicating form/approval code.
- **Single `DataContext`** holds every collection (employees, events, news, work items, attendance, payslips, documents, projects, notifications, modules, audit log, support tickets) and every mutating action (submit, approve, return, reject, reassign, comment, publish, acknowledge, clock in/out, etc.), persisting to `localStorage` on every change.
- **Role Preview** (`RolePreviewContext` + `lib/permissions.ts`): a single source of truth for what each of the 8 roles (Employee, Supervisor, Department Manager, General Manager, Board Member, Process Owner, Auditor, Administrator) can see — navigation items, approval authority, document classification access, and team visibility.

## Major Modules

1. **Enterprise Home** — greeting, "My Day" summary cards, a full-width enlarged enterprise calendar, news/memo panel, quick service tiles, and a My Work panel.
2. **Inbox** — an internal email system (Inbox/Starred/Sent/Drafts/Trash, compose, reply, star, search, delete) and an internal messaging system (1:1 and group conversations, real-time-style chat thread, unread badges), unified under one "Inbox" entry in the sidebar.
3. **My Work** — unified queue (My Tasks / My Requests / My Approvals / Assigned to My Team / Completed / Drafts) with filters, search, sorting, pagination, and CSV export.
3. **Employee Services** — service catalog plus dedicated Attendance, Payroll, and Leave pages, and generic request forms for Official Business, Gate Pass, Travel Order, Overtime, Personnel Documents, and Service Requests (IT, Facilities, Vehicle, Supplies, Records, Communications, Other).
4. **My Workspace** — the Institutional Services Department workspace (the demo user's home department), including 11 functional modules and the **BES Governance and Adoption** module (module registry, adoption metrics, training schedule, policy checklist).
5. **Preview Other Workspaces** — demo-role previews of the other five departments (Network Services, Non-Network Services, Audit, Corporate Planning, Power Generation), each with its own KPIs, work queue, and module shortcuts. The Audit preview demonstrates restricted-record access control.
6. **Shared Workflows** — a catalog of 13 cross-department workflows, with three fully detailed demonstrations (Procurement Request, Document Routing, Project Proposal) including a visual approval-stage tracker.
7. **Calendar** — month/week/agenda views, 8 filterable layers, event creation/edit/delete for personal events, conflict warnings, and an upcoming-deadlines panel.
8. **News and Memos** — a searchable publication center with 9 tabs, read/unread state, bookmarking, acknowledgment tracking, and an admin compose/publish dialog.
9. **Documents and Policies** — a document library with 5 access classifications, version history, and role-based access control (locked/restricted documents).
10. **Organization** — a visual org hierarchy, department directory, and searchable employee directory.
11. **Reports and Analytics** — 9 role-based dashboard tabs built with Recharts, with department and date-range filters.
12. **Notifications** — a full notification center with categories, read/unread state, and deep links to related records.
13. **Help and Support** — getting started guide, FAQ, user guide, video tutorial placeholders, and support/feedback/problem/enhancement ticket submission with persisted ticket tracking.
14. **Administration** — user management, role/permission matrix, module registry, workflow configuration preview, news/calendar administration, document classifications, reference-number settings, notification templates, audit logs, and demo data controls. Visible only to Department Manager / General Manager / Administrator roles.

## Mock Data

All data is generated in `src/lib/mockData.ts` and seeded into `localStorage` on first run. It includes 40+ employees across 6 departments, 20+ calendar events, 15 news/memo posts, 25+ tasks and requests, 10+ pending approvals, 20+ policy documents, attendance and payslip history, 12+ service requests, 10 strategic projects, notifications, a 10-record BES module registry, and a 10-entry audit log. Names, dates, and currency are formatted in a Philippine context (₱ / `en-PH`).

### How persistence and reset work

- Every collection is stored under a `bes:*` key in `localStorage` (see `src/lib/storage.ts`).
- Any action you take (filing a request, approving/returning/rejecting, acknowledging a memo, creating a calendar event, submitting a support ticket, etc.) is saved immediately and will still be there after a refresh.
- **Administration → Demo Data** provides:
  - **Reset All Demo Data** — clears all `bes:*` keys and returns you to the login screen; the next login re-seeds the original mock dataset from scratch.
  - **Clear Created Transactions** — restores the baseline dataset the same way, for cleaning up between demo runs.

## Guided Tour

Available from the Profile menu ("Start Guided Tour") or Help and Support. It walks through Enterprise Home, the calendar, memo acknowledgment, Employee Services, filing a request, manager approval, the Institutional Services workspace, shared workflow tracking, Reports and Analytics, and Role Preview. It is dismissible at any point and restartable at any time.

## Known Prototype Limitations

- No real backend, authentication provider, or database — a single hardcoded demo account, with role behavior simulated via the "View BES As" role preview rather than real per-account permissions.
- File uploads and downloads are simulated (a filename is recorded; no bytes are transferred).
- Reference numbers, approval routing, and notification content are generated client-side and are not integrated with any real HR, finance, or document-management system.
- Data does not sync across browsers/devices — it lives in the current browser's `localStorage` only.
- Recharts dashboards use plausible but synthetic figures; they are explicitly labeled as demonstration data.

## Suggested Future Production Architecture

- **Backend**: a real API layer (e.g., REST/GraphQL) backed by a relational database, with proper HR/payroll system integration rather than mock data.
- **Authentication**: SSO/LDAP or an identity provider integrated with BENECO's directory, with MFA for sensitive roles.
- **Authorization**: server-enforced role-based access control mirroring (and replacing) the client-side `permissions.ts` logic here, including field- and record-level access classification enforcement.
- **Document management**: integration with a records-management/DMS platform for actual file storage, versioning, and retention schedules.
- **Workflow engine**: a proper BPM/workflow engine for configurable, auditable approval routing (replacing the static process definitions in `processDefs.ts`).
- **Notifications**: real email/SMS/push notification delivery, plus an audit-grade event log.
- **Infrastructure**: containerized deployment, backups, monitoring, and a formal security and data-privacy review prior to go-live.

## Management Presentation Flow (10–15 minutes)

A suggested walkthrough for presenting this prototype to BENECO management:

1. **Login** (1 min) — show the login page, demo credentials panel, and sign in.
2. **Enterprise Home** (2 min) — walk through the greeting header, My Day summary cards, and the enterprise calendar as the day-to-day starting point.
3. **News and Memo Acknowledgment** (1–2 min) — open a memo that requires acknowledgment and acknowledge it live.
4. **Filing a Request** (2 min) — go to Employee Services → Leave, file a leave request, and show the generated reference number and status timeline.
5. **Manager Approval** (2 min) — go to My Work → My Approvals, open a pending item, and approve or return it with remarks.
6. **My Workspace** (2 min) — show the Institutional Services Department workspace, then open BES Governance and Adoption to show the module registry.
7. **Shared Workflow Tracking** (1–2 min) — open Shared Workflows and show the Procurement Request or Project Proposal stage tracker.
8. **Reports and Analytics** (1–2 min) — show a couple of dashboard tabs and the department/date filters.
9. **Role Preview** (1–2 min) — use "View BES As" to switch to Employee or Board Member and show how navigation, approvals, and restricted documents change.
10. **Close** — open the About This Prototype dialog to reinforce that this is a simulated demonstration and outline next steps toward production.

---

*BES Management Demonstration — Mock Data.*
