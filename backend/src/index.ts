import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import prisma from './lib/prisma';
import { apiLimiter, loginLimiter } from './middleware/rateLimiter';

// ルートのインポート
import authRoutes from './routes/auth';
import clientRoutes from './routes/clients';
import certificateRoutes from './routes/certificates';
import attendanceRoutes from './routes/attendance';
import dailyReportRoutes from './routes/daily-reports';
import supportNoteRoutes from './routes/support-notes';
import interviewSessionRoutes from './routes/interview-sessions';
import supportPlanRoutes from './routes/support-plans';
import dashboardRoutes from './routes/dashboard';
import wagesRoutes from './routes/wages';
import reportsRoutes from './routes/reports';

dotenv.config();

// 本番環境でのJWT_SECRET必須チェック（Vercel では環境変数で設定）
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET && process.env.VERCEL !== '1') {
  console.error('FATAL: JWT_SECRET must be set in production');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// セキュリティミドルウェア
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS設定
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim());

app.use(cors({
  origin: (origin, callback) => {
    // 開発環境またはOriginがない場合（同一オリジン）は許可
    if (!origin || corsOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// リクエストログ
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ボディパーサー
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静的ファイル（アップロードされたファイル）
app.use('/uploads', express.static('uploads'));

// ヘルスチェック（レート制限なし）
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Vercel 側の想定エンドポイント（/api/health）も提供
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API全体にレート制限を適用
app.use('/api', apiLimiter);

// APIルート
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/daily-reports', dailyReportRoutes);
app.use('/api/support-notes', supportNoteRoutes);
app.use('/api/interview-sessions', interviewSessionRoutes);
app.use('/api/support-plans', supportPlanRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/wages', wagesRoutes);
app.use('/api/reports', reportsRoutes);

// グローバルエラーハンドリング
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);

  // 本番環境ではスタックトレースを隠す
  const errorResponse: any = {
    error: err.message || 'Internal Server Error'
  };

  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  res.status(err.status || 500).json(errorResponse);
});

// 404ハンドリング
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// サーバー起動
const startServer = async () => {
  try {
    await prisma.$connect();
    console.log('Database connected');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`CORS origins: ${corsOrigins.join(', ')}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Vercel サーバーレスでは listen しない（api から app を import するだけ）
if (process.env.VERCEL !== '1') {
  startServer();
}

export { app, prisma };
