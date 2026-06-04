import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(fecha: string | Date | null | undefined): string {
  if (!fecha) return '—';
  const d = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
    ? new Date(`${fecha}T00:00:00`)
    : new Date(fecha);
  if (isNaN(d.getTime())) return String(fecha);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const BOM = '﻿';
  const lines = [
    headers.join(','),
    ...rows.map(row =>
      row.map(cell => {
        const str = String(cell ?? '');
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    )
  ];
  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
