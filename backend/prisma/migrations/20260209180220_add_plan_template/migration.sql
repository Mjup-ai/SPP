-- CreateTable
CREATE TABLE "PlanTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serviceType" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'standard',
    "content" TEXT NOT NULL,
    "sections" TEXT,
    "defaultGoals" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanTemplate_organizationId_idx" ON "PlanTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "PlanTemplate_serviceType_idx" ON "PlanTemplate"("serviceType");

-- CreateIndex
CREATE INDEX "PlanTemplate_isActive_idx" ON "PlanTemplate"("isActive");

-- AddForeignKey
ALTER TABLE "SupportPlan" ADD CONSTRAINT "SupportPlan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
