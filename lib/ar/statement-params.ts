import { fyLabel } from "./documents";

const isDate = (v?: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Statement period from the URL. Defaults: from = 1 April of the as-at
 * date's financial year, to = the as-at date.
 */
export function statementPeriod(
  asOf: string,
  from?: string | null,
  to?: string | null
): { from: string; to: string; error: string | null } {
  const start = `20${fyLabel(asOf).slice(0, 2)}-04-01`;
  const f = isDate(from) ? from : start;
  const t = isDate(to) ? to : asOf;
  return { from: f, to: t, error: f > t ? "The From date is after the To date." : null };
}
