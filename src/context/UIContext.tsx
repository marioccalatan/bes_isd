import { createContext, useContext, useState, type ReactNode } from 'react';

export const TOUR_STEPS = [
  { path: '/home', title: 'Enterprise Home', body: 'Your day starts here — tasks, approvals, the enterprise calendar, and news all in one place.' },
  { path: '/home', title: 'Enterprise Calendar', body: 'The calendar is the most prominent element on the home page, combining enterprise, department, and personal events.' },
  { path: '/news', title: 'News & Memo Acknowledgment', body: 'Employees can read, bookmark, and formally acknowledge memos that require it.' },
  { path: '/services', title: 'Employee Services', body: 'A catalog of self-service actions — attendance, payroll, leave, travel, and more.' },
  { path: '/requests/new/leave', title: 'Filing a Request', body: 'Requests like Leave or Travel Orders can be filed, saved as drafts, and tracked end-to-end.' },
  { path: '/my-work', title: 'Manager Approval', body: 'Managers review, approve, return, or reject requests directly from the unified work queue.' },
  { path: '/workspace', title: 'Institutional Services Workspace', body: "Alex's department workspace, including the BES Governance and Adoption module." },
  { path: '/workflows', title: 'Shared Workflow Tracking', body: 'Cross-department workflows like Procurement and Project Proposals show a visual stage tracker.' },
  { path: '/reports', title: 'Reports and Analytics', body: 'Role-based dashboards summarize enterprise, department, and workforce performance.' },
  { path: '/home', title: 'Role Preview', body: 'Use "View BES As" in the profile menu to demonstrate the system from another role’s perspective.' },
];

interface UIContextValue {
  aboutOpen: boolean;
  setAboutOpen: (v: boolean) => void;
  tourActive: boolean;
  tourStep: number;
  startTour: () => void;
  stopTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
}

const UIContext = createContext<UIContextValue | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  return (
    <UIContext.Provider
      value={{
        aboutOpen, setAboutOpen,
        tourActive, tourStep,
        startTour: () => { setTourStep(0); setTourActive(true); },
        stopTour: () => setTourActive(false),
        nextTourStep: () => setTourStep((s) => Math.min(TOUR_STEPS.length - 1, s + 1)),
        prevTourStep: () => setTourStep((s) => Math.max(0, s - 1)),
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
