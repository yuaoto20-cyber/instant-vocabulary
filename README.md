# Instant Vocabulary

個人用の英単語学習アプリです。教材データは IndexedDB（ローカル）または Supabase（クラウド）に保存します。

## ローカル開発

1. `.env.example` をコピーして `.env.local` を作成します。
2. `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` に Supabase の Project URL と anon/publishable key を設定します。
3. Supabase SQL Editor で `supabase/schema.sql` を実行します。
4. `npm run dev` を実行します。

`service_role` キー、データベースパスワードなどの秘密情報は、ブラウザ・`.env.example`・GitHub Pages に置かないでください。

## GitHub Pages への公開

`.github/workflows/deploy-pages.yml` は `main` ブランチへの push、または Actions 画面からの手動実行で、型チェック、Lint、テスト、静的ビルド、GitHub Pages へのデプロイを実行します。

### GitHub 側の設定

1. リポジトリの **Settings → Pages → Build and deployment** で、Source を **GitHub Actions** にします。
2. **Settings → Secrets and variables → Actions** で以下を設定します。
   - Repository variable: `NEXT_PUBLIC_SUPABASE_URL`
   - Repository secret: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `main` ブランチへ push します。現在のローカルブランチが `master` の場合は、GitHub 側の既定ブランチとワークフローの対象ブランチを `main` にそろえてください。

ワークフローはリポジトリ名を見て公開形式を判定します。`<owner>.github.io` ならユーザーサイトとして basePath を空にし、それ以外ならプロジェクトサイトとして `/<repository-name>` を basePath に設定します。ローカル開発では `NEXT_PUBLIC_BASE_PATH` を設定しません。

## Supabase Auth の本番設定

Supabase Dashboard の **Authentication → URL Configuration** で、GitHub Pages の公開 URL を設定します。

- ユーザーサイト: `https://<owner>.github.io/`
- プロジェクトサイト: `https://<owner>.github.io/<repository-name>/`

上記 URL を **Site URL** に設定し、**Redirect URLs** にも追加します。開発用には `http://localhost:3000/` も Redirect URLs に残します。メール／パスワードログインはブラウザ上の Supabase クライアントで実行し、RLS によりログイン中のユーザー自身のデータだけを読み書きします。

このアプリは個人専用です。Supabase Dashboard の **Authentication → Providers → Email** で **Allow new users to sign up** を無効にしてください。通常画面には新規登録導線を表示しません。

## データ移行

ログイン後、アカウント画面の「ローカルデータをクラウドへ移行」から明示的に移行できます。ローカルの IndexedDB データは移行後も端末内バックアップとして残ります。
