import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { CorrectionProvider } from "@/components/providers/correction-provider";
import { DeducoesProvider } from "@/components/providers/deducoes-provider";

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
        <CorrectionProvider>
          <DeducoesProvider>
            <Sidebar />
            <main className="ml-64 min-h-screen bg-slate-50">
              {children}
            </main>
          </DeducoesProvider>
        </CorrectionProvider>
      </body>
    </html>
  );
}
