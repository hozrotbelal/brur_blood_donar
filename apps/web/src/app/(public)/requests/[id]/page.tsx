import { RequestStatus } from '@/components/request-status';

export default async function RequestStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestStatus id={id} />;
}
