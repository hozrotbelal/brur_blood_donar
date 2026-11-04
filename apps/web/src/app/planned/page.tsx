import { PlannedScreen } from '@/components/planned-screen';
import { AppShell } from '@/components/app-shell';
import { PUBLIC_ROLES, STAFF_ROLES } from '@/lib/api';
import { PUBLIC_NAV } from '@/lib/public-nav';
import { STAFF_NAV } from '@/lib/staff-nav';

export default async function PlannedPage({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  const { screen } = await searchParams;
  return (
    <AppShell roles={[...STAFF_ROLES, ...PUBLIC_ROLES]} nav={{ ...STAFF_NAV, ...PUBLIC_NAV }}>
      <PlannedScreen screenKey={screen ?? ''} />
    </AppShell>
  );
}
