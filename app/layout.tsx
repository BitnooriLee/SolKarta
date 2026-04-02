import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "SolKarta — 일조권 분석 플랫폼",
  description:
    "스웨덴 부동산 매물의 실제 햇빛 유입 시간을 물리 데이터로 분석합니다. Analysera solljus för svenska bostäder.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv" className={GeistSans.variable}>
      <body className="flex flex-col h-dvh overflow-hidden antialiased">
        {children}
      </body>
    </html>
  );
}
