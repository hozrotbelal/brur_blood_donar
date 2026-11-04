import { CaseDetail } from '@/components/case-detail';

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetail id={id} />;
}
