'use client';

import type { ReactNode } from 'react';

/** Khung chung một mục cài đặt: tiêu đề + gợi ý + nội dung cuộn được (như AdminSurface). */
export function SettingsSection({
  title,
  hint,
  testId,
  children,
}: {
  title: string;
  hint?: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6" data-testid={testId}>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </header>
      {children}
    </div>
  );
}
