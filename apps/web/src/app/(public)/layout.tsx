import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { PUBLIC_ROLES } from '@/lib/api';
import { PUBLIC_NAV } from '@/lib/public-nav';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell roles={PUBLIC_ROLES} nav={PUBLIC_NAV}>
      {children}
    </AppShell>
  );
}
