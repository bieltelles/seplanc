"use client";

import { Select } from "@/components/ui/select";

interface HeaderProps {
  title: string;
  subtitle?: string;
  anos?: number[];
  selectedAno?: number;
  onAnoChange?: (ano: number) => void;
}

export function Header({ title, subtitle, anos, selectedAno, onAnoChange }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-4">
      <div>
        <h1 className="text-xl font-bold text-semfaz-700">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {anos && anos.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Exercício:</span>
          <Select
            options={anos.map((a) => ({ value: String(a), label: String(a) }))}
            value={String(selectedAno || anos[0])}
            onChange={(e) => onAnoChange?.(parseInt(e.target.value))}
            className="w-28"
          />
        </div>
      )}
    </header>
  );
}
