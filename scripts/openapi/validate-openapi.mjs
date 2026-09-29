import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OPENAPI_PATH = resolve("docs", "api", "openapi.yaml");
export const PRISMA_PATH = resolve("apps", "api", "prisma", "schema.prisma");

export const ADMIN_SECURITY_CONTRACTS = Object.freeze([
  {
    path: "/api/v1/admin/auth/login",
    method: "post",
    operationId: "loginAdmin",
    slice: "S1.2-03C1",
    authClass: "PUBLIC",
    roles: [],
    stepUp: false,
    idempotent: false,
    request: "AdminLoginRequest",
    success: ["200", "application/json", "AdminPreAuthEnvelope"],
    headers: ["Set-Cookie", "Cache-Control", "X-Content-Type-Options"],
  },
  {
    path: "/api/v1/admin/auth/totp/enrollments",
    method: "post",
    operationId: "createAdminTotpEnrollment",
    slice: "S1.2-03C1",
    authClass: "PREAUTH",
    roles: [],
    stepUp: false,
    idempotent: true,
    request: null,
    success: ["201", "application/json", "AdminTotpEnrollmentEnvelope"],
    headers: ["Cache-Control", "X-Content-Type-Options"],
  },
  {
    path: "/api/v1/admin/auth/totp/enrollments/{enrollmentId}/qr",
    method: "post",
    operationId: "deliverAdminTotpEnrollmentQr",
    slice: "S1.2-03C1",
    authClass: "PREAUTH",
    roles: [],
    stepUp: false,
    idempotent: true,
    request: null,
    success: ["200", "image/png", "binary"],
    headers: ["Cache-Control", "X-Content-Type-Options"],
  },
  {
    path: "/api/v1/admin/auth/totp/enrollments/{enrollmentId}/confirm",
    method: "post",
    operationId: "confirmAdminTotpEnrollment",
    slice: "S1.2-03C1",
    authClass: "PREAUTH",
    roles: [],
    stepUp: false,
    idempotent: true,
    request: "AdminTotpVerificationRequest",
    success: ["200", "application/json", "AdminEnrollmentConfirmationEnvelope"],
    headers: ["Set-Cookie", "Cache-Control", "X-Content-Type-Options"],
  },
  {
    path: "/api/v1/admin/auth/totp/verify",
    method: "post",
    operationId: "verifyAdminTotp",
    slice: "S1.2-03C1",
    authClass: "PREAUTH",
    roles: [],
    stepUp: false,
    idempotent: false,
    request: "AdminTotpVerificationRequest",
    success: ["200", "application/json", "AdminSessionEnvelope"],
    headers: ["Set-Cookie", "Cache-Control", "X-Content-Type-Options"],
  },
  {
    path: "/api/v1/admin/auth/recovery-codes/verify",
    method: "post",
    operationId: "verifyAdminRecoveryCode",
    slice: "S1.2-03C1",
    authClass: "PREAUTH",
    roles: [],
    stepUp: false,
    idempotent: false,
    request: "AdminRecoveryCodeVerificationRequest",
    success: ["200", "application/json", "AdminRecoveryContextEnvelope"],
    headers: ["Set-Cookie", "Cache-Control", "X-Content-Type-Options"],
  },
  {
    path: "/api/v1/admin/auth/recovery-codes/rotate",
    method: "post",
    operationId: "rotateAdminRecoveryCodes",
    slice: "S1.2-03C1",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN", "CONTENT_EDITOR", "FINANCE_MANAGER", "SUPPORT"],
    stepUp: true,
    idempotent: true,
    request: "AdminTotpVerificationRequest",
    success: ["200", "application/json", "AdminRecoveryCodesEnvelope"],
    headers: ["Cache-Control", "X-Content-Type-Options"],
  },
  {
    path: "/api/v1/admin/auth/step-up",
    method: "post",
    operationId: "stepUpAdminSession",
    slice: "S1.2-03C1",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN", "CONTENT_EDITOR", "FINANCE_MANAGER", "SUPPORT"],
    stepUp: false,
    idempotent: false,
    request: "AdminStepUpRequest",
    success: ["200", "application/json", "AdminStepUpEnvelope"],
    headers: ["Cache-Control", "X-Content-Type-Options"],
  },
  {
    path: "/api/v1/admin/auth/sessions/refresh",
    method: "post",
    operationId: "refreshAdminSession",
    slice: "S1.2-03C1",
    authClass: "REFRESH",
    roles: [],
    stepUp: false,
    idempotent: false,
    request: null,
    success: ["200", "application/json", "AdminSessionEnvelope"],
    headers: ["Set-Cookie", "Cache-Control", "X-Content-Type-Options"],
  },
  {
    path: "/api/v1/admin/auth/sessions/current",
    method: "delete",
    operationId: "revokeCurrentAdminSession",
    slice: "S1.2-03C1",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN", "CONTENT_EDITOR", "FINANCE_MANAGER", "SUPPORT"],
    stepUp: false,
    idempotent: false,
    request: null,
    success: ["204", null, null],
    headers: [],
  },
  {
    path: "/api/v1/admin/auth/sessions",
    method: "get",
    operationId: "listAdminSessions",
    slice: "S1.2-03C1",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN", "CONTENT_EDITOR", "FINANCE_MANAGER", "SUPPORT"],
    stepUp: false,
    idempotent: false,
    request: null,
    success: ["200", "application/json", "AdminSessionPage"],
    headers: [],
  },
  {
    path: "/api/v1/admin/auth/sessions/{sessionId}/revocations",
    method: "post",
    operationId: "revokeAdminSession",
    slice: "S1.2-03C1",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN"],
    stepUp: true,
    idempotent: false,
    request: "AdminReasonRequest",
    success: ["204", null, null],
    headers: [],
    reasonRequired: true,
  },
  {
    path: "/api/v1/admin/auth/password/reset-requests",
    method: "post",
    operationId: "requestAdminPasswordReset",
    slice: "S1.2-03C2",
    authClass: "PUBLIC",
    roles: [],
    stepUp: false,
    idempotent: false,
    request: "AdminPasswordResetRequest",
    success: ["202", "application/json", "AdminAcceptedEnvelope"],
    headers: [],
  },
  {
    path: "/api/v1/admin/auth/password/reset",
    method: "post",
    operationId: "resetAdminPassword",
    slice: "S1.2-03C2",
    authClass: "PUBLIC",
    roles: [],
    stepUp: false,
    idempotent: false,
    request: "AdminPasswordResetCompletionRequest",
    success: ["204", null, null],
    headers: [],
  },
  {
    path: "/api/v1/admin/recovery-cases",
    method: "post",
    operationId: "createAdminRecoveryCase",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN", "SUPPORT"],
    stepUp: false,
    idempotent: true,
    request: "AdminRecoveryCaseCreateRequest",
    success: ["201", "application/json", "AdminRecoveryCaseEnvelope"],
    headers: ["Location"],
    reasonRequired: true,
  },
  {
    path: "/api/v1/admin/recovery-cases",
    method: "get",
    operationId: "listAdminRecoveryCases",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN", "SUPPORT"],
    stepUp: false,
    idempotent: false,
    request: null,
    success: ["200", "application/json", "AdminRecoveryCasePage"],
    headers: [],
  },
  {
    path: "/api/v1/admin/recovery-cases/{caseId}",
    method: "get",
    operationId: "getAdminRecoveryCase",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN", "SUPPORT"],
    stepUp: false,
    idempotent: false,
    request: null,
    success: ["200", "application/json", "AdminRecoveryCaseEnvelope"],
    headers: [],
  },
  {
    path: "/api/v1/admin/recovery-cases/{caseId}/approve",
    method: "post",
    operationId: "approveAdminRecoveryCase",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN"],
    stepUp: true,
    idempotent: true,
    request: "AdminReasonRequest",
    success: ["204", null, null],
    headers: [],
    reasonRequired: true,
  },
  {
    path: "/api/v1/admin/audit-logs",
    method: "get",
    operationId: "listAdminAuditLogs",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN"],
    stepUp: false,
    idempotent: false,
    request: null,
    success: ["200", "application/json", "AdminAuditLogPage"],
    headers: [],
  },
  {
    path: "/api/v1/admin/audit-log-exports",
    method: "post",
    operationId: "createAdminAuditLogExport",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN"],
    stepUp: true,
    idempotent: true,
    request: "AdminAuditExportRequest",
    success: ["202", "application/json", "AdminAuditExportEnvelope"],
    headers: ["Location"],
    reasonRequired: true,
  },
  {
    path: "/api/v1/admin/audit-log-exports/{exportId}",
    method: "get",
    operationId: "getAdminAuditLogExport",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN"],
    stepUp: false,
    idempotent: false,
    request: null,
    success: ["200", "application/json", "AdminAuditExportEnvelope"],
    headers: [],
  },
  {
    path: "/api/v1/admin/audit-log-exports/{exportId}/content",
    method: "get",
    operationId: "downloadAdminAuditLogExport",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN"],
    stepUp: true,
    idempotent: false,
    request: null,
    success: ["200", "application/zip", "binary"],
    headers: ["Cache-Control", "Content-Disposition", "X-Content-Type-Options"],
  },
  {
    path: "/api/v1/admin/invitations",
    method: "post",
    operationId: "createAdminInvitation",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN"],
    stepUp: true,
    idempotent: true,
    request: "AdminInvitationCreateRequest",
    success: ["201", "application/json", "AdminInvitationEnvelope"],
    headers: ["Location"],
    reasonRequired: true,
  },
  {
    path: "/api/v1/admin/auth/invitations/accept",
    method: "post",
    operationId: "acceptAdminInvitation",
    slice: "S1.2-03C2",
    authClass: "PUBLIC",
    roles: [],
    stepUp: false,
    idempotent: false,
    request: "AdminInvitationAcceptRequest",
    success: ["200", "application/json", "AdminPreAuthEnvelope"],
    headers: ["Set-Cookie", "Cache-Control", "X-Content-Type-Options"],
  },
  {
    path: "/api/v1/admin/users",
    method: "get",
    operationId: "listAdminUsers",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN"],
    stepUp: false,
    idempotent: false,
    request: null,
    success: ["200", "application/json", "AdminUserPage"],
    headers: [],
  },
  {
    path: "/api/v1/admin/users/{adminUserId}/role-changes",
    method: "post",
    operationId: "changeAdminUserRole",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN"],
    stepUp: true,
    idempotent: true,
    request: "AdminRoleChangeRequest",
    success: ["204", null, null],
    headers: [],
    reasonRequired: true,
  },
  {
    path: "/api/v1/admin/users/{adminUserId}/status-changes",
    method: "post",
    operationId: "changeAdminUserStatus",
    slice: "S1.2-03C2",
    authClass: "ADMIN_SESSION",
    roles: ["SUPER_ADMIN"],
    stepUp: true,
    idempotent: true,
    request: "AdminStatusChangeRequest",
    success: ["204", null, null],
    headers: [],
    reasonRequired: true,
  },
]);

export const EXPECTED_PATHS = [
  "/health/live",
  "/health/ready",
  "/api/v1/catalog/audio",
  "/api/v1/catalog/audio/{contentId}",
  "/api/v1/catalog/audio/{contentId}/cover",
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/otp/challenges/{challengeId}/verify",
  "/api/v1/auth/step-up/challenges",
  "/api/v1/auth/step-up/challenges/{challengeId}/verify",
  "/api/v1/auth/sessions/refresh",
  "/api/v1/auth/sessions/current",
  "/api/v1/auth/devices",
  "/api/v1/orders",
  "/api/v1/orders/{orderId}",
  "/api/v1/orders/{orderId}/payment-attempts",
  "/api/v1/orders/{orderId}/payment-attempts/{paymentAttemptId}",
  "/api/v1/orders/{orderId}/receipt",
  "/api/v1/payment-providers",
  "/api/v1/payment-webhooks/{provider}",
  "/api/v1/media-webhooks/mux",
  "/api/v1/library/audio",
  "/api/v1/mobile/audio/{contentId}/preview-grants",
  "/api/v1/mobile/preview-grants/{previewGrantId}/playback-descriptors",
  "/api/v1/mobile/audio/{contentId}/playback-descriptors",
  "/api/v1/admin/artists",
  "/api/v1/admin/artists/{artistId}",
  "/api/v1/admin/audio-content",
  "/api/v1/admin/audio-content/{contentId}",
  "/api/v1/admin/audio-content/{contentId}/publish",
  "/api/v1/admin/audio-content/{contentId}/archive",
  "/api/v1/admin/media-assets",
  "/api/v1/admin/media-assets/{mediaAssetId}",
  "/api/v1/admin/media-assets/{mediaAssetId}/prepare",
  ...new Set(ADMIN_SECURITY_CONTRACTS.map(({ path }) => path)),
];

const EXPECTED_SCHEMAS = [
  "Identifier",
  "Timestamp",
  "MoneyCfa",
  "BasisPoints",
  "ArtistEarningAllocationPolicyVersion",
  "ArtistEarningAllocationAudit",
  "SettlementArtistAllocationAudit",
  "CursorMeta",
  "ResponseMeta",
  "LivenessResponse",
  "DependencyHealth",
  "ReadinessResponse",
  "ErrorCode",
  "ErrorDetails",
  "ErrorResponse",
  "PublishConflictError",
  "AudioEditorialState",
  "MediaProcessingStatus",
  "AudioCatalogItem",
  "AudioContentDetail",
  "ArtistSummary",
  "PublicCoverImage",
  "AudioCatalogPage",
  "AudioContentEnvelope",
  "E164Phone",
  "CustomerPassword",
  "CustomerDeviceRegistration",
  "RegisterCustomerRequest",
  "LoginCustomerRequest",
  "OtpChallenge",
  "OtpChallengeEnvelope",
  "OtpVerificationRequest",
  "StepUpChallengeRequest",
  "StepUpVerificationRequest",
  "StepUpVerification",
  "StepUpVerificationEnvelope",
  "RefreshSessionRequest",
  "Session",
  "SessionEnvelope",
  "DeviceSummary",
  "DeviceListEnvelope",
  "OrderState",
  "CreateOrderRequest",
  "OrderLine",
  "OrderStateEvent",
  "Order",
  "OrderEnvelope",
  "OrderPage",
  "PaymentProvider",
  "PaymentAttemptState",
  "CreatePaymentAttemptRequest",
  "PaymentAttemptEvent",
  "PaymentAttempt",
  "PaymentAttemptEnvelope",
  "PaymentAttemptPage",
  "OperationalPaymentProvider",
  "OperationalProviderListEnvelope",
  "PaymentWebhookRequest",
  "WebhookAccepted",
  "WebhookAcceptedEnvelope",
  "MuxMediaWebhookRequest",
  "Receipt",
  "ReceiptEnvelope",
  "LibraryAudioItem",
  "LibraryPage",
  "PreviewGrant",
  "PreviewGrantEnvelope",
  "PurchasedPlaybackRequest",
  "PlaybackDescriptor",
  "PlaybackDescriptorEnvelope",
  "UpsertArtistRequest",
  "AdminArtist",
  "AdminArtistEnvelope",
  "AdminArtistPage",
  "UpsertAudioContentRequest",
  "PublishAudioContentRequest",
  "RequiredReadyMediaAsset",
  "ArchiveAudioContentRequest",
  "AdminAudioContent",
  "AdminAudioEnvelope",
  "AdminAudioPage",
  "CreateMediaAssetRequest",
  "PrepareMediaAssetRequest",
  "MediaAssetStatus",
  "MediaAssetEnvelope",
  "MediaPreparation",
  "MediaPreparationEnvelope",
  "AdminRole",
  "AdminStatus",
  "AdminPassword",
  "AdminLoginRequest",
  "AdminPreAuth",
  "AdminPreAuthEnvelope",
  "AdminTotpEnrollment",
  "AdminTotpEnrollmentEnvelope",
  "AdminTotpVerificationRequest",
  "AdminAccessSession",
  "AdminSessionEnvelope",
  "AdminRecoveryCode",
  "AdminRecoveryCodes",
  "AdminRecoveryCodesEnvelope",
  "AdminEnrollmentConfirmation",
  "AdminEnrollmentConfirmationEnvelope",
  "AdminRecoveryCodeVerificationRequest",
  "AdminRecoveryContext",
  "AdminRecoveryContextEnvelope",
  "AdminStepUpRequest",
  "AdminStepUp",
  "AdminStepUpEnvelope",
  "AdminSessionSummary",
  "AdminSessionPage",
  "AdminReasonCode",
  "AdminReasonRequest",
  "AdminPasswordResetRequest",
  "AdminPasswordResetCompletionRequest",
  "AdminAccepted",
  "AdminAcceptedEnvelope",
  "AdminRecoveryCaseCreateRequest",
  "AdminRecoveryCaseState",
  "AdminRecoveryCase",
  "AdminRecoveryCaseEnvelope",
  "AdminRecoveryCasePage",
  "AdminAuditContext",
  "AdminAuditLogEntry",
  "AdminAuditLogPage",
  "AdminAuditExportRequest",
  "AdminAuditExportState",
  "AdminAuditExport",
  "AdminAuditExportEnvelope",
  "AdminInvitationCreateRequest",
  "AdminInvitationAcceptRequest",
  "AdminInvitation",
  "AdminInvitationEnvelope",
  "AdminUser",
  "AdminUserPage",
  "AdminRoleChangeRequest",
  "AdminStatusChangeRequest",
];

const EXPECTED_OPERATIONS = new Map([
  ["GET /health/live", "healthLiveness"],
  ["GET /health/ready", "healthReadiness"],
  ["GET /api/v1/catalog/audio", "listPublicAudioCatalog"],
  ["GET /api/v1/catalog/audio/{contentId}", "getPublicAudioContent"],
  ["GET /api/v1/catalog/audio/{contentId}/cover", "getPublicAudioCover"],
  ["POST /api/v1/auth/register", "registerCustomer"],
  ["POST /api/v1/auth/login", "loginCustomer"],
  [
    "POST /api/v1/auth/otp/challenges/{challengeId}/verify",
    "verifyCustomerOtp",
  ],
  ["POST /api/v1/auth/step-up/challenges", "createCustomerStepUpChallenge"],
  [
    "POST /api/v1/auth/step-up/challenges/{challengeId}/verify",
    "verifyCustomerStepUp",
  ],
  ["POST /api/v1/auth/sessions/refresh", "refreshCustomerSession"],
  ["DELETE /api/v1/auth/sessions/current", "revokeCurrentCustomerSession"],
  ["GET /api/v1/auth/devices", "listCustomerDevices"],
  ["GET /api/v1/orders", "listCustomerOrders"],
  ["POST /api/v1/orders", "createCustomerOrder"],
  ["GET /api/v1/orders/{orderId}", "getCustomerOrder"],
  ["GET /api/v1/orders/{orderId}/payment-attempts", "listPaymentAttempts"],
  ["POST /api/v1/orders/{orderId}/payment-attempts", "createPaymentAttempt"],
  [
    "GET /api/v1/orders/{orderId}/payment-attempts/{paymentAttemptId}",
    "getPaymentAttempt",
  ],
  ["GET /api/v1/orders/{orderId}/receipt", "getOrderReceipt"],
  ["GET /api/v1/payment-providers", "listOperationalPaymentProviders"],
  ["POST /api/v1/payment-webhooks/{provider}", "acceptPaymentWebhook"],
  ["POST /api/v1/media-webhooks/mux", "acceptMuxMediaWebhook"],
  ["GET /api/v1/library/audio", "listEntitledAudioLibrary"],
  [
    "POST /api/v1/mobile/audio/{contentId}/preview-grants",
    "createAnonymousPreviewGrant",
  ],
  [
    "POST /api/v1/mobile/preview-grants/{previewGrantId}/playback-descriptors",
    "exchangePreviewGrantForPlaybackDescriptor",
  ],
  [
    "POST /api/v1/mobile/audio/{contentId}/playback-descriptors",
    "createPurchasedPlaybackDescriptor",
  ],
  ["GET /api/v1/admin/artists", "listAdminArtists"],
  ["POST /api/v1/admin/artists", "createAdminArtist"],
  ["GET /api/v1/admin/artists/{artistId}", "getAdminArtist"],
  ["PATCH /api/v1/admin/artists/{artistId}", "updateAdminArtist"],
  ["GET /api/v1/admin/audio-content", "listAdminAudioContent"],
  ["POST /api/v1/admin/audio-content", "createAdminAudioContent"],
  ["GET /api/v1/admin/audio-content/{contentId}", "getAdminAudioContent"],
  ["PATCH /api/v1/admin/audio-content/{contentId}", "updateAdminAudioContent"],
  [
    "POST /api/v1/admin/audio-content/{contentId}/publish",
    "publishAdminAudioContent",
  ],
  [
    "POST /api/v1/admin/audio-content/{contentId}/archive",
    "archiveAdminAudioContent",
  ],
  ["POST /api/v1/admin/media-assets", "createPrivateMediaAsset"],
  [
    "GET /api/v1/admin/media-assets/{mediaAssetId}",
    "getPrivateMediaAssetStatus",
  ],
  [
    "POST /api/v1/admin/media-assets/{mediaAssetId}/prepare",
    "preparePrivateMediaAssetUpload",
  ],
  ...ADMIN_SECURITY_CONTRACTS.map(({ path, method, operationId }) => [
    `${method.toUpperCase()} ${path}`,
    operationId,
  ]),
]);

const EXPECTED_SUCCESS_RESPONSES = new Map([
  [
    "healthLiveness",
    ["200", "application/json", "#/components/schemas/LivenessResponse"],
  ],
  [
    "healthReadiness",
    ["200", "application/json", "#/components/schemas/ReadinessResponse"],
  ],
  [
    "listPublicAudioCatalog",
    ["200", "application/json", "#/components/schemas/AudioCatalogPage"],
  ],
  [
    "getPublicAudioContent",
    ["200", "application/json", "#/components/schemas/AudioContentEnvelope"],
  ],
  ["getPublicAudioCover", ["200", "image/*", "binary"]],
  [
    "registerCustomer",
    ["202", "application/json", "#/components/schemas/OtpChallengeEnvelope"],
  ],
  [
    "loginCustomer",
    ["202", "application/json", "#/components/schemas/OtpChallengeEnvelope"],
  ],
  [
    "verifyCustomerOtp",
    ["200", "application/json", "#/components/schemas/SessionEnvelope"],
  ],
  [
    "createCustomerStepUpChallenge",
    ["202", "application/json", "#/components/schemas/OtpChallengeEnvelope"],
  ],
  [
    "verifyCustomerStepUp",
    [
      "200",
      "application/json",
      "#/components/schemas/StepUpVerificationEnvelope",
    ],
  ],
  [
    "refreshCustomerSession",
    ["200", "application/json", "#/components/schemas/SessionEnvelope"],
  ],
  ["revokeCurrentCustomerSession", ["204", null, null]],
  [
    "listCustomerDevices",
    ["200", "application/json", "#/components/schemas/DeviceListEnvelope"],
  ],
  [
    "listCustomerOrders",
    ["200", "application/json", "#/components/schemas/OrderPage"],
  ],
  [
    "createCustomerOrder",
    ["201", "application/json", "#/components/schemas/OrderEnvelope"],
  ],
  [
    "getCustomerOrder",
    ["200", "application/json", "#/components/schemas/OrderEnvelope"],
  ],
  [
    "listPaymentAttempts",
    ["200", "application/json", "#/components/schemas/PaymentAttemptPage"],
  ],
  [
    "createPaymentAttempt",
    ["201", "application/json", "#/components/schemas/PaymentAttemptEnvelope"],
  ],
  [
    "getPaymentAttempt",
    ["200", "application/json", "#/components/schemas/PaymentAttemptEnvelope"],
  ],
  [
    "getOrderReceipt",
    ["200", "application/json", "#/components/schemas/ReceiptEnvelope"],
  ],
  [
    "listOperationalPaymentProviders",
    [
      "200",
      "application/json",
      "#/components/schemas/OperationalProviderListEnvelope",
    ],
  ],
  [
    "acceptPaymentWebhook",
    ["202", "application/json", "#/components/schemas/WebhookAcceptedEnvelope"],
  ],
  [
    "acceptMuxMediaWebhook",
    ["202", "application/json", "#/components/schemas/WebhookAcceptedEnvelope"],
  ],
  [
    "listEntitledAudioLibrary",
    ["200", "application/json", "#/components/schemas/LibraryPage"],
  ],
  [
    "createAnonymousPreviewGrant",
    ["201", "application/json", "#/components/schemas/PreviewGrantEnvelope"],
  ],
  [
    "exchangePreviewGrantForPlaybackDescriptor",
    [
      "201",
      "application/json",
      "#/components/schemas/PlaybackDescriptorEnvelope",
    ],
  ],
  [
    "createPurchasedPlaybackDescriptor",
    [
      "201",
      "application/json",
      "#/components/schemas/PlaybackDescriptorEnvelope",
    ],
  ],
  [
    "listAdminArtists",
    ["200", "application/json", "#/components/schemas/AdminArtistPage"],
  ],
  [
    "createAdminArtist",
    ["201", "application/json", "#/components/schemas/AdminArtistEnvelope"],
  ],
  [
    "getAdminArtist",
    ["200", "application/json", "#/components/schemas/AdminArtistEnvelope"],
  ],
  [
    "updateAdminArtist",
    ["200", "application/json", "#/components/schemas/AdminArtistEnvelope"],
  ],
  [
    "listAdminAudioContent",
    ["200", "application/json", "#/components/schemas/AdminAudioPage"],
  ],
  [
    "createAdminAudioContent",
    ["201", "application/json", "#/components/schemas/AdminAudioEnvelope"],
  ],
  [
    "getAdminAudioContent",
    ["200", "application/json", "#/components/schemas/AdminAudioEnvelope"],
  ],
  [
    "updateAdminAudioContent",
    ["200", "application/json", "#/components/schemas/AdminAudioEnvelope"],
  ],
  [
    "publishAdminAudioContent",
    ["200", "application/json", "#/components/schemas/AdminAudioEnvelope"],
  ],
  [
    "archiveAdminAudioContent",
    ["200", "application/json", "#/components/schemas/AdminAudioEnvelope"],
  ],
  [
    "createPrivateMediaAsset",
    ["201", "application/json", "#/components/schemas/MediaAssetEnvelope"],
  ],
  [
    "getPrivateMediaAssetStatus",
    ["200", "application/json", "#/components/schemas/MediaAssetEnvelope"],
  ],
  [
    "preparePrivateMediaAssetUpload",
    [
      "201",
      "application/json",
      "#/components/schemas/MediaPreparationEnvelope",
    ],
  ],
  ...ADMIN_SECURITY_CONTRACTS.map(({ operationId, success }) => [
    operationId,
    [
      success[0],
      success[1],
      success[2] === null || success[2] === "binary"
        ? success[2]
        : `#/components/schemas/${success[2]}`,
    ],
  ]),
]);

const REQUIRED_INVARIANTS = [
  "ORDER_PRECEDES_PAYMENT_ATTEMPT",
  "PAYMENT_ATTEMPT_APPEND_ONLY",
  "ENTITLEMENT_REQUIRES_SETTLEMENT",
  "SETTLED_FINANCE_APPEND_ONLY_COMPENSATION_ONLY",
  "LEDGER_TRANSACTION_BALANCED",
  "PUBLICATION_REQUIRES_READY_MEDIA",
  "WEBHOOK_INBOX_UNIQUE_AND_DURABLE",
  "ARCHIVED_CONTENT_VISIBLE_TO_ENTITLED_HOLDER",
  "PREVIEW_GRANT_NEVER_ENTITLEMENT",
  "MEDIA_IDENTIFIERS_PRIVATE",
  "ARTIST_SETTLEMENT_CARRY_SAME_ARTIST_SINGLE_USE",
  "CUSTOMER_AUTH_PASSWORD_THEN_OTP",
  "CUSTOMER_SESSION_SINGLE_DEVICE",
  "CUSTOMER_STEP_UP_REQUIRES_EXISTING_SESSION",
  "ADMIN_CREATED_CATALOG_ENTITIES_PROVENANCE_RESTRICTED",
  "MEDIA_WEBHOOK_INBOX_AUTHENTICATED_UNIQUE_AND_DURABLE",
  "PUBLIC_COVER_CONTROLLED_REPRESENTATION_ONLY",
  "PUBLIC_SALES_COUNT_SETTLED_NET_FULL_REFUNDS",
];

const REQUIRED_TRANSACTION_PRECONDITIONS = [
  "SETTLEMENT_REQUIRES_LATEST_SUCCEEDED_ATTEMPT_EVENT_FOR_SAME_ORDER",
  "SETTLEMENT_ORDER_ATTEMPT_AMOUNT_AND_XOF_CURRENCY_MATCH",
  "SETTLEMENT_ATOMICALLY_CREATES_LEDGER_EARNING_ENTITLEMENT_AND_OUTBOX",
  "ENTITLEMENT_MATCHES_SETTLEMENT_ORDER_ITEM_CUSTOMER_AND_CONTENT",
  "AT_MOST_ONE_ACTIVE_PUBLICATION_PER_AUDIO_CONTENT",
  "LEDGER_GROUP_TOTAL_DEBITS_EQUAL_TOTAL_CREDITS",
  "CFA_AMOUNTS_NON_NEGATIVE_AND_POSTING_AMOUNTS_STRICTLY_POSITIVE",
  "ARTIST_EARNING_REQUIRES_RECONCILED_SETTLEMENT_AND_MATCHING_ORDER_ITEM_CONTENT_AND_ARTIST",
  "ARTIST_SETTLEMENT_CARRY_REQUIRES_IMMEDIATE_SAME_ARTIST_PREDECESSOR",
  "ARTIST_SETTLEMENT_PREDECESSOR_CARRY_CONSUMED_ONCE_WITH_LOCK",
  "ARTIST_EARNING_ALLOCATION_FOLLOWS_FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1",
  "ARTIST_SETTLEMENT_EXACT_NUMERATOR_IS_CONSERVED",
  "SETTLEMENT_ARTIST_AND_PLATFORM_AMOUNTS_CONSERVE_DISTRIBUTABLE_CFA",
  "AUTH_PASSWORD_VERIFICATION_PRECEDES_OTP_CHALLENGE",
  "AUTH_PUBLIC_OUTCOMES_DO_NOT_REVEAL_ACCOUNT_EXISTENCE",
  "AUTH_OTP_CHALLENGE_BINDS_HASHED_DEVICE_FINGERPRINT_AND_PLATFORM",
  "AUTH_REGISTER_CHALLENGE_BINDS_PENDING_PASSWORD_HASH",
  "AUTH_LOGIN_CHALLENGE_BINDS_PASSWORD_VERIFIED_CUSTOMER",
  "AUTH_STEP_UP_CHALLENGE_BINDS_EXISTING_CUSTOMER_SESSION",
  "AUTH_SESSION_CREATION_ATOMICALLY_REVOKES_PRIOR_ACTIVE_CUSTOMER_SESSIONS",
  "AUTH_STEP_UP_REQUIRES_AND_PRESERVES_EXISTING_CUSTOMER_SESSION",
  "ADMIN_SESSION_REFRESH_ROTATES_HASH_AND_VERSION_OR_REVOKES_FAMILY_ON_REPLAY",
  "ADMIN_RECOVERY_CREATES_EXACTLY_TEN_ARGON2ID_SINGLE_USE_HASHES",
  "ADMIN_CATALOG_CREATION_BINDS_AUTHENTICATED_ADMIN_AND_AUDIT_ATOMICALLY",
  "MEDIA_WEBHOOK_SIGNATURE_VERIFIED_BEFORE_ENCRYPTED_INBOX_INSERT",
  "MEDIA_PROVIDER_UPLOAD_AND_ASSET_REFERENCES_SET_ONCE_AND_RESOLVE_UNIQUELY",
  "MEDIA_WEBHOOK_CALLBACK_NEVER_PUBLISHES",
  "CATALOG_PROVENANCE_COLUMN_IMMUTABLE_AFTER_INSERT",
  "PUBLIC_SALES_COUNT_ZERO_UNTIL_SETTLEMENT_AND_FULL_REFUND_DATA_EXIST",
];

const REQUIRED_AUTHENTICATION_POLICY = {
  primaryFlow: "PHONE_PASSWORD_THEN_OTP",
  registrationOperation: "registerCustomer",
  loginOperation: "loginCustomer",
  otpVerificationOperation: "verifyCustomerOtp",
  stepUpFlow: "EXISTING_CUSTOMER_SESSION_THEN_OTP",
  accessTokenLifetimeMinutes: 15,
  refreshTokenLifetimeDays: 30,
  refreshTokenUse: "SINGLE_USE_ROTATING",
  refreshReplayResponse: "REVOKE_SESSION_FAMILY",
  successfulLoginSessionPolicy:
    "ATOMICALLY_REVOKE_ALL_PRIOR_ACTIVE_CUSTOMER_SESSIONS",
};

const REQUIRED_ADMIN_AUTH_DATA_POLICY = {
  totpStandard: "RFC6238",
  totpAlgorithm: "HMAC-SHA-256",
  totpDigits: 6,
  totpPeriodSeconds: 30,
  totpAcceptedPastSteps: 1,
  totpAcceptedFutureSteps: 1,
  totpReplayWithinAcceptedWindow: "REJECT",
  totpSecretEntropyBits: 256,
  totpSecretAtRest: "ENCRYPTED",
  totpSecretEncryption: "AES-256-GCM_ENVELOPE_ENCRYPTION_EXTERNAL_KEY_MANAGER",
  totpSecretEncryptionAad: "ADMIN_USER_ID_AND_TOTP_PURPOSE",
  totpSecretKeyRotation:
    "VERSIONED_KEY_DECRYPT_OLD_REENCRYPT_ON_USE_INTERNAL_KID_ONLY",
  totpRequiredEveryLogin: true,
  totpEnrollmentRequiredBeforeProtectedAccess: true,
  recoveryCodeCount: 10,
  recoveryCodeStorage: "ARGON2ID_HASH_SINGLE_USE",
  recoveryAndResetAudited: true,
  accessTokenLifetimeMinutes: 15,
  accessTokenAlgorithm: "RS256",
  accessTokenPublicHeaderFields: ["alg", "kid", "typ"],
  refreshTokenUse: "SINGLE_USE_ROTATING",
  refreshReplayResponse: "REVOKE_SESSION_FAMILY",
  refreshTokenEntropyBits: 256,
  refreshCookieHttpOnly: true,
  refreshCookieSecure: true,
  refreshCookieSameSite: "Strict",
  refreshCookieHostOnly: true,
  localStorageForbidden: true,
  preAuthenticationLifetimeMinutes: 10,
  totpEnrollmentLifetimeMinutes: 10,
  mfaRecoveryContextLifetimeMinutes: 10,
  passwordResetLifetimeMinutes: 15,
  invitationLifetimeHours: 24,
  inactivityWindowHours: 8,
  absoluteWindowHours: 12,
  sensitiveActionTotpFreshnessMinutes: 5,
  maximumActiveSessionFamilies: 3,
  recoveryCodeSelector: "PUBLIC_RANDOM_SELECTOR",
  recoveryCodeVerifierEntropyBits: 128,
  recoveryCodeAlphabet: "NON_AMBIGUOUS",
  recoveryCodeArgon2id: { memoryKiB: 65536, iterations: 3, parallelism: 1 },
  adminPasswordStorage: "ARGON2ID_64MIB_T3_P1_UNIQUE_SALT_VERSIONED",
  adminPasswordNormalization: "EXACT_UTF8_NO_UNICODE_NORMALIZATION",
  adminPasswordCompromiseCheck: "REQUIRED_BEFORE_ACCEPTANCE",
  totpEncryptionKeyIdPubliclyExposed: false,
};

const REQUIRED_ADMIN_AUDIT_EXPORT_MANIFEST = {
  manifestPath: "manifest.json",
  signaturePath: "manifest.sig",
  canonicalization: "RFC8785_JCS_UTF8",
  digestAlgorithm: "SHA-256",
  signatureFormat: "JWS_COMPACT_DETACHED",
  signatureAlgorithm: "EdDSA",
  signatureCurve: "Ed25519",
  protectedHeader: "alg_EdDSA_kid_SIGNATURE_KEY_ID",
  signatureInput: "RFC8785_CANONICAL_UTF8_BYTES_OF_MANIFEST_JSON",
  payloadEntrySet:
    "EXACTLY_ALL_ZIP_ENTRIES_EXCEPT_MANIFEST_JSON_AND_MANIFEST_SIG",
  payloadPathPolicy:
    "RELATIVE_FORWARD_SLASH_NFC_NO_DOT_SEGMENTS_NO_DOT_DOT_NO_ABSOLUTE_NO_BACKSLASH_UNIQUE_CASE_SENSITIVE",
  coverage:
    "CANONICAL_MANIFEST_BINDS_EXPORT_ID_CREATED_AT_EXPIRES_AT_AND_SORTED_UNIQUE_PAYLOAD_PATH_SIZE_SHA256",
  rejectUnlistedEntries: true,
  rejectMissingEntries: true,
  rejectDuplicateEntries: true,
  verificationKeyDistribution:
    "ADMIN_DEPLOYMENT_TRUST_BUNDLE_BY_SIGNATURE_KEY_ID",
  keyRotation:
    "OVERLAPPING_VERIFY_OLD_KEYS_UNTIL_ALL_REFERENCED_EXPORTS_EXPIRE",
};

const REQUIRED_ADMIN_SECURITY_POLICY = {
  authorization: "DENY_BY_DEFAULT_SERVER_SIDE_ROLE_AND_AUTHORIZATION_VERSION",
  bootstrap:
    "ADMIN_BOOTSTRAP_CLI_ONE_SHOT_AUDITED_OUTSIDE_OPENAPI_DEFERRED_TO_C2_C1_TEST_FIXTURES_ONLY",
  csrfHeaderName: "X-Kora-CSRF",
  loginBrowserPolicy: "EXACT_ORIGIN_AND_FETCH_METADATA_REJECT_CROSS_SITE",
  loginFailurePolicy: "UNIFORM_401_AUTH_INVALID_CREDENTIALS_COMPARABLE_TIMING",
  auditContexts: ["ADMIN_SESSION", "ADMIN_RECOVERY", "SYSTEM"],
  auditEventClasses: ["LOGIN", "SESSION", "EXPORT", "BUSINESS"],
  auditContextCardinality: "EXACTLY_ONE",
  auditActorSubjectSeparation: true,
  preAuthenticationSink:
    "AdminSecurityEvent_FOR_SUCCESS_AND_FAILURE_WITHOUT_PROVEN_AUDIT_CONTEXT",
  authenticatedOrProvenMutationSink: "AuditLog_IN_SAME_TRANSACTION",
  failureAuditRouting:
    "EACH_OPERATION_ROUTES_UNPROVEN_CONTEXT_TO_ADMIN_SECURITY_EVENT_AND_PROVEN_CONTEXT_BY_EXACT_FAILURE_SINK_MAP",
  failureAuditWrite:
    "DURABLE_BEFORE_ERROR_RESPONSE_AND_ATOMIC_WITH_ANY_SECURITY_STATE_CHANGE",
  adminSecurityEventContract:
    "NO_ACTOR_IMPERSONATION_REQUEST_ID_EVENT_CLASS_OUTCOME_REASON_CODE_REDACTED_SUBJECT_DIGEST_NO_SECRET",
  auditRetention:
    "APPEND_ONLY_NO_DELETION_UNTIL_PRODUCT_LEGAL_RETENTION_DECISION",
  auditEvidence:
    "ENTITY_MASKED_BEFORE_AFTER_REQUEST_CORRELATION_CAUSATION_AND_OPTIONAL_DELEGATION",
  systemAuditCausality:
    "AUTONOMOUS_HAS_NULL_CAUSATION_AND_DELEGATOR_DELEGATED_REQUIRES_BOTH",
  operatorReason: { field: "operatorReason", errorReason: "REQUIRED" },
  passwordReset:
    "OPAQUE_CSPRNG_128_BIT_MANUAL_ENTRY_NO_URL_NO_ORACLE_REVOKE_SESSIONS_PRESERVE_TOTP_AND_RECOVERY_CODES",
  recoveryCodeVerification:
    "CONSUME_CODE_CREATE_BOUNDED_MFA_RECOVERY_CONTEXT_REVOKE_OLD_SESSIONS_NO_SESSION",
  assistedRecovery:
    "CREATOR_APPROVER_SUBJECT_DISTINCT_APPROVER_SUPER_ADMIN_STEP_UP_24H_ONE_SHOT_CANCELLABLE_ATOMIC_RESET_TO_PENDING_MFA",
  assistedRecoveryCancellation:
    "SERVER_ATOMIC_PENDING_TO_CANCELLED_WITH_AUDIT_LOG_WHEN_SUPERSEDED_OR_CREATOR_OR_SUBJECT_BECOMES_INELIGIBLE_NO_STANDALONE_ENDPOINT_IN_EXACT_27",
  refreshRotation:
    "ONE_SHOT_REPLAY_OR_RACE_LOSER_REVOKES_FAMILY_PUBLIC_AUTH_REFRESH_INVALID",
  bearerValidation:
    "ACTIVE_SESSION_ACTIVE_ACCOUNT_NOT_REVOKED_AUTHORIZATION_VERSION_CURRENT_ROLE_RELOADED",
  totpQrDelivery:
    "UNIQUE_NO_STORE_NOSNIFF_NON_LOGGABLE_NON_AUDIT_PAYLOAD_RETRY_409",
  invitations:
    "OPAQUE_SINGLE_USE_24H_EXPIRY_NO_ACCOUNT_ORACLE_PENDING_MFA_NO_SESSION_BEFORE_TOTP",
  publicSecretFailureTiming:
    "LOGIN_RESET_REQUEST_RESET_COMPLETION_AND_INVITATION_UNKNOWN_EXPIRED_CONSUMED_REVOKED_OR_ACCOUNT_STATE_USE_COMPARABLE_TIMING",
  auditExport:
    "ASYNC_STATE_MACHINE_PII_REDACTED_ZIP_WITH_SIGNED_MANIFEST_AUTHENTICATED_BINARY_CONTENT_NO_SIGNED_URL",
  auditExportManifest: REQUIRED_ADMIN_AUDIT_EXPORT_MANIFEST,
  rateLimitProfiles: {
    PASSWORD: {
      limit: 5,
      windowSeconds: 900,
      partition: "IP_AND_NORMALIZED_IDENTIFIER_DIGEST",
      backoff: "EXPONENTIAL",
      retryAfter: true,
    },
    TOTP: {
      limit: 5,
      windowSeconds: 300,
      partition: "IP_AND_PREAUTH_OR_SESSION_ID",
      backoff: "EXPONENTIAL",
      retryAfter: true,
    },
    REFRESH: {
      limit: 10,
      windowSeconds: 60,
      partition: "IP_AND_REFRESH_SELECTOR_DIGEST",
      backoff: "FIXED_WINDOW",
      retryAfter: true,
    },
    RECOVERY: {
      limit: 5,
      windowSeconds: 3600,
      partition: "IP_AND_RECOVERY_SELECTOR_OR_FLOW_ID",
      backoff: "EXPONENTIAL",
      retryAfter: true,
    },
  },
  deliverySlices: ["S1.2-03C1", "S1.2-03C2"],
};

const REQUIRED_ADMIN_AUDIT_SINKS = new Map([
  ["loginAdmin", "ADMIN_SECURITY_EVENT"],
  ["createAdminTotpEnrollment", "ADMIN_SECURITY_EVENT"],
  ["deliverAdminTotpEnrollmentQr", "ADMIN_SECURITY_EVENT"],
  ["confirmAdminTotpEnrollment", "AUDIT_LOG"],
  ["verifyAdminTotp", "AUDIT_LOG"],
  ["verifyAdminRecoveryCode", "AUDIT_LOG"],
  ["rotateAdminRecoveryCodes", "AUDIT_LOG"],
  ["stepUpAdminSession", "AUDIT_LOG"],
  ["refreshAdminSession", "AUDIT_LOG"],
  ["revokeCurrentAdminSession", "AUDIT_LOG"],
  ["listAdminSessions", "NONE"],
  ["revokeAdminSession", "AUDIT_LOG"],
  ["requestAdminPasswordReset", "ADMIN_SECURITY_EVENT"],
  ["resetAdminPassword", "AUDIT_LOG"],
  ["createAdminRecoveryCase", "AUDIT_LOG"],
  ["listAdminRecoveryCases", "NONE"],
  ["getAdminRecoveryCase", "NONE"],
  ["approveAdminRecoveryCase", "AUDIT_LOG"],
  ["listAdminAuditLogs", "AUDIT_LOG"],
  ["createAdminAuditLogExport", "AUDIT_LOG"],
  ["getAdminAuditLogExport", "AUDIT_LOG"],
  ["downloadAdminAuditLogExport", "AUDIT_LOG"],
  ["createAdminInvitation", "AUDIT_LOG"],
  ["acceptAdminInvitation", "ADMIN_SECURITY_EVENT"],
  ["listAdminUsers", "NONE"],
  ["changeAdminUserRole", "AUDIT_LOG"],
  ["changeAdminUserStatus", "AUDIT_LOG"],
]);

const REQUIRED_ADMIN_FAILURE_AUDIT_SINKS = new Map(
  [...REQUIRED_ADMIN_AUDIT_SINKS].map(([operationId, sink]) => [
    operationId,
    sink === "ADMIN_SECURITY_EVENT"
      ? "ADMIN_SECURITY_EVENT"
      : sink === "AUDIT_LOG"
        ? "AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT"
        : "NONE_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT",
  ]),
);

const REQUIRED_ADMIN_PUBLIC_FAILURE_TIMING = new Map([
  ["loginAdmin", "ACCOUNT_UNKNOWN_BAD_PASSWORD_DISABLED_OR_LOCKED_COMPARABLE"],
  ["requestAdminPasswordReset", "ACCOUNT_UNKNOWN_OR_KNOWN_COMPARABLE"],
  [
    "resetAdminPassword",
    "UNKNOWN_EXPIRED_CONSUMED_REVOKED_OR_ACCOUNT_STATE_COMPARABLE",
  ],
  [
    "acceptAdminInvitation",
    "UNKNOWN_EXPIRED_CONSUMED_REVOKED_OR_ACCOUNT_STATE_COMPARABLE",
  ],
]);

const REQUIRED_ADMIN_RECOVERY_CASE_STATE_MACHINE = {
  states: ["PENDING", "APPROVED", "CANCELLED", "EXPIRED"],
  transitions: {
    createAdminRecoveryCase:
      "NONE_TO_PENDING_AND_ATOMICALLY_CANCEL_OLDER_PENDING_FOR_SUBJECT",
    approveAdminRecoveryCase: "PENDING_TO_APPROVED_ONE_SHOT",
    serverPolicySuperseded: "PENDING_TO_CANCELLED",
    serverPolicyIneligible: "PENDING_TO_CANCELLED",
    serverClock: "PENDING_TO_EXPIRED",
  },
  cancellationAuthority: "SERVER_POLICY_ONLY",
  cancellationAudit: "AUDIT_LOG_WITH_SERVER_REASON_AND_CAUSATION",
  standaloneCancellationOperation: false,
};

const REQUIRED_ADMIN_RATE_LIMIT_PROFILES = new Map([
  ["loginAdmin", "PASSWORD"],
  ["confirmAdminTotpEnrollment", "TOTP"],
  ["verifyAdminTotp", "TOTP"],
  ["verifyAdminRecoveryCode", "RECOVERY"],
  ["rotateAdminRecoveryCodes", "TOTP"],
  ["stepUpAdminSession", "TOTP"],
  ["refreshAdminSession", "REFRESH"],
  ["requestAdminPasswordReset", "RECOVERY"],
  ["resetAdminPassword", "RECOVERY"],
  ["acceptAdminInvitation", "RECOVERY"],
]);

const PUBLIC_BUSINESS_OPERATIONS = new Set([
  "listPublicAudioCatalog",
  "getPublicAudioContent",
  "getPublicAudioCover",
  "registerCustomer",
  "loginCustomer",
  "verifyCustomerOtp",
  "refreshCustomerSession",
  "createAnonymousPreviewGrant",
  "exchangePreviewGrantForPlaybackDescriptor",
]);

const CUSTOMER_BEARER_OPERATIONS = new Set([
  "createCustomerStepUpChallenge",
  "verifyCustomerStepUp",
  "revokeCurrentCustomerSession",
  "listCustomerDevices",
  "listCustomerOrders",
  "createCustomerOrder",
  "getCustomerOrder",
  "listPaymentAttempts",
  "createPaymentAttempt",
  "getPaymentAttempt",
  "getOrderReceipt",
  "listOperationalPaymentProviders",
  "listEntitledAudioLibrary",
  "createPurchasedPlaybackDescriptor",
]);

const ARTIST_EARNING_ALLOCATION_POLICY =
  "FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1";

const REQUIRED_ARTIST_EARNING_POLICY = {
  version: ARTIST_EARNING_ALLOCATION_POLICY,
  arithmetic: "INTEGER_BIGINT",
  denominator: 10000,
  granularity: "ARTIST_PER_SETTLEMENT",
  settlementOrder: "STRICT_PER_ARTIST_SEQUENCE",
  calculation: "FLOOR_EXACT_NUMERATOR_WITH_CARRY",
  carryOwnership: "SAME_ARTIST_ONLY",
  carryConsumption: "IMMEDIATE_PREDECESSOR_SINGLE_USE_WITH_LOCK",
  initialCarry: "ZERO",
  conservation:
    "CARRY_IN_PLUS_EARNINGS_EQUALS_PAYABLE_TIMES_DENOMINATOR_PLUS_CARRY_OUT",
  reversal: "APPEND_COMPENSATION_NO_REWRITE",
};

const REQUIRED_STATE_MACHINES = {
  Order: {
    states: ["CREATED", "PAYMENT_PENDING", "SETTLED", "CANCELLED"],
    currentStateSource: "LATEST_APPEND_ONLY_EVENT",
  },
  PaymentAttempt: {
    states: [
      "CREATED",
      "PENDING",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
      "EXPIRED",
    ],
    currentStateSource: "LATEST_APPEND_ONLY_EVENT",
  },
  MediaAsset: {
    states: ["PREPARING", "UPLOAD_PENDING", "PROCESSING", "READY", "FAILED"],
  },
  AudioEditorial: { states: ["DRAFT", "PUBLISHED", "ARCHIVED"] },
  PaymentWebhookInbox: {
    states: ["RECEIVED", "PROCESSING", "PROCESSED", "REJECTED"],
  },
  MediaWebhookInbox: {
    states: ["RECEIVED", "PROCESSING", "PROCESSED", "REJECTED"],
  },
};

const REQUIRED_CATALOG_POLICY = {
  scope: "GLOBAL_MVP",
  publicCover: "CONTROLLED_API_REPRESENTATION_WITHOUT_PRIVATE_LOCATION",
  salesCount: "SETTLED_UNITS_NET_FULL_REFUNDS",
  beforeP4: "ZERO_NO_DEMO_OR_SYNTHETIC_VALUE",
};

const ADMIN_ROLES = new Set([
  "SUPER_ADMIN",
  "CONTENT_EDITOR",
  "FINANCE_MANAGER",
  "SUPPORT",
]);

const ADMIN_OPERATION_ROLES = new Map([
  ["listAdminArtists", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["createAdminArtist", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["getAdminArtist", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["updateAdminArtist", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["listAdminAudioContent", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["createAdminAudioContent", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["getAdminAudioContent", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["updateAdminAudioContent", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["publishAdminAudioContent", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["archiveAdminAudioContent", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["createPrivateMediaAsset", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["getPrivateMediaAssetStatus", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
  ["preparePrivateMediaAssetUpload", ["SUPER_ADMIN", "CONTENT_EDITOR"]],
]);

const SAFE_MEDIA_SURFACE_PROPERTIES = new Map([
  [
    "AudioCatalogItem",
    [
      "artist",
      "contentId",
      "cover",
      "durationSeconds",
      "previewAvailable",
      "previewSeconds",
      "priceCfa",
      "settledSalesCount",
      "title",
    ],
  ],
  [
    "AudioContentDetail",
    [
      "artist",
      "contentId",
      "cover",
      "description",
      "durationSeconds",
      "previewAvailable",
      "previewSeconds",
      "priceCfa",
      "settledSalesCount",
      "title",
    ],
  ],
  [
    "PlaybackDescriptor",
    ["descriptor", "expiresAt", "expiresInSeconds", "protocol"],
  ],
  ["MediaPreparation", ["expiresAt", "expiresInSeconds", "preparationToken"]],
  [
    "LibraryAudioItem",
    [
      "archived",
      "artist",
      "audioContentId",
      "entitlementId",
      "grantedAt",
      "source",
      "title",
    ],
  ],
  [
    "PreviewGrant",
    ["audioContentId", "expiresAt", "maxDurationSeconds", "previewGrantId"],
  ],
  [
    "MediaAssetStatus",
    [
      "durationSeconds",
      "kind",
      "mediaAssetId",
      "processingStatus",
      "safeFailureCode",
      "version",
    ],
  ],
]);

const ADMIN_REQUEST_PROPERTIES = new Map([
  ["UpsertArtistRequest", ["stageName", "status"]],
  [
    "UpsertAudioContentRequest",
    ["artistId", "description", "previewSeconds", "priceCfa", "title"],
  ],
  ["PublishAudioContentRequest", ["reason", "requiredMediaAssets"]],
  ["ArchiveAudioContentRequest", ["reason"]],
  ["CreateMediaAssetRequest", ["audioContentId", "checksumSha256", "kind"]],
  ["PrepareMediaAssetRequest", ["byteLength", "checksumSha256"]],
]);

const HTTP_METHODS = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);

const FORBIDDEN_PUBLIC_FIELD =
  /(?:url|uri)$|r2|mux|storage(?:object)?key|sourceobjectkey|originkey|medialocator|providersecret|providerasset(?:id|ref)|rawpayload/i;
const FORBIDDEN_PUBLIC_AUTH_HASH =
  /^(?=.*(?:code|credential|fingerprint|password|secret|token))(?=.*(?:digest|hash)).*$/i;

function fail(message) {
  throw new Error(`OpenAPI validation failed: ${message}`);
}

function stableEqual(actual, expected) {
  return (
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

function isExactObjectSchema(schema, required, properties) {
  return (
    schema?.type === "object" &&
    schema?.additionalProperties === false &&
    stableEqual(schema?.required ?? [], required) &&
    stableEqual(Object.keys(schema?.properties ?? {}), properties)
  );
}

function hasExactSecurityRequirement(operation, scheme) {
  const security = operation.security;
  if (!Array.isArray(security) || security.length !== 1) return false;
  const requirement = security[0];
  return (
    requirement !== null &&
    typeof requirement === "object" &&
    !Array.isArray(requirement) &&
    stableEqual(Object.keys(requirement), [scheme]) &&
    Array.isArray(requirement[scheme]) &&
    requirement[scheme].length === 0
  );
}

function resolveReference(document, reference) {
  if (!reference.startsWith("#/")) {
    fail(`external reference is forbidden: ${reference}`);
  }
  return reference
    .slice(2)
    .split("/")
    .reduce(
      (value, segment) =>
        value?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")],
      document,
    );
}

function dereference(document, value) {
  return typeof value?.$ref === "string"
    ? resolveReference(document, value.$ref)
    : value;
}

function walk(value, visitor, location = "#") {
  visitor(value, location);
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      walk(entry, visitor, `${location}/${index}`),
    );
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    walk(entry, visitor, `${location}/${key}`);
  }
}

function validateReferences(document) {
  walk(document, (value, location) => {
    if (
      value !== null &&
      typeof value === "object" &&
      typeof value.$ref === "string" &&
      resolveReference(document, value.$ref) === undefined
    ) {
      fail(`unresolved reference at ${location}`);
    }
  });
}

function operationAt(document, path, method) {
  const operation = document.paths?.[path]?.[method];
  if (operation === undefined) {
    fail(`missing ${method.toUpperCase()} ${path}`);
  }
  return operation;
}

function hasParameter(document, operation, expectedName, expectedLocation) {
  return (operation.parameters ?? []).some((entry) => {
    const parameter = dereference(document, entry);
    return (
      parameter?.name === expectedName && parameter?.in === expectedLocation
    );
  });
}

function validateOperationShape(document) {
  const actualOperations = new Map();
  for (const [path, pathItem] of Object.entries(document.paths)) {
    const methods = Object.keys(pathItem).filter((key) =>
      HTTP_METHODS.has(key),
    );
    if (methods.length === 0) {
      fail(`${path} requires an HTTP operation`);
    }
    for (const method of methods) {
      const operation = pathItem[method];
      actualOperations.set(
        `${method.toUpperCase()} ${path}`,
        operation.operationId,
      );
      if (!operation.operationId || !operation.summary) {
        fail(
          `${method.toUpperCase()} ${path} requires operationId and summary`,
        );
      }
      if (
        EXPECTED_OPERATIONS.get(`${method.toUpperCase()} ${path}`) !==
        operation.operationId
      ) {
        fail(
          "path, method and operationId surface must match the exact approved inventory",
        );
      }
      if (
        !Array.isArray(operation["x-kora-clients"]) ||
        operation["x-kora-clients"].length === 0
      ) {
        fail(`${method.toUpperCase()} ${path} requires x-kora-clients`);
      }
      if (Object.keys(operation.responses ?? {}).length === 0) {
        fail(`${method.toUpperCase()} ${path} requires responses`);
      }
      const expectedSuccess = EXPECTED_SUCCESS_RESPONSES.get(
        operation.operationId,
      );
      const successResponses = Object.entries(operation.responses ?? {}).filter(
        ([status]) => /^2(?:\d\d|XX)$/i.test(status),
      );
      if (!expectedSuccess || successResponses.length !== 1) {
        fail(
          `${operation.operationId} requires exactly one approved success response`,
        );
      }
      const [expectedStatus, expectedMediaType, expectedSchema] =
        expectedSuccess;
      const [actualStatus, responseValue] = successResponses[0];
      const response = dereference(document, responseValue);
      if (actualStatus !== expectedStatus) {
        fail(
          `${operation.operationId} success response must use HTTP ${expectedStatus}`,
        );
      }
      if (expectedStatus === "204") {
        if (response?.content !== undefined) {
          fail(
            `${operation.operationId} HTTP 204 success response must not declare content`,
          );
        }
      } else {
        const mediaTypes = Object.keys(response?.content ?? {});
        const schema = response?.content?.[expectedMediaType]?.schema;
        const schemaMatches =
          expectedSchema === "binary"
            ? schema?.type === "string" &&
              schema?.format === "binary" &&
              stableEqual(Object.keys(schema), ["format", "type"])
            : schema?.$ref === expectedSchema &&
              stableEqual(Object.keys(schema), ["$ref"]);
        if (!stableEqual(mediaTypes, [expectedMediaType]) || !schemaMatches) {
          fail(
            `${operation.operationId} HTTP ${expectedStatus} success response must bind exactly ${expectedMediaType} to ${expectedSchema}`,
          );
        }
      }
      if (
        path.startsWith("/health/") &&
        (operation.security !== undefined ||
          !stableEqual(operation["x-kora-clients"] ?? [], ["operations"]))
      ) {
        fail(
          `${method.toUpperCase()} ${path} must be an exact public health operation`,
        );
      }
      for (const [status, responseValue] of Object.entries(
        operation.responses,
      )) {
        if (
          /^2/.test(status) &&
          status !== "204" &&
          !path.startsWith("/health/")
        ) {
          const response = dereference(document, responseValue);
          const isControlledCover =
            operation.operationId === "getPublicAudioCover" &&
            status === "200" &&
            operation["x-kora-controlled-representation"] === true &&
            response?.content?.["image/*"]?.schema?.type === "string" &&
            response?.content?.["image/*"]?.schema?.format === "binary";
          const isAdminSecurityBinary = [
            "deliverAdminTotpEnrollmentQr",
            "downloadAdminAuditLogExport",
          ].includes(operation.operationId);
          if (isControlledCover || isAdminSecurityBinary) continue;
          const schema = response?.content?.["application/json"]?.schema;
          const envelope = dereference(document, schema);
          if (
            !schema?.$ref?.startsWith("#/components/schemas/") ||
            envelope?.type !== "object" ||
            envelope?.additionalProperties !== false ||
            !stableEqual(envelope.required ?? [], ["data", "meta"]) ||
            !stableEqual(Object.keys(envelope.properties ?? {}), [
              "data",
              "meta",
            ]) ||
            envelope.properties?.data === undefined ||
            ![
              "#/components/schemas/CursorMeta",
              "#/components/schemas/ResponseMeta",
            ].includes(envelope.properties?.meta?.$ref)
          ) {
            fail(
              `${method.toUpperCase()} ${path} HTTP ${status} requires the exact {data, meta} success envelope`,
            );
          }
        }
        if (/^[45]/.test(status)) {
          if (path === "/health/ready" && status === "503") {
            continue;
          }

          const response = dereference(document, responseValue);
          const schema = response?.content?.["application/json"]?.schema;
          if (
            schema?.$ref !== "#/components/schemas/ErrorResponse" &&
            schema?.$ref !== "#/components/schemas/PublishConflictError"
          ) {
            fail(
              `${method.toUpperCase()} ${path} HTTP ${status} requires a stable safe error schema`,
            );
          }
        }
      }
    }
  }
  if (
    actualOperations.size !== EXPECTED_OPERATIONS.size ||
    [...EXPECTED_OPERATIONS].some(
      ([key, operationId]) => actualOperations.get(key) !== operationId,
    )
  ) {
    fail(
      "path, method and operationId surface must match the exact approved inventory",
    );
  }
}

function validateStateMachines(document) {
  const machines = document["x-kora-state-machines"] ?? {};
  if (
    !stableEqual(Object.keys(machines), Object.keys(REQUIRED_STATE_MACHINES))
  ) {
    fail("the executable state-machine set is incomplete or has drifted");
  }
  const enumByMachine = {
    AudioEditorial: "AudioEditorialState",
    MediaAsset: "MediaProcessingStatus",
    Order: "OrderState",
    PaymentAttempt: "PaymentAttemptState",
  };

  for (const [name, expectation] of Object.entries(REQUIRED_STATE_MACHINES)) {
    const machine = machines[name];
    const states = Object.keys(machine.transitions ?? {});
    if (!stableEqual(states, expectation.states)) {
      fail(
        `${name} state machine must enumerate every approved state exactly once`,
      );
    }
    if (!states.includes(machine.initial)) {
      fail(`${name} initial state must belong to its transition graph`);
    }
    for (const [from, targets] of Object.entries(machine.transitions)) {
      if (
        !Array.isArray(targets) ||
        targets.some((target) => !states.includes(target))
      ) {
        fail(`${name}.${from} contains an invalid transition target`);
      }
    }
    for (const terminal of machine.terminal ?? []) {
      if (
        !states.includes(terminal) ||
        machine.transitions[terminal].length !== 0
      ) {
        fail(
          `${name} terminal state ${terminal} must exist and have no outgoing transition`,
        );
      }
    }
    if (
      expectation.currentStateSource &&
      machine.currentStateSource !== expectation.currentStateSource
    ) {
      fail(
        `${name} current state must derive from its latest append-only event`,
      );
    }
    const schemaName = enumByMachine[name];
    if (
      schemaName &&
      !stableEqual(document.components.schemas[schemaName].enum, states)
    ) {
      fail(`${name} transition graph and ${schemaName} enum must match`);
    }
  }

  for (const schemaName of ["Order", "PaymentAttempt"]) {
    if (
      document.components.schemas[schemaName]["x-kora-current-state-source"] !==
      "LATEST_APPEND_ONLY_EVENT"
    ) {
      fail(`${schemaName}.state must equal the latest append-only event`);
    }
  }

  if (
    !stableEqual(
      document["x-kora-transaction-preconditions"] ?? [],
      REQUIRED_TRANSACTION_PRECONDITIONS,
    )
  ) {
    fail(
      "the executable transaction-precondition set is incomplete or has drifted",
    );
  }
  if (
    !stableEqual(document["x-kora-required-publication-media-kinds"] ?? [], [
      "AUDIO_MASTER",
      "COVER_IMAGE",
    ])
  ) {
    fail(
      "publication must require exactly the audio master and cover image kinds",
    );
  }
}

function validateErrorsAndAuthorization(document) {
  if (document.security !== undefined) {
    fail(
      "root security is forbidden; every business operation is classified explicitly",
    );
  }
  const errorCodes = new Set(document.components.schemas.ErrorCode.enum ?? []);
  const operationErrors = document["x-kora-operation-errors"] ?? {};
  const errorStatuses = document["x-kora-error-statuses"] ?? {};
  const businessOperationIds = [];
  const publicWebPaths = new Set([
    "/api/v1/catalog/audio",
    "/api/v1/catalog/audio/{contentId}",
    "/api/v1/catalog/audio/{contentId}/cover",
  ]);

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || path.startsWith("/health/")) continue;
      businessOperationIds.push(operation.operationId);
      const declared = operationErrors[operation.operationId];
      if (!Array.isArray(declared) || declared.length === 0) {
        fail(
          `${operation.operationId} must enumerate stable operation error codes`,
        );
      }
      if (declared.some((code) => !errorCodes.has(code))) {
        fail(`${operation.operationId} declares an unknown stable error code`);
      }
      for (const code of declared) {
        const status = String(errorStatuses[code] ?? "");
        if (
          !/^[45]\d\d$/.test(status) ||
          operation.responses?.[status] === undefined
        ) {
          fail(
            `${operation.operationId} does not expose the HTTP status mapped to ${code}`,
          );
        }
      }
      for (const status of Object.keys(operation.responses ?? {}).filter(
        (value) => /^[45]/.test(value),
      )) {
        if (!declared.some((code) => String(errorStatuses[code]) === status)) {
          fail(
            `${operation.operationId} HTTP ${status} lacks a mapped stable error code`,
          );
        }
      }

      const clients = operation["x-kora-clients"];
      if (clients.includes("web") && !publicWebPaths.has(path)) {
        fail(
          `${operation.operationId} must not expose transaction or playback to web`,
        );
      }
      if (PUBLIC_BUSINESS_OPERATIONS.has(operation.operationId)) {
        if (operation.security !== undefined) {
          fail(`${operation.operationId} must be an exact public operation`);
        }
      } else if (CUSTOMER_BEARER_OPERATIONS.has(operation.operationId)) {
        if (!hasExactSecurityRequirement(operation, "customerBearer")) {
          fail(`${operation.operationId} requires customerBearer exactly`);
        }
      }
      if (clients.includes("admin")) {
        if (!hasExactSecurityRequirement(operation, "adminSession")) {
          fail(
            `${operation.operationId} requires the short-lived admin access credential`,
          );
        }
        const roles = operation["x-kora-roles"];
        const expectedRoles = ADMIN_OPERATION_ROLES.get(operation.operationId);
        if (
          !Array.isArray(roles) ||
          expectedRoles === undefined ||
          roles.some((role) => !ADMIN_ROLES.has(role)) ||
          !stableEqual(roles, expectedRoles)
        ) {
          fail(
            `${operation.operationId} requires the exact approved admin roles`,
          );
        }
        if (
          method !== "get" &&
          (operation["x-kora-transactional-audit"] !== true ||
            operation["x-kora-idempotent"] !== true)
        ) {
          fail(
            `${operation.operationId} requires transactional audit and idempotency`,
          );
        }
      }
      if (
        clients.includes("provider") &&
        !hasExactSecurityRequirement(operation, "providerSignature")
      ) {
        fail(
          `${operation.operationId} requires the sandbox provider signature`,
        );
      }
      if (
        clients.includes("media-provider") &&
        !hasExactSecurityRequirement(operation, "muxSignature")
      ) {
        fail(`${operation.operationId} requires the exact Mux signature`);
      }
      const authorizationClasses = [
        PUBLIC_BUSINESS_OPERATIONS.has(operation.operationId),
        CUSTOMER_BEARER_OPERATIONS.has(operation.operationId),
        clients.includes("admin"),
        clients.includes("admin-security"),
        clients.includes("provider"),
        clients.includes("media-provider"),
      ].filter(Boolean);
      if (authorizationClasses.length !== 1) {
        fail(
          `${operation.operationId} must belong to exactly one approved authorization class`,
        );
      }
    }
  }

  if (!stableEqual(Object.keys(operationErrors), businessOperationIds)) {
    fail(
      "operation error-code map must cover every business operation exactly once",
    );
  }
  if (!stableEqual(Object.keys(errorStatuses), errorCodes)) {
    fail("every stable error code must map to exactly one HTTP status");
  }
  const adminScheme = document.components.securitySchemes.adminSession;
  if (
    adminScheme?.type !== "http" ||
    adminScheme?.scheme !== "bearer" ||
    adminScheme?.bearerFormat !== "RS256 JWT; 15 minute maximum"
  ) {
    fail(
      "admin business routes require a short-lived bearer access credential",
    );
  }
  const customerScheme = document.components.securitySchemes.customerBearer;
  if (
    customerScheme?.type !== "http" ||
    customerScheme?.scheme !== "bearer" ||
    customerScheme?.bearerFormat !== "JWT"
  ) {
    fail("customerBearer must be the exact HTTP bearer JWT scheme");
  }
  const providerScheme = document.components.securitySchemes.providerSignature;
  if (
    providerScheme?.type !== "apiKey" ||
    providerScheme?.in !== "header" ||
    providerScheme?.name !== "X-Kora-Sandbox-Signature"
  ) {
    fail("providerSignature must be the exact sandbox signature header");
  }
  const muxScheme = document.components.securitySchemes.muxSignature;
  if (
    muxScheme?.type !== "apiKey" ||
    muxScheme?.in !== "header" ||
    muxScheme?.name !== "Mux-Signature"
  ) {
    fail("muxSignature must be the exact Mux-Signature header");
  }
  const assignedCustomerOperations = businessOperationIds.filter(
    (operationId) =>
      PUBLIC_BUSINESS_OPERATIONS.has(operationId) ||
      CUSTOMER_BEARER_OPERATIONS.has(operationId),
  );
  const expectedCustomerOperations = [
    ...PUBLIC_BUSINESS_OPERATIONS,
    ...CUSTOMER_BEARER_OPERATIONS,
  ];
  if (!stableEqual(assignedCustomerOperations, expectedCustomerOperations)) {
    fail(
      "public and customerBearer operations must match the exact approved sets",
    );
  }
  if (
    JSON.stringify(document["x-kora-authentication-policy"] ?? {}) !==
    JSON.stringify(REQUIRED_AUTHENTICATION_POLICY)
  ) {
    fail(
      "customer authentication must be phone/password then OTP with protected step-up and single-device sessions",
    );
  }
  if (
    JSON.stringify(document["x-kora-admin-auth-data-policy"] ?? {}) !==
    JSON.stringify(REQUIRED_ADMIN_AUTH_DATA_POLICY)
  ) {
    fail(
      "admin authentication data must enforce RFC 6238, encrypted secrets, single-use Argon2id recovery and bounded sessions",
    );
  }
  for (const schemaName of ["ErrorResponse", "PublishConflictError"]) {
    const envelope = document.components.schemas[schemaName];
    const error = envelope?.properties?.error;
    if (
      envelope?.type !== "object" ||
      envelope?.additionalProperties !== false ||
      !stableEqual(envelope?.required ?? [], ["error", "requestId"]) ||
      !stableEqual(Object.keys(envelope?.properties ?? {}), [
        "error",
        "requestId",
      ]) ||
      error?.type !== "object" ||
      error?.additionalProperties !== false ||
      !stableEqual(error?.required ?? [], ["code", "details", "message"]) ||
      !stableEqual(Object.keys(error?.properties ?? {}), [
        "code",
        "details",
        "message",
        "retryable",
      ]) ||
      error.properties?.details?.$ref !== "#/components/schemas/ErrorDetails"
    ) {
      fail(
        `${schemaName} must require the exact {code, message, details} error body`,
      );
    }
  }
  const errorDetails = document.components.schemas.ErrorDetails;
  if (
    errorDetails?.type !== "object" ||
    errorDetails?.additionalProperties !== false ||
    !stableEqual(Object.keys(errorDetails?.properties ?? {}), [
      "field",
      "operatorReason",
      "reason",
      "retryAfterSeconds",
    ])
  ) {
    fail("ErrorDetails must expose only the closed non-sensitive vocabulary");
  }
  const responseMeta = document.components.schemas.ResponseMeta;
  if (
    responseMeta?.type !== "object" ||
    responseMeta?.additionalProperties !== false ||
    !stableEqual(responseMeta?.required ?? [], ["requestId"]) ||
    responseMeta?.properties?.requestId?.type !== "string"
  ) {
    fail("ResponseMeta must require the shared safe requestId contract");
  }
  const publishCodes =
    document.components.schemas.PublishConflictError.properties.error.properties
      .code.enum;
  if (
    !stableEqual(publishCodes, [
      "CONTENT_MEDIA_NOT_READY",
      "IDEMPOTENCY_CONFLICT",
      "INVALID_STATE_TRANSITION",
    ])
  ) {
    fail("publish conflicts must expose only their three stable safe codes");
  }
}

function validateAuthenticationContract(document) {
  const expectedOperations = [
    [
      "/api/v1/auth/register",
      "post",
      "RegisterCustomerRequest",
      "OtpChallengeEnvelope",
      "202",
    ],
    [
      "/api/v1/auth/login",
      "post",
      "LoginCustomerRequest",
      "OtpChallengeEnvelope",
      "202",
    ],
    [
      "/api/v1/auth/otp/challenges/{challengeId}/verify",
      "post",
      "OtpVerificationRequest",
      "SessionEnvelope",
      "200",
    ],
    [
      "/api/v1/auth/step-up/challenges",
      "post",
      "StepUpChallengeRequest",
      "OtpChallengeEnvelope",
      "202",
    ],
    [
      "/api/v1/auth/step-up/challenges/{challengeId}/verify",
      "post",
      "StepUpVerificationRequest",
      "StepUpVerificationEnvelope",
      "200",
    ],
    [
      "/api/v1/auth/sessions/refresh",
      "post",
      "RefreshSessionRequest",
      "SessionEnvelope",
      "200",
    ],
  ];
  for (const [
    path,
    method,
    requestSchema,
    responseSchema,
    status,
  ] of expectedOperations) {
    const operation = operationAt(document, path, method);
    if (
      operation.requestBody?.content?.["application/json"]?.schema?.$ref !==
        `#/components/schemas/${requestSchema}` ||
      operation.responses?.[status]?.content?.["application/json"]?.schema
        ?.$ref !== `#/components/schemas/${responseSchema}`
    ) {
      fail(
        `${operation.operationId} must use its exact approved auth request and response contracts`,
      );
    }
  }

  const phone = document.components.schemas.E164Phone;
  if (
    phone?.type !== "string" ||
    phone?.pattern !== "^\\+[1-9][0-9]{7,14}$" ||
    phone?.example !== "+22370000000"
  ) {
    fail(
      "customer phones must use unambiguous international E.164 with a +223 example",
    );
  }
  const password = document.components.schemas.CustomerPassword;
  if (
    password?.type !== "string" ||
    password?.minLength !== 8 ||
    password?.maxLength !== 128 ||
    password?.writeOnly !== true
  ) {
    fail(
      "customer registration and login require a bounded write-only password",
    );
  }
  for (const schemaName of [
    "RegisterCustomerRequest",
    "LoginCustomerRequest",
  ]) {
    const schema = document.components.schemas[schemaName];
    if (
      schema?.type !== "object" ||
      schema?.additionalProperties !== false ||
      !stableEqual(schema?.required ?? [], ["device", "password", "phone"]) ||
      !stableEqual(Object.keys(schema?.properties ?? {}), [
        "device",
        "password",
        "phone",
      ]) ||
      schema?.properties?.phone?.$ref !== "#/components/schemas/E164Phone" ||
      schema?.properties?.password?.$ref !==
        "#/components/schemas/CustomerPassword" ||
      schema?.properties?.device?.$ref !==
        "#/components/schemas/CustomerDeviceRegistration"
    ) {
      fail(`${schemaName} must require phone, password and device`);
    }
  }
  const deviceRegistration =
    document.components.schemas.CustomerDeviceRegistration;
  if (
    deviceRegistration?.type !== "object" ||
    deviceRegistration?.additionalProperties !== false ||
    !stableEqual(deviceRegistration?.required ?? [], [
      "fingerprint",
      "platform",
    ]) ||
    !stableEqual(Object.keys(deviceRegistration?.properties ?? {}), [
      "fingerprint",
      "platform",
    ])
  ) {
    fail("CustomerDeviceRegistration must be the exact safe device input");
  }
  const register = operationAt(document, "/api/v1/auth/register", "post");
  const login = operationAt(document, "/api/v1/auth/login", "post");
  if (
    register.responses?.["409"] !== undefined ||
    !stableEqual(document["x-kora-operation-errors"].registerCustomer, [
      "RATE_LIMITED",
      "VALIDATION_ERROR",
    ]) ||
    login.responses?.["403"] !== undefined ||
    !stableEqual(document["x-kora-operation-errors"].loginCustomer, [
      "AUTH_INVALID_CREDENTIALS",
      "RATE_LIMITED",
      "VALIDATION_ERROR",
    ])
  ) {
    fail("public authentication outcomes must not reveal account existence");
  }
  const otpChallenge = document.components.schemas.OtpChallenge;
  if (
    otpChallenge?.type !== "object" ||
    otpChallenge?.additionalProperties !== false ||
    !stableEqual(otpChallenge?.required ?? [], [
      "challengeId",
      "expiresAt",
      "purpose",
      "retryAfterSeconds",
    ]) ||
    !stableEqual(Object.keys(otpChallenge?.properties ?? {}), [
      "challengeId",
      "expiresAt",
      "purpose",
      "retryAfterSeconds",
    ])
  ) {
    fail("OtpChallenge must expose only its exact safe public shape");
  }
  const otpVerification = document.components.schemas.OtpVerificationRequest;
  if (
    otpVerification?.type !== "object" ||
    otpVerification?.additionalProperties !== false ||
    !stableEqual(otpVerification?.required ?? [], ["code"]) ||
    !stableEqual(Object.keys(otpVerification?.properties ?? {}), ["code"]) ||
    otpVerification?.properties?.code?.pattern !== "^[0-9]{6}$"
  ) {
    fail(
      "OTP verification must consume only the password-verified challenge code",
    );
  }
  const otpPurpose =
    document.components.schemas.OtpChallenge?.properties?.purpose?.enum;
  if (!stableEqual(otpPurpose ?? [], ["REGISTER", "LOGIN", "STEP_UP"])) {
    fail(
      "OTP challenges must distinguish registration, login and protected step-up",
    );
  }
  const stepUpPurposes =
    document.components.schemas.StepUpChallengeRequest?.properties?.purpose
      ?.enum;
  const stepUpChallenge = document.components.schemas.StepUpChallengeRequest;
  if (
    stepUpChallenge?.type !== "object" ||
    stepUpChallenge?.additionalProperties !== false ||
    !stableEqual(stepUpChallenge?.required ?? [], ["purpose"]) ||
    !stableEqual(Object.keys(stepUpChallenge?.properties ?? {}), ["purpose"]) ||
    !stableEqual(stepUpPurposes ?? [], ["ACCOUNT_SECURITY", "ARTIST_PAYOUT"])
  ) {
    fail(
      "step-up challenges must be limited to account security and artist payout",
    );
  }
  const stepUpVerification =
    document.components.schemas.StepUpVerificationRequest;
  if (
    stepUpVerification?.type !== "object" ||
    stepUpVerification?.additionalProperties !== false ||
    !stableEqual(stepUpVerification?.required ?? [], ["code"]) ||
    !stableEqual(Object.keys(stepUpVerification?.properties ?? {}), ["code"]) ||
    stepUpVerification?.properties?.code?.pattern !== "^[0-9]{6}$"
  ) {
    fail("StepUpVerificationRequest must expose only the exact OTP code input");
  }

  const stepUpResult = document.components.schemas.StepUpVerification;
  if (
    !isExactObjectSchema(
      stepUpResult,
      ["sessionId", "verifiedAt"],
      ["sessionId", "verifiedAt"],
    ) ||
    stepUpResult.properties.sessionId?.$ref !==
      "#/components/schemas/Identifier" ||
    stepUpResult.properties.verifiedAt?.$ref !==
      "#/components/schemas/Timestamp"
  ) {
    fail("StepUpVerification must expose only the exact safe result");
  }

  const refreshSession = document.components.schemas.RefreshSessionRequest;
  if (
    !isExactObjectSchema(refreshSession, ["refreshToken"], ["refreshToken"]) ||
    refreshSession.properties.refreshToken?.type !== "string" ||
    refreshSession.properties.refreshToken?.minLength !== 32 ||
    refreshSession.properties.refreshToken?.maxLength !== 4096
  ) {
    fail("RefreshSessionRequest must expose only the bounded refresh token");
  }

  const session = document.components.schemas.Session;
  if (
    !isExactObjectSchema(
      session,
      [
        "accessExpiresAt",
        "accessToken",
        "deviceId",
        "refreshExpiresAt",
        "refreshToken",
        "sessionId",
      ],
      [
        "accessExpiresAt",
        "accessToken",
        "deviceId",
        "refreshExpiresAt",
        "refreshToken",
        "sessionId",
      ],
    ) ||
    session.properties.sessionId?.$ref !== "#/components/schemas/Identifier" ||
    session.properties.deviceId?.$ref !== "#/components/schemas/Identifier" ||
    session.properties.accessExpiresAt?.$ref !==
      "#/components/schemas/Timestamp" ||
    session.properties.refreshExpiresAt?.$ref !==
      "#/components/schemas/Timestamp" ||
    session.properties.accessToken?.type !== "string" ||
    session.properties.accessToken?.minLength !== 32 ||
    session.properties.accessToken?.maxLength !== 4096 ||
    session.properties.refreshToken?.type !== "string" ||
    session.properties.refreshToken?.minLength !== 32 ||
    session.properties.refreshToken?.maxLength !== 4096
  ) {
    fail("Session must expose only the exact bounded public token result");
  }

  for (const [envelopeName, payloadName] of [
    ["OtpChallengeEnvelope", "OtpChallenge"],
    ["SessionEnvelope", "Session"],
    ["StepUpVerificationEnvelope", "StepUpVerification"],
  ]) {
    const envelope = document.components.schemas[envelopeName];
    if (
      !isExactObjectSchema(envelope, ["data", "meta"], ["data", "meta"]) ||
      envelope.properties.data?.$ref !==
        `#/components/schemas/${payloadName}` ||
      envelope.properties.meta?.$ref !== "#/components/schemas/ResponseMeta"
    ) {
      fail(`${envelopeName} must wrap only its exact safe auth payload`);
    }
  }

  const deviceSummary = document.components.schemas.DeviceSummary;
  if (
    !isExactObjectSchema(
      deviceSummary,
      ["current", "deviceId", "lastSeenAt", "platform", "registeredAt"],
      ["current", "deviceId", "lastSeenAt", "platform", "registeredAt"],
    ) ||
    deviceSummary.properties.deviceId?.$ref !==
      "#/components/schemas/Identifier" ||
    !stableEqual(deviceSummary.properties.platform?.enum ?? [], [
      "ANDROID",
      "IOS",
    ]) ||
    deviceSummary.properties.registeredAt?.$ref !==
      "#/components/schemas/Timestamp" ||
    deviceSummary.properties.lastSeenAt?.$ref !==
      "#/components/schemas/Timestamp" ||
    deviceSummary.properties.current?.type !== "boolean"
  ) {
    fail("DeviceSummary must expose only the exact safe session metadata");
  }
  const deviceList = document.components.schemas.DeviceListEnvelope;
  if (
    !isExactObjectSchema(deviceList, ["data", "meta"], ["data", "meta"]) ||
    deviceList.properties.data?.type !== "array" ||
    deviceList.properties.data?.maxItems !== 20 ||
    deviceList.properties.data?.items?.$ref !==
      "#/components/schemas/DeviceSummary" ||
    deviceList.properties.meta?.$ref !== "#/components/schemas/ResponseMeta" ||
    operationAt(document, "/api/v1/auth/devices", "get").responses?.["200"]
      ?.content?.["application/json"]?.schema?.$ref !==
      "#/components/schemas/DeviceListEnvelope"
  ) {
    fail("registered devices must use the exact bounded safe device list");
  }
}

export function validateSchemaInstance(document, schemaName, instance) {
  function validate(schemaValue, value, location) {
    const schema = dereference(document, schemaValue);
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (value === null) {
      if (!types.includes("null")) fail(`${location} does not allow null`);
      return;
    }
    if (schema.const !== undefined && value !== schema.const) {
      fail(`${location} must equal its const value`);
    }
    if (schema.enum && !schema.enum.includes(value)) {
      fail(`${location} must belong to its enum`);
    }
    if (types.includes("object") || schema.properties) {
      if (typeof value !== "object" || Array.isArray(value))
        fail(`${location} must be an object`);
      for (const required of schema.required ?? []) {
        if (!(required in value))
          fail(`${location} is missing required property ${required}`);
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in (schema.properties ?? {})))
            fail(`${location} rejects property ${key}`);
        }
      }
      for (const [key, child] of Object.entries(value)) {
        if (schema.properties?.[key])
          validate(schema.properties[key], child, `${location}.${key}`);
      }
      return;
    }
    if (types.includes("array")) {
      if (!Array.isArray(value)) fail(`${location} must be an array`);
      for (const [index, child] of value.entries())
        validate(schema.items, child, `${location}[${index}]`);
      return;
    }
    if (types.includes("integer") && !Number.isInteger(value))
      fail(`${location} must be an integer`);
    if (types.includes("string")) {
      if (typeof value !== "string") fail(`${location} must be a string`);
      if (schema.minLength !== undefined && value.length < schema.minLength)
        fail(`${location} is shorter than ${schema.minLength}`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength)
        fail(`${location} is longer than ${schema.maxLength}`);
      if (
        schema.pattern !== undefined &&
        !new RegExp(schema.pattern).test(value)
      )
        fail(`${location} does not match its required pattern`);
    }
    if (types.includes("boolean") && typeof value !== "boolean")
      fail(`${location} must be a boolean`);
  }

  validate(document.components.schemas[schemaName], instance, schemaName);
  return true;
}

function validateExamples(document) {
  let count = 0;
  for (const [schemaName, schema] of Object.entries(
    document.components.schemas,
  )) {
    for (const example of schema.examples ?? []) {
      validateSchemaInstance(document, schemaName, example);
      count += 1;
    }
  }
  if (count < 3)
    fail(
      "S1.2-01 requires at least three coherent non-sensitive schema examples",
    );
}

function validateArtistEarningPolicy(document) {
  const policy = document["x-kora-financial-policies"]?.artistEarningAllocation;
  if (
    JSON.stringify(policy) !== JSON.stringify(REQUIRED_ARTIST_EARNING_POLICY)
  ) {
    fail(
      "artist earnings must use the exact versioned settlement allocation policy",
    );
  }

  const policySchema =
    document.components.schemas.ArtistEarningAllocationPolicyVersion;
  if (
    policySchema?.type !== "string" ||
    policySchema.const !== ARTIST_EARNING_ALLOCATION_POLICY
  ) {
    fail(
      "artist earning allocation audit must expose the approved policy version",
    );
  }
  const earningAudit = document.components.schemas.ArtistEarningAllocationAudit;
  if (
    earningAudit?.additionalProperties !== false ||
    !stableEqual(earningAudit.required ?? [], [
      "artistId",
      "artistRevenueShareBps",
      "artistSettlementId",
      "audioContentId",
      "exactEarningNumerator",
      "frozenBasisCfa",
      "orderId",
      "orderItemId",
      "policy",
      "settlementId",
    ]) ||
    earningAudit.properties.exactEarningNumerator.type !== "string" ||
    earningAudit.properties.exactEarningNumerator.pattern !== "^[0-9]+$"
  ) {
    fail("artist earning allocation audit fields are incomplete or unsafe");
  }
  const settlementAudit =
    document.components.schemas.SettlementArtistAllocationAudit;
  if (
    settlementAudit?.additionalProperties !== false ||
    !stableEqual(settlementAudit.required ?? [], [
      "artistId",
      "artistSettlementId",
      "carryInNumerator",
      "carryOutNumerator",
      "earnings",
      "exactEarningsNumerator",
      "exactNumerator",
      "payableAmountCfa",
      "policy",
      "previousArtistSettlementId",
      "settlementSequence",
      "settlementId",
    ]) ||
    settlementAudit.properties.artistId.$ref !==
      "#/components/schemas/Identifier" ||
    settlementAudit.properties.artistSettlementId.$ref !==
      "#/components/schemas/Identifier" ||
    settlementAudit.properties.settlementId.$ref !==
      "#/components/schemas/Identifier" ||
    !stableEqual(
      settlementAudit.properties.previousArtistSettlementId.type ?? [],
      ["null", "string"],
    ) ||
    settlementAudit.properties.previousArtistSettlementId.format !== "uuid" ||
    settlementAudit.properties.policy.$ref !==
      "#/components/schemas/ArtistEarningAllocationPolicyVersion" ||
    settlementAudit.properties.settlementSequence.type !== "string" ||
    settlementAudit.properties.earnings.minItems !== 1 ||
    settlementAudit.properties.earnings.maxItems !== 20 ||
    settlementAudit.properties.earnings.items.$ref !==
      "#/components/schemas/ArtistEarningAllocationAudit" ||
    settlementAudit.properties.settlementSequence.pattern !== "^[1-9][0-9]*$" ||
    settlementAudit.properties.carryInNumerator.type !== "integer" ||
    settlementAudit.properties.carryInNumerator.minimum !== 0 ||
    settlementAudit.properties.carryInNumerator.maximum !== 9999 ||
    settlementAudit.properties.carryOutNumerator.type !== "integer" ||
    settlementAudit.properties.carryOutNumerator.minimum !== 0 ||
    settlementAudit.properties.carryOutNumerator.maximum !== 9999 ||
    settlementAudit.properties.exactEarningsNumerator.type !== "string" ||
    settlementAudit.properties.exactEarningsNumerator.pattern !== "^[0-9]+$" ||
    settlementAudit.properties.exactNumerator.type !== "string" ||
    settlementAudit.properties.exactNumerator.pattern !== "^[0-9]+$" ||
    settlementAudit.properties.payableAmountCfa.$ref !==
      "#/components/schemas/MoneyCfa"
  ) {
    fail(
      "artist settlement audit must prove bounded single-owner carry conservation",
    );
  }
}

function validateCursorPagination(document) {
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (
        !HTTP_METHODS.has(method) ||
        operation["x-kora-pagination"] !== "cursor"
      ) {
        continue;
      }
      if (
        !hasParameter(document, operation, "cursor", "query") ||
        !hasParameter(document, operation, "limit", "query")
      ) {
        fail(
          `${method.toUpperCase()} ${path} cursor pagination requires cursor and limit`,
        );
      }
    }
  }
  const limit = document.components.parameters.Limit.schema;
  if (limit.type !== "integer" || limit.minimum !== 1 || limit.maximum !== 50) {
    fail("cursor pagination limit must be an integer from 1 through 50");
  }
  const cursor = document.components.parameters.Cursor.schema;
  if (cursor.type !== "string" || cursor.maxLength !== 512) {
    fail("cursor must be an opaque bounded string");
  }
}

function validateIdempotency(document) {
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (
        !HTTP_METHODS.has(method) ||
        operation["x-kora-idempotent"] !== true
      ) {
        continue;
      }
      if (path.includes("-webhooks")) {
        continue;
      }
      if (!hasParameter(document, operation, "Idempotency-Key", "header")) {
        fail(
          `${method.toUpperCase()} ${path} is idempotent but lacks Idempotency-Key`,
        );
      }
      if (operation.responses?.["409"] === undefined) {
        fail(
          `${method.toUpperCase()} ${path} requires a stable idempotency conflict response`,
        );
      }
    }
  }
  const key = document.components.parameters.IdempotencyKey;
  if (
    key.required !== true ||
    key.schema.minLength < 16 ||
    key.schema.maxLength > 128
  ) {
    fail(
      "Idempotency-Key must be required and bounded from 16 through 128 characters",
    );
  }
}

function validateSafeSchemaSurface(document) {
  for (const [
    schemaName,
    expectedProperties,
  ] of SAFE_MEDIA_SURFACE_PROPERTIES) {
    const schema = document.components.schemas[schemaName];
    if (
      schema?.additionalProperties !== false ||
      !stableEqual(Object.keys(schema?.properties ?? {}), expectedProperties)
    ) {
      fail(`${schemaName} must expose only its exact safe media properties`);
    }
  }
  for (const [schemaName, expectedProperties] of ADMIN_REQUEST_PROPERTIES) {
    const schema = document.components.schemas[schemaName];
    if (!isExactObjectSchema(schema, expectedProperties, expectedProperties)) {
      fail(
        `${schemaName} must expose only its exact approved content-authority fields`,
      );
    }
  }
  walk(document.components.schemas, (value, location) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    for (const key of Object.keys(value.properties ?? {})) {
      if (
        FORBIDDEN_PUBLIC_FIELD.test(key) ||
        FORBIDDEN_PUBLIC_AUTH_HASH.test(key)
      ) {
        fail(
          `forbidden public field ${key} at ${location}/properties/${key}: raw media or private provider fields and server authentication hashes are not allowed`,
        );
      }
      if (/Cfa$/.test(key)) {
        const schema = dereference(document, value.properties[key]);
        if (schema?.type !== "integer" || !Number.isInteger(schema.minimum)) {
          fail(`money field ${key} must be an integer CFA amount`);
        }
      }
      if (/Bps$/.test(key)) {
        const schema = dereference(document, value.properties[key]);
        if (
          schema?.type !== "integer" ||
          schema.minimum !== 0 ||
          schema.maximum !== 10000
        ) {
          fail(
            `basis-point field ${key} must be an integer from 0 through 10000`,
          );
        }
      }
    }
  });
  if (document.components.schemas.MoneyCfa.type !== "integer") {
    fail("MoneyCfa must reject floating-point amounts");
  }
}

function validateMediaAndClientGates(document) {
  const previewPaths = [
    "/api/v1/mobile/audio/{contentId}/preview-grants",
    "/api/v1/mobile/preview-grants/{previewGrantId}/playback-descriptors",
    "/api/v1/mobile/audio/{contentId}/playback-descriptors",
  ];
  for (const path of previewPaths) {
    const clients = operationAt(document, path, "post")["x-kora-clients"];
    if (!stableEqual(clients, ["mobile"])) {
      fail(
        `${path} must remain mobile-only; web preview/playback is forbidden`,
      );
    }
  }

  const descriptor = document.components.schemas.PlaybackDescriptor;
  if (
    descriptor.readOnly !== true ||
    descriptor["x-kora-non-persistable"] !== true ||
    descriptor["x-kora-non-loggable"] !== true ||
    descriptor.properties.expiresInSeconds.maximum > 300 ||
    descriptor.properties.descriptor.type !== "string"
  ) {
    fail(
      "playback descriptors must be opaque, non-persistable and expire within 300 seconds",
    );
  }
  const preparation = document.components.schemas.MediaPreparation;
  if (
    preparation.readOnly !== true ||
    preparation["x-kora-non-persistable"] !== true ||
    preparation["x-kora-non-loggable"] !== true ||
    preparation.properties.expiresInSeconds.maximum > 300
  ) {
    fail(
      "media preparation must be opaque, non-persistable and expire within 300 seconds",
    );
  }
  const preview = operationAt(
    document,
    "/api/v1/mobile/audio/{contentId}/preview-grants",
    "post",
  );
  if (preview["x-kora-grant-type"] !== "PREVIEW_ONLY") {
    fail("anonymous preview must issue PreviewGrant only, never Entitlement");
  }
  for (const operation of [
    operationAt(
      document,
      "/api/v1/mobile/preview-grants/{previewGrantId}/playback-descriptors",
      "post",
    ),
    operationAt(
      document,
      "/api/v1/mobile/audio/{contentId}/playback-descriptors",
      "post",
    ),
    operationAt(
      document,
      "/api/v1/admin/media-assets/{mediaAssetId}/prepare",
      "post",
    ),
  ]) {
    if (
      operation["x-kora-non-persistable-response"] !== true ||
      operation["x-kora-non-loggable-response"] !== true
    ) {
      fail(
        `${operation.operationId} must mark its capability response non-persistable and non-loggable`,
      );
    }
  }
  const preparationOperation = operationAt(
    document,
    "/api/v1/admin/media-assets/{mediaAssetId}/prepare",
    "post",
  );
  if (
    preparationOperation["x-kora-idempotent-replay"] !==
    "REISSUE_SHORT_LIVED_CAPABILITY_FOR_SAME_MEDIA_ASSET_WITHOUT_PERSISTING_TOKEN"
  ) {
    fail(
      "media preparation replay must reissue a capability without persisting its token",
    );
  }

  const mediaWebhook = operationAt(
    document,
    "/api/v1/media-webhooks/mux",
    "post",
  );
  const muxRequest = document.components.schemas.MuxMediaWebhookRequest;
  if (
    !stableEqual(mediaWebhook["x-kora-clients"] ?? [], ["media-provider"]) ||
    mediaWebhook["x-kora-idempotent"] !== true ||
    mediaWebhook["x-kora-durable-before-ack"] !== true ||
    mediaWebhook["x-kora-never-publishes"] !== true ||
    mediaWebhook["x-kora-signature-algorithm"] !== "HMAC-SHA256" ||
    mediaWebhook["x-kora-signed-payload"] !== "TIMESTAMP_DOT_RAW_BODY" ||
    mediaWebhook["x-kora-raw-body-ingress-policy"] !==
      "BOUNDED_BEFORE_HMAC_PARSE_AND_ENCRYPTED_PERSISTENCE_APPROVAL_REQUIRED" ||
    mediaWebhook["x-kora-provider-event-key-source"] !== "BODY_ID" ||
    mediaWebhook["x-kora-persisted-payload"] !==
      "ENCRYPTED_RAW_BODY_WITH_SHA256" ||
    mediaWebhook.responses?.["202"] === undefined ||
    mediaWebhook.requestBody?.content?.["application/json"]?.schema?.$ref !==
      "#/components/schemas/MuxMediaWebhookRequest" ||
    !stableEqual(muxRequest?.required ?? [], ["data", "id", "type"]) ||
    muxRequest?.properties?.id?.type !== "string" ||
    muxRequest?.properties?.id?.minLength !== 1 ||
    muxRequest?.properties?.id?.maxLength !== 256 ||
    !stableEqual(muxRequest?.properties?.type?.enum ?? [], [
      "video.asset.ready",
      "video.asset.errored",
      "video.upload.asset_created",
    ]) ||
    muxRequest?.properties?.data?.type !== "object" ||
    muxRequest?.properties?.data?.additionalProperties !== true ||
    muxRequest?.additionalProperties !== true
  ) {
    fail(
      "Mux callbacks must be signature-authenticated, durable, idempotent and unable to publish",
    );
  }
  const accepted = document.components.schemas.WebhookAccepted;
  if (
    !isExactObjectSchema(
      accepted,
      ["duplicate", "inboxEventId", "received"],
      ["duplicate", "inboxEventId", "received"],
    ) ||
    accepted.properties?.inboxEventId?.$ref !==
      "#/components/schemas/Identifier" ||
    accepted.properties?.received?.type !== "boolean" ||
    accepted.properties?.received?.const !== true ||
    accepted.properties?.duplicate?.type !== "boolean"
  ) {
    fail("webhook acknowledgements must remain exact and closed");
  }
}

function validateCatalogReadinessGates(document) {
  if (
    JSON.stringify(document["x-kora-catalog-policy"] ?? {}) !==
    JSON.stringify(REQUIRED_CATALOG_POLICY)
  ) {
    fail("the global catalog cover and settled-sales policy has drifted");
  }

  const cover = document.components.schemas.PublicCoverImage;
  if (
    !isExactObjectSchema(
      cover,
      ["contentId", "mediaAssetVersion", "representation"],
      ["contentId", "mediaAssetVersion", "representation"],
    ) ||
    cover.readOnly !== true ||
    cover["x-kora-resolution-operation"] !== "getPublicAudioCover" ||
    cover["x-kora-content-binding"] !==
      "ROUTE_CONTENT_ID_AND_REQUIRED_MEDIA_ASSET_VERSION" ||
    cover.properties?.representation?.const !== "CONTROLLED_API" ||
    cover.properties?.mediaAssetVersion?.type !== "integer" ||
    cover.properties?.mediaAssetVersion?.minimum !== 1
  ) {
    fail("public cover metadata must resolve only through the controlled API");
  }
  const coverPath = "/api/v1/catalog/audio/{contentId}/cover";
  const coverPathItem = document.paths[coverPath];
  const coverOperation = operationAt(document, coverPath, "get");
  const coverVersionParameters = [
    ...(coverPathItem.parameters ?? []),
    ...(coverOperation.parameters ?? []),
  ]
    .map((entry) => dereference(document, entry))
    .filter((parameter) => parameter?.name === "mediaAssetVersion");
  if (coverVersionParameters.length !== 1) {
    fail(
      "getPublicAudioCover must declare exactly one mediaAssetVersion parameter",
    );
  }
  const [coverVersionParameter] = coverVersionParameters;
  if (
    coverOperation["x-kora-controlled-representation"] !== true ||
    coverOperation["x-kora-content-binding"] !==
      "ROUTE_CONTENT_ID_AND_REQUIRED_MEDIA_ASSET_VERSION" ||
    coverVersionParameter?.in !== "query" ||
    coverVersionParameter?.required !== true ||
    coverVersionParameter?.schema?.type !== "integer" ||
    coverVersionParameter?.schema?.minimum !== 1 ||
    coverOperation.responses?.["400"]?.$ref !==
      "#/components/responses/ClientError" ||
    !stableEqual(
      document["x-kora-operation-errors"]?.getPublicAudioCover ?? [],
      ["CONTENT_NOT_FOUND", "VALIDATION_ERROR"],
    ) ||
    coverOperation.responses?.["200"]?.content?.["image/*"]?.schema?.format !==
      "binary"
  ) {
    fail("public cover bytes require the exact controlled representation path");
  }
  for (const schemaName of ["AudioCatalogItem", "AudioContentDetail"]) {
    const schema = document.components.schemas[schemaName];
    const sales = schema?.properties?.settledSalesCount;
    if (
      !schema?.required?.includes("cover") ||
      !schema?.required?.includes("settledSalesCount") ||
      schema.properties?.cover?.$ref !==
        "#/components/schemas/PublicCoverImage" ||
      sales?.type !== "integer" ||
      sales?.minimum !== 0 ||
      sales?.readOnly !== true ||
      sales?.["x-kora-derivation"] !==
        "SETTLED_ORDER_ITEM_UNITS_MINUS_FULLY_REFUNDED_UNITS" ||
      sales?.["x-kora-pre-p4-value"] !== 0
    ) {
      fail(
        `${schemaName} must expose controlled cover metadata and real settled sales only`,
      );
    }
  }
  for (const [responseName, requestName] of [
    ["AdminArtist", "UpsertArtistRequest"],
    ["AdminAudioContent", "UpsertAudioContentRequest"],
  ]) {
    const response = document.components.schemas[responseName];
    const request = document.components.schemas[requestName];
    const expectedRequestProperties =
      requestName === "UpsertArtistRequest"
        ? ["stageName", "status"]
        : ["artistId", "description", "previewSeconds", "priceCfa", "title"];
    if (
      !response?.required?.includes("createdByAdminId") ||
      response.properties?.createdByAdminId?.$ref !==
        "#/components/schemas/Identifier" ||
      request?.properties?.createdByAdminId !== undefined ||
      request?.additionalProperties !== false ||
      !stableEqual(
        Object.keys(request?.properties ?? {}),
        expectedRequestProperties,
      )
    ) {
      fail(
        `${responseName} must expose server-assigned admin provenance and its content request must exclude finance authority`,
      );
    }
  }
  for (const [path, method] of [
    ["/api/v1/admin/artists", "post"],
    ["/api/v1/admin/artists/{artistId}", "patch"],
    ["/api/v1/admin/audio-content", "post"],
    ["/api/v1/admin/audio-content/{contentId}", "patch"],
  ]) {
    if (
      operationAt(document, path, method)["x-kora-provenance"] !==
      "AUTHENTICATED_ADMIN_ACTOR_IMMUTABLE"
    ) {
      fail(
        "catalog mutations must preserve immutable authenticated-admin provenance",
      );
    }
  }
}

function validateCommerceGates(document) {
  const provider = document.components.schemas.PaymentProvider;
  const operational = document.components.schemas.OperationalPaymentProvider;
  if (
    provider.const !== "SANDBOX_NEUTRAL" ||
    operational.properties.code.const !== "SANDBOX_NEUTRAL" ||
    operational.properties.status.const !== "OPERATIONAL"
  ) {
    fail("only the operational provider-neutral sandbox may appear in S1.2-01");
  }
  const providerList =
    document.components.schemas.OperationalProviderListEnvelope.properties.data;
  if (providerList.minItems !== 0 || providerList.maxItems !== 1) {
    fail(
      "the sandbox provider list must allow zero or one operational provider",
    );
  }

  const attempt = document.components.schemas.PaymentAttempt;
  const createAttempt = operationAt(
    document,
    "/api/v1/orders/{orderId}/payment-attempts",
    "post",
  );
  if (
    attempt.readOnly !== true ||
    createAttempt["x-kora-append-only"] !== true
  ) {
    fail("PaymentAttempt must be immutable and retries must append attempts");
  }
  const attemptMethods = Object.keys(
    document.paths[
      "/api/v1/orders/{orderId}/payment-attempts/{paymentAttemptId}"
    ],
  );
  if (!stableEqual(attemptMethods, ["get"])) {
    fail(
      "PaymentAttempt resources must expose GET only and cannot be overwritten",
    );
  }

  const webhook = operationAt(
    document,
    "/api/v1/payment-webhooks/{provider}",
    "post",
  );
  if (
    webhook["x-kora-idempotent"] !== true ||
    webhook["x-kora-durable-before-ack"] !== true ||
    webhook.responses["202"] === undefined
  ) {
    fail("webhooks must be authenticated, durable-before-ack and idempotent");
  }
}

function validatePublicationAndArchiveGates(document) {
  const publish = operationAt(
    document,
    "/api/v1/admin/audio-content/{contentId}/publish",
    "post",
  );
  if (
    publish["x-kora-precondition"] !==
      "MEDIA_ASSET_READY_AT_EXPECTED_VERSION" ||
    publish.responses["409"]?.$ref !== "#/components/responses/PublishConflict"
  ) {
    fail(
      "publishing must expose stable conflicts and require exact ready media versions",
    );
  }
  if (
    publish["x-kora-republication"] !==
      "APPEND_NEW_CONTENT_PUBLICATION_PRESERVE_HISTORY" ||
    !stableEqual(
      document["x-kora-state-machines"]?.AudioEditorial?.transitions
        ?.ARCHIVED ?? [],
      ["PUBLISHED"],
    ) ||
    (document["x-kora-state-machines"]?.AudioEditorial?.terminal ?? [])
      .length !== 0
  ) {
    fail(
      "republishing archived content must append a new publication and preserve immutable history",
    );
  }
  const request = document.components.schemas.PublishAudioContentRequest;
  const requiredMedia = request.properties.requiredMediaAssets;
  const requiredKinds = (requiredMedia.allOf ?? []).map(
    (constraint) => constraint.contains?.properties?.kind?.const,
  );
  if (
    !request.required.includes("requiredMediaAssets") ||
    requiredMedia.minItems !== 2 ||
    requiredMedia.maxItems !== 2 ||
    requiredMedia.uniqueItems !== true ||
    !stableEqual(requiredKinds, ["AUDIO_MASTER", "COVER_IMAGE"]) ||
    (requiredMedia.allOf ?? []).some(
      (constraint) =>
        constraint.minContains !== 1 || constraint.maxContains !== 1,
    )
  ) {
    fail(
      "publish request must bind one exact ready version of every required media kind",
    );
  }

  const archive = operationAt(
    document,
    "/api/v1/admin/audio-content/{contentId}/archive",
    "post",
  );
  const library = operationAt(document, "/api/v1/library/audio", "get");
  const libraryItem = document.components.schemas.LibraryAudioItem;
  if (
    archive["x-kora-preserves-entitlements"] !== true ||
    library["x-kora-includes-archived-entitlements"] !== true ||
    libraryItem.properties.archived?.type !== "boolean"
  ) {
    fail(
      "archived content must remain representable in the entitled buyer library",
    );
  }
}

function hasExactSecuritySchemes(operation, names) {
  if (names.length === 0) {
    return Array.isArray(operation.security) && operation.security.length === 0;
  }
  if (!Array.isArray(operation.security) || operation.security.length !== 1) {
    return false;
  }
  const requirement = operation.security[0];
  return (
    requirement !== null &&
    typeof requirement === "object" &&
    !Array.isArray(requirement) &&
    stableEqual(Object.keys(requirement), names) &&
    names.every(
      (name) =>
        Array.isArray(requirement[name]) && requirement[name].length === 0,
    )
  );
}

function validateAdminSecurityContract(document) {
  if (
    ADMIN_SECURITY_CONTRACTS.length !== 27 ||
    ADMIN_SECURITY_CONTRACTS.filter(({ slice }) => slice === "S1.2-03C1")
      .length !== 12 ||
    ADMIN_SECURITY_CONTRACTS.filter(({ slice }) => slice === "S1.2-03C2")
      .length !== 15
  ) {
    fail("admin-security inventory must lock 12 C1 and 15 C2 operations");
  }

  if (
    JSON.stringify(document["x-kora-admin-failure-audit-sinks"] ?? {}) !==
      JSON.stringify(Object.fromEntries(REQUIRED_ADMIN_FAILURE_AUDIT_SINKS)) ||
    JSON.stringify(document["x-kora-admin-public-failure-timing"] ?? {}) !==
      JSON.stringify(
        Object.fromEntries(REQUIRED_ADMIN_PUBLIC_FAILURE_TIMING),
      ) ||
    JSON.stringify(
      document["x-kora-admin-recovery-case-state-machine"] ?? {},
    ) !== JSON.stringify(REQUIRED_ADMIN_RECOVERY_CASE_STATE_MACHINE)
  ) {
    fail(
      "admin failure audit, public timing and recovery cancellation maps must be exact",
    );
  }

  const schemesByClass = {
    PUBLIC: [],
    PREAUTH: ["adminPreAuthCookie", "adminCsrfCookie", "adminCsrfHeader"],
    REFRESH: ["adminRefreshCookie", "adminCsrfCookie", "adminCsrfHeader"],
    ADMIN_SESSION: ["adminSession"],
  };

  for (const contract of ADMIN_SECURITY_CONTRACTS) {
    const operation = operationAt(document, contract.path, contract.method);
    const response = operation.responses?.[contract.success[0]];
    const bodyRef =
      operation.requestBody?.content?.["application/json"]?.schema?.$ref;
    if (
      operation.operationId !== contract.operationId ||
      !stableEqual(operation["x-kora-clients"] ?? [], ["admin-security"]) ||
      operation["x-kora-delivery-slice"] !== contract.slice ||
      operation["x-kora-auth-class"] !== contract.authClass ||
      !stableEqual(operation["x-kora-roles"] ?? [], contract.roles) ||
      operation["x-kora-step-up-required"] !== contract.stepUp ||
      (operation["x-kora-idempotent"] === true) !== contract.idempotent ||
      (operation["x-kora-reason-required"] === true) !==
        (contract.reasonRequired === true) ||
      !hasExactSecuritySchemes(operation, schemesByClass[contract.authClass])
    ) {
      fail(
        `${contract.operationId} must preserve its exact slice, authorization, role, step-up, reason and idempotency contract`,
      );
    }
    if (
      contract.method !== "get" &&
      (operation["x-kora-origin-policy"] !== "EXACT_ALLOWLIST" ||
        !hasParameter(document, operation, "Origin", "header"))
    ) {
      fail(`${contract.operationId} requires exact Origin enforcement`);
    }
    if (
      (contract.request === null && operation.requestBody !== undefined) ||
      (contract.request !== null &&
        (operation.requestBody?.required !== true ||
          !stableEqual(Object.keys(operation.requestBody?.content ?? {}), [
            "application/json",
          ]) ||
          bodyRef !== `#/components/schemas/${contract.request}` ||
          operation["x-kora-json-body-policy"] !== "APPLICATION_JSON_ONLY"))
    ) {
      fail(`${contract.operationId} request schema or JSON policy has drifted`);
    }
    if (
      !stableEqual(Object.keys(response?.headers ?? {}), contract.headers) ||
      (contract.headers.includes("Cache-Control") &&
        response.headers["Cache-Control"]?.$ref !==
          "#/components/headers/NoStore") ||
      (contract.headers.includes("X-Content-Type-Options") &&
        response.headers["X-Content-Type-Options"]?.$ref !==
          "#/components/headers/NoSniff")
    ) {
      fail(`${contract.operationId} response headers have drifted`);
    }
    const expectedAuditSink = REQUIRED_ADMIN_AUDIT_SINKS.get(
      contract.operationId,
    );
    if (operation["x-kora-audit-sink"] !== expectedAuditSink) {
      fail(`${contract.operationId} audit sink has drifted`);
    }
    if (
      document["x-kora-admin-failure-audit-sinks"]?.[contract.operationId] !==
      REQUIRED_ADMIN_FAILURE_AUDIT_SINKS.get(contract.operationId)
    ) {
      fail(`${contract.operationId} failure audit routing has drifted`);
    }
    if (
      expectedAuditSink === "ADMIN_SECURITY_EVENT" &&
      (contract.method === "get" ||
        operation["x-kora-security-record-atomic"] !== true ||
        operation["x-kora-transactional-audit"] !== undefined)
    ) {
      fail(
        `${contract.operationId} must atomically write AdminSecurityEvent without fabricating AuditLog context`,
      );
    }
    if (
      expectedAuditSink === "AUDIT_LOG" &&
      contract.method !== "get" &&
      operation["x-kora-transactional-audit"] !== true
    ) {
      fail(
        `${contract.operationId} successful proven mutation requires transactional AuditLog`,
      );
    }
    if (
      expectedAuditSink === "NONE" &&
      (operation["x-kora-transactional-audit"] !== undefined ||
        operation["x-kora-security-record-atomic"] !== undefined)
    ) {
      fail(`${contract.operationId} read-only audit policy has drifted`);
    }

    const expectedRateLimit =
      REQUIRED_ADMIN_RATE_LIMIT_PROFILES.get(contract.operationId) ?? null;
    if (
      (operation["x-kora-rate-limit-profile"] ?? null) !== expectedRateLimit
    ) {
      fail(`${contract.operationId} rate-limit profile has drifted`);
    }
    if (
      expectedRateLimit !== null &&
      (!document["x-kora-operation-errors"][contract.operationId].includes(
        "RATE_LIMITED",
      ) ||
        operation.responses?.["429"]?.$ref !==
          "#/components/responses/RateLimitedError")
    ) {
      fail(
        `${contract.operationId} rate limiting requires RATE_LIMITED, 429 and Retry-After`,
      );
    }
  }

  const login = operationAt(document, "/api/v1/admin/auth/login", "post");
  if (
    login["x-kora-fetch-metadata-policy"] !==
      "REJECT_CROSS_SITE_REQUIRE_SAME_ORIGIN" ||
    login["x-kora-audit-sink"] !== "ADMIN_SECURITY_EVENT"
  ) {
    fail("admin login requires exact Origin, Fetch Metadata and event sink");
  }

  if (
    [...REQUIRED_ADMIN_PUBLIC_FAILURE_TIMING].some(
      ([operationId, policy]) =>
        document["x-kora-admin-public-failure-timing"]?.[operationId] !==
        policy,
    )
  ) {
    fail(
      "login, reset and invitation public failures require exact comparable timing",
    );
  }

  const rateLimitedResponse = document.components.responses.RateLimitedError;
  if (
    rateLimitedResponse?.headers?.["Retry-After"]?.$ref !==
      "#/components/headers/RetryAfter" ||
    rateLimitedResponse?.content?.["application/json"]?.schema?.$ref !==
      "#/components/schemas/ErrorResponse"
  ) {
    fail("admin rate-limit response must expose safe Retry-After semantics");
  }

  if (
    JSON.stringify(document["x-kora-admin-security-policy"] ?? {}) !==
    JSON.stringify(REQUIRED_ADMIN_SECURITY_POLICY)
  ) {
    fail("the ADR-025 admin-security policy has drifted");
  }

  const securitySchemes = document.components.securitySchemes;
  const expectedApiKeys = {
    adminPreAuthCookie: ["cookie", "__Host-kora_admin_preauth"],
    adminRefreshCookie: ["cookie", "__Host-kora_admin_refresh"],
    adminCsrfCookie: ["cookie", "__Host-kora_admin_csrf"],
    adminCsrfHeader: ["header", "X-Kora-CSRF"],
  };
  for (const [name, [location, wireName]] of Object.entries(expectedApiKeys)) {
    const scheme = securitySchemes[name];
    if (
      scheme?.type !== "apiKey" ||
      scheme?.in !== location ||
      scheme?.name !== wireName
    ) {
      fail(`${name} must preserve its exact cookie/header wire contract`);
    }
  }

  const qr = operationAt(
    document,
    "/api/v1/admin/auth/totp/enrollments/{enrollmentId}/qr",
    "post",
  );
  if (
    qr.operationId !== "deliverAdminTotpEnrollmentQr" ||
    qr["x-kora-idempotent-replay"] !== "SECRET_RESPONSE_RETRY_409" ||
    qr["x-kora-non-persistable-response"] !== true ||
    qr["x-kora-non-loggable-response"] !== true ||
    !document["x-kora-operation-errors"].deliverAdminTotpEnrollmentQr.includes(
      "SENSITIVE_RESPONSE_ALREADY_DELIVERED",
    )
  ) {
    fail("TOTP QR delivery must remain unique, non-loggable and retry-409");
  }

  const refreshErrors =
    document["x-kora-operation-errors"].refreshAdminSession ?? [];
  if (
    !stableEqual(refreshErrors, ["AUTH_REFRESH_INVALID", "RATE_LIMITED"]) ||
    refreshErrors.includes("AUTH_REFRESH_REUSED")
  ) {
    fail("admin refresh replay must expose only AUTH_REFRESH_INVALID publicly");
  }

  const recoveryCodes = document.components.schemas.AdminRecoveryCodes;
  if (
    recoveryCodes?.additionalProperties !== false ||
    recoveryCodes?.properties?.codes?.minItems !== 10 ||
    recoveryCodes?.properties?.codes?.maxItems !== 10 ||
    recoveryCodes?.properties?.codes?.uniqueItems !== true ||
    recoveryCodes?.["x-kora-non-loggable"] !== true
  ) {
    fail("admin recovery-code delivery must contain exactly ten unique codes");
  }
  const recoveryInput =
    document.components.schemas.AdminRecoveryCodeVerificationRequest;
  if (
    !isExactObjectSchema(
      recoveryInput,
      ["selector", "verifier"],
      ["selector", "verifier"],
    ) ||
    recoveryInput.properties.verifier?.writeOnly !== true
  ) {
    fail("recovery code verification requires public selector plus verifier");
  }

  for (const schemaName of [
    "AdminPreAuth",
    "AdminTotpEnrollment",
    "AdminAccessSession",
    "AdminRecoveryContext",
    "AdminSessionSummary",
  ]) {
    const properties = Object.keys(
      document.components.schemas[schemaName]?.properties ?? {},
    );
    if (
      properties.some((name) =>
        /seed|secret|provisioning|refreshToken|encryptionKeyId/i.test(name),
      )
    ) {
      fail(`${schemaName} exposes forbidden admin authentication material`);
    }
  }

  for (const schemaName of [
    "AdminReasonRequest",
    "AdminRecoveryCaseCreateRequest",
    "AdminAuditExportRequest",
    "AdminInvitationCreateRequest",
    "AdminRoleChangeRequest",
    "AdminStatusChangeRequest",
  ]) {
    const schema = document.components.schemas[schemaName];
    if (
      !schema?.required?.includes("reasonCode") ||
      !schema?.required?.includes("operatorReason") ||
      schema.properties?.operatorReason?.minLength !== 3 ||
      schema.properties?.operatorReason?.maxLength !== 500
    ) {
      fail(`${schemaName} requires bounded reasonCode and operatorReason`);
    }
  }

  const audit = document.components.schemas.AdminAuditLogEntry;
  const auditProperties = [
    "action",
    "actorAdminUserId",
    "adminRecoveryContextId",
    "adminSessionId",
    "causationEventId",
    "context",
    "createdAt",
    "delegatedByAdminUserId",
    "entityId",
    "entityType",
    "eventClass",
    "eventId",
    "maskedAfter",
    "maskedBefore",
    "operatorReason",
    "reasonCode",
    "requestId",
    "subjectAdminUserId",
    "systemExecutionRefHash",
  ];
  const [sessionAudit, recoveryAudit, systemAudit] = audit.oneOf ?? [];
  if (
    !isExactObjectSchema(audit, auditProperties, auditProperties) ||
    audit.oneOf?.length !== 3 ||
    !stableEqual(
      audit.oneOf.map((branch) => branch.properties?.context?.const),
      ["ADMIN_SESSION", "ADMIN_RECOVERY", "SYSTEM"],
    ) ||
    sessionAudit?.properties?.actorAdminUserId?.type !== "string" ||
    sessionAudit?.properties?.adminSessionId?.type !== "string" ||
    sessionAudit?.properties?.adminRecoveryContextId?.type !== "null" ||
    sessionAudit?.properties?.systemExecutionRefHash?.type !== "null" ||
    sessionAudit?.properties?.delegatedByAdminUserId?.type !== "null" ||
    recoveryAudit?.properties?.actorAdminUserId?.type !== "string" ||
    recoveryAudit?.properties?.adminSessionId?.type !== "null" ||
    recoveryAudit?.properties?.adminRecoveryContextId?.type !== "string" ||
    recoveryAudit?.properties?.systemExecutionRefHash?.type !== "null" ||
    recoveryAudit?.properties?.delegatedByAdminUserId?.type !== "null" ||
    systemAudit?.properties?.actorAdminUserId?.type !== "null" ||
    systemAudit?.properties?.adminSessionId?.type !== "null" ||
    systemAudit?.properties?.adminRecoveryContextId?.type !== "null" ||
    systemAudit?.properties?.systemExecutionRefHash?.type !== "string" ||
    systemAudit?.oneOf?.length !== 2 ||
    systemAudit.oneOf[0]?.properties?.causationEventId?.type !== "null" ||
    systemAudit.oneOf[0]?.properties?.delegatedByAdminUserId?.type !== "null" ||
    systemAudit.oneOf[1]?.properties?.causationEventId?.type !== "string" ||
    systemAudit.oneOf[1]?.properties?.delegatedByAdminUserId?.type !==
      "string" ||
    !stableEqual(audit.properties?.eventClass?.enum ?? [], [
      "LOGIN",
      "SESSION",
      "EXPORT",
      "BUSINESS",
    ]) ||
    audit.properties?.reasonCode?.$ref !==
      "#/components/schemas/AdminReasonCode" ||
    audit.properties?.operatorReason?.minLength !== 3 ||
    audit.properties?.maskedBefore?.["x-kora-pii-redacted"] !== true ||
    audit.properties?.maskedAfter?.["x-kora-pii-redacted"] !== true
  ) {
    fail(
      "AuditLog must encode the complete ADR-004/019 evidence and strict ADR-025 discriminated context",
    );
  }

  const auditRead = operationAt(document, "/api/v1/admin/audit-logs", "get");
  const requiredAuditFilters = [
    "actorAdminUserId",
    "action",
    "entityType",
    "entityId",
    "createdFrom",
    "createdTo",
  ];
  if (
    auditRead["x-kora-filter-semantics"] !==
      "ALL_SUPPLIED_FILTERS_ARE_COMBINED_WITH_AND" ||
    requiredAuditFilters.some(
      (name) => !hasParameter(document, auditRead, name, "query"),
    )
  ) {
    fail(
      "audit read must preserve administrator, action, entity and date filters",
    );
  }

  const auditExportRequest =
    document.components.schemas.AdminAuditExportRequest;
  if (
    auditExportRequest?.["x-kora-filter-semantics"] !==
      "ALL_SUPPLIED_FILTERS_ARE_COMBINED_WITH_AND" ||
    ["actorAdminUserId", "action", "entityType", "entityId"].some(
      (name) => auditExportRequest.properties?.[name] === undefined,
    )
  ) {
    fail("audit export must preserve the same bounded evidence filters");
  }

  const recoveryCase = document.components.schemas.AdminRecoveryCase;
  if (
    recoveryCase?.oneOf?.length !== 2 ||
    recoveryCase.oneOf[0]?.properties?.state?.const !== "APPROVED" ||
    !recoveryCase.oneOf[0]?.required?.includes("approverAdminUserId") ||
    recoveryCase.oneOf[0]?.properties?.approverAdminUserId?.type !== "string" ||
    !stableEqual(recoveryCase.oneOf[1]?.properties?.state?.enum ?? [], [
      "PENDING",
      "CANCELLED",
      "EXPIRED",
    ]) ||
    recoveryCase.oneOf[1]?.properties?.approverAdminUserId?.type !== "null"
  ) {
    fail("approved recovery cases require a non-null distinct approver");
  }

  const auditExport = document.components.schemas.AdminAuditExport;
  const createAuditExport = operationAt(
    document,
    "/api/v1/admin/audit-log-exports",
    "post",
  );
  const auditExportContent = operationAt(
    document,
    "/api/v1/admin/audit-log-exports/{exportId}/content",
    "get",
  );
  if (
    auditExport?.oneOf?.length !== 2 ||
    !stableEqual(auditExport.oneOf[0]?.properties?.state?.enum ?? [], [
      "READY",
      "EXPIRED",
    ]) ||
    auditExport.oneOf[0]?.properties?.expiresAt?.type !== "string" ||
    auditExport.oneOf[0]?.properties?.contentSha256?.type !== "string" ||
    auditExport.oneOf[0]?.properties?.signatureKeyId?.type !== "string" ||
    !stableEqual(auditExport.oneOf[1]?.properties?.state?.enum ?? [], [
      "PENDING",
      "PROCESSING",
      "FAILED",
    ]) ||
    createAuditExport["x-kora-pii-redacted"] !== true ||
    auditExportContent["x-kora-pii-redacted"] !== true ||
    JSON.stringify(auditExportContent["x-kora-signed-manifest"] ?? {}) !==
      JSON.stringify(REQUIRED_ADMIN_AUDIT_EXPORT_MANIFEST)
  ) {
    fail(
      "audit exports require redacted evidence, signed manifest metadata and state-bound expiry",
    );
  }

  if (
    !stableEqual(document["x-kora-operation-errors"].resetAdminPassword, [
      "ADMIN_RECOVERY_INVALID",
      "RATE_LIMITED",
    ]) ||
    !stableEqual(document["x-kora-operation-errors"].acceptAdminInvitation, [
      "ADMIN_INVITATION_INVALID",
      "RATE_LIMITED",
      "VALIDATION_ERROR",
    ])
  ) {
    fail("public reset and invitation errors must not reveal secret state");
  }

  const errorDetails = document.components.schemas.ErrorDetails;
  if (
    errorDetails.properties?.operatorReason?.minLength !== 3 ||
    errorDetails.properties?.operatorReason?.maxLength !== 500 ||
    !errorDetails.properties?.reason?.enum?.includes("REQUIRED")
  ) {
    fail(
      "missing operator reason must use ErrorDetails.operatorReason/REQUIRED",
    );
  }

  for (const operationId of [
    "listAdminArtists",
    "getAdminArtist",
    "listAdminAudioContent",
    "getAdminAudioContent",
    "getPrivateMediaAssetStatus",
  ]) {
    if (ADMIN_OPERATION_ROLES.get(operationId)?.includes("SUPPORT")) {
      fail("SUPPORT must not retain historical Artist/Audio/Media reads");
    }
  }

  for (const operationId of ["changeAdminUserRole", "changeAdminUserStatus"]) {
    const contract = ADMIN_SECURITY_CONTRACTS.find(
      (entry) => entry.operationId === operationId,
    );
    const operation = operationAt(document, contract.path, contract.method);
    if (operation["x-kora-self-change-forbidden"] !== true) {
      fail(`${operationId} must forbid self role/status changes`);
    }
  }

  const exportContent = operationAt(
    document,
    "/api/v1/admin/audit-log-exports/{exportId}/content",
    "get",
  );
  if (
    exportContent["x-kora-step-up-required"] !== true ||
    !stableEqual(
      document["x-kora-operation-errors"].downloadAdminAuditLogExport,
      [
        "AUDIT_EXPORT_EXPIRED",
        "AUDIT_EXPORT_NOT_FOUND",
        "AUDIT_EXPORT_NOT_READY",
        "AUTH_REQUIRED",
        "FORBIDDEN",
      ],
    )
  ) {
    fail(
      "audit export content requires bearer, step-up and 404/409/410 states",
    );
  }
}

export function validateOpenApiDocument(document) {
  if (document.openapi !== "3.1.0") {
    fail("openapi must be exactly 3.1.0");
  }
  if (
    document.info?.title !== "KORA+ Audio Pilot API" ||
    document.info?.version !== "1.2.1" ||
    document["x-kora-scope"] !== "S1.2_03B_ADMIN_SECURITY_CONTRACT_GATE"
  ) {
    fail(
      "S1.2-03B admin-security contract title, version or scope is incorrect",
    );
  }
  if (!stableEqual(Object.keys(document.paths ?? {}), EXPECTED_PATHS)) {
    fail(
      `paths must be exactly the ${EXPECTED_PATHS.length} approved S1.2-03B paths`,
    );
  }
  if (
    !stableEqual(
      Object.keys(document.components?.schemas ?? {}),
      EXPECTED_SCHEMAS,
    )
  ) {
    fail(
      `schemas must be exactly the ${EXPECTED_SCHEMAS.length} approved schemas`,
    );
  }
  if (!stableEqual(document["x-kora-invariants"] ?? [], REQUIRED_INVARIANTS)) {
    fail("the formal S1.2-01 invariant set is incomplete or has drifted");
  }

  validateReferences(document);
  validateOperationShape(document);
  validateAdminSecurityContract(document);
  validateStateMachines(document);
  validateErrorsAndAuthorization(document);
  validateSafeSchemaSurface(document);
  validateAuthenticationContract(document);
  validateExamples(document);
  validateArtistEarningPolicy(document);
  validateCursorPagination(document);
  validateIdempotency(document);
  validateMediaAndClientGates(document);
  validateCatalogReadinessGates(document);
  validateCommerceGates(document);
  validatePublicationAndArchiveGates(document);

  return {
    invariants: REQUIRED_INVARIANTS.length,
    operations: EXPECTED_OPERATIONS.size,
    paths: EXPECTED_PATHS.length,
    references: "resolved",
    schemas: Object.keys(document.components.schemas).length,
  };
}

export function stripPrismaComments(source) {
  let stripped = "";
  let state = "code";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (state === "string") {
      if (character === "\r" || character === "\n") {
        fail(
          "Prisma target schema contains an unterminated string literal before a line break",
        );
      }
      stripped += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        state = "code";
      }
      continue;
    }

    if (state === "line-comment") {
      if (character === "\r" || character === "\n") {
        stripped += character;
        state = "code";
      } else {
        stripped += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        stripped += "  ";
        index += 1;
        state = "code";
      } else {
        stripped += character === "\r" || character === "\n" ? character : " ";
      }
      continue;
    }

    if (character === '"') {
      stripped += character;
      state = "string";
    } else if (character === "/" && next === "/") {
      stripped += "  ";
      index += 1;
      state = "line-comment";
    } else if (character === "/" && next === "*") {
      stripped += "  ";
      index += 1;
      state = "block-comment";
    } else {
      stripped += character;
    }
  }

  if (state === "block-comment") {
    fail("Prisma target schema contains an unterminated block comment");
  }
  if (state === "string") {
    fail(
      "Prisma target schema contains an unterminated string literal at end of file",
    );
  }
  return stripped;
}

function maskPrismaCodeLikeStringContents(source) {
  return source.replace(/"(?:\\.|[^"\\])*"/g, (literal) => {
    const content = literal.slice(1, -1);
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(content)) {
      return literal;
    }
    return `"${" ".repeat(content.length)}"`;
  });
}

function prismaModel(source, name) {
  const match = new RegExp(
    `model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`,
    "m",
  ).exec(source);
  if (!match?.[1]) {
    fail(`Prisma target schema is missing model ${name}`);
  }
  return match[1];
}

function hasExactPrismaLine(source, declaration) {
  const flags = declaration.flags.replace(/[gy]/g, "");
  const anchored = new RegExp(
    `^\\s*(?:${declaration.source})\\s*$`,
    flags.includes("m") ? flags : `${flags}m`,
  );
  return anchored.test(source);
}

export function validatePrismaTargetSchema(source) {
  source = maskPrismaCodeLikeStringContents(stripPrismaComments(source));
  const requiredModels = [
    "Customer",
    "CustomerDevice",
    "CustomerSession",
    "OtpChallenge",
    "AdminUser",
    "AdminSession",
    "AdminRecoveryCode",
    "Artist",
    "AudioContent",
    "MediaAsset",
    "MediaWebhookInbox",
    "ContentPublication",
    "PublicationMediaAsset",
    "Order",
    "OrderItem",
    "OrderStateEvent",
    "PaymentAttempt",
    "PaymentAttemptEvent",
    "PaymentWebhookInbox",
    "OutboxEvent",
    "Settlement",
    "ArtistSettlement",
    "LedgerAccount",
    "LedgerTransactionGroup",
    "LedgerPosting",
    "ArtistEarning",
    "Entitlement",
    "PreviewGrant",
    "PreviewPlaybackDescriptor",
    "PurchasedPlaybackDescriptor",
    "IdempotencyRecord",
    "AdminIdempotencyRecord",
    "AuditLog",
  ];
  const actualModels = [
    ...source.matchAll(/^model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{/gm),
  ].map((match) => match[1]);
  if (!stableEqual(actualModels, requiredModels)) {
    fail(
      `Prisma target models must be exactly the ${requiredModels.length} approved models`,
    );
  }
  for (const name of requiredModels) {
    prismaModel(source, name);
  }

  if (/\b(?:Float|Decimal)\b/.test(source)) {
    fail(
      "Prisma target schema must use integer CFA and basis-point fields only",
    );
  }
  const integerMoneyFields = [
    ...source.matchAll(/^\s+(\w+(?:Cfa|Bps))\s+(\w+)/gm),
  ];
  if (
    integerMoneyFields.length < 10 ||
    integerMoneyFields.some(([, , type]) => type !== "Int")
  ) {
    fail("every Prisma CFA/basis-point field must be Int");
  }

  const order = prismaModel(source, "Order");
  const attempt = prismaModel(source, "PaymentAttempt");
  if (
    !/paymentAttempts\s+PaymentAttempt\[\]/.test(order) ||
    !/orderId\s+String/.test(attempt) ||
    !/currency\s+Currency\s+@default\(XOF\)/.test(order) ||
    !/currency\s+Currency\s+@default\(XOF\)/.test(attempt) ||
    !/enum Currency\s*\{\s*XOF\s*\}/m.test(source)
  ) {
    fail(
      "Order must precede attempts and both must use the XOF-only Currency enum",
    );
  }
  if (
    /updatedAt/.test(attempt) ||
    !/events\s+PaymentAttemptEvent\[\]/.test(attempt)
  ) {
    fail("PaymentAttempt must be immutable with append-only events");
  }
  if (!/@@unique\(\[orderId, idempotencyKey\]\)/.test(attempt)) {
    fail(
      "PaymentAttempt retries require an order-scoped idempotency constraint",
    );
  }
  const customer = prismaModel(source, "Customer");
  const customerDevice = prismaModel(source, "CustomerDevice");
  const customerSession = prismaModel(source, "CustomerSession");
  if (!/passwordHash\s+String/.test(customer)) {
    fail("Customer must persist only the server-side password hash");
  }
  if (
    !/refreshTokenHash\s+String\s+@unique/.test(customerSession) ||
    !/refreshTokenVersion\s+Int\s+@default\(1\)/.test(customerSession) ||
    !/lastOtpStepUpAt\s+DateTime\?/.test(customerSession)
  ) {
    fail(
      "CustomerSession must persist rotating refresh hashes and OTP step-up freshness",
    );
  }
  if (
    !/customer\s+Customer\s+@relation\(fields: \[customerId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      customerDevice,
    ) ||
    !/@@unique\(\[id, customerId\]\)/.test(customerDevice) ||
    !/customer\s+Customer\s+@relation\(fields: \[customerId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      customerSession,
    ) ||
    !/@@unique\(\[id, customerId\]\)/.test(customerSession) ||
    !/device\s+CustomerDevice\s+@relation\(fields: \[deviceId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      customerSession,
    )
  ) {
    fail(
      "CustomerSession must bind its device to the same customer through Restrict composite relations",
    );
  }
  const otpChallenge = prismaModel(source, "OtpChallenge");
  if (
    !/normalizedPhone\s+String/.test(otpChallenge) ||
    !/purpose\s+OtpPurpose/.test(otpChallenge) ||
    !/codeHash\s+String/.test(otpChallenge) ||
    !/customerId\s+String\?/.test(otpChallenge) ||
    !/customer\s+Customer\?\s+@relation\(fields: \[customerId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      otpChallenge,
    ) ||
    !/sessionId\s+String\?/.test(otpChallenge) ||
    !/session\s+CustomerSession\?\s+@relation\(fields: \[sessionId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      otpChallenge,
    ) ||
    !/pendingPasswordHash\s+String\?/.test(otpChallenge) ||
    !/passwordVerifiedAt\s+DateTime\?/.test(otpChallenge) ||
    !/deviceFingerprintHash\s+String/.test(otpChallenge) ||
    !/devicePlatform\s+DevicePlatform/.test(otpChallenge) ||
    !/attempts\s+Int\s+@default\(0\)/.test(otpChallenge) ||
    !/consumedAt\s+DateTime\?/.test(otpChallenge) ||
    !/@@index\(\[customerId, purpose, consumedAt\]\)/.test(otpChallenge) ||
    !/@@index\(\[sessionId, customerId\]\)/.test(otpChallenge)
  ) {
    fail(
      "OtpChallenge must persist the bounded password, customer, session and hashed-device context",
    );
  }
  const adminUser = prismaModel(source, "AdminUser");
  const adminSession = prismaModel(source, "AdminSession");
  const adminRecoveryCode = prismaModel(source, "AdminRecoveryCode");
  if (
    !hasExactPrismaLine(adminUser, /totpSecretEncrypted\s+String\?/) ||
    !hasExactPrismaLine(adminUser, /totpEnabledAt\s+DateTime\?/) ||
    !hasExactPrismaLine(adminUser, /sessions\s+AdminSession\[\]/) ||
    !hasExactPrismaLine(adminUser, /recoveryCodes\s+AdminRecoveryCode\[\]/) ||
    !hasExactPrismaLine(adminSession, /tokenFamilyId\s+String/) ||
    !hasExactPrismaLine(adminSession, /accessTokenJti\s+String\s+@unique/) ||
    !hasExactPrismaLine(adminSession, /refreshTokenHash\s+String\s+@unique/) ||
    !hasExactPrismaLine(
      adminSession,
      /refreshTokenVersion\s+Int\s+@default\(1\)/,
    ) ||
    !hasExactPrismaLine(adminSession, /lastTwoFactorAt\s+DateTime/) ||
    !hasExactPrismaLine(
      adminSession,
      /lastActivityAt\s+DateTime\s+@default\(now\(\)\)/,
    ) ||
    !hasExactPrismaLine(adminSession, /expiresAt\s+DateTime/) ||
    !hasExactPrismaLine(adminSession, /revokedAt\s+DateTime\?/) ||
    !hasExactPrismaLine(
      adminSession,
      /adminUser\s+AdminUser\s+@relation\(fields: \[adminUserId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    ) ||
    !hasExactPrismaLine(adminSession, /@@unique\(\[id, adminUserId\]\)/) ||
    !hasExactPrismaLine(
      adminSession,
      /@@unique\(\[adminUserId, tokenFamilyId\]\)/,
    ) ||
    !hasExactPrismaLine(adminRecoveryCode, /codeHash\s+String/) ||
    !hasExactPrismaLine(adminRecoveryCode, /usedAt\s+DateTime\?/) ||
    !hasExactPrismaLine(
      adminRecoveryCode,
      /adminUser\s+AdminUser\s+@relation\(fields: \[adminUserId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    ) ||
    !hasExactPrismaLine(
      adminRecoveryCode,
      /@@unique\(\[adminUserId, codeHash\]\)/,
    )
  ) {
    fail(
      "admin authentication readiness requires encrypted TOTP material, revocable sessions and hashed recovery codes",
    );
  }
  const artist = prismaModel(source, "Artist");
  const catalogAudioContent = prismaModel(source, "AudioContent");
  if (
    !hasExactPrismaLine(artist, /createdByAdminId\s+String/) ||
    !hasExactPrismaLine(
      artist,
      /createdByAdmin\s+AdminUser\s+@relation\("ArtistCreatedByAdmin", fields: \[createdByAdminId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    ) ||
    !hasExactPrismaLine(catalogAudioContent, /createdByAdminId\s+String/) ||
    !hasExactPrismaLine(
      catalogAudioContent,
      /createdByAdmin\s+AdminUser\s+@relation\("AudioContentCreatedByAdmin", fields: \[createdByAdminId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    ) ||
    !hasExactPrismaLine(
      catalogAudioContent,
      /artist\s+Artist\s+@relation\(fields: \[artistId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    )
  ) {
    fail(
      "Artist and AudioContent require server-owned admin provenance and Restrict relations",
    );
  }
  const entitlement = prismaModel(source, "Entitlement");
  if (
    !/settlementId\s+String/.test(entitlement) ||
    /settlementId\s+String\?/.test(entitlement) ||
    !/orderItem\s+OrderItem\s+@relation\(fields: \[orderItemId, orderId, audioContentId\], references: \[id, orderId, audioContentId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      entitlement,
    ) ||
    !/settlement\s+Settlement\s+@relation\(fields: \[settlementId, orderId\], references: \[id, orderId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      entitlement,
    ) ||
    !/order\s+Order\s+@relation\(fields: \[orderId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      entitlement,
    ) ||
    !/customer\s+Customer\s+@relation\(fields: \[customerId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      entitlement,
    ) ||
    !/@@unique\(\[id, customerId\]\)/.test(entitlement)
  ) {
    fail(
      "Entitlement must require a settlement and match its order item, content and customer",
    );
  }
  const inbox = prismaModel(source, "PaymentWebhookInbox");
  if (
    !hasExactPrismaLine(inbox, /@@unique\(\[provider, providerEventKey\]\)/)
  ) {
    fail("PaymentWebhookInbox requires provider/event deduplication");
  }
  const mediaAsset = prismaModel(source, "MediaAsset");
  const mediaInbox = prismaModel(source, "MediaWebhookInbox");
  if (
    !/enum MediaProvider\s*\{\s*MUX\s*\}/m.test(source) ||
    !hasExactPrismaLine(mediaAsset, /provider\s+MediaProvider\?/) ||
    !hasExactPrismaLine(mediaAsset, /privateProviderUploadRef\s+String\?/) ||
    !hasExactPrismaLine(mediaAsset, /privateProviderAssetRef\s+String\?/) ||
    !hasExactPrismaLine(
      mediaAsset,
      /@@unique\(\[provider, privateProviderUploadRef\]\)/,
    ) ||
    !hasExactPrismaLine(
      mediaAsset,
      /@@unique\(\[provider, privateProviderAssetRef\]\)/,
    ) ||
    !hasExactPrismaLine(
      mediaAsset,
      /audioContent\s+AudioContent\s+@relation\(fields: \[audioContentId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    ) ||
    !hasExactPrismaLine(mediaInbox, /providerEventKey\s+String/) ||
    !hasExactPrismaLine(mediaInbox, /eventType\s+String/) ||
    !hasExactPrismaLine(mediaInbox, /payloadHash\s+String/) ||
    !hasExactPrismaLine(mediaInbox, /encryptedPayload\s+String/) ||
    /(?:^|\n)\s*(?:rawPayload|payload)\s+/.test(mediaInbox) ||
    !hasExactPrismaLine(mediaInbox, /signatureVerifiedAt\s+DateTime/) ||
    !hasExactPrismaLine(
      mediaInbox,
      /processingStatus\s+InboxProcessingStatus\s+@default\(RECEIVED\)/,
    ) ||
    !hasExactPrismaLine(
      mediaInbox,
      /mediaAsset\s+MediaAsset\?\s+@relation\(fields: \[mediaAssetId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    ) ||
    !hasExactPrismaLine(
      mediaInbox,
      /@@unique\(\[provider, providerEventKey\]\)/,
    )
  ) {
    fail(
      "MediaWebhookInbox requires authenticated encrypted payloads, provider/event deduplication and Restrict linkage",
    );
  }
  const publication = prismaModel(source, "ContentPublication");
  const publicationMedia = prismaModel(source, "PublicationMediaAsset");
  if (
    !/mediaAssets\s+PublicationMediaAsset\[\]/.test(publication) ||
    !/@@index\(\[audioContentId, archivedAt\]\)/.test(publication) ||
    !/audioContent\s+AudioContent\s+@relation\(fields: \[audioContentId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      publication,
    ) ||
    !/publishedByAdmin\s+AdminUser\s+@relation\(fields: \[publishedByAdminId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      publication,
    ) ||
    !/@@unique\(\[publicationId, kind\]\)/.test(publicationMedia) ||
    !/publication\s+ContentPublication\s+@relation\(fields: \[publicationId, audioContentId\], references: \[id, audioContentId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      publicationMedia,
    ) ||
    !/mediaAsset\s+MediaAsset\s+@relation\(fields: \[mediaAssetId, audioContentId, kind, mediaAssetVersion\], references: \[id, audioContentId, kind, version\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      publicationMedia,
    )
  ) {
    fail(
      "ContentPublication must bind one exact ready version per required media kind",
    );
  }
  const settlement = prismaModel(source, "Settlement");
  if (
    /updatedAt|deletedAt/.test(settlement) ||
    !/order\s+Order\s+@relation\(fields: \[orderId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      settlement,
    ) ||
    !/paymentAttempt\s+PaymentAttempt\s+@relation\(fields: \[paymentAttemptId, orderId\], references: \[id, orderId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      settlement,
    ) ||
    !/succeededAttemptEvent\s+PaymentAttemptEvent\s+@relation\(fields: \[succeededAttemptEventId, paymentAttemptId\], references: \[id, paymentAttemptId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      settlement,
    ) ||
    !/@@unique\(\[paymentAttemptId, orderId\]\)/.test(settlement) ||
    !/@@unique\(\[succeededAttemptEventId, paymentAttemptId\]\)/.test(
      settlement,
    ) ||
    !/distributableBasisCfa\s+Int/.test(settlement) ||
    !/artistPayableAmountCfa\s+Int/.test(settlement) ||
    !/platformAmountCfa\s+Int/.test(settlement) ||
    !/artistAllocationPolicy\s+ArtistEarningAllocationPolicy\s+@default\(FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1\)/.test(
      settlement,
    ) ||
    !/reconciliationKey\s+String\s+@unique/.test(settlement) ||
    !/reconciledAt\s+DateTime/.test(settlement)
  ) {
    fail(
      "Settlement must bind its successful attempt and audited artist-allocation totals",
    );
  }
  const artistSettlement = prismaModel(source, "ArtistSettlement");
  if (
    /updatedAt|deletedAt/.test(artistSettlement) ||
    !/settlement\s+Settlement\s+@relation\(fields: \[settlementId, orderId\], references: \[id, orderId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      artistSettlement,
    ) ||
    !/artist\s+Artist\s+@relation\(fields: \[artistId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      artistSettlement,
    ) ||
    !/settlementSequence\s+BigInt/.test(artistSettlement) ||
    !/previousArtistSettlementId\s+String\?\s+@unique/.test(artistSettlement) ||
    !/previousArtistSettlement\s+ArtistSettlement\?\s+@relation\("ArtistSettlementCarry", fields: \[previousArtistSettlementId, artistId\], references: \[id, artistId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      artistSettlement,
    ) ||
    !/carryInNumerator\s+Int/.test(artistSettlement) ||
    !/exactEarningsNumerator\s+BigInt/.test(artistSettlement) ||
    !/exactNumerator\s+BigInt/.test(artistSettlement) ||
    !/payableAmountCfa\s+Int/.test(artistSettlement) ||
    !/carryOutNumerator\s+Int/.test(artistSettlement) ||
    !/allocationPolicy\s+ArtistEarningAllocationPolicy\s+@default\(FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1\)/.test(
      artistSettlement,
    ) ||
    !/@@unique\(\[settlementId, artistId\]\)/.test(artistSettlement) ||
    !/@@unique\(\[previousArtistSettlementId, artistId\]\)/.test(
      artistSettlement,
    ) ||
    !/@@unique\(\[id, artistId\]\)/.test(artistSettlement) ||
    !/@@unique\(\[id, settlementId, orderId, artistId\]\)/.test(
      artistSettlement,
    ) ||
    !/@@unique\(\[artistId, settlementSequence\]\)/.test(artistSettlement)
  ) {
    fail(
      "ArtistSettlement must serialize one same-artist predecessor carry with immutable exact totals",
    );
  }

  const earning = prismaModel(source, "ArtistEarning");
  for (const field of ["frozenBasisCfa", "artistRevenueShareBps"]) {
    if (!new RegExp(`${field}\\s+Int`).test(earning)) {
      fail(`ArtistEarning must freeze ${field}`);
    }
  }
  const audioContent = prismaModel(source, "AudioContent");
  if (
    !/enum ArtistEarningAllocationPolicy\s*\{\s*FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1\s*\}/m.test(
      source,
    ) ||
    !/@@unique\(\[id, artistId\]\)/.test(audioContent) ||
    !/settlementId\s+String/.test(earning) ||
    /settlementId\s+String\?/.test(earning) ||
    !/settlement\s+Settlement\s+@relation\(fields: \[settlementId, orderId\], references: \[id, orderId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      earning,
    ) ||
    !/artistSettlement\s+ArtistSettlement\s+@relation\(fields: \[artistSettlementId, settlementId, orderId, artistId\], references: \[id, settlementId, orderId, artistId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      earning,
    ) ||
    !/orderItem\s+OrderItem\s+@relation\(fields: \[orderItemId, orderId, audioContentId\], references: \[id, orderId, audioContentId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      earning,
    ) ||
    !/audioContent\s+AudioContent\s+@relation\(fields: \[audioContentId, artistId\], references: \[id, artistId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      earning,
    ) ||
    !/artist\s+Artist\s+@relation\(fields: \[artistId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      earning,
    )
  ) {
    fail(
      "ArtistEarning must match its reconciled settlement, order item, content and artist",
    );
  }
  if (
    !/@@unique\(\[orderItemId, orderId, audioContentId\]\)/.test(earning) ||
    !/@@unique\(\[artistSettlementId, settlementId, orderId, orderItemId, audioContentId, artistId\]\)/.test(
      earning,
    )
  ) {
    fail("ArtistEarning requires exact one-to-one and business-key uniqueness");
  }
  for (const field of [
    ["allocationPolicy", "ArtistEarningAllocationPolicy"],
    ["exactEarningNumerator", "BigInt"],
  ]) {
    if (!new RegExp(`${field[0]}\\s+${field[1]}`).test(earning)) {
      fail(`ArtistEarning allocation audit must persist ${field[0]}`);
    }
  }
  if (/updatedAt|deletedAt/.test(earning)) {
    fail("ArtistEarning must remain immutable after settlement");
  }
  const ledgerGroup = prismaModel(source, "LedgerTransactionGroup");
  const posting = prismaModel(source, "LedgerPosting");
  if (
    /updatedAt|deletedAt/.test(ledgerGroup) ||
    /updatedAt|deletedAt/.test(posting) ||
    !/correctionOfGroupId\s+String\?/.test(ledgerGroup) ||
    !/correctionOfGroup\s+LedgerTransactionGroup\?\s+@relation\("LedgerCorrection", fields: \[correctionOfGroupId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      ledgerGroup,
    ) ||
    !/corrections\s+LedgerTransactionGroup\[\]\s+@relation\("LedgerCorrection"\)/.test(
      ledgerGroup,
    ) ||
    !/postings\s+LedgerPosting\[\]/.test(ledgerGroup) ||
    !/group\s+LedgerTransactionGroup\s+@relation\(fields: \[groupId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      posting,
    ) ||
    !/account\s+LedgerAccount\s+@relation\(fields: \[accountId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      posting,
    ) ||
    !/direction\s+LedgerDirection/.test(posting) ||
    !/amountCfa\s+Int/.test(posting)
  ) {
    fail(
      "balanced append-only ledger groups require directed integer postings",
    );
  }
  const audit = prismaModel(source, "AuditLog");
  if (
    /^\s+(?:updatedAt|deletedAt)\s+/m.test(audit) ||
    !/^\s+action\s+String\s*$/m.test(audit) ||
    !/^\s+entityType\s+String\s*$/m.test(audit) ||
    !/^\s+entityId\s+String\s*$/m.test(audit) ||
    !/^\s+maskedBefore\s+Json\?\s*$/m.test(audit) ||
    !/^\s+maskedAfter\s+Json\?\s*$/m.test(audit) ||
    !/^\s+reason\s+String\s*$/m.test(audit) ||
    !/^\s+requestId\s+String\s*$/m.test(audit) ||
    !/^\s+createdAt\s+DateTime\s+@default\(now\(\)\)\s*$/m.test(audit) ||
    !/^\s+adminUser\s+AdminUser\s+@relation\(fields: \[adminUserId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)\s*$/m.test(
      audit,
    ) ||
    !/^\s+adminSession\s+AdminSession\s+@relation\(fields: \[adminSessionId, adminUserId\], references: \[id, adminUserId\], onDelete: Restrict, onUpdate: Restrict\)\s*$/m.test(
      audit,
    )
  ) {
    fail(
      "AuditLog must be append-only with complete actor, session, action, entity, masked change, reason, request and timestamp evidence",
    );
  }
  const customerIdempotency = prismaModel(source, "IdempotencyRecord");
  const adminIdempotency = prismaModel(source, "AdminIdempotencyRecord");
  const purchasedDescriptor = prismaModel(
    source,
    "PurchasedPlaybackDescriptor",
  );
  if (
    /responseBody/.test(customerIdempotency) ||
    /responseBody/.test(adminIdempotency) ||
    !/resourceType\s+String/.test(customerIdempotency) ||
    !/resourceId\s+String/.test(customerIdempotency) ||
    !/adminUserId\s+String/.test(adminIdempotency) ||
    !/adminUser\s+AdminUser\s+@relation\(fields: \[adminUserId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      adminIdempotency,
    ) ||
    !/order\s+Order\?\s+@relation\(fields: \[orderId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      customerIdempotency,
    ) ||
    !/@@unique\(\[id, customerId\]\)/.test(order) ||
    !/customer\s+Customer\s+@relation\(fields: \[customerId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      customerIdempotency,
    ) ||
    !/@@unique\(\[adminUserId, operation, idempotencyKey\]\)/.test(
      adminIdempotency,
    )
  ) {
    fail(
      "idempotency records must scope actors and never persist capability response bodies",
    );
  }
  if (
    !/customerId\s+String/.test(purchasedDescriptor) ||
    !/entitlement\s+Entitlement\s+@relation\(fields: \[entitlementId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      purchasedDescriptor,
    ) ||
    !/device\s+CustomerDevice\s+@relation\(fields: \[deviceId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/.test(
      purchasedDescriptor,
    )
  ) {
    fail(
      "PurchasedPlaybackDescriptor must bind entitlement and device to the same customer through Restrict composite relations",
    );
  }

  return {
    integerFinancialFields: integerMoneyFields.length,
    models: actualModels.length,
  };
}

export function readAndValidateOpenApi(
  path = OPENAPI_PATH,
  prismaPath = PRISMA_PATH,
) {
  let document;
  try {
    document = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("docs/api/openapi.yaml must be JSON-compatible YAML");
  }
  return {
    openapi: validateOpenApiDocument(document),
    prisma: validatePrismaTargetSchema(readFileSync(prismaPath, "utf8")),
  };
}

const direct =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    resolve(process.argv[1]).toLowerCase();

if (direct) {
  const result = readAndValidateOpenApi();
  console.log(
    `S1.2-03B admin-security contract valid: ${result.openapi.paths} paths, ${result.openapi.operations} operations, ${result.openapi.schemas} schemas, ${result.openapi.invariants} inherited invariants, ${result.prisma.models} unchanged target models.`,
  );
}
