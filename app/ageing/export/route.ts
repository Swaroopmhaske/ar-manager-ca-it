import { NextResponse } from "next/server";
import { loadArData } from "@/lib/ar/load";
import { invoicePosition } from "@/lib/ar/calculations";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const asOf = searchParams.get("asof") ?? "2026-08-31";

  const data = await loadArData();
  const customers = new Map(
    data.customers.map((customer) => [customer.id, customer]),
  );

  const rows = data.invoices
    .filter((invoice) => invoice.invoiceDate <= asOf)
    .map((invoice) => ({
      invoice,
      position: invoicePosition(data, invoice, asOf),
    }))
    .filter(
      (item): item is typeof item & {
        position: NonNullable<typeof item.position>;
      } => item.position !== null && item.position.outstanding > 0,
    );

  const csvRows = [
    [
      "Invoice No",
      "Customer",
      "Due Date",
      "Outstanding",
      "Days Past Due",
      "Ageing Bucket",
    ],
    ...rows.map(({ invoice, position }) => [
      invoice.invoiceNo,
      customers.get(invoice.customerId)?.name ?? "",
      invoice.dueDate,
      (position.outstanding / 100).toFixed(2),
      String(position.daysPastDue),
      position.bucket ?? "",
    ]),
  ];

  const csv = csvRows
    .map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ageing.csv"',
    },
  });
}