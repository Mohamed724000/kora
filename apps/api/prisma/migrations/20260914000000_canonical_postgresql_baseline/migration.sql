-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'LOGIN', 'STEP_UP');

-- CreateEnum
CREATE TYPE "ArtistStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MediaAssetKind" AS ENUM ('AUDIO_MASTER', 'COVER_IMAGE');

-- CreateEnum
CREATE TYPE "MediaProcessingStatus" AS ENUM ('PREPARING', 'UPLOAD_PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaProvider" AS ENUM ('MUX');

-- CreateEnum
CREATE TYPE "OrderState" AS ENUM ('CREATED', 'PAYMENT_PENDING', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('XOF');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('SANDBOX_NEUTRAL');

-- CreateEnum
CREATE TYPE "PaymentAttemptState" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InboxProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerAccountKind" AS ENUM ('PROVIDER_CLEARING', 'CUSTOMER_RECEIVABLE', 'ARTIST_PAYABLE', 'PLATFORM_REVENUE', 'TAX_PAYABLE', 'REFUND_LIABILITY');

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('PURCHASE');

-- CreateEnum
CREATE TYPE "ArtistEarningAllocationPolicy" AS ENUM ('FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'CONTENT_EDITOR', 'FINANCE_MANAGER', 'SUPPORT');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "verifiedPhone" TEXT NOT NULL,
    "optionalEmail" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerDevice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fingerprintHash" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "sessionFamilyId" TEXT NOT NULL,
    "accessTokenId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "refreshTokenVersion" INTEGER NOT NULL DEFAULT 1,
    "lastOtpStepUpAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "customerId" TEXT,
    "sessionId" TEXT,
    "pendingPasswordHash" TEXT,
    "passwordVerifiedAt" TIMESTAMP(3),
    "deviceFingerprintHash" TEXT NOT NULL,
    "devicePlatform" "DevicePlatform" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "totpSecretEncrypted" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenFamilyId" TEXT NOT NULL,
    "accessTokenJti" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "refreshTokenVersion" INTEGER NOT NULL DEFAULT 1,
    "lastTwoFactorAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRecoveryCode" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "status" "ArtistStatus" NOT NULL DEFAULT 'ACTIVE',
    "artistRevenueShareBps" INTEGER NOT NULL DEFAULT 2000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioContent" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceCfa" INTEGER NOT NULL,
    "previewSeconds" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "audioContentId" TEXT NOT NULL,
    "kind" "MediaAssetKind" NOT NULL,
    "processingStatus" "MediaProcessingStatus" NOT NULL DEFAULT 'PREPARING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "checksumSha256" TEXT,
    "durationSeconds" INTEGER,
    "privateStorageObjectKey" TEXT,
    "privateProviderUploadRef" TEXT,
    "privateProviderAssetRef" TEXT,
    "provider" "MediaProvider",
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaWebhookInbox" (
    "id" TEXT NOT NULL,
    "provider" "MediaProvider" NOT NULL DEFAULT 'MUX',
    "providerEventKey" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "signatureVerifiedAt" TIMESTAMP(3) NOT NULL,
    "processingStatus" "InboxProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "MediaWebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPublication" (
    "id" TEXT NOT NULL,
    "audioContentId" TEXT NOT NULL,
    "publishedByAdminId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ContentPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationMediaAsset" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "audioContentId" TEXT NOT NULL,
    "kind" "MediaAssetKind" NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "mediaAssetVersion" INTEGER NOT NULL,
    "readinessChecksum" TEXT NOT NULL,
    "verifiedReadyAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicationMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'XOF',
    "totalCfa" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "audioContentId" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "unitPriceCfa" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStateEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "state" "OrderState" NOT NULL,
    "reasonCode" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "amountCfa" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'XOF',
    "idempotencyKey" TEXT NOT NULL,
    "providerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttemptEvent" (
    "id" TEXT NOT NULL,
    "paymentAttemptId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "state" "PaymentAttemptState" NOT NULL,
    "safeReasonCode" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttemptEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookInbox" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerEventKey" TEXT NOT NULL,
    "paymentAttemptId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "signatureVerifiedAt" TIMESTAMP(3) NOT NULL,
    "processingStatus" "InboxProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentWebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentAttemptId" TEXT NOT NULL,
    "succeededAttemptEventId" TEXT NOT NULL,
    "settledAmountCfa" INTEGER NOT NULL,
    "distributableBasisCfa" INTEGER NOT NULL,
    "artistPayableAmountCfa" INTEGER NOT NULL,
    "platformAmountCfa" INTEGER NOT NULL,
    "artistAllocationPolicy" "ArtistEarningAllocationPolicy" NOT NULL DEFAULT 'FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1',
    "reconciliationKey" TEXT NOT NULL,
    "reconciledAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistSettlement" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "settlementSequence" BIGINT NOT NULL,
    "previousArtistSettlementId" TEXT,
    "carryInNumerator" INTEGER NOT NULL,
    "exactEarningsNumerator" BIGINT NOT NULL,
    "exactNumerator" BIGINT NOT NULL,
    "payableAmountCfa" INTEGER NOT NULL,
    "carryOutNumerator" INTEGER NOT NULL,
    "allocationPolicy" "ArtistEarningAllocationPolicy" NOT NULL DEFAULT 'FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1',
    "reconciledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "LedgerAccountKind" NOT NULL,
    "ownerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransactionGroup" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT,
    "eventKey" TEXT NOT NULL,
    "correctionOfGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransactionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerPosting" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amountCfa" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistEarning" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "artistSettlementId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "audioContentId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "grossItemAmountCfa" INTEGER NOT NULL,
    "legallyRequiredTaxCfa" INTEGER NOT NULL,
    "refundAdjustmentCfa" INTEGER NOT NULL DEFAULT 0,
    "frozenBasisCfa" INTEGER NOT NULL,
    "artistRevenueShareBps" INTEGER NOT NULL,
    "allocationPolicy" "ArtistEarningAllocationPolicy" NOT NULL DEFAULT 'FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1',
    "exactEarningNumerator" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "audioContentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "source" "EntitlementSource" NOT NULL DEFAULT 'PURCHASE',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewGrant" (
    "id" TEXT NOT NULL,
    "audioContentId" TEXT NOT NULL,
    "anonymousDeviceHash" TEXT NOT NULL,
    "anonymousIpBucketHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "maxDurationSeconds" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviewGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewPlaybackDescriptor" (
    "id" TEXT NOT NULL,
    "previewGrantId" TEXT NOT NULL,
    "descriptorHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviewPlaybackDescriptor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchasedPlaybackDescriptor" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "descriptorHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchasedPlaybackDescriptor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseCode" INTEGER NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "orderId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminIdempotencyRecord" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseCode" INTEGER NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "adminSessionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "maskedBefore" JSONB,
    "maskedAfter" JSONB,
    "reason" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_verifiedPhone_key" ON "Customer"("verifiedPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_optionalEmail_key" ON "Customer"("optionalEmail");

-- CreateIndex
CREATE INDEX "Customer_status_createdAt_idx" ON "Customer"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDevice_customerId_revokedAt_idx" ON "CustomerDevice"("customerId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDevice_customerId_fingerprintHash_key" ON "CustomerDevice"("customerId", "fingerprintHash");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDevice_id_customerId_key" ON "CustomerDevice"("id", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_accessTokenId_key" ON "CustomerSession"("accessTokenId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_refreshTokenHash_key" ON "CustomerSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "CustomerSession_customerId_revokedAt_idx" ON "CustomerSession"("customerId", "revokedAt");

-- CreateIndex
CREATE INDEX "CustomerSession_sessionFamilyId_revokedAt_idx" ON "CustomerSession"("sessionFamilyId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_id_customerId_key" ON "CustomerSession"("id", "customerId");

-- CreateIndex
CREATE INDEX "OtpChallenge_normalizedPhone_purpose_createdAt_idx" ON "OtpChallenge"("normalizedPhone", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_customerId_purpose_consumedAt_idx" ON "OtpChallenge"("customerId", "purpose", "consumedAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_sessionId_customerId_idx" ON "OtpChallenge"("sessionId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_accessTokenJti_key" ON "AdminSession"("accessTokenJti");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_refreshTokenHash_key" ON "AdminSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_adminUserId_revokedAt_idx" ON "AdminSession"("adminUserId", "revokedAt");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_id_adminUserId_key" ON "AdminSession"("id", "adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_adminUserId_tokenFamilyId_key" ON "AdminSession"("adminUserId", "tokenFamilyId");

-- CreateIndex
CREATE INDEX "AdminRecoveryCode_adminUserId_usedAt_idx" ON "AdminRecoveryCode"("adminUserId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRecoveryCode_adminUserId_codeHash_key" ON "AdminRecoveryCode"("adminUserId", "codeHash");

-- CreateIndex
CREATE INDEX "Artist_status_stageName_idx" ON "Artist"("status", "stageName");

-- CreateIndex
CREATE INDEX "AudioContent_artistId_createdAt_idx" ON "AudioContent"("artistId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AudioContent_id_artistId_key" ON "AudioContent"("id", "artistId");

-- CreateIndex
CREATE INDEX "MediaAsset_audioContentId_processingStatus_idx" ON "MediaAsset"("audioContentId", "processingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_audioContentId_kind_version_key" ON "MediaAsset"("audioContentId", "kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_id_audioContentId_kind_version_key" ON "MediaAsset"("id", "audioContentId", "kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_provider_privateProviderUploadRef_key" ON "MediaAsset"("provider", "privateProviderUploadRef");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_provider_privateProviderAssetRef_key" ON "MediaAsset"("provider", "privateProviderAssetRef");

-- CreateIndex
CREATE INDEX "MediaWebhookInbox_processingStatus_receivedAt_idx" ON "MediaWebhookInbox"("processingStatus", "receivedAt");

-- CreateIndex
CREATE INDEX "MediaWebhookInbox_mediaAssetId_receivedAt_idx" ON "MediaWebhookInbox"("mediaAssetId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaWebhookInbox_provider_providerEventKey_key" ON "MediaWebhookInbox"("provider", "providerEventKey");

-- CreateIndex
CREATE INDEX "ContentPublication_audioContentId_archivedAt_idx" ON "ContentPublication"("audioContentId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPublication_id_audioContentId_key" ON "ContentPublication"("id", "audioContentId");

-- CreateIndex
CREATE INDEX "PublicationMediaAsset_mediaAssetId_mediaAssetVersion_idx" ON "PublicationMediaAsset"("mediaAssetId", "mediaAssetVersion");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationMediaAsset_publicationId_kind_key" ON "PublicationMediaAsset"("publicationId", "kind");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_customerId_key" ON "Order"("id", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_audioContentId_key" ON "OrderItem"("orderId", "audioContentId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_id_orderId_audioContentId_key" ON "OrderItem"("id", "orderId", "audioContentId");

-- CreateIndex
CREATE INDEX "OrderStateEvent_orderId_recordedAt_idx" ON "OrderStateEvent"("orderId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderStateEvent_orderId_sequence_key" ON "OrderStateEvent"("orderId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_providerReference_key" ON "PaymentAttempt"("providerReference");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_createdAt_idx" ON "PaymentAttempt"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_orderId_idempotencyKey_key" ON "PaymentAttempt"("orderId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_id_orderId_key" ON "PaymentAttempt"("id", "orderId");

-- CreateIndex
CREATE INDEX "PaymentAttemptEvent_paymentAttemptId_recordedAt_idx" ON "PaymentAttemptEvent"("paymentAttemptId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttemptEvent_paymentAttemptId_sequence_key" ON "PaymentAttemptEvent"("paymentAttemptId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttemptEvent_id_paymentAttemptId_key" ON "PaymentAttemptEvent"("id", "paymentAttemptId");

-- CreateIndex
CREATE INDEX "PaymentWebhookInbox_processingStatus_receivedAt_idx" ON "PaymentWebhookInbox"("processingStatus", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookInbox_provider_providerEventKey_key" ON "PaymentWebhookInbox"("provider", "providerEventKey");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_deduplicationKey_key" ON "OutboxEvent"("deduplicationKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_orderId_key" ON "Settlement"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_paymentAttemptId_key" ON "Settlement"("paymentAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_succeededAttemptEventId_key" ON "Settlement"("succeededAttemptEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_reconciliationKey_key" ON "Settlement"("reconciliationKey");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_id_orderId_key" ON "Settlement"("id", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_paymentAttemptId_orderId_key" ON "Settlement"("paymentAttemptId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_succeededAttemptEventId_paymentAttemptId_key" ON "Settlement"("succeededAttemptEventId", "paymentAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistSettlement_previousArtistSettlementId_key" ON "ArtistSettlement"("previousArtistSettlementId");

-- CreateIndex
CREATE INDEX "ArtistSettlement_artistId_reconciledAt_idx" ON "ArtistSettlement"("artistId", "reconciledAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistSettlement_settlementId_artistId_key" ON "ArtistSettlement"("settlementId", "artistId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistSettlement_previousArtistSettlementId_artistId_key" ON "ArtistSettlement"("previousArtistSettlementId", "artistId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistSettlement_id_artistId_key" ON "ArtistSettlement"("id", "artistId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistSettlement_id_settlementId_orderId_artistId_key" ON "ArtistSettlement"("id", "settlementId", "orderId", "artistId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistSettlement_artistId_settlementSequence_key" ON "ArtistSettlement"("artistId", "settlementSequence");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransactionGroup_eventKey_key" ON "LedgerTransactionGroup"("eventKey");

-- CreateIndex
CREATE INDEX "LedgerTransactionGroup_settlementId_createdAt_idx" ON "LedgerTransactionGroup"("settlementId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerPosting_groupId_direction_idx" ON "LedgerPosting"("groupId", "direction");

-- CreateIndex
CREATE INDEX "LedgerPosting_accountId_createdAt_idx" ON "LedgerPosting"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistEarning_orderItemId_key" ON "ArtistEarning"("orderItemId");

-- CreateIndex
CREATE INDEX "ArtistEarning_artistId_createdAt_idx" ON "ArtistEarning"("artistId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistEarning_orderItemId_orderId_audioContentId_key" ON "ArtistEarning"("orderItemId", "orderId", "audioContentId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistEarning_artistSettlementId_settlementId_orderId_order_key" ON "ArtistEarning"("artistSettlementId", "settlementId", "orderId", "orderItemId", "audioContentId", "artistId");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_orderItemId_key" ON "Entitlement"("orderItemId");

-- CreateIndex
CREATE INDEX "Entitlement_audioContentId_revokedAt_idx" ON "Entitlement"("audioContentId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_customerId_audioContentId_key" ON "Entitlement"("customerId", "audioContentId");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_id_customerId_key" ON "Entitlement"("id", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_orderItemId_orderId_audioContentId_key" ON "Entitlement"("orderItemId", "orderId", "audioContentId");

-- CreateIndex
CREATE UNIQUE INDEX "PreviewGrant_tokenHash_key" ON "PreviewGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "PreviewGrant_anonymousDeviceHash_audioContentId_createdAt_idx" ON "PreviewGrant"("anonymousDeviceHash", "audioContentId", "createdAt");

-- CreateIndex
CREATE INDEX "PreviewGrant_anonymousIpBucketHash_createdAt_idx" ON "PreviewGrant"("anonymousIpBucketHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PreviewPlaybackDescriptor_descriptorHash_key" ON "PreviewPlaybackDescriptor"("descriptorHash");

-- CreateIndex
CREATE UNIQUE INDEX "PurchasedPlaybackDescriptor_descriptorHash_key" ON "PurchasedPlaybackDescriptor"("descriptorHash");

-- CreateIndex
CREATE INDEX "PurchasedPlaybackDescriptor_customerId_entitlementId_device_idx" ON "PurchasedPlaybackDescriptor"("customerId", "entitlementId", "deviceId", "expiresAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_customerId_operation_idempotencyKey_key" ON "IdempotencyRecord"("customerId", "operation", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AdminIdempotencyRecord_expiresAt_idx" ON "AdminIdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminIdempotencyRecord_adminUserId_operation_idempotencyKey_key" ON "AdminIdempotencyRecord"("adminUserId", "operation", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_adminUserId_createdAt_idx" ON "AuditLog"("adminUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerDevice" ADD CONSTRAINT "CustomerDevice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_deviceId_customerId_fkey" FOREIGN KEY ("deviceId", "customerId") REFERENCES "CustomerDevice"("id", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_sessionId_customerId_fkey" FOREIGN KEY ("sessionId", "customerId") REFERENCES "CustomerSession"("id", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AdminRecoveryCode" ADD CONSTRAINT "AdminRecoveryCode_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Artist" ADD CONSTRAINT "Artist_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AudioContent" ADD CONSTRAINT "AudioContent_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AudioContent" ADD CONSTRAINT "AudioContent_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_audioContentId_fkey" FOREIGN KEY ("audioContentId") REFERENCES "AudioContent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MediaWebhookInbox" ADD CONSTRAINT "MediaWebhookInbox_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContentPublication" ADD CONSTRAINT "ContentPublication_audioContentId_fkey" FOREIGN KEY ("audioContentId") REFERENCES "AudioContent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContentPublication" ADD CONSTRAINT "ContentPublication_publishedByAdminId_fkey" FOREIGN KEY ("publishedByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublicationMediaAsset" ADD CONSTRAINT "PublicationMediaAsset_publicationId_audioContentId_fkey" FOREIGN KEY ("publicationId", "audioContentId") REFERENCES "ContentPublication"("id", "audioContentId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublicationMediaAsset" ADD CONSTRAINT "PublicationMediaAsset_mediaAssetId_audioContentId_kind_med_fkey" FOREIGN KEY ("mediaAssetId", "audioContentId", "kind", "mediaAssetVersion") REFERENCES "MediaAsset"("id", "audioContentId", "kind", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_audioContentId_fkey" FOREIGN KEY ("audioContentId") REFERENCES "AudioContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStateEvent" ADD CONSTRAINT "OrderStateEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttemptEvent" ADD CONSTRAINT "PaymentAttemptEvent_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookInbox" ADD CONSTRAINT "PaymentWebhookInbox_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_paymentAttemptId_orderId_fkey" FOREIGN KEY ("paymentAttemptId", "orderId") REFERENCES "PaymentAttempt"("id", "orderId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_succeededAttemptEventId_paymentAttemptId_fkey" FOREIGN KEY ("succeededAttemptEventId", "paymentAttemptId") REFERENCES "PaymentAttemptEvent"("id", "paymentAttemptId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArtistSettlement" ADD CONSTRAINT "ArtistSettlement_settlementId_orderId_fkey" FOREIGN KEY ("settlementId", "orderId") REFERENCES "Settlement"("id", "orderId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArtistSettlement" ADD CONSTRAINT "ArtistSettlement_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArtistSettlement" ADD CONSTRAINT "ArtistSettlement_previousArtistSettlementId_artistId_fkey" FOREIGN KEY ("previousArtistSettlementId", "artistId") REFERENCES "ArtistSettlement"("id", "artistId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LedgerTransactionGroup" ADD CONSTRAINT "LedgerTransactionGroup_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LedgerTransactionGroup" ADD CONSTRAINT "LedgerTransactionGroup_correctionOfGroupId_fkey" FOREIGN KEY ("correctionOfGroupId") REFERENCES "LedgerTransactionGroup"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LedgerPosting" ADD CONSTRAINT "LedgerPosting_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LedgerTransactionGroup"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LedgerPosting" ADD CONSTRAINT "LedgerPosting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArtistEarning" ADD CONSTRAINT "ArtistEarning_settlementId_orderId_fkey" FOREIGN KEY ("settlementId", "orderId") REFERENCES "Settlement"("id", "orderId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArtistEarning" ADD CONSTRAINT "ArtistEarning_artistSettlementId_settlementId_orderId_arti_fkey" FOREIGN KEY ("artistSettlementId", "settlementId", "orderId", "artistId") REFERENCES "ArtistSettlement"("id", "settlementId", "orderId", "artistId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArtistEarning" ADD CONSTRAINT "ArtistEarning_orderItemId_orderId_audioContentId_fkey" FOREIGN KEY ("orderItemId", "orderId", "audioContentId") REFERENCES "OrderItem"("id", "orderId", "audioContentId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArtistEarning" ADD CONSTRAINT "ArtistEarning_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArtistEarning" ADD CONSTRAINT "ArtistEarning_audioContentId_artistId_fkey" FOREIGN KEY ("audioContentId", "artistId") REFERENCES "AudioContent"("id", "artistId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_audioContentId_fkey" FOREIGN KEY ("audioContentId") REFERENCES "AudioContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_orderItemId_orderId_audioContentId_fkey" FOREIGN KEY ("orderItemId", "orderId", "audioContentId") REFERENCES "OrderItem"("id", "orderId", "audioContentId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_settlementId_orderId_fkey" FOREIGN KEY ("settlementId", "orderId") REFERENCES "Settlement"("id", "orderId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_orderId_customerId_fkey" FOREIGN KEY ("orderId", "customerId") REFERENCES "Order"("id", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PreviewGrant" ADD CONSTRAINT "PreviewGrant_audioContentId_fkey" FOREIGN KEY ("audioContentId") REFERENCES "AudioContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewPlaybackDescriptor" ADD CONSTRAINT "PreviewPlaybackDescriptor_previewGrantId_fkey" FOREIGN KEY ("previewGrantId") REFERENCES "PreviewGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasedPlaybackDescriptor" ADD CONSTRAINT "PurchasedPlaybackDescriptor_entitlementId_customerId_fkey" FOREIGN KEY ("entitlementId", "customerId") REFERENCES "Entitlement"("id", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PurchasedPlaybackDescriptor" ADD CONSTRAINT "PurchasedPlaybackDescriptor_deviceId_customerId_fkey" FOREIGN KEY ("deviceId", "customerId") REFERENCES "CustomerDevice"("id", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_orderId_customerId_fkey" FOREIGN KEY ("orderId", "customerId") REFERENCES "Order"("id", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AdminIdempotencyRecord" ADD CONSTRAINT "AdminIdempotencyRecord_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminSessionId_adminUserId_fkey" FOREIGN KEY ("adminSessionId", "adminUserId") REFERENCES "AdminSession"("id", "adminUserId") ON DELETE RESTRICT ON UPDATE RESTRICT;
