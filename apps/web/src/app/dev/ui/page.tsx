import { notFound } from 'next/navigation';
import { isProduction } from '@/lib/env';
import { DevUiGallery } from './gallery';

export default function DevUiPage() {
  // Kho giao diện chỉ để xem tay trong `next dev`; bản production dựng tĩnh trang này ra 404.
  if (isProduction) notFound();
  return <DevUiGallery />;
}
