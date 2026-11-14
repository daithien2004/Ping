const BADGE_SIZE = 64;
let originalHref: string | null = null;
let iconImage: HTMLImageElement | null = null;

function iconLink(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null;
  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (existing) return existing;
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = '/favicon.ico';
  document.head.appendChild(link);
  return link;
}

function renderBadge(link: HTMLLinkElement, image: HTMLImageElement): void {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = BADGE_SIZE;
    canvas.height = BADGE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, BADGE_SIZE, BADGE_SIZE);
    ctx.drawImage(image, 0, 0, BADGE_SIZE, BADGE_SIZE);
    ctx.beginPath();
    ctx.arc(BADGE_SIZE - 14, 14, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    const url = canvas.toDataURL('image/png');
    if (link.href !== url) link.href = url;
  } catch {
    // Canvas có thể bị taint (favicon khác origin) — bỏ qua badge, không nổi lỗi.
  }
}

export function drawFaviconBadge(count: number): void {
  const link = iconLink();
  if (!link) return;
  if (count <= 0) {
    if (originalHref !== null && link.href !== originalHref) link.href = originalHref;
    originalHref = null;
    iconImage = null;
    return;
  }
  if (originalHref === null) originalHref = link.href;
  if (iconImage) {
    renderBadge(link, iconImage);
    return;
  }
  const image = new Image();
  image.onload = () => {
    iconImage = image;
    renderBadge(link, image);
  };
  image.onerror = () => {};
  image.src = originalHref;
}
