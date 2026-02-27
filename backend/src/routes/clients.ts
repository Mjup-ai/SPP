import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireStaff } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// 認証必須
router.use(authenticate);
router.use(requireStaff);

// 利用者一覧取得
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { status, serviceType, search, limit, offset } = req.query;

    const where: any = { organizationId };

    if (status) {
      where.status = status;
    }

    if (serviceType) {
      where.serviceType = serviceType;
    }

    if (search) {
      where.OR = [
        { lastName: { contains: search as string } },
        { firstName: { contains: search as string } },
        { lastNameKana: { contains: search as string } },
        { firstNameKana: { contains: search as string } },
        { clientNumber: { contains: search as string } }
      ];
    }

    const clients = await prisma.client.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { lastName: 'asc' },
        { firstName: 'asc' }
      ],
      include: {
        certificates: {
          where: {
            validUntil: {
              gte: new Date()
            }
          },
          orderBy: { validUntil: 'asc' },
          take: 3
        }
      },
      take: limit ? parseInt(limit as string) : 50,
      skip: offset ? parseInt(offset as string) : 0
    });

    const total = await prisma.client.count({ where });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'view',
        resource: 'clients',
        details: JSON.stringify({ count: clients.length })
      }
    });

    res.json({ clients, total });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ error: '利用者一覧の取得に失敗しました' });
  }
});

// 利用者詳細取得
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const client = await prisma.client.findFirst({
      where: { id, organizationId },
      include: {
        sensitiveProfile: true,
        certificates: {
          orderBy: { validUntil: 'asc' }
        },
        consents: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!client) {
      return res.status(404).json({ error: '利用者が見つかりません' });
    }

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'view',
        resource: 'clients',
        resourceId: id
      }
    });

    res.json({ client });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: '利用者情報の取得に失敗しました' });
  }
});

// 利用者作成
router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const {
      clientNumber,
      lastName,
      firstName,
      lastNameKana,
      firstNameKana,
      birthDate,
      gender,
      postalCode,
      address,
      phone,
      email,
      emergencyContact,
      serviceType,
      startDate,
      endDate,
      scheduledDays,
      needsTransport,
      transportDetails,
      assignedStaffId
    } = req.body;

    if (!lastName || !firstName || !serviceType || !startDate) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }

    const client = await prisma.client.create({
      data: {
        organizationId: organizationId!,
        clientNumber,
        lastName,
        firstName,
        lastNameKana,
        firstNameKana,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        gender,
        postalCode,
        address,
        phone,
        email,
        emergencyContact: emergencyContact ? JSON.stringify(emergencyContact) : undefined,
        serviceType,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
        scheduledDays: scheduledDays ? JSON.stringify(scheduledDays) : undefined,
        needsTransport,
        transportDetails,
        assignedStaffId,
        status: 'active'
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'create',
        resource: 'clients',
        resourceId: client.id
      }
    });

    res.status(201).json({ client });
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({ error: '利用者の登録に失敗しました' });
  }
});

// 利用者更新
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    const existingClient = await prisma.client.findFirst({
      where: { id, organizationId }
    });

    if (!existingClient) {
      return res.status(404).json({ error: '利用者が見つかりません' });
    }

    const {
      clientNumber,
      lastName,
      firstName,
      lastNameKana,
      firstNameKana,
      birthDate,
      gender,
      postalCode,
      address,
      phone,
      email,
      emergencyContact,
      serviceType,
      startDate,
      endDate,
      scheduledDays,
      needsTransport,
      transportDetails,
      assignedStaffId,
      status
    } = req.body;

    const client = await prisma.client.update({
      where: { id },
      data: {
        clientNumber,
        lastName,
        firstName,
        lastNameKana,
        firstNameKana,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        gender,
        postalCode,
        address,
        phone,
        email,
        emergencyContact: emergencyContact ? JSON.stringify(emergencyContact) : undefined,
        serviceType,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        scheduledDays: scheduledDays ? JSON.stringify(scheduledDays) : undefined,
        needsTransport,
        transportDetails,
        assignedStaffId,
        status
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'clients',
        resourceId: id,
        details: JSON.stringify({ changes: req.body })
      }
    });

    res.json({ client });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: '利用者情報の更新に失敗しました' });
  }
});

// 要配慮情報の更新
router.put('/:id/sensitive', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const organizationId = req.user?.organizationId;

    // 管理者またはサービス管理責任者のみ
    if (!['admin', 'service_manager'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'アクセス権限がありません' });
    }

    const client = await prisma.client.findFirst({
      where: { id, organizationId }
    });

    if (!client) {
      return res.status(404).json({ error: '利用者が見つかりません' });
    }

    const {
      disabilityTypes,
      disabilityGrade,
      characteristics,
      accommodations,
      restrictions,
      medications,
      medicalHistory,
      risks,
      supportPolicy,
      goals
    } = req.body;

    const sensitiveProfile = await prisma.clientSensitiveProfile.upsert({
      where: { clientId: id },
      update: {
        disabilityTypes: disabilityTypes ? JSON.stringify(disabilityTypes) : undefined,
        disabilityGrade,
        characteristics,
        accommodations: accommodations ? JSON.stringify(accommodations) : undefined,
        restrictions: restrictions ? JSON.stringify(restrictions) : undefined,
        medications: medications ? JSON.stringify(medications) : undefined,
        medicalHistory,
        risks,
        supportPolicy,
        goals: goals ? JSON.stringify(goals) : undefined
      },
      create: {
        clientId: id,
        disabilityTypes: disabilityTypes ? JSON.stringify(disabilityTypes) : undefined,
        disabilityGrade,
        characteristics,
        accommodations: accommodations ? JSON.stringify(accommodations) : undefined,
        restrictions: restrictions ? JSON.stringify(restrictions) : undefined,
        medications: medications ? JSON.stringify(medications) : undefined,
        medicalHistory,
        risks,
        supportPolicy,
        goals: goals ? JSON.stringify(goals) : undefined
      }
    });

    // 監査ログ
    await prisma.auditLog.create({
      data: {
        staffId: req.user?.id,
        action: 'update',
        resource: 'client_sensitive_profiles',
        resourceId: id,
        details: JSON.stringify({ updated: true })
      }
    });

    res.json({ sensitiveProfile });
  } catch (error) {
    console.error('Update sensitive profile error:', error);
    res.status(500).json({ error: '要配慮情報の更新に失敗しました' });
  }
});

export default router;
