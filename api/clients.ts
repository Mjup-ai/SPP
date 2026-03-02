import type { IncomingMessage, ServerResponse } from 'http';
import { getBearerToken, readJsonBody, sendJson, setCors } from './_lib/http';

const STAFF_ADMIN_TOKEN = process.env.STAFF_ADMIN_TOKEN ?? 'staff-admin-token';

type Client = {
  id: string;
  clientNumber: string | null;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  status: 'active' | 'suspended' | 'terminated' | 'trial' | string;
  serviceType: string;
  startDate: string;
  phone: string | null;
  certificates: Array<{ id: string; typeName: string; validUntil: string; status: string }>;
};

// NOTE: This is a demo/in-memory dataset. Replace with DB-backed implementation later.
let CLIENTS: Client[] = [
  {
    id: 'client_1',
    clientNumber: '0001',
    lastName: '山田',
    firstName: '太郎',
    lastNameKana: 'ヤマダ',
    firstNameKana: 'タロウ',
    status: 'active',
    serviceType: 'employment_continuation_b',
    startDate: '2025-04-01',
    phone: null,
    certificates: [],
  },
  {
    id: 'client_2',
    clientNumber: '0002',
    lastName: '佐藤',
    firstName: '花子',
    lastNameKana: 'サトウ',
    firstNameKana: 'ハナコ',
    status: 'active',
    serviceType: 'employment_transition',
    startDate: '2025-06-15',
    phone: null,
    certificates: [],
  },
  {
    id: 'client_3',
    clientNumber: '0003',
    lastName: '鈴木',
    firstName: '次郎',
    lastNameKana: 'スズキ',
    firstNameKana: 'ジロウ',
    status: 'suspended',
    serviceType: 'employment_continuation_b',
    startDate: '2024-11-01',
    phone: null,
    certificates: [],
  },
];

function parseQuery(req: IncomingMessage) {
  const url = new URL(req.url || '', 'http://localhost');
  return url.searchParams;
}

function contains(haystack: string | null | undefined, needle: string) {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  setCors(res);

  const token = getBearerToken(req);
  if (token !== STAFF_ADMIN_TOKEN) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  if (method === 'GET') {
    const q = parseQuery(req);
    const status = q.get('status');
    const serviceType = q.get('serviceType');
    const search = q.get('search')?.trim();

    const offset = Number(q.get('offset') || '0');
    const limit = Number(q.get('limit') || '20');

    let filtered = CLIENTS.slice();
    if (status) filtered = filtered.filter((c) => c.status === status);
    if (serviceType) filtered = filtered.filter((c) => c.serviceType === serviceType);
    if (search) {
      filtered = filtered.filter((c) => {
        const fullName = `${c.lastName}${c.firstName}`;
        const fullKana = `${c.lastNameKana ?? ''}${c.firstNameKana ?? ''}`;
        return (
          contains(fullName, search) ||
          contains(fullKana, search) ||
          contains(c.clientNumber, search)
        );
      });
    }

    const total = filtered.length;
    const page = filtered.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit));

    return sendJson(res, 200, { clients: page, total });
  }

  if (method === 'POST') {
    const body = await readJsonBody(req);

    const newClient: Client = {
      id: `client_${Date.now()}`,
      clientNumber: body.clientNumber ?? null,
      lastName: body.lastName ?? '',
      firstName: body.firstName ?? '',
      lastNameKana: body.lastNameKana ?? null,
      firstNameKana: body.firstNameKana ?? null,
      status: body.status ?? 'active',
      serviceType: body.serviceType ?? 'employment_continuation_b',
      startDate: body.startDate ?? new Date().toISOString().slice(0, 10),
      phone: body.phone ?? null,
      certificates: [],
    };

    if (!newClient.lastName || !newClient.firstName) {
      return sendJson(res, 400, { error: 'lastName and firstName are required' });
    }

    CLIENTS = [newClient, ...CLIENTS];
    return sendJson(res, 201, { client: newClient });
  }

  return sendJson(res, 405, { error: 'Method Not Allowed' });
}
