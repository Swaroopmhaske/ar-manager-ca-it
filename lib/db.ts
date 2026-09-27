import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const workspaceId = process.env.AR_WORKSPACE_ID;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL");
}

if (!supabaseAnonKey) {
  throw new Error("Missing SUPABASE_ANON_KEY");
}

if (!workspaceId) {
  throw new Error("Missing AR_WORKSPACE_ID");
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        "x-workspace": workspaceId,
      },
    },
  }
);

export const AR_WORKSPACE_ID = workspaceId;

export async function dbQuery<T>(
  query: PromiseLike<{
    data: T | null;
    error: { message: string } | null;
  }>
): Promise<T> {
  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  if (data === null) {
    throw new Error("Database query returned no data");
  }

  return data;
}