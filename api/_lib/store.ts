// In-memory mock store shared across warm Vercel function invocations.
// Not durable; for demo only.

export type SupportPlanStatus = 'draft' | 'pending_consent' | 'approved' | 'delivered' | 'monitoring';

export type SupportPlan = {
  id: string;
  client: { id: string; lastName: string; firstName: string; clientNumber: string };
  serviceType: string;
  status: SupportPlanStatus;
  planPeriodStart: string;
  planPeriodEnd: string;
  monitoringFrequency: number;
  nextMonitoringDate: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  consentDate?: string | null;
  deliveryDate?: string | null;
  planContent?: string; // JSON string
  monitorings?: any[];
  versions?: any[];
};

export function getMockSupportPlans(): SupportPlan[] {
  const g = globalThis as any;
  if (!g.__mockSupportPlans) g.__mockSupportPlans = [] as SupportPlan[];
  return g.__mockSupportPlans as SupportPlan[];
}

export function computeNextMonitoringDate(start: string, months: number): string | null {
  if (!start) return null;
  const m = Number(months);
  if (!Number.isFinite(m) || m <= 0) return null;
  const d = new Date(`${start}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}
