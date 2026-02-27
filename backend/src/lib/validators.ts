import { z } from 'zod';

// 共通バリデーションスキーマ
export const phoneSchema = z.string().regex(/^[\d\-\+\(\)\s]+$/, '電話番号の形式が不正です').optional().nullable();
export const postalCodeSchema = z.string().regex(/^\d{3}-?\d{4}$/, '郵便番号の形式が不正です').optional().nullable();
export const emailSchema = z.string().email('メールアドレスの形式が不正です');

// 日付バリデーション
export const dateSchema = z.string().refine((val) => !isNaN(Date.parse(val)), '有効な日付を入力してください');
export const optionalDateSchema = z.string().refine((val) => !val || !isNaN(Date.parse(val)), '有効な日付を入力してください').optional().nullable();

// サービス種別
export const serviceTypeSchema = z.enum([
  'employment_transition',
  'employment_continuation_a',
  'employment_continuation_b',
  'employment_stabilization',
  'independence_training_functional',
  'independence_training_life'
]);

// ステータス
export const clientStatusSchema = z.enum(['active', 'suspended', 'terminated', 'trial']);
export const attendanceStatusSchema = z.enum(['present', 'absent', 'late', 'early_leave', 'holiday', 'sick']);
export const supportPlanStatusSchema = z.enum(['draft', 'pending_consent', 'approved', 'delivered', 'monitoring', 'expired']);
export const certificateStatusSchema = z.enum(['valid', 'expiring_soon', 'expired', 'pending_renewal']);

// ============================================
// 認証関連
// ============================================
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'パスワードを入力してください')
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '現在のパスワードを入力してください'),
  newPassword: z.string().min(8, 'パスワードは8文字以上で入力してください')
    .regex(/[A-Za-z]/, 'パスワードには英字を含めてください')
    .regex(/[0-9]/, 'パスワードには数字を含めてください')
});

// ============================================
// 利用者関連
// ============================================
const clientBaseSchema = z.object({
  clientNumber: z.string().optional(),
  lastName: z.string().min(1, '姓を入力してください'),
  firstName: z.string().min(1, '名を入力してください'),
  lastNameKana: z.string().optional(),
  firstNameKana: z.string().optional(),
  birthDate: optionalDateSchema,
  gender: z.enum(['male', 'female', 'other']).optional().nullable(),
  postalCode: postalCodeSchema,
  address: z.string().optional().nullable(),
  phone: phoneSchema,
  email: z.string().email().optional().nullable(),
  emergencyContact: z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string()
  }).optional().nullable(),
  serviceType: serviceTypeSchema,
  startDate: dateSchema,
  endDate: optionalDateSchema,
  scheduledDays: z.array(z.number().min(0).max(6)).optional(),
  needsTransport: z.boolean().optional(),
  transportDetails: z.string().optional().nullable(),
  assignedStaffId: z.string().optional().nullable()
});

export const createClientSchema = clientBaseSchema.refine(
  (data) => !data.endDate || new Date(data.startDate) <= new Date(data.endDate),
  { message: '終了日は開始日以降に設定してください', path: ['endDate'] }
);

export const updateClientSchema = clientBaseSchema.partial().extend({
  status: clientStatusSchema.optional()
});

// ============================================
// 出勤関連
// ============================================
export const createAttendanceSchema = z.object({
  clientId: z.string().min(1, '利用者を選択してください'),
  date: dateSchema,
  status: attendanceStatusSchema,
  checkIn: z.string().optional().nullable(),
  checkOut: z.string().optional().nullable(),
  breakMinutes: z.number().min(0).optional(),
  workContent: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const confirmAttendanceSchema = z.object({
  date: dateSchema
});

// ============================================
// 日報関連
// ============================================
export const createDailyReportSchema = z.object({
  clientId: z.string().optional(),
  date: optionalDateSchema,
  workContent: z.array(z.object({
    task: z.string(),
    duration: z.number().optional(),
    outcome: z.string().optional()
  })).optional(),
  mood: z.number().min(1).max(5).optional(),
  health: z.number().min(1).max(5).optional(),
  reflection: z.string().optional(),
  concerns: z.array(z.string()).optional()
});

export const addCommentSchema = z.object({
  content: z.string().min(1, 'コメント内容を入力してください'),
  isTemplate: z.boolean().optional()
});

// ============================================
// 支援記録関連
// ============================================
export const createSupportNoteSchema = z.object({
  clientId: z.string().min(1, '利用者を選択してください'),
  date: dateSchema,
  category: z.enum(['daily', 'behavior', 'health', 'skill', 'communication', 'other']),
  content: z.string().min(1, '内容を入力してください'),
  tags: z.array(z.string()).optional(),
  isImportant: z.boolean().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string()
  })).optional()
});

export const updateSupportNoteSchema = createSupportNoteSchema.partial();

// ============================================
// 証明書関連
// ============================================
const certificateBaseSchema = z.object({
  clientId: z.string().min(1, '利用者を選択してください'),
  type: z.string().min(1, '証明書種別を選択してください'),
  typeName: z.string().min(1, '証明書名を入力してください'),
  number: z.string().optional(),
  issuedDate: optionalDateSchema,
  validFrom: optionalDateSchema,
  validUntil: dateSchema,
  issuingAuthority: z.string().optional(),
  notes: z.string().optional()
});

export const createCertificateSchema = certificateBaseSchema.refine(
  (data) => !data.validFrom || !data.validUntil || new Date(data.validFrom) <= new Date(data.validUntil),
  { message: '有効期限開始日は終了日以前に設定してください', path: ['validFrom'] }
);

export const updateCertificateSchema = certificateBaseSchema.partial().extend({
  status: certificateStatusSchema.optional()
});

// ============================================
// 面談セッション関連
// ============================================
export const createInterviewSessionSchema = z.object({
  clientId: z.string().min(1, '利用者を選択してください'),
  scheduledDate: dateSchema,
  sessionType: z.enum(['regular', 'initial', 'monitoring', 'emergency', 'family', 'external']),
  duration: z.number().min(1).optional(),
  location: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  notes: z.string().optional()
});

export const updateInterviewSessionSchema = createInterviewSessionSchema.partial().extend({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
  actualDate: optionalDateSchema,
  summary: z.string().optional()
});

// ============================================
// 個別支援計画関連
// ============================================
export const createSupportPlanSchema = z.object({
  clientId: z.string().min(1, '利用者を選択してください'),
  planPeriodStart: dateSchema,
  planPeriodEnd: dateSchema,
  serviceType: serviceTypeSchema,
  monitoringFrequency: z.number().min(1).max(12).optional()
}).refine(
  (data) => new Date(data.planPeriodStart) < new Date(data.planPeriodEnd),
  { message: '計画終了日は開始日より後に設定してください', path: ['planPeriodEnd'] }
);

export const updateSupportPlanSchema = z.object({
  status: supportPlanStatusSchema.optional(),
  planContent: z.string().optional(),
  consentDate: optionalDateSchema,
  deliveryDate: optionalDateSchema,
  nextMonitoringDate: optionalDateSchema,
  monitoringFrequency: z.number().min(1).max(12).optional()
});

export const createMonitoringSchema = z.object({
  monitoringDate: dateSchema,
  goalAchievements: z.array(z.object({
    goalId: z.string(),
    achievement: z.number().min(0).max(100),
    notes: z.string().optional()
  })).optional(),
  overallProgress: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  hasChanges: z.boolean().optional(),
  nextActions: z.array(z.string()).optional()
});

// ============================================
// スタッフ管理関連
// ============================================
export const createStaffSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
  name: z.string().min(1, '名前を入力してください'),
  role: z.enum(['admin', 'service_manager', 'support_staff', 'part_time']),
  qualifications: z.array(z.string()).optional(),
  phone: phoneSchema
});

export const updateStaffSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'service_manager', 'support_staff', 'part_time']).optional(),
  qualifications: z.array(z.string()).optional(),
  phone: phoneSchema,
  isActive: z.boolean().optional()
});

// ============================================
// 事業所設定関連
// ============================================
export const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  serviceType: serviceTypeSchema.optional(),
  capacity: z.number().min(1).optional(),
  postalCode: postalCodeSchema,
  address: z.string().optional(),
  phone: phoneSchema,
  email: z.string().email().optional(),
  settings: z.object({
    businessHours: z.object({
      start: z.string(),
      end: z.string()
    }).optional(),
    openDays: z.array(z.number().min(0).max(6)).optional(),
    holidayCalendar: z.array(z.string()).optional()
  }).optional()
});

// ============================================
// 給与関連
// ============================================
export const createWageRuleSchema = z.object({
  clientId: z.string().min(1, '利用者を選択してください'),
  ruleType: z.enum(['hourly', 'daily', 'piece_rate', 'monthly']),
  baseAmount: z.number().min(0, '金額は0以上で入力してください'),
  effectiveFrom: dateSchema,
  effectiveTo: optionalDateSchema,
  conditions: z.object({
    minHours: z.number().optional(),
    maxHours: z.number().optional(),
    overtimeRate: z.number().optional()
  }).optional()
});

export const createPayrollRunSchema = z.object({
  periodStart: dateSchema,
  periodEnd: dateSchema,
  targetClientIds: z.array(z.string()).optional()
}).refine(
  (data) => new Date(data.periodStart) < new Date(data.periodEnd),
  { message: '期間終了日は開始日より後に設定してください', path: ['periodEnd'] }
);

// ============================================
// アラート関連
// ============================================
export const createAlertRuleSchema = z.object({
  name: z.string().min(1, 'ルール名を入力してください'),
  type: z.enum(['certificate_expiry', 'monitoring_due', 'attendance_pattern', 'custom']),
  conditions: z.object({
    daysBeforeExpiry: z.number().optional(),
    threshold: z.number().optional(),
    pattern: z.string().optional()
  }),
  actions: z.array(z.enum(['notification', 'email', 'dashboard'])),
  isActive: z.boolean().optional()
});

// ============================================
// バリデーションミドルウェア
// ============================================
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validate = <T>(schema: ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.'),
        message: issue.message
      }));
      res.status(400).json({
        error: '入力内容に問題があります',
        details: errors
      });
      return;
    }
    next();
  };
};

export const validateQuery = <T>(schema: ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.'),
        message: issue.message
      }));
      res.status(400).json({
        error: 'クエリパラメータに問題があります',
        details: errors
      });
      return;
    }
    next();
  };
};
