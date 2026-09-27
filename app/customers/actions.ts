"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabase, AR_WORKSPACE_ID } from "@/lib/db";
export async function createNote(input: {
  customerId: number;
  invoiceId: number | null;
  noteDate: string;
  noteType: "Call" | "Email" | "Meeting" | "Note";
  body: string;
  followUpDate: string | null;
  followUpDone: boolean;
  promiseDate: string | null;
  promiseAmount: number | null;
}) {
  const noteSchema = z.object({
    customerId: z.number().int().positive(),
    invoiceId: z.number().int().positive().nullable(),
    noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    noteType: z.enum(["Call", "Email", "Meeting", "Note"]),
    body: z.string().trim().min(1),
    followUpDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    followUpDone: z.boolean(),
    promiseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    promiseAmount: z.number().nonnegative().nullable(),
  });

  const parsed = noteSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid note details.",
    };
  }

  const values = parsed.data;

  if (
    values.followUpDate &&
    values.followUpDate < values.noteDate
  ) {
    return {
      success: false,
      error: "Follow-up date cannot be earlier than note date.",
    };
  }

  if (
    values.promiseDate &&
    values.promiseDate < values.noteDate
  ) {
    return {
      success: false,
      error: "Promise date cannot be earlier than note date.",
    };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("id", values.customerId)
    .eq("workspace_id", AR_WORKSPACE_ID)
    .single();

  if (customerError || !customer) {
    return {
      success: false,
      error: "Customer not found.",
    };
  }

  if (values.invoiceId !== null) {
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id,customer_id")
      .eq("id", values.invoiceId)
      .eq("workspace_id", AR_WORKSPACE_ID)
      .single();

    if (invoiceError || !invoice) {
      return {
        success: false,
        error: "Invoice not found.",
      };
    }

    if (invoice.customer_id !== values.customerId) {
      return {
        success: false,
        error: "Invoice does not belong to this customer.",
      };
    }
  }

  const { error } = await supabase.from("notes").insert({
    customer_id: values.customerId,
    invoice_id: values.invoiceId,
    note_date: values.noteDate,
    note_type: values.noteType,
    body: values.body,
    follow_up_date: values.followUpDate,
    follow_up_done: values.followUpDone,
    promise_date: values.promiseDate,
    promise_amount: values.promiseAmount,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath(`/customers/${values.customerId}`);
  revalidatePath(`/customers/${values.customerId}/notes`);
  revalidatePath("/customers");
  revalidatePath("/");

  return {
    success: true,
  };
}
export async function markFollowUpDone(input: {
  noteId: number;
  customerId: number;
}) {
  const schema = z.object({
    noteId: z.number().int().positive(),
    customerId: z.number().int().positive(),
  });

  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid follow-up details.",
    };
  }

  const values = parsed.data;

  const { data: note, error: noteError } = await supabase
    .from("notes")
    .select("id, customer_id")
    .eq("id", values.noteId)
    .eq("workspace_id", AR_WORKSPACE_ID)
    .single();

  if (noteError || !note) {
    return {
      success: false,
      error: "Note not found.",
    };
  }

  if (note.customer_id !== values.customerId) {
    return {
      success: false,
      error: "Note does not belong to this customer.",
    };
  }

  const { error } = await supabase
    .from("notes")
    .update({ follow_up_done: true })
    .eq("id", values.noteId)
    .eq("workspace_id", AR_WORKSPACE_ID);

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath(`/customers/${values.customerId}`);
  revalidatePath(`/customers/${values.customerId}/notes`);

  return { success: true };
}