"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabase } from "@/lib/db";
import { loadArData } from "@/lib/ar/load";
import { nextNumber } from "@/lib/ar/documents";
import { isDuplicateNumberError } from "@/lib/ar/drafts";
import {
  canDeleteReceipt,
  receiptAvailable,
  validateAllocations,
} from "@/lib/ar/payments";

export type ActionResult =
  | { success: true; message?: string; receiptNo?: string }
  | { success: false; error: string };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
/** Rupees from the form → whole paise. Rejects more than 2 decimals. */
const paise = z
  .number()
  .nonnegative("Amounts cannot be negative.")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most 2 decimals.")
  .transform((v) => Math.round(v * 100));

const lineSchema = z.object({
  invoiceId: z.number().int().positive(),
  amount: paise,
});

const receiptSchema = z.object({
  customerId: z.number().int().positive("Choose a customer."),
  receiptDate: date,
  bankAmount: paise,
  tdsAmount: paise,
  mode: z.enum(["NEFT", "RTGS", "IMPS", "UPI", "Cheque"]),
  reference: z.string().trim().max(200).nullable(),
  allocations: z.array(lineSchema),
});

function refresh() {
  revalidatePath("/", "layout");
}

const rupees = (p: number) => (p / 100).toFixed(2);

/**
 * Record a payment (Part 2, Action 1; README 4.8).
 *
 * The API has no transactions, so "saved together" works like this, all on
 * the server: check everything first; insert the receipt and get its id;
 * insert ALL allocations in one request (one statement, so they succeed or
 * fail together); if that fails, delete the receipt just created, so
 * nothing is left behind, and report the database's reason.
 */
export async function createReceiptWithAllocations(
  input: z.input<typeof receiptSchema>
): Promise<ActionResult> {
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Please check the receipt details." };
  }
  const values = parsed.data;
  const settlement = values.bankAmount + values.tdsAmount;
  if (settlement <= 0) {
    return { success: false, error: "Enter the amount received (bank amount and/or TDS)." };
  }

  const data = await loadArData();
  const customer = data.customers.find((c) => c.id === values.customerId);
  if (!customer) return { success: false, error: "Customer not found." };

  const lines = values.allocations.filter((l) => l.amount > 0);
  const problems = validateAllocations(data, {
    customerId: customer.id,
    receiptDate: values.receiptDate,
    allocationDate: values.receiptDate,
    available: settlement,
    lines,
  });
  if (problems.length > 0) return { success: false, error: problems.join(" ") };

  // Insert the receipt. Retry once with a fresh number if another tab took it.
  let receipt: { id: number; receipt_no: string } | null = null;
  for (let attempt = 0; attempt < 2 && !receipt; attempt++) {
    const fresh = attempt === 0 ? data : await loadArData();
    const receiptNo = nextNumber("receipt", fresh, values.receiptDate);
    const { data: row, error } = await supabase
      .from("receipts")
      .insert({
        receipt_no: receiptNo,
        customer_id: customer.id,
        receipt_date: values.receiptDate,
        bank_amount: values.bankAmount / 100,
        tds_amount: values.tdsAmount / 100,
        mode: values.mode,
        reference: values.reference || null,
      })
      .select("id, receipt_no")
      .single();
    if (row) receipt = row;
    else if (!isDuplicateNumberError(error?.message) || attempt === 1) {
      return { success: false, error: error?.message ?? "The receipt could not be saved." };
    }
  }
  if (!receipt) return { success: false, error: "The receipt could not be saved." };

  if (lines.length > 0) {
    const { error } = await supabase.from("allocations").insert(
      lines.map((l) => ({
        receipt_id: receipt!.id,
        invoice_id: l.invoiceId,
        allocation_date: values.receiptDate,
        amount: l.amount / 100,
      }))
    );

    if (error) {
      const { error: undoError } = await supabase.from("receipts").delete().eq("id", receipt.id);
      refresh();
      if (undoError) {
        return {
          success: false,
          error: `The allocations failed (${error.message}) and receipt ${receipt.receipt_no} could not be removed automatically (${undoError.message}). Delete it from the Receipts page.`,
        };
      }
      return { success: false, error: `Nothing was saved. ${error.message}` };
    }
  }

  refresh();
  const unapplied = settlement - lines.reduce((s, l) => s + l.amount, 0);
  return {
    success: true,
    receiptNo: receipt.receipt_no,
    message:
      `Saved ${receipt.receipt_no}` +
      (unapplied > 0 ? `; ₹${rupees(unapplied)} kept as unapplied credit.` : "."),
  };
}

const allocateSchema = z.object({
  receiptId: z.number().int().positive(),
  allocationDate: date,
  allocations: z.array(lineSchema).min(1, "Enter an amount against at least one invoice."),
});

/** Allocate a receipt's unapplied credit later (Part 2, Action 2). */
export async function allocateReceipt(
  input: z.input<typeof allocateSchema>
): Promise<ActionResult> {
  const parsed = allocateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Please check the allocation." };
  }
  const values = parsed.data;
  const lines = values.allocations.filter((l) => l.amount > 0);
  if (lines.length === 0) return { success: false, error: "Enter an amount against at least one invoice." };

  const data = await loadArData();
  const receipt = data.receipts.find((r) => r.id === values.receiptId);
  if (!receipt) return { success: false, error: "Receipt not found." };

  const problems = validateAllocations(data, {
    customerId: receipt.customerId,
    receiptDate: receipt.receiptDate,
    allocationDate: values.allocationDate,
    available: receiptAvailable(data, receipt.id),
    lines,
  });
  if (problems.length > 0) return { success: false, error: problems.join(" ") };

  const { error } = await supabase.from("allocations").insert(
    lines.map((l) => ({
      receipt_id: receipt.id,
      invoice_id: l.invoiceId,
      allocation_date: values.allocationDate,
      amount: l.amount / 100,
    }))
  );
  if (error) return { success: false, error: error.message };

  refresh();
  return { success: true, message: "Allocation saved." };
}

/** Correction: remove one allocation. Every figure is derived, so nothing else changes. */
export async function removeAllocation(allocationId: number): Promise<ActionResult> {
  if (!Number.isInteger(allocationId) || allocationId <= 0) {
    return { success: false, error: "Invalid allocation." };
  }
  const { data: rows, error } = await supabase
    .from("allocations")
    .delete()
    .eq("id", allocationId)
    .select("id");
  if (error) return { success: false, error: error.message };
  if (!rows || rows.length === 0) return { success: false, error: "That allocation no longer exists." };

  refresh();
  return { success: true, message: "Allocation removed." };
}

/** Correction: delete a receipt, only when it has no allocations (R6). */
export async function deleteReceipt(receiptId: number): Promise<ActionResult> {
  if (!Number.isInteger(receiptId) || receiptId <= 0) {
    return { success: false, error: "Invalid receipt." };
  }
  const data = await loadArData();
  const receipt = data.receipts.find((r) => r.id === receiptId);
  if (!receipt) return { success: false, error: "That receipt no longer exists." };

  const check = canDeleteReceipt(data, receiptId);
  if (!check.ok) return { success: false, error: check.reason };

  // The database also refuses to delete a receipt that has allocations.
  const { error } = await supabase.from("receipts").delete().eq("id", receiptId);
  if (error) return { success: false, error: error.message };

  refresh();
  return { success: true, message: `Receipt ${receipt.receiptNo} deleted.` };
}
