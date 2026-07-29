import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Instant Vocabulary",
  description: "短時間で意味を想起する英単語学習アプリ"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
