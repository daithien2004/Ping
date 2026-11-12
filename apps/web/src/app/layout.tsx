import type { Metadata } from 'next';
import { Geist, Geist_Mono, Montserrat } from 'next/font/google';
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

// Font hiển thị của skin Pop (ADR-0084). Jost đẹp hơn nhưng không có subset `vietnamese`;
// Montserrat có. `preload: false`: chỉ tải khi một skin thật sự dùng, skin mặc định không tốn thêm.
const displayFont = Montserrat({
  variable: '--font-display',
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: '800',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Ping',
  description: 'Chat realtime kiểu Discord',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} h-full antialiased`}
    >
      {/* `overflow-x-clip`: chặn scrollbar ngang của trang (không tạo scroll container, nên
          trang auth/public vẫn cuộn dọc được) — scrollbar ngang là gốc của chuỗi giật. */}
      <body className="min-h-full flex flex-col overflow-x-clip">
        {/* Provider nằm ở layout từng nhóm route: nhóm app cần khung tĩnh trong HTML, nhóm
            công khai không. lang="vi" chỉ là mặc định của HTML tĩnh; LocaleProvider đặt lại theo cookie. */}
        {children}
      </body>
    </html>
  );
}
