"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbQuery, supabase } from "@/lib/db";

const customerSchema = z.object({
  code: z.string().trim().min(1, "Customer code is required").max(50),
  name: z.string().trim().min(1, "Customer name is required").max(200),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  contactPerson: z.string().trim().max(150).optional(),
  email: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || z.string().email().safeParse(value).success,
      "Enter a valid email"
    ),
  phone: z.string().trim().max(30).optional(),
  gstin: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        /^[0-9A-Z]{15}$/.test(value),
      "GSTIN must be exactly 15 characters"
    ),
  creditDays: z.coerce.number().int().min(0, "Credit days cannot be negative"),
  creditLimit: z.coerce.number().min(0, "Credit limit cannot be negative"),
  tdsRatePct: z.coerce
    .number()
    .min(0, "TDS rate cannot be below 0")
    .max(100, "TDS rate cannot exceed 100"),
});

function optionalValue(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export async function createCustomer(formData: FormData) {
  const parsed = customerSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    city: formData.get("city"),
    state: formData.get("state"),
    contactPerson: formData.get("contactPerson"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    gstin: formData.get("gstin"),
    creditDays: formData.get("creditDays"),
    creditLimit: formData.get("creditLimit"),
    tdsRatePct: formData.get("tdsRatePct"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid customer details",
    };
  }

  const values = parsed.data;

  const existing = await dbQuery(
    supabase
      .from("customers")
      .select("id")
      .eq("code", values.code)
      .maybeSingle()
  );

  if (existing) {
    return {
      success: false,
      error: "Customer code already exists",
    };
  }

  const { error } = await supabase.from("customers").insert({
    code: values.code,
    name: values.name,
    city: optionalValue(values.city),
    state: optionalValue(values.state),
    contact_person: optionalValue(values.contactPerson),
    email: optionalValue(values.email),
    phone: optionalValue(values.phone),
    gstin: optionalValue(values.gstin),
    credit_days: values.creditDays,
    credit_limit: values.creditLimit,
    tds_rate_pct: values.tdsRatePct,
    is_active: true,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath("/customers");
  return { success: true };
}

export async function updateCustomer(id: number, formData: FormData) {
  const parsed = customerSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    city: formData.get("city"),
    state: formData.get("state"),
    contactPerson: formData.get("contactPerson"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    gstin: formData.get("gstin"),
    creditDays: formData.get("creditDays"),
    creditLimit: formData.get("creditLimit"),
    tdsRatePct: formData.get("tdsRatePct"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid customer details",
    };
  }

  const values = parsed.data;

  const existing = await dbQuery(
    supabase
      .from("customers")
      .select("id")
      .eq("code", values.code)
      .neq("id", id)
      .maybeSingle()
  );

  if (existing) {
    return {
      success: false,
      error: "Customer code already exists",
    };
  }

  const { error } = await supabase
    .from("customers")
    .update({
      code: values.code,
      name: values.name,
      city: optionalValue(values.city),
      state: optionalValue(values.state),
      contact_person: optionalValue(values.contactPerson),
      email: optionalValue(values.email),
      phone: optionalValue(values.phone),
      gstin: optionalValue(values.gstin),
      credit_days: values.creditDays,
      credit_limit: values.creditLimit,
      tds_rate_pct: values.tdsRatePct,
    })
    .eq("id", id);

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);

  return { success: true };
}

export async function setCustomerActive(id: number, active: boolean) {
  const { error } = await supabase
    .from("customers")
    .update({ is_active: active })
    .eq("id", id);

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);

  return { success: true };
}