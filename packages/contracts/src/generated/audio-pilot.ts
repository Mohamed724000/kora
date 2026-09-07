// Generated from docs/api/openapi.yaml by scripts/openapi/generate-contract-types.mjs.
// Do not edit by hand. Runtime clients are intentionally outside S1.1.

export const audioPilotPaths = [
  '/health/live',
  '/health/ready',
  '/api/v1/catalog/audio',
  '/api/v1/catalog/audio/{contentId}',
  '/api/v1/auth/otp/challenges',
  '/api/v1/auth/otp/challenges/{challengeId}/verify',
  '/api/v1/auth/sessions/refresh',
  '/api/v1/auth/sessions/current',
  '/api/v1/auth/devices',
  '/api/v1/orders',
  '/api/v1/orders/{orderId}',
  '/api/v1/orders/{orderId}/payment-attempts',
  '/api/v1/orders/{orderId}/payment-attempts/{paymentAttemptId}',
  '/api/v1/orders/{orderId}/receipt',
  '/api/v1/payment-providers',
  '/api/v1/payment-webhooks/{provider}',
  '/api/v1/library/audio',
  '/api/v1/mobile/audio/{contentId}/preview-grants',
  '/api/v1/mobile/preview-grants/{previewGrantId}/playback-descriptors',
  '/api/v1/mobile/audio/{contentId}/playback-descriptors',
  '/api/v1/admin/artists',
  '/api/v1/admin/artists/{artistId}',
  '/api/v1/admin/audio-content',
  '/api/v1/admin/audio-content/{contentId}',
  '/api/v1/admin/audio-content/{contentId}/publish',
  '/api/v1/admin/audio-content/{contentId}/archive',
  '/api/v1/admin/media-assets',
  '/api/v1/admin/media-assets/{mediaAssetId}',
  '/api/v1/admin/media-assets/{mediaAssetId}/prepare',
] as const;

export type AudioPilotPath = (typeof audioPilotPaths)[number];

export type Identifier = string;

export type Timestamp = string;

export type MoneyCfa = number;

export type BasisPoints = number;

export type ArtistEarningAllocationPolicyVersion = 'FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1';

export type ArtistEarningAllocationAudit = {
  readonly settlementId: Identifier;
  readonly artistSettlementId: Identifier;
  readonly orderId: Identifier;
  readonly orderItemId: Identifier;
  readonly audioContentId: Identifier;
  readonly artistId: Identifier;
  readonly policy: ArtistEarningAllocationPolicyVersion;
  readonly frozenBasisCfa: MoneyCfa;
  readonly artistRevenueShareBps: BasisPoints;
  readonly exactEarningNumerator: string;
};

export type SettlementArtistAllocationAudit = {
  readonly settlementId: Identifier;
  readonly artistSettlementId: Identifier;
  readonly artistId: Identifier;
  readonly settlementSequence: string;
  readonly previousArtistSettlementId: string | null;
  readonly policy: ArtistEarningAllocationPolicyVersion;
  readonly carryInNumerator: number;
  readonly exactEarningsNumerator: string;
  readonly exactNumerator: string;
  readonly payableAmountCfa: MoneyCfa;
  readonly carryOutNumerator: number;
  readonly earnings: ReadonlyArray<ArtistEarningAllocationAudit>;
};

export type CursorMeta = {
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type LivenessResponse = {
  readonly status: 'live';
};

export type DependencyHealth = {
  readonly latencyMs: number;
  readonly reason?: 'unavailable';
  readonly status: 'up' | 'down';
};

export type ReadinessResponse = {
  readonly checks: {
    readonly postgresql: DependencyHealth;
    readonly redis: DependencyHealth;
  };
  readonly status: 'ready' | 'not_ready';
};

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_REQUIRED'
  | 'AUTH_SESSION_REVOKED'
  | 'AUTH_REFRESH_REUSED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_TOO_MANY_ATTEMPTS'
  | 'CONTENT_NOT_FOUND'
  | 'CONTENT_MEDIA_NOT_READY'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ALREADY_SETTLED'
  | 'ALREADY_ENTITLED'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PAYMENT_PROVIDER_UNAVAILABLE'
  | 'PAYMENT_ATTEMPT_NOT_FOUND'
  | 'PAYMENT_ATTEMPT_TERMINAL'
  | 'PAYMENT_WEBHOOK_INVALID'
  | 'PROVIDER_SIGNATURE_INVALID'
  | 'ENTITLEMENT_REQUIRED'
  | 'DEVICE_NOT_REGISTERED'
  | 'PREVIEW_NOT_AVAILABLE'
  | 'PREVIEW_GRANT_INVALID'
  | 'PREVIEW_GRANT_EXPIRED'
  | 'RATE_LIMITED'
  | 'FORBIDDEN'
  | 'INVALID_STATE_TRANSITION'
  | 'MEDIA_ASSET_NOT_FOUND'
  | 'ARTIST_NOT_FOUND'
  | 'ARTIST_CONFLICT';

export type ErrorResponse = {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly retryable?: boolean;
  };
  readonly requestId: string;
};

export type PublishConflictError = {
  readonly error: {
    readonly code: 'CONTENT_MEDIA_NOT_READY' | 'IDEMPOTENCY_CONFLICT' | 'INVALID_STATE_TRANSITION';
    readonly message: string;
    readonly retryable?: boolean;
  };
  readonly requestId: string;
};

export type AudioEditorialState = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type MediaProcessingStatus =
  'PREPARING' | 'UPLOAD_PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export type AudioCatalogItem = {
  readonly contentId: Identifier;
  readonly title: string;
  readonly artist: ArtistSummary;
  readonly priceCfa: MoneyCfa;
  readonly durationSeconds: number;
  readonly previewAvailable: boolean;
  readonly previewSeconds: number;
};

export type AudioContentDetail = {
  readonly contentId: Identifier;
  readonly title: string;
  readonly description: string | null;
  readonly artist: ArtistSummary;
  readonly priceCfa: MoneyCfa;
  readonly durationSeconds: number;
  readonly previewAvailable: boolean;
  readonly previewSeconds: number;
};

export type ArtistSummary = {
  readonly artistId: Identifier;
  readonly stageName: string;
};

export type AudioCatalogPage = {
  readonly data: ReadonlyArray<AudioCatalogItem>;
  readonly meta: CursorMeta;
};

export type AudioContentEnvelope = {
  readonly data: AudioContentDetail;
};

export type MaliPhone = string;

export type OtpChallengeRequest = {
  readonly phone: MaliPhone;
  readonly purpose: 'REGISTER' | 'LOGIN' | 'STEP_UP';
};

export type OtpChallenge = {
  readonly challengeId: Identifier;
  readonly expiresAt: Timestamp;
  readonly retryAfterSeconds: number;
};

export type OtpChallengeEnvelope = {
  readonly data: OtpChallenge;
};

export type OtpVerificationRequest = {
  readonly code: string;
  readonly device: {
    readonly fingerprint: string;
    readonly platform: 'ANDROID' | 'IOS';
  };
};

export type RefreshSessionRequest = {
  readonly refreshToken: string;
};

export type Session = {
  readonly sessionId: Identifier;
  readonly deviceId: Identifier;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: Timestamp;
  readonly refreshExpiresAt: Timestamp;
};

export type SessionEnvelope = {
  readonly data: Session;
};

export type DeviceSummary = {
  readonly deviceId: Identifier;
  readonly platform: 'ANDROID' | 'IOS';
  readonly registeredAt: Timestamp;
  readonly lastSeenAt: Timestamp;
  readonly current: boolean;
};

export type DeviceListEnvelope = {
  readonly data: ReadonlyArray<DeviceSummary>;
};

export type OrderState = 'CREATED' | 'PAYMENT_PENDING' | 'SETTLED' | 'CANCELLED';

export type CreateOrderRequest = {
  readonly contentId: Identifier;
};

export type OrderLine = {
  readonly orderItemId: Identifier;
  readonly contentId: Identifier;
  readonly title: string;
  readonly unitPriceCfa: MoneyCfa;
};

export type OrderStateEvent = {
  readonly sequence: number;
  readonly state: OrderState;
  readonly recordedAt: Timestamp;
  readonly reasonCode?: string | null;
};

export type Order = {
  readonly orderId: Identifier;
  readonly currency: 'XOF';
  readonly totalCfa: MoneyCfa;
  readonly state: OrderState;
  readonly createdAt: Timestamp;
  readonly items: ReadonlyArray<OrderLine>;
  readonly stateHistory: ReadonlyArray<OrderStateEvent>;
};

export type OrderEnvelope = {
  readonly data: Order;
};

export type OrderPage = {
  readonly data: ReadonlyArray<Order>;
  readonly meta: CursorMeta;
};

export type PaymentProvider = 'SANDBOX_NEUTRAL';

export type PaymentAttemptState =
  'CREATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export type CreatePaymentAttemptRequest = {
  readonly provider: PaymentProvider;
};

export type PaymentAttemptEvent = {
  readonly sequence: number;
  readonly state: PaymentAttemptState;
  readonly recordedAt: Timestamp;
  readonly safeReasonCode?: string | null;
};

export type PaymentAttempt = {
  readonly paymentAttemptId: Identifier;
  readonly orderId: Identifier;
  readonly provider: PaymentProvider;
  readonly amountCfa: MoneyCfa;
  readonly currency: 'XOF';
  readonly state: PaymentAttemptState;
  readonly createdAt: Timestamp;
  readonly events: ReadonlyArray<PaymentAttemptEvent>;
};

export type PaymentAttemptEnvelope = {
  readonly data: PaymentAttempt;
};

export type PaymentAttemptPage = {
  readonly data: ReadonlyArray<PaymentAttempt>;
  readonly meta: CursorMeta;
};

export type OperationalPaymentProvider = {
  readonly code: 'SANDBOX_NEUTRAL';
  readonly displayName: 'Paiement sandbox';
  readonly status: 'OPERATIONAL';
};

export type OperationalProviderListEnvelope = {
  readonly data: ReadonlyArray<OperationalPaymentProvider>;
};

export type PaymentWebhookRequest = {
  readonly eventId: string;
  readonly paymentAttemptId: Identifier;
  readonly amountCfa: MoneyCfa;
  readonly currency: 'XOF';
  readonly state: PaymentAttemptState;
  readonly occurredAt: Timestamp;
};

export type WebhookAccepted = {
  readonly inboxEventId: Identifier;
  readonly received: true;
  readonly duplicate: boolean;
};

export type WebhookAcceptedEnvelope = {
  readonly data: WebhookAccepted;
};

export type Receipt = {
  readonly receiptId: Identifier;
  readonly orderId: Identifier;
  readonly totalCfa: MoneyCfa;
  readonly currency: 'XOF';
  readonly paidAt: Timestamp;
  readonly items: ReadonlyArray<OrderLine>;
};

export type ReceiptEnvelope = {
  readonly data: Receipt;
};

export type LibraryAudioItem = {
  readonly entitlementId: Identifier;
  readonly audioContentId: Identifier;
  readonly title: string;
  readonly artist: ArtistSummary;
  readonly source: 'PURCHASE';
  readonly grantedAt: Timestamp;
  readonly archived: boolean;
};

export type LibraryPage = {
  readonly data: ReadonlyArray<LibraryAudioItem>;
  readonly meta: CursorMeta;
};

export type PreviewGrant = {
  readonly previewGrantId: Identifier;
  readonly audioContentId: Identifier;
  readonly maxDurationSeconds: number;
  readonly expiresAt: Timestamp;
};

export type PreviewGrantEnvelope = {
  readonly data: PreviewGrant;
};

export type PurchasedPlaybackRequest = {
  readonly deviceId: Identifier;
};

export type PlaybackDescriptor = {
  readonly descriptor: string;
  readonly protocol: 'HLS';
  readonly expiresInSeconds: number;
  readonly expiresAt: Timestamp;
};

export type PlaybackDescriptorEnvelope = {
  readonly data: PlaybackDescriptor;
};

export type UpsertArtistRequest = {
  readonly stageName: string;
  readonly status: 'ACTIVE' | 'SUSPENDED';
};

export type AdminArtist = {
  readonly artistId: Identifier;
  readonly stageName: string;
  readonly status: 'ACTIVE' | 'SUSPENDED';
};

export type AdminArtistEnvelope = {
  readonly data: AdminArtist;
};

export type AdminArtistPage = {
  readonly data: ReadonlyArray<AdminArtist>;
  readonly meta: CursorMeta;
};

export type UpsertAudioContentRequest = {
  readonly artistId: Identifier;
  readonly title: string;
  readonly description: string | null;
  readonly priceCfa: MoneyCfa;
  readonly previewSeconds: number;
};

export type PublishAudioContentRequest = {
  readonly reason: string;
  readonly requiredMediaAssets: ReadonlyArray<RequiredReadyMediaAsset>;
};

export type RequiredReadyMediaAsset = {
  readonly expectedMediaAssetId: Identifier;
  readonly expectedMediaAssetVersion: number;
  readonly kind: 'AUDIO_MASTER' | 'COVER_IMAGE';
  readonly checksumSha256: string;
};

export type ArchiveAudioContentRequest = {
  readonly reason: string;
};

export type AdminAudioContent = {
  readonly contentId: Identifier;
  readonly title: string;
  readonly description?: string | null;
  readonly artist: ArtistSummary;
  readonly priceCfa: MoneyCfa;
  readonly previewSeconds: number;
  readonly editorialState: AudioEditorialState;
  readonly mediaAssets: ReadonlyArray<MediaAssetStatus>;
};

export type AdminAudioEnvelope = {
  readonly data: AdminAudioContent;
};

export type AdminAudioPage = {
  readonly data: ReadonlyArray<AdminAudioContent>;
  readonly meta: CursorMeta;
};

export type CreateMediaAssetRequest = {
  readonly audioContentId: Identifier;
  readonly kind: 'AUDIO_MASTER' | 'COVER_IMAGE';
  readonly checksumSha256: string;
};

export type PrepareMediaAssetRequest = {
  readonly byteLength: number;
  readonly checksumSha256: string;
};

export type MediaAssetStatus = {
  readonly mediaAssetId: Identifier;
  readonly kind: 'AUDIO_MASTER' | 'COVER_IMAGE';
  readonly processingStatus: MediaProcessingStatus;
  readonly version: number;
  readonly durationSeconds?: number | null;
  readonly safeFailureCode?: string | null;
};

export type MediaAssetEnvelope = {
  readonly data: MediaAssetStatus;
};

export type MediaPreparation = {
  readonly preparationToken: string;
  readonly expiresInSeconds: number;
  readonly expiresAt: Timestamp;
};

export type MediaPreparationEnvelope = {
  readonly data: MediaPreparation;
};
