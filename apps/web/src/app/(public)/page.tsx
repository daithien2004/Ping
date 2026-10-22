'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslations } from 'use-intl';
import { PingAvatar } from '@/components/ui/ping-avatar';
import { PingButton } from '@/components/ui/ping-button';
import { PingTag } from '@/components/ui/ping-tag';
import { getSession } from '@/features/auth/api';
import { qk } from '@/lib/query-keys';

/**
 * Trang landing công khai (TF.8).
 *
 * Người đã đăng nhập thì vào app luôn; khách mới thấy phần giới thiệu + đường vào đăng nhập /
 * đăng ký. Mọi chuỗi nằm trong `messages/*.json` (namespace `landing`) — không hardcode.
 */
export default function LandingPage() {
  const router = useRouter();
  const t = useTranslations('landing');
  const { data: me } = useQuery({
    queryKey: qk.me,
    queryFn: getSession,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (me) router.replace('/servers');
  }, [me, router]);

  const features = [
    { title: t('featureRealtimeTitle'), text: t('featureRealtimeText') },
    { title: t('featureServerTitle'), text: t('featureServerText') },
    { title: t('featurePermissionTitle'), text: t('featurePermissionText') },
    { title: t('featureAiTitle'), text: t('featureAiText') },
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 py-16">
      <section className="flex flex-col items-start gap-6">
        <PingTag color="purple">{t('eyebrow')}</PingTag>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t('title')}</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{t('tagline')}</p>
        <div className="flex flex-wrap gap-3">
          <PingButton size="lg" onClick={() => router.push('/register')}>
            {t('ctaRegister')}
          </PingButton>
          <PingButton size="lg" variant="secondary" onClick={() => router.push('/login')}>
            {t('ctaLogin')}
          </PingButton>
        </div>
      </section>

      <section aria-labelledby="landing-features" className="flex flex-col gap-6">
        <h2 id="landing-features" className="text-2xl font-semibold">
          {t('featuresTitle')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-base font-medium">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="landing-demo" className="flex flex-col gap-6">
        <div>
          <h2 id="landing-demo" className="text-2xl font-semibold">
            {t('demoTitle')}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('demoText')}</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border bg-sidebar px-4 py-3">
            <span className="font-medium"># {t('demoChannel')}</span>
            <PingTag>{t('demoTag')}</PingTag>
          </div>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex gap-3">
              <PingAvatar presence="online" size={40} />
              <div>
                <p className="text-sm font-medium">{t('demoAuthor1')}</p>
                <p className="text-sm text-muted-foreground">{t('demoMessage1')}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <PingAvatar presence="offline" size={40} />
              <div>
                <p className="text-sm font-medium">{t('demoAuthor2')}</p>
                <p className="text-sm text-muted-foreground">{t('demoMessage2')}</p>
              </div>
            </div>
          </div>
          <div className="border-t border-border p-4">
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              {t('demoComposer')}
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col items-start gap-4 rounded-xl border border-border bg-muted p-8">
        <h2 className="text-2xl font-semibold">{t('finalTitle')}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{t('finalText')}</p>
        <PingButton size="lg" onClick={() => router.push('/register')}>
          {t('ctaRegister')}
        </PingButton>
      </section>
    </main>
  );
}
