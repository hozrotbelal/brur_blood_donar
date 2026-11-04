import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { STAFF_ROLES } from '@/lib/api';
import { STAFF_NAV } from '@/lib/staff-nav';

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell roles={STAFF_ROLES} nav={STAFF_NAV}>
      {children}
    </AppShell>
  );
}
