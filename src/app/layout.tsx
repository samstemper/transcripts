import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Earnings Insight — S&P 500 Earnings Call Search",
  description:
    "Search recent S&P 500 earnings call transcripts with AI-powered semantic retrieval and cited answers.",
  openGraph: {
    title: "Earnings Insight",
    description: "AI search over S&P 500 earnings call transcripts",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
