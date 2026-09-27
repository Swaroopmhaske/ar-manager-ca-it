import type { Metadata } from "next";
import { Suspense } from "react";

import "./globals.css";
import Header from "./components/Header";

export const metadata: Metadata = {
  title: "AR Manager",
  description: "Accounts Receivable Manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">
        <Suspense fallback={null}>
          <Header />
        </Suspense>

        {children}
      </body>
    </html>
  );
}