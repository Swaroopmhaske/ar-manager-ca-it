import { NextResponse } from "next/server";
import { loadArData } from "@/lib/ar/load";
import { statement } from "@/lib/ar/calculations";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const customerId = Number(searchParams.get("customer"));
  const from = searchParams.get("from") ?? "2026-04-01";
  const to = searchParams.get("to") ?? "2026-08-31";

  if (!Number.isInteger(customerId)) {
    return new NextResponse("Invalid customer", { status: 400 });
  }

  const data = await loadArData();

  const customer = data.customers.find(
    (item) => item.id === customerId,
  );

  if (!customer) {
    return new NextResponse("Customer not found", { status: 404 });
  }

  const result = statement(data, customerId, from, to);

  const rows = [
    ["Date", "Type", "Document No", "Debit", "Credit", "Balance"],
    ...result.lines.map((line) => [
      line.date,
      line.type,
      line.documentNo,
      (line.debit / 100).toFixed(2),
      (line.credit / 100).toFixed(2),
      (line.balance / 100).toFixed(2),
    ]),
  ];

  const csv = rows
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${customer.code}.csv"`,
    },
  });
}