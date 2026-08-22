import { Navigate, Route, Routes } from 'react-router-dom';
import { AdministratorRoute, ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import Login from '@/pages/Login';
import Home from '@/pages/Home';
import InboxPage from '@/pages/Inbox';
import MyWork from '@/pages/MyWork';
import WorkItemDetail from '@/pages/WorkItemDetail';
import RequestNew from '@/pages/RequestNew';
import ServicesCatalog from '@/pages/ServicesCatalog';
import Attendance from '@/pages/Attendance';
import Payroll from '@/pages/Payroll';
import Leave from '@/pages/Leave';
import Workspace from '@/pages/Workspace';
import WorkspaceModule from '@/pages/WorkspaceModule';
import WorkspacePreview from '@/pages/WorkspacePreview';
import ToolDetail from '@/pages/ToolDetail';
import BuildingMaintenance from '@/pages/BuildingMaintenance';
import BuildingProgramOfWorks from '@/pages/BuildingProgramOfWorks';
import VehicleMaintenanceSchedule from '@/pages/VehicleMaintenanceSchedule';
import Workflows from '@/pages/Workflows';
import CalendarPage from '@/pages/CalendarPage';
import News from '@/pages/News';
import NewsDetail from '@/pages/NewsDetail';
import Documents from '@/pages/Documents';
import DocumentDetail from '@/pages/DocumentDetail';
import Storage from '@/pages/Storage';
import Iso from '@/pages/Iso';
import IsoDocumentDetail from '@/pages/IsoDocumentDetail';
import IsoFlowchartBuilder from '@/pages/IsoFlowchartBuilder';
import Organization from '@/pages/Organization';
import OrganizationDepartment from '@/pages/OrganizationDepartment';
import OrganizationEmployee from '@/pages/OrganizationEmployee';
import Reports from '@/pages/Reports';
import Notifications from '@/pages/Notifications';
import Help from '@/pages/Help';
import Admin from '@/pages/Admin';
import SearchPage from '@/pages/SearchPage';
import Profile from '@/pages/Profile';
import NotFound from '@/pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/my-work" element={<MyWork />} />
        <Route path="/my-work/:id" element={<WorkItemDetail />} />
        <Route path="/requests/new/:processType" element={<RequestNew />} />
        <Route path="/services" element={<ServicesCatalog />} />
        <Route path="/services/attendance" element={<Attendance />} />
        <Route path="/services/payroll" element={<Payroll />} />
        <Route path="/services/leave" element={<Leave />} />
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/workspace/preview/:deptId" element={<WorkspacePreview />} />
        <Route path="/workspace/preview/:deptId/tools/:toolCode" element={<ToolDetail />} />
        <Route path="/workspace/building-facilities/maintenance" element={<BuildingMaintenance />} />
        <Route path="/workspace/building-facilities/program-of-works" element={<BuildingProgramOfWorks />} />
        <Route path="/workspace/vehicle-fleet/maintenance-schedule" element={<VehicleMaintenanceSchedule />} />
        <Route path="/workspace/:moduleId" element={<WorkspaceModule />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/news" element={<News />} />
        <Route path="/news/:id" element={<NewsDetail />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/documents/:id" element={<DocumentDetail />} />
        <Route path="/storage" element={<Storage />} />
        <Route path="/storage/:folderId" element={<Storage />} />
        <Route path="/iso" element={<Iso />} />
        <Route path="/iso/:id" element={<IsoDocumentDetail />} />
        <Route path="/iso/:id/flowchart" element={<IsoFlowchartBuilder />} />
        <Route path="/organization" element={<Organization />} />
        <Route path="/organization/employee/:id" element={<OrganizationEmployee />} />
        <Route path="/organization/:deptId" element={<OrganizationDepartment />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/help" element={<Help />} />
        <Route path="/admin" element={<AdministratorRoute><Admin /></AdministratorRoute>} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
