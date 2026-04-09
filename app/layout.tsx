import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: "SEMFAZ - Dashboard Financeiro",
  description: "Dashboard financeiro da Secretaria da Fazenda Municipal de São Luís",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <Sidebar />
        <main className="ml-64 min-h-screen bg-slate-50">
          {children}
        </main>
      </body>
    </html>
  );
}
