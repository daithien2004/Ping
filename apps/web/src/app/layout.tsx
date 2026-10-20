import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from '@/providers/providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Ping',
  description: 'Chat realtime kiểu Discord',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Ở root để cả trang login/register dùng được useMutation và bản dịch. lang="vi" chỉ là mặc định của HTML tĩnh; LocaleProvider đặt lại theo cookie. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
