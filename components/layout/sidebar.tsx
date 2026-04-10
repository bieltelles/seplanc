"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  TrendingUp,
  FileText,
  ShieldCheck,
  Upload,
  FolderOpen,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/receitas", label: "Receitas", icon: TrendingUp },
  { href: "/rreo", label: "RREO", icon: FileText },
  { href: "/rgf", label: "RGF", icon: ShieldCheck },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/exercicios", label: "Exercícios", icon: FolderOpen },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-semfaz-700 text-white">
      {/* Header */}
      <div className="flex h-16 items-center gap-3 border-b border-semfaz-600 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-wide">SEMFAZ</h1>
          <p className="text-[10px] text-semfaz-200">Dashboard Financeiro</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-white/15 text-white"
                  : "text-semfaz-200 hover:bg-white/10 hover:text-white",
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-semfaz-600 p-4">
        <p className="text-[10px] text-semfaz-300">
          Secretaria da Fazenda Municipal
        </p>
        <p className="text-[10px] text-semfaz-400">
          São Luís - MA
        </p>
      </div>
    </aside>
  );
}
