import rateLimit from 'express-rate-limit';

// 一般的なAPIリクエスト制限
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100, // 15分あたり100リクエスト
  message: {
    error: 'リクエストが多すぎます。しばらくしてから再度お試しください。'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ログイン試行制限（ブルートフォース対策）
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5, // 15分あたり5回の試行
  message: {
    error: 'ログイン試行回数が上限に達しました。15分後に再度お試しください。'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // 成功したリクエストはカウントしない
});

// パスワード変更制限
export const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1時間
  max: 3, // 1時間あたり3回
  message: {
    error: 'パスワード変更の試行回数が上限に達しました。1時間後に再度お試しください。'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ファイルアップロード制限
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1時間
  max: 20, // 1時間あたり20ファイル
  message: {
    error: 'ファイルアップロードの上限に達しました。1時間後に再度お試しください。'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 重い処理（AI処理など）の制限
export const heavyProcessLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1時間
  max: 10, // 1時間あたり10回
  message: {
    error: 'AI処理の実行回数が上限に達しました。1時間後に再度お試しください。'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
