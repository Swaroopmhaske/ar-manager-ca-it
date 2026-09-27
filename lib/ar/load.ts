import "server-only";

import { dbQuery, supabase } from "@/lib/db";
import type {
  Allocation,
  ArData,
  CreditNote,
  Customer,
  Invoice,
  Note,
  Receipt,
} from "./types";

const paise = (rupees: number): number => Math.round(rupees * 100);

export async function loadArData(): Promise<ArData> {
  const [
    customersResult,
    invoicesResult,
    creditNotesResult,
    receiptsResult,
    allocationsResult,
    notesResult,
  ] = await Promise.all([
    supabase.from("customers").select("*"),
    supabase.from("invoices").select("*"),
    supabase.from("credit_notes").select("*"),
    supabase.from("receipts").select("*"),
    supabase.from("allocations").select("*"),
    supabase.from("notes").select("*"),
  ]);

  const customers = await dbQuery(
    Promise.resolve(customersResult)
  );

  const invoices = await dbQuery(
    Promise.resolve(invoicesResult)
  );

  const creditNotes = await dbQuery(
    Promise.resolve(creditNotesResult)
  );

  const receipts = await dbQuery(
    Promise.resolve(receiptsResult)
  );

  const allocations = await dbQuery(
    Promise.resolve(allocationsResult)
  );

  const notes = await dbQuery(
    Promise.resolve(notesResult)
  );

  return {
    customers: customers.map(
      (row): Customer => ({
        id: row.id,
        code: row.code,
        name: row.name,
        city: row.city,
        state: row.state,
        contactPerson: row.contact_person,
        email: row.email,
        phone: row.phone,
        gstin: row.gstin,
        creditDays: row.credit_days,
        creditLimit: paise(Number(row.credit_limit)),
        tdsRatePct: Number(row.tds_rate_pct),
        isActive: row.is_active,
      })
    ),

    invoices: invoices.map(
      (row): Invoice => ({
        id: row.id,
        invoiceNo: row.invoice_no,
        customerId: row.customer_id,
        invoiceDate: row.invoice_date,
        dueDate: row.due_date,
        description: row.description,
        taxableValue: paise(Number(row.taxable_value)),
        gstRatePct: Number(row.gst_rate_pct),
        cgst: paise(Number(row.cgst)),
        sgst: paise(Number(row.sgst)),
        igst: paise(Number(row.igst)),
        total: paise(Number(row.total)),
        isCancelled: row.is_cancelled,
        isDisputed: row.is_disputed,
      })
    ),

    creditNotes: creditNotes.map(
      (row): CreditNote => ({
        id: row.id,
        creditNoteNo: row.credit_note_no,
        invoiceId: row.invoice_id,
        creditNoteDate: row.credit_note_date,
        taxableValue: paise(Number(row.taxable_value)),
        cgst: paise(Number(row.cgst)),
        sgst: paise(Number(row.sgst)),
        igst: paise(Number(row.igst)),
        total: paise(Number(row.total)),
        reason: row.reason,
      })
    ),

    receipts: receipts.map(
      (row): Receipt => ({
        id: row.id,
        receiptNo: row.receipt_no,
        customerId: row.customer_id,
        receiptDate: row.receipt_date,
        bankAmount: paise(Number(row.bank_amount)),
        tdsAmount: paise(Number(row.tds_amount)),
        mode: row.mode,
        reference: row.reference,
      })
    ),

    allocations: allocations.map(
      (row): Allocation => ({
        id: row.id,
        receiptId: row.receipt_id,
        invoiceId: row.invoice_id,
        allocationDate: row.allocation_date,
        amount: paise(Number(row.amount)),
      })
    ),

    notes: notes.map(
      (row): Note => ({
        id: row.id,
        customerId: row.customer_id,
        invoiceId: row.invoice_id,
        noteDate: row.note_date,
        noteType: row.note_type,
        body: row.body,
        followUpDate: row.follow_up_date,
        followUpDone: row.follow_up_done,
        promiseDate: row.promise_date,
        promiseAmount:
          row.promise_amount === null
            ? null
            : paise(Number(row.promise_amount)),
      })
    ),
  };
}