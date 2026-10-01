import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { plainAmount } from "@/lib/ar/format";
import { AGEING_BUCKETS, customerPositions } from "@/lib/ar/calculations";
import { dashboardSummary } from "@/lib/ar/attention";
import { csvResponse, toCsv } from "@/lib/csv";

/** The ageing report (by customer, with a totals row), as on the dashboard. */
export async function GET(request: Request) {
  const asOf = getAsOf(new URL(request.url).searchParams.get("asof") ?? undefined);
  const data = await loadArData();
  const customers = new Map(data.customers.map((c) => [c.id, c]));
  const positions = customerPositions(data, asOf).filter(
    (p) => p.outstanding !== 0 || p.unappliedCredit !== 0
  );
  const totals = dashboardSummary(data, asOf);

  const csv = toCsv([
    ["Ageing as at", asOf, "Days past due are counted from the due date"],
    [],
    ["Customer Code", "Customer", ...AGEING_BUCKETS, "Outstanding", "Unapplied Credit", "Net Balance"],
    ...positions.map((p) => [
      customers.get(p.customerId)?.code,
      customers.get(p.customerId)?.name,
      ...AGEING_BUCKETS.map((b) => plainAmount(p.ageing[b])),
      plainAmount(p.outstanding),
      plainAmount(p.unappliedCredit),
      plainAmount(p.netBalance),
    ]),
    [
      "Total", "",
      ...AGEING_BUCKETS.map((b) => plainAmount(totals.ageing[b])),
      plainAmount(totals.totalOutstanding),
      plainAmount(totals.unappliedCredit),
      plainAmount(totals.netReceivable),
    ],
  ]);

  return csvResponse(csv, `Ageing_${asOf}.csv`);
}
