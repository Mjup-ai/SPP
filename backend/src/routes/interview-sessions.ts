import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { authenticate, requireStaff } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// Zodバリデーションスキーマ
// ============================================

const sessionTypeEnum = z.enum([
  'initial_assessment',
  'monitoring',
  'review',
  'regular',
  'emergency',
  'family',
  'external',
  'other'
]);

const sessionStatusEnum = z.enum([
  'draft',
  'scheduled',
  'recording',
  'transcribing',
  'processing',
  'completed',
  'archived'
]);

// 一覧取得クエリ
const listQuerySchema = z.object({
  clientId: z.string().optional(),
  sessionType: sessionTypeEnum.optional(),
  status: sessionStatusEnum.optional(),
  startDate: z.string().refine((val) => !val || !isNaN(Date.parse(val)), '有効な開始日を入力してください').optional(),
  endDate: z.string().refine((val) => !val || !isNaN(Date.parse(val)), '有効な終了日を入力してください').optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

// セッション作成
const createSessionSchema = z.object({
  clientId: z.string().min(1, '利用者を選択してください'),
  sessionDate: z.string().refine((val) => !isNaN(Date.parse(val)), '有効な日時を入力してください'),
  sessionType: sessionTypeEnum,
  participants: z.array(z.string()).optional(),
  location: z.string().max(200, '場所は200文字以内で入力してください').optional(),
  recordingConsent: z.boolean().optional().default(false),
  aiProcessingConsent: z.boolean().optional().default(false),
  consentBy: z.string().max(100).optional(),
  consentRelationship: z.string().max(100).optional(),
  consentVersion: z.string().max(50).optional(),
  notes: z.string().max(5000, 'メモは5000文字以内で入力してください').optional(),
});

// セッション更新
const updateSessionSchema = z.object({
  sessionDate: z.string().refine((val) => !val || !isNaN(Date.parse(val)), '有効な日時を入力してください').optional(),
  sessionType: sessionTypeEnum.optional(),
  participants: z.array(z.string()).optional(),
  location: z.string().max(200).optional().nullable(),
  recordingConsent: z.boolean().optional(),
  aiProcessingConsent: z.boolean().optional(),
  consentBy: z.string().max(100).optional().nullable(),
  consentRelationship: z.string().max(100).optional().nullable(),
  consentVersion: z.string().max(50).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

// ステータス遷移
const statusTransitionSchema = z.object({
  status: sessionStatusEnum,
  reason: z.string().max(500, '理由は500文字以内で入力してください').optional(),
});

// 文字起こしリクエスト
const transcribeSchema = z.object({
  mediaAssetId: z.string().optional(),
});

// ============================================
// ステータス遷移ルール
// ============================================
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['scheduled', 'recording', 'archived'],
  scheduled: ['recording', 'draft', 'archived'],
  recording: ['transcribing', 'draft'],
  transcribing: ['processing', 'recording'],
  processing: ['completed', 'transcribing'],
  completed: ['archived'],
  archived: ['draft'],
};

const isValidTransition = (from: string, to: string): boolean => {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
};

// ============================================
// ファイルアップロード設定
// ============================================
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionDir = path.join(uploadDir, 'audio');
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '100')) * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/webm', 'audio/ogg', 'audio/x-m4a'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('音声ファイル（MP3、WAV、M4A、WebM、OGG）のみアップロード可能です'));
    }
  }
});

// ============================================
// バリデーションヘルパー
// ============================================
const parseValidation = <T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: { field: string; message: string }[] } => {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  return { success: false, errors };
};

// ============================================
// ミドルウェア
// ============================================
router.use(authenticate);
router.use(requireStaff);

// ============================================
// 面談セッション一覧取得
// GET /api/interview-sessions
// ============================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    const validation = parseValidation(listQuerySchema, req.query);
    if (!validation.success) {
      return res.status(400).json({ error: '検索条件に問題があります', details: validation.errors });
    }

    const { clientId, sessionType, status, startDate, endDate, limit, offset } = validation.data;

    const where: any = { organizationId };

    if (clientId) where.clientId = clientId;
    if (sessionType) where.sessionType = sessionType;
    if (status) where.status = status;

    if (startDate || endDate) {
      where.sessionDate = {};
      if (startDate) where.sessionDate.gte = new Date(startDate);
      if (endDate) where.sessionDate.lte = new Date(endDate);
    }

    const sessions = await prisma.interviewSession.findMany({
      where,
      orderBy: { sessionDate: 'desc' },
      include: {
        client: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            clientNumber: true
          }
        },
        conductedBy: {
          select: { id: true, name: true }
        },
        mediaAssets: {
          select: { id: true, fileName: true, duration: true, fileSize: true }
        },
        transcripts: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true }
        },
        aiSummaries: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true }
        },
        aiExtractions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true }
        }
      },
      take: limit || 50,
      skip: offset || 0
    });

    const total = await prisma.interviewSession.count({ where });

    res.json({ sessions, total });
  } catch (error) {
    console.error('面談セッション一覧取得エラー:', error);
    res.status(500).json({ error: '面談セッション一覧の取得に失敗しました。しばらく経ってから再度お試しください。' });
  }
});

// ============================================
// 面談セッション詳細取得
// GET /api/interview-sessions/:id
// ============================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    if (!id) {
      return res.status(400).json({ error: 'セッションIDが指定されていません' });
    }

    const session = await prisma.interviewSession.findFirst({
      where: { id, organizationId },
      include: {
        client: true,
        conductedBy: {
          select: { id: true, name: true }
        },
        mediaAssets: true,
        transcripts: {
          orderBy: { version: 'desc' }
        },
        aiSummaries: {
          orderBy: { version: 'desc' }
        },
        aiExtractions: {
          orderBy: { version: 'desc' }
        },
        supportPlans: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            planPeriodStart: true,
            planPeriodEnd: true,
            serviceType: true,
            status: true,
            createdAt: true
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: '指定された面談セッションが見つかりません' });
    }

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'view',
        resource: 'interview_sessions',
        resourceId: id as string,
        details: JSON.stringify({ clientId: session.clientId })
      }
    });

    res.json({ session });
  } catch (error) {
    console.error('面談セッション詳細取得エラー:', error);
    res.status(500).json({ error: '面談セッションの取得に失敗しました。しばらく経ってから再度お試しください。' });
  }
});

// ============================================
// 面談セッション作成
// POST /api/interview-sessions
// ============================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    const validation = parseValidation(createSessionSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ error: '入力内容に問題があります', details: validation.errors });
    }

    const {
      clientId,
      sessionDate,
      sessionType,
      participants,
      location,
      recordingConsent,
      aiProcessingConsent,
      consentBy,
      consentRelationship,
      consentVersion,
      notes
    } = validation.data;

    // クライアントの存在確認
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId }
    });

    if (!client) {
      return res.status(404).json({ error: '指定された利用者が見つかりません。利用者を確認してください。' });
    }

    // セッション日時の妥当性チェック
    const sessionDateObj = new Date(sessionDate);
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    if (sessionDateObj < sixMonthsAgo) {
      return res.status(400).json({ error: 'セッション日時が過去すぎます。正しい日時を指定してください。' });
    }

    const session = await prisma.interviewSession.create({
      data: {
        clientId,
        organizationId: organizationId!,
        sessionDate: sessionDateObj,
        sessionType,
        conductedById: req.user!.id,
        participants: participants ? JSON.stringify(participants) : undefined,
        location: location || undefined,
        recordingConsent,
        aiProcessingConsent,
        consentDate: (recordingConsent || aiProcessingConsent) ? new Date() : undefined,
        consentBy: consentBy || undefined,
        consentRelationship: consentRelationship || undefined,
        consentVersion: consentVersion || undefined,
        notes: notes || undefined,
        status: 'draft'
      },
      include: {
        client: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            clientNumber: true
          }
        },
        conductedBy: {
          select: { id: true, name: true }
        }
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'interview_sessions',
        resourceId: session.id,
        details: JSON.stringify({
          clientId,
          sessionType,
          sessionDate,
          clientName: `${client.lastName} ${client.firstName}`
        })
      }
    });

    res.status(201).json({ session });
  } catch (error) {
    console.error('面談セッション作成エラー:', error);
    res.status(500).json({ error: '面談セッションの作成に失敗しました。しばらく経ってから再度お試しください。' });
  }
});

// ============================================
// 面談セッション更新
// PUT /api/interview-sessions/:id
// ============================================
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    if (!id) {
      return res.status(400).json({ error: 'セッションIDが指定されていません' });
    }

    const validation = parseValidation(updateSessionSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ error: '入力内容に問題があります', details: validation.errors });
    }

    const existing = await prisma.interviewSession.findFirst({
      where: { id, organizationId }
    });

    if (!existing) {
      return res.status(404).json({ error: '指定された面談セッションが見つかりません' });
    }

    // 完了・アーカイブ済みセッションの編集制限
    if (existing.status === 'completed' || existing.status === 'archived') {
      return res.status(400).json({ error: '完了済みまたはアーカイブ済みのセッションは編集できません' });
    }

    const {
      sessionDate,
      sessionType,
      participants,
      location,
      recordingConsent,
      aiProcessingConsent,
      consentBy,
      consentRelationship,
      consentVersion,
      notes
    } = validation.data;

    // 同意が新たに得られた場合、同意日を更新
    let consentDate = existing.consentDate;
    if ((!existing.recordingConsent && recordingConsent) ||
        (!existing.aiProcessingConsent && aiProcessingConsent)) {
      consentDate = new Date();
    }

    const updateData: any = {};
    if (sessionDate !== undefined) updateData.sessionDate = new Date(sessionDate);
    if (sessionType !== undefined) updateData.sessionType = sessionType;
    if (participants !== undefined) updateData.participants = JSON.stringify(participants);
    if (location !== undefined) updateData.location = location;
    if (recordingConsent !== undefined) updateData.recordingConsent = recordingConsent;
    if (aiProcessingConsent !== undefined) updateData.aiProcessingConsent = aiProcessingConsent;
    if (consentBy !== undefined) updateData.consentBy = consentBy;
    if (consentRelationship !== undefined) updateData.consentRelationship = consentRelationship;
    if (consentVersion !== undefined) updateData.consentVersion = consentVersion;
    if (notes !== undefined) updateData.notes = notes;
    if (consentDate !== existing.consentDate) updateData.consentDate = consentDate;

    const session = await prisma.interviewSession.update({
      where: { id },
      data: updateData,
      include: {
        client: {
          select: { id: true, lastName: true, firstName: true, clientNumber: true }
        },
        conductedBy: {
          select: { id: true, name: true }
        }
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'interview_sessions',
        resourceId: id as string,
        details: JSON.stringify({ updatedFields: Object.keys(updateData) })
      }
    });

    res.json({ session });
  } catch (error) {
    console.error('面談セッション更新エラー:', error);
    res.status(500).json({ error: '面談セッションの更新に失敗しました。しばらく経ってから再度お試しください。' });
  }
});

// ============================================
// ステータス遷移
// PUT /api/interview-sessions/:id/status
// ============================================
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    if (!id) {
      return res.status(400).json({ error: 'セッションIDが指定されていません' });
    }

    const validation = parseValidation(statusTransitionSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ error: '入力内容に問題があります', details: validation.errors });
    }

    const { status: newStatus, reason } = validation.data;

    const existing = await prisma.interviewSession.findFirst({
      where: { id, organizationId }
    });

    if (!existing) {
      return res.status(404).json({ error: '指定された面談セッションが見つかりません' });
    }

    // ステータス遷移の妥当性チェック
    if (!isValidTransition(existing.status, newStatus)) {
      const currentLabel = statusLabelsMap[existing.status] || existing.status;
      const targetLabel = statusLabelsMap[newStatus] || newStatus;
      return res.status(400).json({
        error: `「${currentLabel}」から「${targetLabel}」への変更はできません`,
        currentStatus: existing.status,
        targetStatus: newStatus,
        allowedTransitions: VALID_STATUS_TRANSITIONS[existing.status] || []
      });
    }

    // 録音開始時の同意チェック
    if (newStatus === 'recording' && !existing.recordingConsent) {
      return res.status(400).json({ error: '録音の同意が得られていないため、録音を開始できません。基本情報タブで録音同意を設定してください。' });
    }

    // AI処理開始時の同意チェック
    if ((newStatus === 'transcribing' || newStatus === 'processing') && !existing.aiProcessingConsent) {
      return res.status(400).json({ error: 'AI処理の同意が得られていないため、処理を開始できません。基本情報タブでAI処理同意を設定してください。' });
    }

    const session = await prisma.interviewSession.update({
      where: { id },
      data: { status: newStatus },
      include: {
        client: {
          select: { id: true, lastName: true, firstName: true }
        }
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'interview_sessions',
        resourceId: id as string,
        details: JSON.stringify({
          type: 'status_transition',
          from: existing.status,
          to: newStatus,
          reason: reason || null
        })
      }
    });

    res.json({ session });
  } catch (error) {
    console.error('ステータス遷移エラー:', error);
    res.status(500).json({ error: 'ステータスの変更に失敗しました。しばらく経ってから再度お試しください。' });
  }
});

// ステータス日本語ラベルマップ
const statusLabelsMap: Record<string, string> = {
  draft: '下書き',
  scheduled: '予定',
  recording: '録音中',
  transcribing: '文字起こし中',
  processing: '処理中',
  completed: '完了',
  archived: 'アーカイブ',
};

// ============================================
// 面談セッション削除
// DELETE /api/interview-sessions/:id
// ============================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    if (!id) {
      return res.status(400).json({ error: 'セッションIDが指定されていません' });
    }

    const existing = await prisma.interviewSession.findFirst({
      where: { id, organizationId },
      include: {
        mediaAssets: true,
        supportPlans: { select: { id: true } }
      }
    });

    if (!existing) {
      return res.status(404).json({ error: '指定された面談セッションが見つかりません' });
    }

    // 完了済みセッションの削除制限（管理者のみ可能）
    if (existing.status === 'completed' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: '完了済みセッションの削除は管理者のみ実行できます' });
    }

    // 支援計画が紐づいている場合の警告
    if ((existing as any).supportPlans.length > 0) {
      return res.status(400).json({
        error: 'この面談セッションには支援計画が紐づいているため削除できません。先に支援計画の紐づけを解除してください。',
        linkedPlanCount: (existing as any).supportPlans.length
      });
    }

    // 関連する音声ファイルの削除
    for (const asset of (existing as any).mediaAssets) {
      const filePath = path.join(uploadDir, 'audio', asset.storageKey);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // カスケード削除（mediaAssets, transcripts, aiSummaries, aiExtractions）
    await prisma.interviewSession.delete({
      where: { id }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'delete',
        resource: 'interview_sessions',
        resourceId: id as string,
        details: JSON.stringify({
          clientId: existing.clientId,
          sessionDate: existing.sessionDate,
          sessionType: existing.sessionType,
          status: existing.status,
          mediaAssetCount: (existing as any).mediaAssets.length
        })
      }
    });

    res.json({ message: '面談セッションを削除しました' });
  } catch (error) {
    console.error('面談セッション削除エラー:', error);
    res.status(500).json({ error: '面談セッションの削除に失敗しました。しばらく経ってから再度お試しください。' });
  }
});

// ============================================
// 音声ファイルアップロード
// POST /api/interview-sessions/:id/media
// ============================================
router.post('/:id/media', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    const session = await prisma.interviewSession.findFirst({
      where: { id, organizationId }
    });

    if (!session) {
      return res.status(404).json({ error: '指定された面談セッションが見つかりません' });
    }

    if (!session.recordingConsent) {
      return res.status(400).json({ error: '録音の同意が得られていません。基本情報タブで録音同意を設定してください。' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '音声ファイルがアップロードされていません。ファイルを選択してください。' });
    }

    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        sessionId: id as string,
        storageKey: req.file.filename,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedBy: req.user!.id,
        uploadMethod: 'upload'
      }
    });

    // セッションが下書き状態の場合、録音中に自動遷移
    if (session.status === 'draft' || session.status === 'scheduled') {
      await prisma.interviewSession.update({
        where: { id },
        data: { status: 'recording' }
      });
    }

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'media_assets',
        resourceId: mediaAsset.id,
        details: JSON.stringify({
          sessionId: id,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype
        })
      }
    });

    res.status(201).json({ mediaAsset });
  } catch (error) {
    console.error('音声ファイルアップロードエラー:', error);
    res.status(500).json({ error: '音声ファイルのアップロードに失敗しました。しばらく経ってから再度お試しください。' });
  }
});

// ============================================
// 文字起こし実行（モック）
// POST /api/interview-sessions/:id/transcribe
// ============================================
router.post('/:id/transcribe', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    const validation = parseValidation(transcribeSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ error: '入力内容に問題があります', details: validation.errors });
    }

    const session = await prisma.interviewSession.findFirst({
      where: { id, organizationId },
      include: {
        mediaAssets: { select: { id: true } }
      }
    });

    if (!session) {
      return res.status(404).json({ error: '指定された面談セッションが見つかりません' });
    }

    if (!session.aiProcessingConsent) {
      return res.status(400).json({ error: 'AI処理の同意が得られていません。基本情報タブでAI処理同意を設定してください。' });
    }

    if ((session as any).mediaAssets.length === 0) {
      return res.status(400).json({ error: '音声ファイルがアップロードされていません。先に音声ファイルをアップロードしてください。' });
    }

    // 既存の最新バージョンを取得
    const latestTranscript = await prisma.transcript.findFirst({
      where: { sessionId: id },
      orderBy: { version: 'desc' }
    });

    const newVersion = (latestTranscript?.version || 0) + 1;

    // モック：実際はWhisper APIなどを呼び出す
    const transcript = await prisma.transcript.create({
      data: {
        sessionId: id as string,
        version: newVersion,
        fullText: '【モック文字起こし】\n\n支援員：本日はよろしくお願いします。\n\n利用者：よろしくお願いします。\n\n支援員：最近の調子はいかがですか？\n\n利用者：まあまあです。少し疲れやすいかもしれません。\n\n支援員：そうですか。睡眠は取れていますか？\n\n利用者：睡眠は取れているんですが、朝起きにくい日があります。\n\n支援員：作業のペースについてはどうですか？\n\n利用者：続けていきたいという気持ちはあるんですが、ペースを調整しながら取り組みたいと思っています。',
        segments: JSON.stringify([
          { start: 0, end: 5, text: '本日はよろしくお願いします。', speaker: 'staff' },
          { start: 5, end: 10, text: 'よろしくお願いします。', speaker: 'client' },
          { start: 10, end: 20, text: '最近の調子はいかがですか？', speaker: 'staff' },
          { start: 20, end: 35, text: 'まあまあです。少し疲れやすいかもしれません。', speaker: 'client' },
          { start: 35, end: 45, text: 'そうですか。睡眠は取れていますか？', speaker: 'staff' },
          { start: 45, end: 60, text: '睡眠は取れているんですが、朝起きにくい日があります。', speaker: 'client' },
          { start: 60, end: 72, text: '作業のペースについてはどうですか？', speaker: 'staff' },
          { start: 72, end: 95, text: '続けていきたいという気持ちはあるんですが、ペースを調整しながら取り組みたいと思っています。', speaker: 'client' }
        ]),
        processingEngine: 'mock-whisper',
        confidence: 0.95
      }
    });

    // セッションのステータスを更新
    if (session.status === 'recording' || session.status === 'draft' || session.status === 'scheduled') {
      await prisma.interviewSession.update({
        where: { id },
        data: { status: 'transcribing' }
      });
    }

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'transcripts',
        resourceId: transcript.id,
        details: JSON.stringify({ sessionId: id, version: newVersion, engine: 'mock-whisper' })
      }
    });

    res.status(201).json({ transcript });
  } catch (error) {
    console.error('文字起こしエラー:', error);
    res.status(500).json({ error: '文字起こしの実行に失敗しました。しばらく経ってから再度お試しください。' });
  }
});

// ============================================
// AI要約生成（モック）
// POST /api/interview-sessions/:id/summarize
// ============================================
router.post('/:id/summarize', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    const session = await prisma.interviewSession.findFirst({
      where: { id, organizationId },
      include: {
        transcripts: {
          orderBy: { version: 'desc' },
          take: 1
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: '指定された面談セッションが見つかりません' });
    }

    if (!session.aiProcessingConsent) {
      return res.status(400).json({ error: 'AI処理の同意が得られていません。基本情報タブでAI処理同意を設定してください。' });
    }

    if ((session as any).transcripts.length === 0) {
      return res.status(400).json({ error: '文字起こしが完了していません。先に文字起こしを実行してください。' });
    }

    const latestSummary = await prisma.aISummary.findFirst({
      where: { sessionId: id },
      orderBy: { version: 'desc' }
    });

    const newVersion = (latestSummary?.version || 0) + 1;

    // モック：実際はGPT-4などを呼び出す
    const summary = await prisma.aISummary.create({
      data: {
        sessionId: id as string,
        version: newVersion,
        summaryShort: '利用者は体調面での疲れやすさを報告。就労継続に向けた休息の取り方と作業ペースの調整について検討。',
        summaryMedium: '本日の面談では、利用者から最近の体調について報告があった。疲れやすさを感じているとのことで、睡眠は取れているものの朝起きにくい日があるという。作業ペースの調整や休息の取り方について話し合い、就労継続に向けて無理のない範囲での取り組みを続けることを確認した。利用者本人にも継続意欲があり、前向きな姿勢が見られた。',
        summaryLong: '【面談概要】\n面談実施日の状況確認として、利用者の最近の体調と就労への意欲について聞き取りを行った。\n\n【体調面】\n- 疲れやすさを感じている\n- 睡眠は取れているが、朝起きにくい日がある\n- 日中の活動量に影響が出ている可能性\n\n【就労への意欲】\n- 続けていきたいという気持ちがある\n- ペースを調整しながら取り組みたい意向\n- 前向きな姿勢が維持されている\n\n【検討事項】\n- 作業時間の調整（午前中の軽作業から開始等）\n- 定期的な休息の組み込み\n- 睡眠改善のためのアドバイス\n\n【今後の方針】\n- 作業スケジュールの見直しを検討\n- 2週間のモニタリング期間を設定\n- 次回面談で体調変化を確認',
        model: 'mock-gpt4'
      }
    });

    // ステータスを処理中に更新（まだ処理中でなければ）
    if (session.status === 'transcribing') {
      await prisma.interviewSession.update({
        where: { id },
        data: { status: 'processing' }
      });
    }

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'ai_summaries',
        resourceId: summary.id,
        details: JSON.stringify({ sessionId: id, version: newVersion, model: 'mock-gpt4' })
      }
    });

    res.status(201).json({ summary });
  } catch (error) {
    console.error('AI要約生成エラー:', error);
    res.status(500).json({ error: '要約の生成に失敗しました。しばらく経ってから再度お試しください。' });
  }
});

// ============================================
// AI項目抽出（モック）
// POST /api/interview-sessions/:id/extract
// ============================================
router.post('/:id/extract', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const organizationId = req.user?.organizationId;

    const session = await prisma.interviewSession.findFirst({
      where: { id, organizationId },
      include: {
        transcripts: {
          orderBy: { version: 'desc' },
          take: 1
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: '指定された面談セッションが見つかりません' });
    }

    if (!session.aiProcessingConsent) {
      return res.status(400).json({ error: 'AI処理の同意が得られていません。基本情報タブでAI処理同意を設定してください。' });
    }

    if ((session as any).transcripts.length === 0) {
      return res.status(400).json({ error: '文字起こしが完了していません。先に文字起こしを実行してください。' });
    }

    const latestExtraction = await prisma.aIExtraction.findFirst({
      where: { sessionId: id },
      orderBy: { version: 'desc' }
    });

    const newVersion = (latestExtraction?.version || 0) + 1;

    // モック：実際はGPT-4などを呼び出す
    const extractedData = {
      clientIntentions: {
        life: ['無理のないペースで生活したい', '体調管理を意識したい'],
        employment: ['就労を継続したい', 'スキルアップしていきたい'],
        other: []
      },
      currentChallenges: {
        dailyLife: ['朝起きにくい日がある'],
        work: ['疲れやすさを感じている'],
        interpersonal: [],
        health: ['体力面での不安'],
        other: []
      },
      strengths: {
        skills: ['パソコン作業ができる'],
        personality: ['真面目に取り組む姿勢', '継続意欲がある'],
        interests: ['コツコツした作業が好き'],
        other: []
      },
      considerations: {
        accommodations: ['作業時間の調整', '定期的な休息', '午前中の軽作業から開始'],
        restrictions: [],
        medical: ['睡眠状態のモニタリング'],
        other: []
      },
      goals: {
        longTerm: [
          { description: '一般就労を目指す', timeframe: '2年以内', priority: 'high' }
        ],
        shortTerm: [
          { description: '週3日の通所を安定させる', timeframe: '3ヶ月', priority: 'high' },
          { description: '体調管理の習慣をつける', timeframe: '1ヶ月', priority: 'medium' },
          { description: '朝の起床リズムを整える', timeframe: '1ヶ月', priority: 'medium' }
        ]
      },
      supportContents: [
        { type: '就労訓練', provider: '支援員', location: '事業所内', frequency: '週3回', duration: '3時間/日' },
        { type: '体調確認', provider: '支援員', location: '事業所内', frequency: '毎日', duration: '10分' },
        { type: '生活リズム支援', provider: '支援員', location: '事業所内', frequency: '週1回', duration: '15分' }
      ],
      nextMonitoringCheckpoints: [
        '通所の安定度',
        '疲労感の変化',
        '作業時間の適正',
        '睡眠・起床リズムの改善度'
      ],
      citations: [
        { segmentIndex: 3, timestamp: '00:00:20', text: '少し疲れやすいかもしれません' },
        { segmentIndex: 5, timestamp: '00:00:45', text: '朝起きにくい日があります' },
        { segmentIndex: 7, timestamp: '00:01:12', text: 'ペースを調整しながら取り組みたい' }
      ]
    };

    const extraction = await prisma.aIExtraction.create({
      data: {
        sessionId: id as string,
        version: newVersion,
        extractedData: JSON.stringify(extractedData),
        model: 'mock-gpt4'
      }
    });

    // セッションのステータスを完了に更新
    if (session.status === 'processing' || session.status === 'transcribing') {
      await prisma.interviewSession.update({
        where: { id },
        data: { status: 'completed' }
      });
    }

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'ai_extractions',
        resourceId: extraction.id,
        details: JSON.stringify({ sessionId: id, version: newVersion, model: 'mock-gpt4' })
      }
    });

    res.status(201).json({ extraction });
  } catch (error) {
    console.error('AI項目抽出エラー:', error);
    res.status(500).json({ error: '項目抽出に失敗しました。しばらく経ってから再度お試しください。' });
  }
});

export default router;
