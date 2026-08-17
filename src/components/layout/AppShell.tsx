import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar, MobileDrawer } from './Sidebar';
import { Topbar } from './Topbar';
import { RolePreviewBanner } from './RolePreviewBanner';
import { Footer } from './Footer';
import { AboutDialog } from './AboutDialog';
import { GuidedTour } from './GuidedTour';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-svh w-full overflow-hidden bg-canvas">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <RolePreviewBanner />
        <Topbar onOpenDrawer={() => setDrawerOpen(true)} />
        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-6">
          <Outlet />
        </main>
        <Footer />
      </div>
      <AboutDialog />
      <GuidedTour />
    </div>
  );
}
