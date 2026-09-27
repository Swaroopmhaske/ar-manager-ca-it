"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadArData } from "@/lib/ar/load";
import { supabase } from "@/lib/db";

const schema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  creditNoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxableValue: z.coerce.number().positive(),
  reason: z.string().trim().min(1),
});

export async function createCreditNote(formData: FormData) {
  const parsed = schema.safeParse({
    invoiceId: formData.get("invoiceId"),
    creditNoteDate: formData.get("creditNoteDate"),
    taxableValue: formData.get("taxableValue"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Invalid credit note details",
    };
  }

  const values = parsed.data;
  const data = await loadArData();

  const invoice = data.invoices.find(
    (item) => item.id === values.invoiceId
  );

  if (!invoice) {
    return {
      success: false,
      error: "Invoice not found",
    };
  }

  if (invoice.isCancelled) {
    return {
      success: false,
      error: "A cancelled invoice cannot receive a credit note",
    };
  }

  if (values.creditNoteDate < invoice.invoiceDate) {
    return {
      success: false,
      error: "Credit note date cannot be before invoice date",
    };
  }

  const taxablePaise = Math.round(values.taxableValue * 100);

  const gstPaise = Math.round(
    (taxablePaise * invoice.gstRatePct) / 100
  );

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  const customer = data.customers.find(
    (item) => item.id === invoice.customerId
  );

  if (customer?.state?.toLowerCase() === "maharashtra") {
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

  const allocatedPaise = data.allocations
    .filter((item) => item.invoiceId === invoice.id)
    .reduce((sum, item) => sum + item.amount, 0);

  const existingCreditPaise = data.creditNotes
    .filter((item) => item.invoiceId === invoice.id)
    .reduce((sum, item) => sum + item.total, 0);

  if (
    allocatedPaise +
      existingCreditPaise +
      totalPaise >
    invoice.total
  ) {
    return {
      success: false,
      error:
        "Credit note exceeds the invoice amount after existing allocations and credit notes",
    };
  }

  const nextNumber =
    data.creditNotes.reduce((max, note) => {
      const match = note.creditNoteNo.match(/(\d+)$/);
      return Math.max(
        max,
        match ? Number(match[1]) : 0
      );
    }, 0) + 1;

  const creditNoteNo =
    `BWA/CN/26-27/${String(nextNumber).padStart(3, "0")}`;

  const { error } = await supabase
    .from("credit_notes")
    .insert({
      invoice_id: invoice.id,
      credit_note_no: creditNoteNo,
      credit_note_date: values.creditNoteDate,
      reason: values.reason,
      taxable_value: taxablePaise / 100,
      cgst: cgstPaise / 100,
      sgst: sgstPaise / 100,
      igst: igstPaise / 100,
      total: totalPaise / 100,
    });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath(`/invoices/${invoice.id}`);
  revalidatePath("/invoices");
  revalidatePath("/");

  return {
    success: true,
    creditNoteNo,
  };
}