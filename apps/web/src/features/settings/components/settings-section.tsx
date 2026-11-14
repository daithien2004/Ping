'use client';

import type { ReactNode } from 'react';

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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid={testId}>
      <div className="mx-auto flex w-full max-w-settings-content flex-col gap-6 p-6 md:px-10 md:py-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{title}</h1>
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </header>
        {children}
      </div>
    </div>
  );
}
