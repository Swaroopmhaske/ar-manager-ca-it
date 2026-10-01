"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabase } from "@/lib/db";
import { loadArData } from "@/lib/ar/load";
import { draftCreditNote, isDuplicateNumberError } from "@/lib/ar/drafts";

const schema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  creditNoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
  taxableValue: z.coerce
    .number()
    .positive("The taxable value must be more than zero.")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most 2 decimals."),
  reason: z.string().trim().min(1, "Enter a reason.").max(500),
});

export async function createCreditNote(formData: FormData) {
  const parsed = schema.safeParse({
    invoiceId: formData.get("invoiceId"),
    creditNoteDate: formData.get("creditNoteDate"),
    taxableValue: formData.get("taxableValue"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Please check the credit note." };
  }
  const values = parsed.data;
  const input = {
    invoiceId: values.invoiceId,
    creditNoteDate: values.creditNoteDate,
    taxable: Math.round(values.taxableValue * 100),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await loadArData();
    const draft = draftCreditNote(data, input);
    if (draft.errors.length > 0) return { success: false, error: draft.errors.join(" ") };

    const { error } = await supabase.from("credit_notes").insert({
      invoice_id: values.invoiceId,
      credit_note_no: draft.creditNoteNo,
      credit_note_date: values.creditNoteDate,
      reason: values.reason,
      taxable_value: input.taxable / 100,
      cgst: draft.gst.cgst / 100,
      sgst: draft.gst.sgst / 100,
      igst: draft.gst.igst / 100,
      total: draft.total / 100,
    });

    if (!error) {
      revalidatePath("/", "layout");
      return { success: true, creditNoteNo: draft.creditNoteNo };
    }
    if (!isDuplicateNumberError(error.message) || attempt === 1) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: "The credit note could not be saved." };
}
