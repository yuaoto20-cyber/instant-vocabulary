import Link from "next/link";

export default function NotFound() {
  return <main className="page centered"><section className="setup-card"><p className="eyebrow">404</p><h1>ページが見つかりません</h1><p>アプリのホーム画面から開き直してください。</p><Link className="primary link-button" href="/">ホームへ戻る</Link></section></main>;
}
