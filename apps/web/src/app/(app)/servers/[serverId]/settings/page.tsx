import { AdminSurface } from '@/features/admin/components/admin-surface';

export default function ServerSettingsPage({ params }: { params: Promise<{ serverId: string }> }) {
  return <AdminSurface params={params} />;
}
