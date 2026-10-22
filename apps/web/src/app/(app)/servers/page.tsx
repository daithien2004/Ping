import { HomeRedirect } from '@/features/servers/components/home-redirect';

/** "/servers": vào server đầu tiên, hoặc mở wizard onboarding khi chưa có server. */
export default function ServersPage() {
  return <HomeRedirect />;
}
