import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { AGEING_BUCKETS, statement } from "@/lib/ar/calculations";
import { statementPeriod } from "@/lib/ar/statement-params";
import { plainAmount } from "@/lib/ar/format";
import { SELLER } from "@/lib/seller";
import { csvResponse, toCsv } from "@/lib/csv";

const drCr = (p: number) => (p > 0 ? "Dr" : p < 0 ? "Cr" : "");

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const asOf = getAsOf(p.get("asof") ?? undefined);
  const { from, to, error } = statementPeriod(asOf, p.get("from"), p.get("to"));
  if (error) return new Response(error, { status: 400 });

  const data = await loadArData();
  const customer = data.customers.find((c) => c.id === Number(p.get("customer")));
  if (!customer) return new Response("Customer not found", { status: 404 });

  const result = statement(data, customer.id, from, to);
  const balance = (v: number) => [plainAmount(Math.abs(v)), drCr(v)];

  const csv = toCsv([
    [SELLER.name, `${SELLER.address}, ${SELLER.state}`],
    ["Statement of Account", customer.code, customer.name],
    ["Period", from, to],
    [],
    ["Date", "Particulars", "Document No", "Debit", "Credit", "Balance", "Dr/Cr"],
    [from, "Opening balance", "", "", "", ...balance(result.openingBalance)],
    ...result.lines.map((l) => [
      l.date,
      l.type,
      l.documentNo,
      l.debit > 0 ? plainAmount(l.debit) : "",
      l.credit > 0 ? plainAmount(l.credit) : "",
      ...balance(l.balance),
    ]),
    [to, "Closing balance", "", "", "", ...balance(result.closingBalance)],
    [],
    ["Ageing of closing balance", ...AGEING_BUCKETS, "Unapplied credit"],
    ["", ...AGEING_BUCKETS.map((b) => plainAmount(result.ageing[b])), plainAmount(result.unappliedCredit)],
  ]);

  return csvResponse(csv, `Statement_${customer.code}_${from}_to_${to}.csv`);
}
