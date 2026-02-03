import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enteral Tool",
  description: "Enteral nutrition calculation tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-slate-50">
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
