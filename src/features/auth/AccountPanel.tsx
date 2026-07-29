"use client";

import { FormEvent, useEffect, useState } from "react";
import { StorageMode, getStorageMode, setStorageMode } from "@/lib/repositories";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { MigrationPanel } from "@/features/migration/MigrationPanel";

type AuthState = "checking" | "anonymous" | "authenticated" | "error";

export function AccountPanel({ onStorageChanged }: { onStorageChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<"account" | "login" | "signup">("account");
  const [state, setState] = useState<AuthState>(() => isSupabaseConfigured() ? "checking" : "anonymous");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<StorageMode>(() => getStorageMode());
  const [migrationOpen, setMigrationOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data, error }) => { if (!alive) return; if (error) { setMessage(error.message); setState("error"); return; } setEmail(data.session?.user.email ?? ""); setState(data.session ? "authenticated" : "anonymous"); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => { if (!alive) return; setEmail(session?.user.email ?? ""); setState(session ? "authenticated" : "anonymous"); });
    return () => { alive = false; subscription.subscription.unsubscribe(); };
  }, []);

  const authenticate = async (event: FormEvent) => {
    event.preventDefault(); const supabase = getSupabaseClient(); if (!supabase) { setMessage("Supabase接続情報が設定されていません。"); return; }
    try {
      setMessage("");
      if (screen === "signup") { if (password !== passwordConfirmation) throw new Error("確認用パスワードが一致しません。"); const { data, error } = await supabase.auth.signUp({ email, password }); if (error) throw error; setMessage(data.session ? "登録してログインしました。" : "登録しました。メール確認後にログインしてください。"); }
      else { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; }
      setPassword(""); setPasswordConfirmation(""); setScreen("account");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "認証に失敗しました。"); }
  };
  const chooseMode = (next: StorageMode) => { if (next === "cloud" && state !== "authenticated") { setMessage("クラウドモードを利用するにはログインしてください。"); return; } setStorageMode(next); setMode(next); onStorageChanged(); };
  const logout = async () => { const supabase = getSupabaseClient(); if (!supabase) return; const { error } = await supabase.auth.signOut(); if (error) setMessage(error.message); else { setStorageMode("local"); setMode("local"); onStorageChanged(); } };

  return <><button className="account-button" onClick={() => { setOpen(true); setScreen("account"); }}>アカウント</button>{open && <div className="modal-backdrop"><section className="account-panel" role="dialog" aria-modal="true"><button className="panel-close" onClick={() => setOpen(false)}>×</button>{screen === "account" ? <><p className="eyebrow">ACCOUNT</p><h2>保存とアカウント</h2>{!isSupabaseConfigured() ? <p className="account-note">Supabaseが未設定のため、現在はローカルモードのみ利用できます。</p> : state === "checking" ? <p>認証状態を確認しています…</p> : state === "authenticated" ? <><p className="account-email">{email}</p><p className="account-note">同期状態：クラウド同期は第3B段階で追加予定です。</p><button className="secondary full-button" onClick={() => setMigrationOpen(true)}>ローカルデータをクラウドへ移行</button><button className="secondary full-button" onClick={() => void logout()}>ログアウト</button></> : <button className="primary" onClick={() => setScreen("login")}>ログイン</button>}<fieldset className="storage-choice"><legend>保存方式</legend><label><input type="radio" checked={mode === "local"} onChange={() => chooseMode("local")} /> ローカル（この端末のIndexedDB）</label><label><input type="radio" checked={mode === "cloud"} disabled={state !== "authenticated"} onChange={() => chooseMode("cloud")} /> クラウド（Supabase）</label></fieldset><p className="account-note">保存方式を切り替えても、データは自動コピーされません。</p></> : <form className="auth-form" onSubmit={authenticate}><p className="eyebrow">SIGN IN</p><h2>ログイン</h2><label>メールアドレス<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>パスワード<input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message && <p className="auth-error">{message}</p>}<button className="primary" type="submit">ログイン</button><button className="text-button" type="button" onClick={() => setScreen("account")}>戻る</button></form>}{screen === "account" && message && <p className="auth-error">{message}</p>}</section></div>}{migrationOpen && <MigrationPanel onClose={() => setMigrationOpen(false)} onCompleted={() => { setMode("cloud"); onStorageChanged(); }} />}</>;
}
