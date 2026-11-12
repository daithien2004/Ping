'use client';

import { useQuery } from '@tanstack/react-query';
import { Hash, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslations } from 'use-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PingButton } from '@/components/ui/ping-button';
import { PingTag } from '@/components/ui/ping-tag';
import { getSession } from '@/features/auth/api';
import { UserAvatar } from '@/features/profile/components/user-avatar';
import { qk } from '@/lib/query-keys';

/**
 * Trang landing công khai (TF.8).
 *
 * Người đã đăng nhập thì vào app luôn; khách mới thấy phần giới thiệu + đường vào đăng nhập /
 * đăng ký. Mọi chuỗi nằm trong `messages/*.json` (namespace `landing`) — không hardcode.
 * Hình thức Pop (ADR-0084) bám vào các `data-slot="landing-*"`; skin khác dùng khung trung tính.
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
    { icon: Zap, title: t('featureRealtimeTitle'), text: t('featureRealtimeText') },
    { icon: Hash, title: t('featureServerTitle'), text: t('featureServerText') },
    { icon: ShieldCheck, title: t('featurePermissionTitle'), text: t('featurePermissionText') },
    { icon: Sparkles, title: t('featureAiTitle'), text: t('featureAiText') },
  ];
  const steps = [
    { title: t('step1Title'), text: t('step1Text') },
    { title: t('step2Title'), text: t('step2Text') },
    { title: t('step3Title'), text: t('step3Text') },
  ];
  const ticker = features.map((feature) => feature.title).join(' ★ ');

  return (
    <div data-slot="landing" className="flex flex-col">
      <header
        data-slot="landing-nav"
        className="flex items-center justify-between border-b border-border px-6 py-3"
      >
        <span className="flex items-center gap-2 text-lg font-semibold">
          <b aria-hidden data-slot="landing-logo" className="hidden">
            P
          </b>
          Ping
        </span>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <PingButton variant="secondary" onClick={() => router.push('/login')}>
            {t('ctaLogin')}
          </PingButton>
        </div>
      </header>

      <main>
        <section
          data-slot="landing-hero"
          className="mx-auto grid w-full max-w-5xl items-center gap-10 px-6 py-16 md:grid-cols-2"
        >
          <div className="flex flex-col items-start gap-5">
            <PingTag color="purple" data-slot="landing-eyebrow">
              {t('eyebrow')}
            </PingTag>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              <span className="block">{t('titleLead')}</span>
              <span data-slot="landing-mark" className="text-primary">
                {t('titleMark')}
              </span>
              <span className="block">{t('titleTail')}</span>
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">{t('tagline')}</p>
            <div className="flex flex-wrap gap-3">
              <PingButton variant="primary" size="lg" onClick={() => router.push('/register')}>
                {t('ctaRegister')}
              </PingButton>
              <PingButton size="lg" variant="secondary" onClick={() => router.push('/login')}>
                {t('ctaLogin')}
              </PingButton>
            </div>
          </div>

          <div data-slot="landing-window-wrap" className="relative">
            <div
              data-slot="landing-window"
              className="relative overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="border-b border-border bg-sidebar px-4 py-3 font-medium">
                # {t('demoChannel')}
              </div>
              <div className="flex flex-col gap-4 p-4">
                <div className="flex items-end gap-3">
                  <UserAvatar name={t('demoAuthor1')} avatarUrl={null} size={32} />
                  <p className="rounded-xl bg-muted px-3 py-2 text-sm" data-slot="landing-bubble">
                    {t('demoMessage1')}
                  </p>
                </div>
                <div className="flex items-end gap-3">
                  <UserAvatar name={t('demoAuthor2')} avatarUrl={null} size={32} />
                  <p
                    className="rounded-xl bg-muted px-3 py-2 text-sm"
                    data-slot="landing-bubble"
                    data-mine="true"
                  >
                    {t('demoMessage2')}
                  </p>
                </div>
              </div>
              <div className="border-t border-border p-4">
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                  {t('demoComposer')}
                </div>
              </div>
            </div>
          </div>
        </section>

        <p aria-hidden data-slot="landing-marquee" className="hidden">
          <span>{`${ticker} ★ ${ticker} ★`}</span>
        </p>

        <section
          aria-labelledby="landing-features"
          data-slot="landing-features"
          className="border-b border-border py-16"
        >
          <div className="mx-auto w-full max-w-5xl px-6">
            <h2 id="landing-features" className="mb-8 text-2xl font-semibold">
              {t('featuresTitle')}
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              {features.map(({ icon: Icon, title, text }) => (
                <article
                  key={title}
                  data-slot="landing-feature"
                  className="flex gap-4 rounded-xl border border-border bg-card p-5"
                >
                  <span
                    data-slot="landing-icon"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted"
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-base font-medium">{title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="landing-steps" data-slot="landing-steps" className="py-16">
          <div className="mx-auto w-full max-w-5xl px-6">
            <h2 id="landing-steps" className="mb-10 text-2xl font-semibold">
              {t('stepsTitle')}
            </h2>
            <ol className="grid gap-8 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} data-slot="landing-step" className="text-center">
                  <span
                    data-slot="landing-step-number"
                    className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-muted text-xl font-semibold"
                  >
                    {index + 1}
                  </span>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          data-slot="landing-cta"
          className="flex flex-wrap items-center justify-between gap-5 border-t border-border bg-muted px-6 py-10"
        >
          <span aria-hidden data-slot="landing-stamp" className="hidden">
            {t('stamp')}
          </span>
          <h2 className="text-2xl font-semibold">{t('finalTitle')}</h2>
          <PingButton variant="primary" size="lg" onClick={() => router.push('/register')}>
            {t('ctaRegister')}
          </PingButton>
        </section>
      </main>

      <footer
        data-slot="landing-footer"
        className="flex justify-between border-t border-border px-6 py-3 text-sm text-muted-foreground"
      >
        <span>Ping</span>
        <span>{t('eyebrow')}</span>
      </footer>
    </div>
  );
}
