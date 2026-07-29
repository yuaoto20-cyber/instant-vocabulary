import { SupabaseClient, createClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseClient() {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;
  return client;
}

export function requireSupabaseClient() {
  const configured = getSupabaseClient();
  if (!configured) throw new Error("Supabase接続情報が設定されていません。.env.localを確認してください。");
  return configured;
}
