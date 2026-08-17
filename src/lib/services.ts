import {
  Clock, Wallet, CalendarOff, Briefcase, DoorOpen, Plane, Timer, FileBadge,
  Laptop, Wrench, Car, Package, Archive, MessageSquare, HelpCircle,
} from 'lucide-react';
import type { ProcessType } from './types';

export interface ServiceDef {
  id: string;
  name: string;
  description: string;
  category: 'Time & Pay' | 'Leave & Travel' | 'Personnel Documents' | 'Institutional Support';
  icon: typeof Clock;
  to: string;
  processType?: ProcessType;
  quickAction?: boolean;
}

export const SERVICES: ServiceDef[] = [
  { id: 'attendance', name: 'Attendance', description: 'View time records, clock in/out, and file corrections.', category: 'Time & Pay', icon: Clock, to: '/services/attendance', quickAction: true },
  { id: 'payroll', name: 'Payroll', description: 'View payslips, pay period summaries, and deductions.', category: 'Time & Pay', icon: Wallet, to: '/services/payroll', quickAction: true },
  { id: 'leave', name: 'Leave', description: 'File and track vacation, sick, and special leave requests.', category: 'Leave & Travel', icon: CalendarOff, to: '/services/leave', processType: 'leave', quickAction: true },
  { id: 'official-business', name: 'Official Business', description: 'Request authorization for field or off-site work.', category: 'Leave & Travel', icon: Briefcase, to: '/requests/new/official-business', processType: 'official-business', quickAction: true },
  { id: 'gate-pass', name: 'Gate Pass', description: 'Request a personal or property gate pass.', category: 'Leave & Travel', icon: DoorOpen, to: '/requests/new/gate-pass', processType: 'gate-pass', quickAction: true },
  { id: 'travel-order', name: 'Travel Order', description: 'Request an official travel order with routing.', category: 'Leave & Travel', icon: Plane, to: '/requests/new/travel-order', processType: 'travel-order', quickAction: true },
  { id: 'overtime', name: 'Overtime', description: 'Request overtime work authorization.', category: 'Time & Pay', icon: Timer, to: '/requests/new/overtime', processType: 'overtime', quickAction: true },
  { id: 'personnel-coe', name: 'Certificate of Employment', description: 'Request a certificate of employment.', category: 'Personnel Documents', icon: FileBadge, to: '/requests/new/personnel-request', processType: 'personnel-request' },
  { id: 'personnel-sr', name: 'Service Record', description: 'Request an official service record.', category: 'Personnel Documents', icon: FileBadge, to: '/requests/new/personnel-request', processType: 'personnel-request' },
  { id: 'personnel-ev', name: 'Employment Verification', description: 'Request employment verification for external parties.', category: 'Personnel Documents', icon: FileBadge, to: '/requests/new/personnel-request', processType: 'personnel-request' },
  { id: 'personnel-tr', name: 'Training Record', description: 'Request a copy of your official training record.', category: 'Personnel Documents', icon: FileBadge, to: '/requests/new/personnel-request', processType: 'personnel-request' },
  { id: 'service-it', name: 'IT Support', description: 'Report hardware, software, or network issues.', category: 'Institutional Support', icon: Laptop, to: '/requests/new/service-request-it', processType: 'service-request-it', quickAction: true },
  { id: 'service-facilities', name: 'Facilities', description: 'Request facilities maintenance or repair.', category: 'Institutional Support', icon: Wrench, to: '/requests/new/service-request-facilities', processType: 'service-request-facilities' },
  { id: 'service-vehicle', name: 'Vehicle', description: 'Request a service vehicle for official use.', category: 'Institutional Support', icon: Car, to: '/requests/new/service-request-vehicle', processType: 'service-request-vehicle' },
  { id: 'service-supplies', name: 'Supplies', description: 'Request office supplies and materials.', category: 'Institutional Support', icon: Package, to: '/requests/new/service-request-supplies', processType: 'service-request-supplies' },
  { id: 'service-records', name: 'Records', description: 'Request records retrieval or filing assistance.', category: 'Institutional Support', icon: Archive, to: '/requests/new/service-request-records', processType: 'service-request-records' },
  { id: 'service-comms', name: 'Communications Assistance', description: 'Request communications or publication support.', category: 'Institutional Support', icon: MessageSquare, to: '/requests/new/service-request-comms', processType: 'service-request-comms' },
  { id: 'service-other', name: 'Other Institutional Support', description: 'Submit any other institutional support request.', category: 'Institutional Support', icon: HelpCircle, to: '/requests/new/service-request-other', processType: 'service-request-other' },
];

export const QUICK_CREATE_ITEMS = SERVICES.filter((s) => s.quickAction);
