# ログインを有効にする（DATABASE_URL の設定）

JWT_SECRET はすでに Vercel に追加済みです。あと **DATABASE_URL** を設定するとログインできます。

## 1. Neon で無料データベースを作る（2分）

1. **https://console.neon.tech/signup** を開く（GitHub/Google でサインアップ可）
2. サインアップ後、**New Project** でプロジェクト作成（名前は何でも可）
3. ダッシュボードで **Connection string** をコピー  
   - 「Connection string」または「Connect」をクリック  
   - **Pooled connection** の文字列をコピー（`postgresql://...?sslmode=require` のような形式）

## 2. Vercel に DATABASE_URL を追加

1. **https://vercel.com** にログイン
2. プロジェクト **support-plan-app** を開く
3. **Settings** → **Environment Variables**
4. 追加:
   - **Name:** `DATABASE_URL`
   - **Value:** コピーした Neon の接続文字列（そのまま貼り付け）
   - **Environment:** Production にチェック
5. **Save** をクリック

## 3. 再デプロイ

- **Deployments** タブ → 直近のデプロイの **⋯** → **Redeploy**
- またはターミナルで:
  ```bash
  cd support-plan-app && npx vercel --prod
  ```

再デプロイのビルド時に DB が自動作成・シードされ、ログインできるようになります。

## ログイン情報

| 役割   | メール                     | パスワード   |
|--------|----------------------------|--------------|
| 管理者 | admin@sample-support.jp    | admin123     |
| サビ管 | manager@sample-support.jp  | manager123   |
| 利用者 | client1@sample-support.jp  | client123    |

**URL:** https://support-plan-app.vercel.app
