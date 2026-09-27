"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabase } from "@/lib/db";
import { loadArData } from "@/lib/ar/load";
import { addDays } from "@/lib/ar/date";

const schema = z.object({
  customerId: z.coerce.number().int().positive(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1),
  taxableValue: z.coerce.number().min(0),
  gstRate: z.coerce.number().refine(
    (value) => value === 18,
    "GST rate must be 18%",
  ),
});

function financialYear(date: string): string {
  const [year, month] = date.split("-").map(Number);

  if (month >= 4) {
    return `${String(year).slice(-2)}-${String(year + 1).slice(-2)}`;
  }

  return `${String(year - 1).slice(-2)}-${String(year).slice(-2)}`;
}

export async function createInvoice(formData: FormData) {
  const parsed = schema.safeParse({
    customerId: formData.get("customerId"),
    invoiceDate: formData.get("invoiceDate"),
    description: formData.get("description"),
    taxableValue: formData.get("taxableValue"),
    gstRate: formData.get("gstRate"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid invoice details",
    };
  }

  const values = parsed.data;
  const data = await loadArData();

  const customer = data.customers.find(
    (item) => item.id === values.customerId,
  );

  if (!customer) {
    return {
      success: false,
      error: "Customer not found",
    };
  }

  if (!customer.isActive) {
    return {
      success: false,
      error: "Inactive customers cannot receive new invoices",
    };
  }

  const taxablePaise = Math.round(values.taxableValue * 100);

  const gstPaise = Math.round(
    (taxablePaise * 18) / 100,
  );

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (customer.state?.toLowerCase() === "maharashtra") {
    cgstPaise = Math.round(gstPaise / 2);
    sgstPaise = gstPaise - cgstPaise;
  } else {
    igstPaise = gstPaise;
  }

  const totalPaise =
    taxablePaise +
    cgstPaise +
    sgstPaise +
    igstPaise;

  const fy = financialYear(values.invoiceDate);
  const prefix = `BWA/${fy}/`;

  const nextNumber =
    data.invoices
      .filter((invoice) => invoice.invoiceNo.startsWith(prefix))
      .reduce((max, invoice) => {
        const match = invoice.invoiceNo.match(/(\d+)$/);
        return Math.max(max, match ? Number(match[1]) : 0);
      }, 0) + 1;

  const invoiceNo = `${prefix}${String(nextNumber).padStart(4, "0")}`;

  const dueDate = addDays(
    values.invoiceDate,
    customer.creditDays,
  );

  const { error } = await supabase.from("invoices").insert({
    customer_id: customer.id,
    invoice_no: invoiceNo,
    invoice_date: values.invoiceDate,
    due_date: dueDate,
    description: values.description,
    taxable_value: taxablePaise / 100,
    gst_rate_pct: 18,
    cgst: cgstPaise / 100,
    sgst: sgstPaise / 100,
    igst: igstPaise / 100,
    total: totalPaise / 100,
    is_cancelled: false,
    is_disputed: false,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath("/invoices");
  revalidatePath("/");

  return {
    success: true,
    invoiceNo,
  };
}