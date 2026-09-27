import type { Paise } from "./types";

export function formatAmount(paise: Paise): string {
  const sign = paise < 0 ? "-" : "";
  const absolutePaise = Math.abs(paise);

  const rupees = Math.floor(absolutePaise / 100);
  const decimals = String(absolutePaise % 100).padStart(2, "0");

  const indianRupees = rupees.toLocaleString("en-IN");

  return `${sign}₹${indianRupees}.${decimals}`;
}

export function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return `${String(day).padStart(2, "0")}-${monthNames[month - 1]}-${year}`;
}

export function formatBalance(
  paise: Paise,
  suffix: "Dr" | "Cr"
): string {
  return `${formatAmount(Math.abs(paise))} ${suffix}`;
}