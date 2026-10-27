import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "hello-world", description: "Agent-ready Next.js + Supabase starter" };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
