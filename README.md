# 就労支援事業所 業務管理システム

就労支援事業所向けの総合業務管理システム

## 主な機能

- 利用者管理
- 勤怠管理（出欠申告・確定）
- 日報管理
- 支援記録
- 面談記録
- 個別支援計画
- 受給者証管理

## 📋 プロジェクト構成

```
support-plan-app/
├── backend/          # バックエンド（Node.js + Express + Prisma）
├── frontend/         # フロントエンド（React + TypeScript + Tailwind CSS）
├── docker-compose.yml
└── docs/            # ドキュメント
```

## 🚀 ローカル開発

### バックエンド

```bash
cd backend
npm install
cp .env.example .env
# .envファイルを編集（DATABASE_URL等）
npx prisma db push
npx prisma db seed
npm run dev
```

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

### デフォルトログイン情報

| ユーザー | メール | パスワード |
|---------|--------|-----------|
| 管理者 | admin@sample-support.jp | admin123 |
| サビ管 | manager@sample-support.jp | manager123 |
| 利用者 | client1@sample-support.jp | client123 |

## 🐳 Docker でデプロイ

### 1. Docker Compose（ローカル/VPS）

```bash
# ビルドと起動
docker-compose up -d --build

# データベースマイグレーション
docker-compose exec backend npx prisma db push
docker-compose exec backend npx prisma db seed

# ログ確認
docker-compose logs -f

# 停止
docker-compose down
```

アクセス: http://localhost

### 2. Railway でデプロイ

1. [Railway](https://railway.app/) でプロジェクト作成
2. PostgreSQL サービスを追加
3. GitHub リポジトリを接続
4. 環境変数を設定:
   - `DATABASE_URL`: Railway が自動設定
   - `JWT_SECRET`: 安全なランダム文字列
   - `NODE_ENV`: production
   - `CORS_ORIGIN`: フロントエンドのURL

### 3. Render でデプロイ

1. [Render](https://render.com/) でアカウント作成
2. PostgreSQL データベースを作成
3. Web Service を2つ作成（backend, frontend）
4. 環境変数を設定

### 4. Fly.io でデプロイ

```bash
# Backend
cd backend
fly launch
fly secrets set JWT_SECRET=your-secret-key
fly secrets set DATABASE_URL=your-postgres-url

# Frontend
cd frontend
fly launch
```

### 5. Vercel でデプロイ（フロントエンド）

バックエンドは **Railway・Render など別サービス** にデプロイし、フロントエンドのみ Vercel に載せる構成です。

**手順**

1. バックエンドを先に Railway などでデプロイし、API の URL を用意する（例: `https://xxx.railway.app`）。
2. [Vercel](https://vercel.com/) にログインし、Git リポジトリをインポート。
3. **Root Directory** に `support-plan-app/frontend` を指定。
4. **Environment Variables** で以下を設定:
   - `VITE_API_URL`: バックエンドの URL（例: `https://xxx.railway.app`）
     - ビルド時のみ参照されるため、デプロイ前に設定必須。
5. **Deploy** を実行。

バックエンド側の `CORS_ORIGIN` に、Vercel のフロント URL（例: `https://your-app.vercel.app`）を設定してください。

フロントエンド用の `vercel.json` は `frontend/` に含まれており、SPA のルーティング用リライトが設定済みです。

### 6. Vercel でフルスタックデプロイ（ログイン可能）

フロント・API を同一 Vercel プロジェクトで動かし、**ログインまでそのまま使える**構成です。

**1. データベース（Neon 無料枠）**

1. [Neon](https://neon.tech/) でアカウント作成
2. 新規プロジェクト作成 → **Connection string** をコピー（`postgresql://...`）

**2. Vercel にデプロイ**

1. [Vercel](https://vercel.com/) でプロジェクト作成し、リポジトリをインポート
2. **Root Directory** を **`support-plan-app`** に変更（`support-plan-app/frontend` ではない）
3. **Environment Variables** を追加:
   - `DATABASE_URL`: Neon の接続文字列（例: `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`）
   - `JWT_SECRET`: 任意の長いランダム文字列（例: `openssl rand -hex 32` で生成）
4. **Deploy** を実行

ビルド時に DB の作成とシードが走るため、デプロイ完了後すぐにログインできます。  
ログイン情報は「デフォルトログイン情報」の表を参照してください。

## 環境変数

### Backend (.env)

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname"
JWT_SECRET="your-super-secret-key"
JWT_EXPIRES_IN="7d"
PORT=3001
NODE_ENV=production
CORS_ORIGIN="https://your-frontend-url.com"
```

### Frontend (.env.production)

```env
VITE_API_URL=https://your-backend-url.com
```

## 📚 ドキュメント

- 詳細設計書: `docs/個別支援計画機能_詳細設計書.md`

## 技術スタック

- **Frontend**: React, TypeScript, TailwindCSS, TanStack Query
- **Backend**: Node.js, Express, Prisma, PostgreSQL
- **Auth**: JWT
