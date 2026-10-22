import { notFound } from 'next/navigation';
import { PingButton } from '@/components/ui/ping-button';
import { PingInput } from '@/components/ui/ping-input';
import { PingTag } from '@/components/ui/ping-tag';
import { PingBadge } from '@/components/ui/ping-badge';
import { PingAlert } from '@/components/ui/ping-alert';
import { PingSkeleton } from '@/components/ui/ping-skeleton';
import { PingEmpty } from '@/components/ui/ping-empty';
import { PingSpinner } from '@/components/ui/ping-spinner';
import { PingAvatar } from '@/components/ui/ping-avatar';
import { PingKbd } from '@/components/ui/ping-kbd';
import { PingDivider } from '@/components/ui/ping-divider';

export default function DevUiPage() {
   
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1>UI inventory (dev only)</h1>
      <PingButton>Button</PingButton>
      <PingInput placeholder="Input" />
      <PingTag>Tag</PingTag>
      <PingBadge count={5} />
      <PingAlert message="Alert" type="info" />
      <PingSkeleton active />
      <PingEmpty description="Empty" />
      <PingSpinner />
      <PingAvatar presence="online" />
      <PingKbd>K</PingKbd>
      <PingDivider />
    </main>
  );
}
