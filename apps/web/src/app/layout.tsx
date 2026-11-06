import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from '@/providers/providers';
import './globals.css';

// TF.13: kèm `vietnamese` — thiếu subset này dấu tiếng Việt rơi về font hệ điều hành, vừa
// lệch chữ giữa Windows/Linux (vỡ baseline ảnh) vừa khác tệp font so với phần chữ Latin.
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin', 'vietnamese'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin', 'vietnamese'],
});

export const metadata: Metadata = {
  title: 'Ping',
  description: 'Chat realtime kiểu Discord',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* `overflow-x-clip`: chặn scrollbar ngang của trang (không tạo scroll container, nên
          trang auth/public vẫn cuộn dọc được) — scrollbar ngang là gốc của chuỗi giật. */}
      <body className="min-h-full flex flex-col overflow-x-clip">
        {/* Ở root để cả trang login/register dùng được useMutation và bản dịch. lang="vi" chỉ là mặc định của HTML tĩnh; LocaleProvider đặt lại theo cookie. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
