/** Markup thuần (không hook, không bản dịch): dùng được ngoài `Providers` nơi chưa có IntlProvider. */
const RAIL_ITEMS = [0, 1, 2];
const SIDEBAR_ITEMS = [0, 1, 2, 3];
const MESSAGE_ROWS = [0, 1, 2, 3, 4];

export function ShellSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="shell-skeleton"
      className="flex h-dvh flex-col overflow-hidden bg-background"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:hidden">
        <div className="size-8 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-18 shrink-0 flex-col items-center gap-2 bg-rail py-3 md:flex">
          {RAIL_ITEMS.map((item) => (
            <div key={item} className="size-10 animate-pulse rounded-full bg-background/60" />
          ))}
        </div>
        <div className="hidden w-sidebar shrink-0 flex-col gap-2 bg-sidebar p-3 md:flex">
          <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
          {SIDEBAR_ITEMS.map((item) => (
            <div key={item} className="h-7 w-full animate-pulse rounded-md bg-muted" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-header shrink-0 items-center border-b px-4">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-1 flex-col justify-end gap-5 overflow-hidden p-4">
            {MESSAGE_ROWS.map((row) => (
              <div key={row} className="flex items-start gap-3">
                <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 pt-0">
            <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
