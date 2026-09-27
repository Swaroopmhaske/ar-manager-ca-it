"use server";
import { loadArData } from "@/lib/ar/load";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabase, AR_WORKSPACE_ID } from "@/lib/db";

const receiptSchema = z.object({
  customerId: z.number().int().positive(),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bankAmount: z.number().nonnegative(),
  tdsAmount: z.number().nonnegative(),
  mode: z.enum(["NEFT", "RTGS", "IMPS", "UPI", "Cheque"]),
  reference: z.string().max(200).nullable(),
});

function financialYear(date: string): string {
  const [year, month] = date.split("-").map(Number);

  if (month >= 4) {
    return `${String(year).slice(-2)}-${String(year + 1).slice(-2)}`;
  }

  return `${String(year - 1).slice(-2)}-${String(year).slice(-2)}`;
}

export async function createReceipt(input: {
  customerId: number;
  receiptDate: string;
  bankAmount: number;
  tdsAmount: number;
  mode: "NEFT" | "RTGS" | "IMPS" | "UPI" | "Cheque";
  reference: string | null;
}) {
  const parsed = receiptSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "Please enter valid receipt details.",
    };
  }

  const values = parsed.data;

  if (values.bankAmount === 0 && values.tdsAmount === 0) {
    return {
      success: false,
      error: "Receipt amount cannot be zero.",
    };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id,is_active")
    .eq("id", values.customerId)
    .eq("workspace_id", AR_WORKSPACE_ID)
    .single();

  if (customerError || !customer) {
    return {
      success: false,
      error: "Customer not found.",
    };
  }

  if (!customer.is_active) {
    return {
      success: false,
      error: "Cannot record a receipt for an inactive customer.",
    };
  }

  const fy = financialYear(values.receiptDate);
  const prefix = `RCT/${fy}/`;

  const { data: existingReceipts, error: receiptsError } = await supabase
    .from("receipts")
    .select("receipt_no")
    .eq("workspace_id", AR_WORKSPACE_ID)
    .like("receipt_no", `${prefix}%`);

  if (receiptsError) {
    return {
      success: false,
      error: receiptsError.message,
    };
  }

  const nextNumber =
    (existingReceipts ?? []).reduce((max, receipt) => {
      const match = String(receipt.receipt_no).match(/(\d+)$/);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0) + 1;

  const receiptNo = `${prefix}${String(nextNumber).padStart(4, "0")}`;

  const { error } = await supabase.from("receipts").insert({
    workspace_id: AR_WORKSPACE_ID,
    receipt_no: receiptNo,
    customer_id: values.customerId,
    receipt_date: values.receiptDate,
    bank_amount: values.bankAmount,
    tds_amount: values.tdsAmount,
    mode: values.mode,
    reference: values.reference,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath("/receipts");
  revalidatePath("/customers");
  revalidatePath("/");

  return {
    success: true,
  };
}
export async function allocateReceipt(input: {
  receiptId: number;
  invoiceId: number;
  allocationDate: string;
  amount: number;
}) {
  if (
    !Number.isInteger(input.receiptId) ||
    !Number.isInteger(input.invoiceId) ||
    input.amount <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.allocationDate)
  ) {
    return {
      success: false,
      error: "Invalid allocation details.",
    };
  }

  const data = await loadArData();

  const receipt = data.receipts.find(
    (item) => item.id === input.receiptId,
  );

  const invoice = data.invoices.find(
    (item) => item.id === input.invoiceId,
  );

  if (!receipt) {
    return {
      success: false,
      error: "Receipt not found.",
    };
  }

  if (!invoice) {
    return {
      success: false,
      error: "Invoice not found.",
    };
  }

  if (receipt.customerId !== invoice.customerId) {
    return {
      success: false,
      error: "Receipt and invoice must belong to the same customer.",
    };
  }

  if (invoice.isCancelled) {
    return {
      success: false,
      error: "Cancelled invoices cannot receive allocations.",
    };
  }

  if (input.allocationDate < receipt.receiptDate) {
    return {
      success: false,
      error: "Allocation date cannot be earlier than receipt date.",
    };
  }

  if (input.allocationDate < invoice.invoiceDate) {
    return {
      success: false,
      error: "Allocation date cannot be earlier than invoice date.",
    };
  }

  const amountPaise = Math.round(input.amount * 100);

  const settlement =
    receipt.bankAmount + receipt.tdsAmount;

  const existingReceiptAllocations = data.allocations
    .filter(
      (allocation) =>
        allocation.receiptId === receipt.id &&
        allocation.allocationDate <= input.allocationDate,
    )
    .reduce((sum, allocation) => sum + allocation.amount, 0);

  if (
    existingReceiptAllocations + amountPaise >
    settlement
  ) {
    return {
      success: false,
      error: "Allocation exceeds the receipt settlement value.",
    };
  }

  const existingInvoiceAllocations = data.allocations
    .filter(
      (allocation) =>
        allocation.invoiceId === invoice.id &&
        allocation.allocationDate <= input.allocationDate,
    )
    .reduce((sum, allocation) => sum + allocation.amount, 0);

  const existingCreditNotes = data.creditNotes
    .filter(
      (note) =>
        note.invoiceId === invoice.id &&
        note.creditNoteDate <= input.allocationDate,
    )
    .reduce((sum, note) => sum + note.total, 0);

  if (
    existingInvoiceAllocations +
      existingCreditNotes +
      amountPaise >
    invoice.total
  ) {
    return {
      success: false,
      error: "Allocation exceeds the invoice balance.",
    };
  }

  const { error } = await supabase.from("allocations").insert({
    receipt_id: receipt.id,
    invoice_id: invoice.id,
    allocation_date: input.allocationDate,
    amount: input.amount,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath("/receipts");
  revalidatePath(`/receipts/${receipt.id}/allocate`);
  revalidatePath("/invoices");
  revalidatePath("/customers");
  revalidatePath("/");

  return {
    success: true,
  };
}