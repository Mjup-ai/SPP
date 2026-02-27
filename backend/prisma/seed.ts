import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 事業所を作成
  const organization = await prisma.organization.upsert({
    where: { id: 'org-001' },
    update: {},
    create: {
      id: 'org-001',
      name: 'サンプル就労支援事業所',
      serviceType: 'employment_continuation_b',
      capacity: 20,
      postalCode: '100-0001',
      address: '東京都千代田区1-1-1',
      phone: '03-1234-5678',
      email: 'info@sample-support.jp',
    },
  });
  console.log('Created organization:', organization.name);

  // 管理者スタッフを作成
  const passwordHash = await bcrypt.hash('admin123', 10);
  const adminStaff = await prisma.staffUser.upsert({
    where: { email: 'admin@sample-support.jp' },
    update: {},
    create: {
      organizationId: organization.id,
      email: 'admin@sample-support.jp',
      passwordHash,
      name: '管理者 太郎',
      role: 'admin',
      isActive: true,
    },
  });
  console.log('Created admin staff:', adminStaff.email);

  // サビ管を作成
  const managerHash = await bcrypt.hash('manager123', 10);
  const manager = await prisma.staffUser.upsert({
    where: { email: 'manager@sample-support.jp' },
    update: {},
    create: {
      organizationId: organization.id,
      email: 'manager@sample-support.jp',
      passwordHash: managerHash,
      name: 'サビ管 花子',
      role: 'service_manager',
      isActive: true,
    },
  });
  console.log('Created service manager:', manager.email);

  // 利用者を作成
  const clientsData = [
    { lastName: '山田', firstName: '一郎', lastKana: 'やまだ', firstKana: 'いちろう' },
    { lastName: '佐藤', firstName: '花子', lastKana: 'さとう', firstKana: 'はなこ' },
    { lastName: '鈴木', firstName: '次郎', lastKana: 'すずき', firstKana: 'じろう' },
    { lastName: '田中', firstName: '三郎', lastKana: 'たなか', firstKana: 'さぶろう' },
    { lastName: '高橋', firstName: '美咲', lastKana: 'たかはし', firstKana: 'みさき' },
  ];

  const clientPasswordHash = await bcrypt.hash('client123', 10);

  for (let i = 0; i < clientsData.length; i++) {
    const clientData = clientsData[i];
    const clientId = 'client-00' + (i + 1);
    const clientNumber = 'C-' + String(i + 1).padStart(4, '0');
    const certId = 'cert-' + (i + 1) + '-recipient';
    const certNumber = 'R-' + String(i + 1).padStart(6, '0');

    const created = await prisma.client.upsert({
      where: { id: clientId },
      update: {},
      create: {
        id: clientId,
        organizationId: organization.id,
        clientNumber: clientNumber,
        lastName: clientData.lastName,
        firstName: clientData.firstName,
        lastNameKana: clientData.lastKana,
        firstNameKana: clientData.firstKana,
        serviceType: 'employment_continuation_b',
        startDate: new Date('2024-04-01'),
        status: 'active',
      },
    });
    console.log('Created client:', created.lastName, created.firstName);

    // 利用者ログインアカウントを作成
    const clientUserId = 'client-user-00' + (i + 1);
    const clientEmail = `client${i + 1}@sample-support.jp`;
    await prisma.clientUser.upsert({
      where: { id: clientUserId },
      update: {},
      create: {
        id: clientUserId,
        clientId: created.id,
        email: clientEmail,
        passwordHash: clientPasswordHash,
        isActive: true,
      },
    });
    console.log('Created client user:', clientEmail);

    // 受給者証を作成
    await prisma.certificate.upsert({
      where: { id: certId },
      update: {},
      create: {
        id: certId,
        clientId: created.id,
        type: 'recipient_certificate',
        typeName: '受給者証',
        number: certNumber,
        validUntil: new Date('2025-03-31'),
        status: 'valid',
      },
    });
  }

  // 個別支援計画テンプレートを作成
  const templatesData = [
    {
      id: 'template-001',
      name: '就労継続B型 標準テンプレート',
      serviceType: 'employment_continuation_b',
      category: 'standard',
      isDefault: true,
      content: JSON.stringify({
        sections: ['基本情報', '本人の意向', '支援目標', '支援内容'],
        goals: [
          {
            id: 'goal-sample-1',
            title: '作業時間の安定',
            description: '週の作業時間を安定して確保する',
            category: 'work',
            priority: 'high',
            actions: ['出勤日の体調管理支援', '作業ペースの調整'],
            criteria: '月間出勤率80%以上'
          },
          {
            id: 'goal-sample-2',
            title: 'コミュニケーション能力の向上',
            description: '周囲とのコミュニケーションを円滑にする',
            category: 'social',
            priority: 'medium',
            actions: ['グループワークへの参加促進', '報連相の練習'],
            criteria: '自発的な報告ができる'
          }
        ]
      })
    },
    {
      id: 'template-002',
      name: '就労継続A型 標準テンプレート',
      serviceType: 'employment_continuation_a',
      category: 'standard',
      isDefault: true,
      content: JSON.stringify({
        sections: ['基本情報', '本人の意向', '支援目標', '支援内容'],
        goals: [
          {
            id: 'goal-a-1',
            title: '作業スキルの向上',
            description: '担当業務の習熟度を高める',
            category: 'skill',
            priority: 'high',
            actions: ['OJTの実施', 'スキルチェックシートによる進捗管理'],
            criteria: '担当業務を独力で遂行できる'
          }
        ]
      })
    },
    {
      id: 'template-003',
      name: '就労移行支援 標準テンプレート',
      serviceType: 'employment_transition',
      category: 'standard',
      isDefault: true,
      content: JSON.stringify({
        sections: ['基本情報', '本人の意向', '就労目標', '支援内容', '企業実習'],
        goals: [
          {
            id: 'goal-t-1',
            title: '一般就労を目指す',
            description: '企業への就職を実現する',
            category: 'work',
            priority: 'high',
            actions: ['職業適性検査', '履歴書作成支援', '面接練習', '企業見学・実習'],
            criteria: '一般企業への就職内定'
          }
        ]
      })
    }
  ];

  for (const template of templatesData) {
    await prisma.planTemplate.upsert({
      where: { id: template.id },
      update: {},
      create: {
        id: template.id,
        organizationId: null, // システムデフォルト
        name: template.name,
        serviceType: template.serviceType,
        category: template.category,
        content: template.content,
        isDefault: template.isDefault,
        isActive: true,
        sortOrder: 0,
      },
    });
    console.log('Created template:', template.name);
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
