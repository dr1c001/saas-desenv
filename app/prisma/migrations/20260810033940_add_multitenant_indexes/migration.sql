-- Índices multi-tenant e de chave estrangeira.
-- Ver o bloco de comentário no topo de prisma/schema.prisma para o porquê de cada um.
-- Puramente aditivo: 28 CREATE INDEX, nenhum DROP/ALTER.

-- CreateIndex
CREATE INDEX "Attachment_orderId_idx" ON "Attachment"("orderId");

-- CreateIndex
CREATE INDEX "ChecklistItem_orderId_idx" ON "ChecklistItem"("orderId");

-- CreateIndex
CREATE INDEX "Client_tenantId_createdAt_idx" ON "Client"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Client_tenantId_status_idx" ON "Client"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Equipment_tenantId_idx" ON "Equipment"("tenantId");

-- CreateIndex
CREATE INDEX "Equipment_clientId_idx" ON "Equipment"("clientId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_status_paidAt_idx" ON "Expense"("tenantId", "status", "paidAt");

-- CreateIndex
CREATE INDEX "Expense_tenantId_status_dueDate_idx" ON "Expense"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "MaintenanceItem_orderId_idx" ON "MaintenanceItem"("orderId");

-- CreateIndex
CREATE INDEX "MaintenanceOrder_tenantId_createdAt_idx" ON "MaintenanceOrder"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceOrder_tenantId_status_idx" ON "MaintenanceOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MaintenanceOrder_providerId_idx" ON "MaintenanceOrder"("providerId");

-- CreateIndex
CREATE INDEX "Provider_tenantId_name_idx" ON "Provider"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Quote_tenantId_createdAt_idx" ON "Quote"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_tenantId_status_idx" ON "Quote"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Revenue_tenantId_status_paidAt_idx" ON "Revenue"("tenantId", "status", "paidAt");

-- CreateIndex
CREATE INDEX "Revenue_tenantId_status_dueDate_idx" ON "Revenue"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Revenue_orderId_idx" ON "Revenue"("orderId");

-- CreateIndex
CREATE INDEX "ServiceItem_orderId_idx" ON "ServiceItem"("orderId");

-- CreateIndex
CREATE INDEX "ServiceOrder_tenantId_createdAt_idx" ON "ServiceOrder"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceOrder_tenantId_status_idx" ON "ServiceOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ServiceOrder_tenantId_concludedAt_idx" ON "ServiceOrder"("tenantId", "concludedAt");

-- CreateIndex
CREATE INDEX "ServiceOrder_tenantId_scheduledAt_idx" ON "ServiceOrder"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ServiceOrder_clientId_idx" ON "ServiceOrder"("clientId");

-- CreateIndex
CREATE INDEX "ServiceOrder_technicianId_idx" ON "ServiceOrder"("technicianId");

-- CreateIndex
CREATE INDEX "Subscription_tenantId_idx" ON "Subscription"("tenantId");

-- CreateIndex
CREATE INDEX "Subscription_asaasId_idx" ON "Subscription"("asaasId");

-- CreateIndex
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");
