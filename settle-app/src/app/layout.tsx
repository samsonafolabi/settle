import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "Settle",
  description: "Intent-based DeFi agent on Somnia",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0F0F0F" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
