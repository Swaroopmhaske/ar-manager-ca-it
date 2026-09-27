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
      } => item.position !== null,
    );

  const csvRows = [
    [
      "Invoice No",
      "Customer",
      "Invoice Date",
      "Due Date",
      "Total",
      "Received",
      "Credited",
      "Outstanding",
      "Status",
      "Days Late",
    ],
    ...rows.map(({ invoice, position }) => [
      invoice.invoiceNo,
      customers.get(invoice.customerId)?.name ?? "",
      invoice.invoiceDate,
      invoice.dueDate,
      (invoice.total / 100).toFixed(2),
      (position.received / 100).toFixed(2),
      (position.credited / 100).toFixed(2),
      (position.outstanding / 100).toFixed(2),
      position.status,
      String(position.daysPastDue),
    ]),
  ];

  const csv = csvRows
    .map((row) =>
      row.map((value) =>
        `"${String(value).replace(/"/g, '""')}"`
      ).join(","),
    )
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"invoices.csv\"",
    },
  });
}