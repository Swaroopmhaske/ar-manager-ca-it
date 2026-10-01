import { loadArData } from "@/lib/ar/load";
import { getAsOf } from "@/lib/asof";
import { plainAmount } from "@/lib/ar/format";
import {
  filterInvoiceRows,
  invoiceFilterFromParams,
  invoiceListRows,
  invoiceListTotals,
  isInvoiceSortKey,
  sortInvoiceRows,
} from "@/lib/ar/lists";
import { csvResponse, toCsv } from "@/lib/csv";

/** CSV of the invoice list exactly as filtered and sorted on screen. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const asOf = getAsOf(p.get("asof") ?? undefined);
  const sort = isInvoiceSortKey(p.get("sort")) ? p.get("sort")! : "invoiceDate";
  const dir = p.get("dir") === "asc" ? "asc" : "desc";

  const data = await loadArData();
  const filter = invoiceFilterFromParams({
    q: p.get("q"),
    customer: p.get("customer"),
    status: p.get("status"),
    disputed: p.get("disputed"),
    from: p.get("from"),
    to: p.get("to"),
  });
  const rows = sortInvoiceRows(
    filterInvoiceRows(invoiceListRows(data, asOf), filter),
    isInvoiceSortKey(sort) ? sort : "invoiceDate",
    dir
  );
  const totals = invoiceListTotals(rows);

  const csv = toCsv([
    ["Invoices as at", asOf],
    [],
    [
      "Invoice No", "Customer Code", "Customer", "Invoice Date", "Due Date", "Total",
      "Received", "Credited", "Outstanding", "Status", "Days Late", "Part-paid", "Disputed",
    ],
    ...rows.map((r) => {
      const cancelled = r.status === "Cancelled";
      return [
        r.invoice.invoiceNo, r.customerCode, r.customerName, r.invoice.invoiceDate, r.invoice.dueDate,
        plainAmount(r.invoice.total),
        cancelled ? "" : plainAmount(r.received),
        cancelled ? "" : plainAmount(r.credited),
        cancelled ? "" : plainAmount(r.outstanding),
        r.status, r.daysLate, r.isPartPaid ? "Yes" : "No", r.isDisputed ? "Yes" : "No",
      ];
    }),
    [
      `Total (${totals.count}; cancelled excluded from amounts)`, "", "", "", "",
      plainAmount(totals.total), plainAmount(totals.received), plainAmount(totals.credited),
      plainAmount(totals.outstanding),
    ],
  ]);

  return csvResponse(csv, `Invoices_${asOf}.csv`);
}
