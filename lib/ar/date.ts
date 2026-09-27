import type { Paise } from "./types";

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);

  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);

  return Math.round((toUtc - fromUtc) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);

  const result = new Date(Date.UTC(year, month - 1, day));
  result.setUTCDate(result.getUTCDate() + days);

  const y = result.getUTCFullYear();
  const m = String(result.getUTCMonth() + 1).padStart(2, "0");
  const d = String(result.getUTCDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

export function settlementValue(
  bankAmount: Paise,
  tdsAmount: Paise
): Paise {
  return bankAmount + tdsAmount;
}