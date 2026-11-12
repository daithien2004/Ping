import { notFound } from 'next/navigation';
import { isProduction } from '@/lib/env';
import { Providers } from '@/providers/providers';
import { DevUiGallery } from './gallery';

export default function DevUiPage() {
  // Kho giao diện chỉ để xem tay trong `next dev`; bản production dựng tĩnh trang này ra 404.
  if (isProduction) notFound();
  // Trang dev nằm ngoài mọi nhóm route nên tự bọc provider.
  return (
    <Providers>
      <DevUiGallery />
    </Providers>
  );
}
