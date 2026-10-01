"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabase } from "@/lib/db";
import { loadArData } from "@/lib/ar/load";
import { draftInvoice, isDuplicateNumberError, type InvoiceDraft } from "@/lib/ar/drafts";

const schema = z.object({
  customerId: z.coerce.number().int().positive("Choose a customer."),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid invoice date."),
  description: z.string().trim().min(1, "Enter a description.").max(500),
  taxableValue: z.coerce
    .number()
    .positive("The taxable value must be more than zero.")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most 2 decimals."),
  gstRate: z.coerce.number().min(0, "GST rate cannot be negative.").max(100, "GST rate cannot exceed 100%."),
  /** Set once the user has seen the credit-limit warning and chose to go ahead. */
  acknowledgeLimit: z.boolean().optional(),
});

export type InvoicePreview =
  | { ok: true; draft: InvoiceDraft }
  | { ok: false; error: string };

/** Live preview for the form: number, due date, GST, total, credit-limit warning. */
export async function previewInvoice(input: {
  customerId: number;
  invoiceDate: string;
  taxableValue: number;
  gstRate: number;
}): Promise<InvoicePreview> {
  if (!input.customerId || !/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate)) {
    return { ok: false, error: "" };
  }
  const data = await loadArData();
  const draft = draftInvoice(data, {
    customerId: input.customerId,
    invoiceDate: input.invoiceDate,
    taxable: Math.round((Number(input.taxableValue) || 0) * 100),
    gstRatePct: Number(input.gstRate) || 0,
  });
  return { ok: true, draft };
}

export type CreateInvoiceResult =
  | { success: true; invoiceId: number; invoiceNo: string }
  | { success: false; error: string }
  | { success: false; needsConfirmation: true; draft: InvoiceDraft };

export async function createInvoice(input: z.input<typeof schema>): Promise<CreateInvoiceResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Please check the invoice details." };
  }
  const values = parsed.data;
  const draftInput = {
    customerId: values.customerId,
    invoiceDate: values.invoiceDate,
    taxable: Math.round(values.taxableValue * 100),
    gstRatePct: values.gstRate,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await loadArData();
    const draft = draftInvoice(data, draftInput);
    if (draft.errors.length > 0) return { success: false, error: draft.errors.join(" ") };

    // R9: warn, never block. The first save over the limit returns the
    // warning; saving again with acknowledgeLimit goes ahead.
    if (draft.creditLimit?.exceedsLimit && !values.acknowledgeLimit) {
      return { success: false, needsConfirmation: true, draft };
    }

    const { data: row, error } = await supabase
      .from("invoices")
      .insert({
        customer_id: values.customerId,
        invoice_no: draft.invoiceNo,
        invoice_date: values.invoiceDate,
        due_date: draft.dueDate,
        description: values.description,
        taxable_value: draftInput.taxable / 100,
        gst_rate_pct: values.gstRate,
        cgst: draft.gst.cgst / 100,
        sgst: draft.gst.sgst / 100,
        igst: draft.gst.igst / 100,
        total: draft.total / 100,
        is_cancelled: false,
        is_disputed: false,
      })
      .select("id")
      .single();

    if (row) {
      revalidatePath("/", "layout");
      return { success: true, invoiceId: row.id, invoiceNo: draft.invoiceNo };
    }
    // Another tab took this number: work it out again and retry once (README 4.8).
    if (!isDuplicateNumberError(error?.message) || attempt === 1) {
      return { success: false, error: error?.message ?? "The invoice could not be saved." };
    }
  }
  return { success: false, error: "The invoice could not be saved." };
}
