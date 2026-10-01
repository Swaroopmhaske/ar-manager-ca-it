import type { Paise } from "./types";

/**
 * Ageing bands (client change, replaces the brief's R12 bands).
 * Days past due = as-at date − due date. Only invoices with an
 * outstanding amount above zero are aged.
 *
 * This list is the single source of truth: every screen, export and
 * total iterates over it, so changing the bands means changing only
 * this file and `bucketFor` below.
 */
export const AGEING_BUCKETS = [
  "Not due",
  "1-15",
  "16-30",
  "31-45",
  "46-90",
  "Over 90",
] as const;

export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export function bucketFor(daysPastDue: number): AgeingBucket {
  if (daysPastDue <= 0) return "Not due";
  if (daysPastDue <= 15) return "1-15";
  if (daysPastDue <= 30) return "16-30";
  if (daysPastDue <= 45) return "31-45";
  if (daysPastDue <= 90) return "46-90";
  return "Over 90";
}

export type Ageing = Record<AgeingBucket, Paise>;

export function emptyAgeing(): Ageing {
  const ageing = {} as Ageing;
  for (const bucket of AGEING_BUCKETS) ageing[bucket] = 0;
  return ageing;
}

/** Adds several ageing breakdowns together, bucket by bucket. */
export function sumAgeing(list: Ageing[]): Ageing {
  const total = emptyAgeing();
  for (const ageing of list) {
    for (const bucket of AGEING_BUCKETS) total[bucket] += ageing[bucket];
  }
  return total;
}
