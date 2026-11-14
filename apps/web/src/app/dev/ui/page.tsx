import { notFound } from 'next/navigation';
import { isProduction } from '@/lib/env';
import { Providers } from '@/providers/providers';
import { DevUiGallery } from './gallery';

export default function DevUiPage() {
  if (isProduction) notFound();
  return (
    <Providers>
      <DevUiGallery />
    </Providers>
  );
}
