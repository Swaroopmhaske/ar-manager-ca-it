"use server";

import { revalidatePath } from "next/cache";
import { loadArData } from "@/lib/ar/load";
import { supabase } from "@/lib/db";

export async function setDisputed(
  invoiceId: number,
  disputed: boolean
) {
  const data = await loadArData();

  const invoice = data.invoices.find(
    (item) => item.id === invoiceId
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
      error: "A cancelled invoice cannot be disputed",
    };
  }

  const { error } = await supabase
    .from("invoices")
    .update({
      is_disputed: disputed,
    })
    .eq("id", invoiceId);

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  return { success: true };
}

export async function cancelInvoice(invoiceId: number) {
  const data = await loadArData();

  const invoice = data.invoices.find(
    (item) => item.id === invoiceId
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
      error: "Invoice is already cancelled",
    };
  }

  const hasAllocation = data.allocations.some(
    (allocation) => allocation.invoiceId === invoiceId
  );

  if (hasAllocation) {
    return {
      success: false,
      error:
        "This invoice cannot be cancelled because it has a payment allocation.",
    };
  }

  const hasCreditNote = data.creditNotes.some(
    (creditNote) => creditNote.invoiceId === invoiceId
  );

  if (hasCreditNote) {
    return {
      success: false,
      error:
        "This invoice cannot be cancelled because it has a credit note.",
    };
  }

  const { error } = await supabase
    .from("invoices")
    .update({
      is_cancelled: true,
    })
    .eq("id", invoiceId);

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/");

  return { success: true };
}