// Generated from docs/api/openapi.yaml by scripts/openapi/generate-contract-types.mjs.
// Do not edit by hand. Runtime clients remain outside S1.2-03C2-P0.

export const audioPilotPaths = [
  '/health/live',
  '/health/ready',
  '/api/v1/catalog/audio',
  '/api/v1/catalog/audio/{contentId}',
  '/api/v1/catalog/audio/{contentId}/cover',
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/otp/challenges/{challengeId}/verify',
  '/api/v1/auth/step-up/challenges',
  '/api/v1/auth/step-up/challenges/{challengeId}/verify',
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
  '/api/v1/media-webhooks/mux',
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
  '/api/v1/admin/auth/login',
  '/api/v1/admin/auth/totp/enrollments',
  '/api/v1/admin/auth/totp/enrollments/{enrollmentId}/qr',
  '/api/v1/admin/auth/totp/enrollments/{enrollmentId}/confirm',
  '/api/v1/admin/auth/totp/verify',
  '/api/v1/admin/auth/recovery-codes/verify',
  '/api/v1/admin/auth/recovery-codes/rotate',
  '/api/v1/admin/auth/step-up',
  '/api/v1/admin/auth/sessions/refresh',
  '/api/v1/admin/auth/sessions/current',
  '/api/v1/admin/auth/sessions',
  '/api/v1/admin/auth/sessions/{sessionId}/revocations',
  '/api/v1/admin/auth/password/reset-requests',
  '/api/v1/admin/auth/password/reset',
  '/api/v1/admin/recovery-cases',
  '/api/v1/admin/recovery-cases/{caseId}',
  '/api/v1/admin/recovery-cases/{caseId}/approve',
  '/api/v1/admin/audit-logs',
  '/api/v1/admin/audit-log-exports',
  '/api/v1/admin/audit-log-exports/{exportId}',
  '/api/v1/admin/audit-log-exports/{exportId}/content',
  '/api/v1/admin/invitations',
  '/api/v1/admin/auth/invitations/accept',
  '/api/v1/admin/users',
  '/api/v1/admin/users/{adminUserId}/role-changes',
  '/api/v1/admin/users/{adminUserId}/status-changes',
] as const;

export type AudioPilotPath = (typeof audioPilotPaths)[number];

export const adminC1ContractPolicies = {
  enrollmentAuditRouting: {
    operationIds: ['createAdminTotpEnrollment', 'deliverAdminTotpEnrollmentQr'],
    serverProvenRecoveryContext: 'VALID_MFA_RECOVERY_BOUND_TO_ACTOR',
    requiredServerChecks: ['OWNERSHIP', 'ACTOR_BINDING', 'ACTIVE_STATE', 'NOT_EXPIRED'],
    clientEvidenceNeverSufficient: ['COOKIE', 'SELECTOR', 'IDENTIFIER'],
    provenContextSink: 'AUDIT_LOG_ADMIN_RECOVERY',
    unprovenContextSink: 'ADMIN_SECURITY_EVENT',
    successAndFailureRoutingExplicit: true,
    mutationAndSecurityRecordAtomic: true,
  },
  recoveryCodeRotation: {
    operationId: 'rotateAdminRecoveryCodes',
    stepUpMode: 'INLINE_TOTP_REQUEST_BODY',
    stepUpPurpose: 'RECOVERY_CODE_ROTATION',
    priorStepUpPolicy: 'NOT_REQUIRED_AND_DOES_NOT_SUBSTITUTE_FOR_BODY_TOTP',
    secondOtpRequired: false,
    totpCounterScope: 'GLOBAL_PER_ADMIN_USER_REJECT_REUSE',
    transactionEffects: [
      'CONSUME_TOTP_COUNTER',
      'REPLACE_RECOVERY_CODE_BATCH',
      'RECORD_IDEMPOTENCY',
      'WRITE_AUDIT_LOG',
    ],
    authorizesOtherPurpose: false,
  },
  sessionFamilies: {
    maximumActiveFamilies: 3,
    creationTiming: 'AFTER_COMPLETE_AUTHENTICATION',
    serializationLock: 'ADMIN_USER',
    activeFamilyDefinition: 'NOT_REVOKED_AND_IDLE_EXPIRY_AFTER_NOW_AND_ABSOLUTE_EXPIRY_AFTER_NOW',
    overflowPolicy: 'ATOMIC_LRU_EVICTION',
    lruOrder: ['lastActivityAt_ASC', 'createdAt_ASC', 'id_ASC'],
    transactionEffects: [
      'REVOKE_REQUIRED_ACTIVE_FAMILIES',
      'CREATE_NEW_FAMILY',
      'WRITE_AUDIT_RECORD',
    ],
    auditFailure: 'ROLLBACK_UNCOMMITTED_EFFECTS',
    refreshCreatesFamily: false,
  },
  unavailability: {
    operationIds: [
      'loginAdmin',
      'createAdminTotpEnrollment',
      'deliverAdminTotpEnrollmentQr',
      'confirmAdminTotpEnrollment',
      'verifyAdminTotp',
      'verifyAdminRecoveryCode',
      'rotateAdminRecoveryCodes',
      'stepUpAdminSession',
      'refreshAdminSession',
      'revokeCurrentAdminSession',
      'listAdminSessions',
      'revokeAdminSession',
    ],
    httpStatus: 503,
    errorCode: 'SERVICE_UNAVAILABLE',
    publicMessage: 'Service temporairement indisponible.',
    publicDetails: 'EMPTY_OBJECT',
    dependencyDisclosure: 'FORBIDDEN',
    requiredDependencyFailure: 'FAIL_CLOSED',
    criticalMutationWithoutDurableAudit: 'FORBIDDEN',
    auditDurabilityImpossible:
      'ROLLBACK_UNCOMMITTED_RETURN_SAFE_503_NEUTRALIZED_OPERATIONAL_OBSERVATION_NO_DURABLE_AUDIT_CLAIM',
    commitAcknowledgementLoss: 'UNKNOWN_OUTCOME_NO_SUCCESS_OR_SECRET_NO_BLIND_AUTOMATIC_RETRY',
    idempotencyAndSingleUseRulesPreserved: true,
  },
} as const;

export const adminC2ContractPolicies = {
  contract: {
    operationMatrix: {
      requestAdminPasswordReset: {
        roles: [],
        serverProof: 'NO_AUDIT_CONTEXT',
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: null,
        successSink: 'ADMIN_SECURITY_EVENT',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'ADMIN_SECURITY_EVENT',
        action: 'requestAdminPasswordReset',
        eventClass: 'LOGIN',
        entityType: 'ADMIN_PASSWORD_RESET_REQUEST',
        maskedSnapshots: ['REDACTED_SUBJECT_DIGEST', 'DELIVERY_REQUEST_STATE'],
        atomicity: 'RESET_REQUEST_ENCRYPTED_OUTBOX_AND_SECURITY_EVENT',
        asynchronousTransitions: ['NOTIFICATION_DELIVERY_SYSTEM_AUDIT'],
      },
      resetAdminPassword: {
        roles: [],
        serverProof:
          'SERVER_VERIFIED_PASSWORD_RESET_CONTEXT_BOUND_TO_ACTIVE_ADMIN_USER_NOT_EXPIRED_NOT_CONSUMED_NOT_REVOKED_CLIENT_INPUT_NEVER_SUFFICIENT',
        proofPurpose: 'PASSWORD_RESET',
        forbiddenProofPurpose: 'MFA_RECOVERY',
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_RECOVERY',
        successSink: 'AUDIT_LOG',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'AUDIT_LOG',
        action: 'resetAdminPassword',
        eventClass: 'LOGIN',
        entityType: 'ADMIN_USER',
        maskedSnapshots: [
          'PASSWORD_CREDENTIAL_VERSION',
          'AUTHORIZATION_VERSION',
          'SESSION_REVOCATION_STATE',
        ],
        atomicity:
          'CONSUME_RESET_CONTEXT_CHANGE_PASSWORD_INCREMENT_AUTHORIZATION_VERSION_REVOKE_SESSIONS_AND_AUDIT',
        asynchronousTransitions: [],
      },
      createAdminRecoveryCase: {
        roles: ['SUPER_ADMIN', 'SUPPORT'],
        serverProof: 'ACTIVE_ADMIN_SESSION_ROLE_AND_AUTHORIZATION_VERSION_RELOADED',
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: ['ACCOUNT_RECOVERY', 'SECURITY_RESPONSE'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'AUDIT_LOG',
        action: 'createAdminRecoveryCase',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_RECOVERY_CASE',
        maskedSnapshots: ['CASE_STATE', 'SUBJECT_ADMIN_USER_ID'],
        atomicity: 'CANCEL_OLDER_PENDING_CREATE_CASE_RECORD_IDEMPOTENCY_AND_AUDIT',
        asynchronousTransitions: ['SERVER_POLICY_CANCELLATION_SYSTEM_AUDIT'],
      },
      listAdminRecoveryCases: {
        roles: ['SUPER_ADMIN', 'SUPPORT'],
        serverProof: 'ACTIVE_ADMIN_SESSION_ROLE_AND_AUTHORIZATION_VERSION_RELOADED',
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'NONE',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'NONE',
        action: 'listAdminRecoveryCases',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_RECOVERY_CASE_SNAPSHOT',
        maskedSnapshots: ['SAFE_PROJECTION_DIGEST'],
        atomicity: 'MATERIALIZED_SAFE_SNAPSHOT_READ',
        asynchronousTransitions: [],
      },
      getAdminRecoveryCase: {
        roles: ['SUPER_ADMIN', 'SUPPORT'],
        serverProof: 'ACTIVE_ADMIN_SESSION_ROLE_AND_AUTHORIZATION_VERSION_RELOADED',
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'NONE',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'NONE',
        action: 'getAdminRecoveryCase',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_RECOVERY_CASE',
        maskedSnapshots: ['SAFE_CASE_PROJECTION'],
        atomicity: 'READ_ONLY',
        asynchronousTransitions: [],
      },
      approveAdminRecoveryCase: {
        roles: ['SUPER_ADMIN'],
        serverProof:
          'ACTIVE_ADMIN_SESSION_ROLE_AUTHORIZATION_VERSION_AND_FRESH_TOTP_STEP_UP_RELOADED',
        stepUpPurpose: 'RECOVERY_APPROVAL',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: ['ACCOUNT_RECOVERY', 'SECURITY_RESPONSE'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'AUDIT_LOG',
        action: 'approveAdminRecoveryCase',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_RECOVERY_CASE',
        maskedSnapshots: ['CASE_STATE', 'SUBJECT_AUTHORIZATION_AND_MFA_STATE'],
        atomicity:
          'CONSUME_CASE_RESET_SUBJECT_TO_PENDING_MFA_REVOKE_SECURITY_MATERIAL_RECORD_IDEMPOTENCY_AND_AUDIT',
        asynchronousTransitions: [],
      },
      listAdminAuditLogs: {
        roles: ['SUPER_ADMIN'],
        serverProof: 'ACTIVE_ADMIN_SESSION_ROLE_AND_AUTHORIZATION_VERSION_RELOADED',
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'AUDIT_LOG',
        action: 'listAdminAuditLogs',
        eventClass: 'EXPORT',
        entityType: 'AUDIT_LOG_SNAPSHOT',
        maskedSnapshots: ['FILTER_DIGEST', 'SNAPSHOT_BOUNDS'],
        atomicity: 'MATERIALIZE_SNAPSHOT_BEFORE_AUDIT_READ_EVENT_TO_EXCLUDE_SELF',
        asynchronousTransitions: [],
      },
      createAdminAuditLogExport: {
        roles: ['SUPER_ADMIN'],
        serverProof:
          'ACTIVE_ADMIN_SESSION_ROLE_AUTHORIZATION_VERSION_AND_FRESH_TOTP_STEP_UP_RELOADED',
        stepUpPurpose: 'AUDIT_EXPORT',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: ['AUDIT_EXPORT'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'AUDIT_LOG',
        action: 'createAdminAuditLogExport',
        eventClass: 'EXPORT',
        entityType: 'ADMIN_AUDIT_EXPORT',
        maskedSnapshots: ['FILTER_DIGEST', 'EXPORT_STATE'],
        atomicity: 'CREATE_IMMUTABLE_SNAPSHOT_EXPORT_JOB_RECORD_IDEMPOTENCY_AND_AUDIT',
        asynchronousTransitions: ['EXPORT_BUILD_SYSTEM_AUDIT', 'EXPORT_EXPIRY_SYSTEM_AUDIT'],
      },
      getAdminAuditLogExport: {
        roles: ['SUPER_ADMIN'],
        serverProof: 'ACTIVE_ADMIN_SESSION_ROLE_AND_AUTHORIZATION_VERSION_RELOADED',
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'AUDIT_LOG',
        action: 'getAdminAuditLogExport',
        eventClass: 'EXPORT',
        entityType: 'ADMIN_AUDIT_EXPORT',
        maskedSnapshots: ['EXPORT_STATE', 'INTEGRITY_METADATA'],
        atomicity: 'AUDIT_DURABLE_BEFORE_RESPONSE',
        asynchronousTransitions: [],
      },
      downloadAdminAuditLogExport: {
        roles: ['SUPER_ADMIN'],
        serverProof:
          'ACTIVE_ADMIN_SESSION_ROLE_AUTHORIZATION_VERSION_FRESH_TOTP_STEP_UP_AND_EXPORT_INTEGRITY_RELOADED',
        stepUpPurpose: 'AUDIT_EXPORT',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'AUDIT_LOG',
        action: 'downloadAdminAuditLogExport',
        eventClass: 'EXPORT',
        entityType: 'ADMIN_AUDIT_EXPORT',
        maskedSnapshots: ['EXPORT_STATE', 'INTEGRITY_METADATA'],
        atomicity: 'AUTHORIZATION_STEP_UP_INTEGRITY_AND_AUDIT_DURABLE_BEFORE_FIRST_BYTE',
        asynchronousTransitions: [],
      },
      createAdminInvitation: {
        roles: ['SUPER_ADMIN'],
        serverProof:
          'ACTIVE_ADMIN_SESSION_ROLE_AUTHORIZATION_VERSION_AND_FRESH_TOTP_STEP_UP_RELOADED',
        stepUpPurpose: 'INVITATION',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: ['INVITATION_ADMINISTRATION'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'AUDIT_LOG',
        action: 'createAdminInvitation',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_INVITATION',
        maskedSnapshots: ['CANONICAL_EMAIL_DIGEST', 'ROLE', 'INVITATION_STATE'],
        atomicity:
          'REVOKE_PRIOR_VALID_INVITATION_CREATE_INVITATION_ENCRYPTED_OUTBOX_RECORD_IDEMPOTENCY_AND_AUDIT',
        asynchronousTransitions: ['NOTIFICATION_DELIVERY_SYSTEM_AUDIT'],
      },
      acceptAdminInvitation: {
        roles: [],
        serverProof: 'NO_AUDIT_CONTEXT_PUBLIC_SINGLE_USE_INVITATION_CHECK',
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: null,
        successSink: 'ADMIN_SECURITY_EVENT',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'ADMIN_SECURITY_EVENT',
        action: 'acceptAdminInvitation',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_INVITATION',
        maskedSnapshots: ['INVITATION_STATE', 'PENDING_MFA_ACCOUNT_STATE'],
        atomicity: 'CONSUME_INVITATION_CREATE_PENDING_MFA_ACCOUNT_AND_SECURITY_EVENT',
        asynchronousTransitions: [],
      },
      listAdminUsers: {
        roles: ['SUPER_ADMIN'],
        serverProof: 'ACTIVE_ADMIN_SESSION_ROLE_AND_AUTHORIZATION_VERSION_RELOADED',
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'NONE',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'NONE',
        action: 'listAdminUsers',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_USER_SNAPSHOT',
        maskedSnapshots: ['SAFE_USER_PROJECTION_DIGEST'],
        atomicity: 'MATERIALIZED_SAFE_SNAPSHOT_READ',
        asynchronousTransitions: [],
      },
      changeAdminUserRole: {
        roles: ['SUPER_ADMIN'],
        serverProof:
          'ACTIVE_ADMIN_SESSION_ROLE_AUTHORIZATION_VERSION_AND_FRESH_TOTP_STEP_UP_RELOADED',
        stepUpPurpose: 'ROLE_CHANGE',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: ['ROLE_ADMINISTRATION'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'AUDIT_LOG',
        action: 'changeAdminUserRole',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_USER',
        maskedSnapshots: ['ROLE', 'AUTHORIZATION_VERSION', 'SESSION_REVOCATION_STATE'],
        atomicity:
          'CHANGE_ROLE_INCREMENT_AUTHORIZATION_VERSION_REVOKE_SESSIONS_RECORD_IDEMPOTENCY_AND_AUDIT',
        asynchronousTransitions: [],
      },
      changeAdminUserStatus: {
        roles: ['SUPER_ADMIN'],
        serverProof:
          'ACTIVE_ADMIN_SESSION_ROLE_AUTHORIZATION_VERSION_AND_FRESH_TOTP_STEP_UP_RELOADED',
        stepUpPurpose: 'STATUS_CHANGE',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: ['STATUS_ADMINISTRATION', 'SECURITY_RESPONSE'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        failureBeforeProof: 'ADMIN_SECURITY_EVENT',
        failureAfterProof: 'AUDIT_LOG',
        action: 'changeAdminUserStatus',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_USER',
        maskedSnapshots: ['STATUS', 'AUTHORIZATION_VERSION', 'SESSION_REVOCATION_STATE'],
        atomicity:
          'CHANGE_STATUS_INCREMENT_AUTHORIZATION_VERSION_REVOKE_SESSIONS_RECORD_IDEMPOTENCY_AND_AUDIT',
        asynchronousTransitions: [],
      },
    },
    passwordReset: {
      recoveryPurpose: 'PASSWORD_RESET',
      forbiddenSubstitutePurpose: 'MFA_RECOVERY',
      purposeCardinality: 'EXACTLY_ONE',
      contextMustPreexistCriticalTransaction: true,
      contextCreationInsideRolledBackCriticalTransactionForbidden: true,
      serverProofOnly: true,
      clientFieldNeverProof: true,
      oneShot: true,
      preserveTotpEnrollment: true,
      preserveRecoveryCodes: true,
      createsSession: false,
      bypassesMfa: false,
      effects: [
        'CHANGE_PASSWORD_ARGON2ID',
        'INCREMENT_AUTHORIZATION_VERSION',
        'REVOKE_ALL_SESSIONS',
        'CONSUME_PASSWORD_RESET_CONTEXT',
        'WRITE_ADMIN_RECOVERY_AUDIT',
      ],
      beforeProofSink: 'ADMIN_SECURITY_EVENT',
      afterProofSink: 'AUDIT_LOG_ADMIN_RECOVERY',
      unknownCommit: 'NEUTRAL_503_NO_SECOND_SINK_NO_BLIND_RETRY',
      futureModel: 'DEDICATED_PURPOSE_DISCRIMINATOR_WITHOUT_FICTITIOUS_RECOVERY_CODE_ID',
    },
    preControllerJson: {
      operationIds: [
        'requestAdminPasswordReset',
        'resetAdminPassword',
        'createAdminRecoveryCase',
        'approveAdminRecoveryCase',
        'createAdminAuditLogExport',
        'createAdminInvitation',
        'acceptAdminInvitation',
        'changeAdminUserRole',
        'changeAdminUserStatus',
      ],
      causalMatch:
        'EXPRESS_ENTITY_PARSE_FAILED_SYNTAX_ERROR_STATUS_400_POST_EXACT_ROUTE_REMAINDER_APPLICATION_JSON',
      response: 'CLOSED_ADMIN_400_VALIDATION_ERROR_SAME_REQUEST_ID_EMPTY_DETAILS_RETRYABLE_FALSE',
      securitySink: 'EXACTLY_ONE_ADMIN_SECURITY_EVENT',
      forbiddenEffects: ['AUDIT_LOG', 'COOKIE', 'SECRET', 'BUSINESS_MUTATION'],
      excluded: [
        'HTTP_413',
        'HTTP_415',
        'URI_ERROR',
        'OTHER_ERROR_FAMILIES',
        'OTHER_ROUTES',
        'GET',
        'PREFIX_MATCH',
      ],
      recorderFailure: 'NEUTRAL_503_NO_RETRY_NO_FALLBACK_NO_SECOND_SINK',
    },
    notificationAndPassword: {
      channels: ['EMAIL'],
      secretPresentation: 'MANUAL_CODE_NO_SECRET_IN_URL',
      port: 'NOTIFICATION_PORT',
      durableOutbox: true,
      transaction: 'BUSINESS_STATE_ENCRYPTED_OUTBOX_AND_SECURITY_SINK_ATOMIC',
      rawCodePersistence: 'FORBIDDEN',
      rawCodeLogging: 'FORBIDDEN',
      rawCodeAudit: 'FORBIDDEN',
      plaintextLifetime: 'TRANSIENT_TRANSPORT_ONLY',
      deliveryRevalidation: ['EXPIRATION', 'REVOCATION', 'REPLACEMENT'],
      providerAcknowledgement: 'SEPARATE_FROM_REQUEST_COMMIT',
      uncertainDelivery: 'REPRESENTED_NO_EXACTLY_ONCE_EMAIL_CLAIM',
      accepted202Meaning: 'DURABLY_ACCEPTED_NOT_DELIVERED',
      accountTimingLeak: 'FORBIDDEN',
      compromiseCheck: {
        provider: 'HIBP_PWNED_PASSWORDS_RANGE_API',
        request: 'SHA1_PREFIX_ONLY_WITH_PADDING',
        passwordSent: false,
        fullHashSent: false,
        failurePolicy: 'FAIL_CLOSED_ON_UNAVAILABLE_OR_UNUSABLE_RESPONSE',
        sha1Purpose: 'REMOTE_LOOKUP_ONLY',
        storage: 'ARGON2ID',
        inputEncoding: 'EXACT_UTF8_NO_UNICODE_NORMALIZATION',
        productionProviderCall: false,
        productionSdk: false,
        officialReference: 'https://haveibeenpwned.com/API/v3#PwnedPasswords',
      },
    },
    emailAndIdempotency: {
      emailComparison: 'ASCII_CASE_INSENSITIVE',
      deliverySpelling: 'PRESERVE_ACCEPTED_INPUT',
      plusRewrite: false,
      dotRewrite: false,
      rejectSpacesAndAmbiguousForms: true,
      migrationCollisionPreflight: 'SAME_COMPARISON_AS_LOGIN',
      collisionResolution: 'NO_AUTO_MERGE_DELETE_OR_REWRITE',
      invitationExistingAccount: 'CONFLICT',
      validInvitationCardinality: 'ONE_PER_CANONICAL_EMAIL',
      replacement: 'ATOMICALLY_REVOKE_OLD_INVITATION_AND_PENDING_DELIVERY',
      sameKeySamePayload: 'SAME_RESULT_NO_NEW_CODE_NO_NEW_DELIVERY',
      idempotentOperationIds: [
        'createAdminRecoveryCase',
        'approveAdminRecoveryCase',
        'createAdminAuditLogExport',
        'createAdminInvitation',
        'changeAdminUserRole',
        'changeAdminUserStatus',
      ],
      idempotencyWindowHours: 24,
      idempotencyScope: 'ACTOR_OPERATION_KEY_AND_PAYLOAD_DIGEST',
      differentPayload: 'HTTP_409_IDEMPOTENCY_CONFLICT',
      replay: 'RECHECK_CURRENT_AUTHORIZATION_DO_NOT_EXTEND_EXPIRY_DO_NOT_RETURN_SECRET',
    },
    pagination: {
      operationIds: ['listAdminRecoveryCases', 'listAdminAuditLogs', 'listAdminUsers'],
      defaultLimit: 25,
      maximumLimit: 50,
      order: ['createdAt_DESC', 'id_DESC'],
      cursor: 'OPAQUE_AUTHENTICATED_BOUND_TO_PRINCIPAL_OPERATION_AND_FILTERS',
      invalidCursor: 'HTTP_400_VALIDATION_ERROR',
      snapshot: 'SERVER_MATERIALIZED_SAFE_PROJECTION_CONSISTENT_TRANSACTION',
      authorizationReloadedEachPage: true,
      snapshotLifetimeMinutes: 15,
      maximumEntries: 10000,
      maximumUtf8Bytes: 26214400,
      overflow: 'EXPLICIT_RESTRICT_FILTERS_NO_TRUNCATION',
      auditSnapshotRule: 'MATERIALIZE_BEFORE_AUDIT_READ_EVENT_NO_SELF_INCLUSION',
      retentionMeaning: 'TECHNICAL_ONLY_NOT_LEGAL',
    },
    auditExport: {
      filterSemantics: 'ALL_SUPPLIED_FILTERS_ARE_COMBINED_WITH_AND',
      snapshot: 'IMMUTABLE',
      maximumEntries: 10000,
      maximumUncompressedUtf8Bytes: 26214400,
      truncation: 'FORBIDDEN',
      storage: 'PRIVATE_ENCRYPTED_OPAQUE_REFERENCE_NO_SIGNED_URL',
      expiresHoursAfterReady: 24,
      expiryDeletion: 'DERIVATIVE_ONLY',
      masking: 'POSITIVE_ALLOWLIST_BY_ACTION',
      forbiddenFields: ['SECRET', 'RAW_EMAIL', 'RAW_IP', 'FREE_FORM_JUSTIFICATION'],
      unknownField: 'OMIT_OR_MASK',
      keySeparation: ['ED25519_SIGNATURE', 'JWT', 'STORAGE_ENCRYPTION'],
      productionProvider: 'NOT_QUALIFIED',
      sourceOfTruth: 'POSTGRESQL',
      worker: 'BOUNDED_IDEMPOTENT_CLAIMS_AND_RETRIES',
      unknownCommit: 'RECONCILE_NO_BLIND_RETRY',
      beforeFirstByte: [
        'AUTHORIZATION',
        'STEP_UP_AUDIT_EXPORT',
        'INTEGRITY_VERIFICATION',
        'DURABLE_AUDIT',
      ],
      streamFailure: 'INTERRUPT_STREAM_NO_JSON_NO_FALSE_COMPLETION_AUDIT',
    },
    bootstrap: {
      interface: 'DEDICATED_CLI_OUTSIDE_OPENAPI',
      concurrency: 'POSTGRESQL_SINGLETON_GUARD',
      precondition: 'REFUSE_IF_ANY_ADMIN_USER_EXISTS',
      createdRole: 'SUPER_ADMIN',
      createdStatus: 'PENDING_MFA',
      precreatedTotp: false,
      precreatedRecoveryCodes: false,
      precreatedSession: false,
      secretInput: 'PROTECTED_STDIN_OR_SECRET_STORE_NEVER_ARGUMENT_OR_OUTPUT',
      transaction: 'CREATE_GUARD_AND_STANDALONE_SYSTEM_AUDIT_ATOMIC',
      output: 'NON_SECRET_IDENTIFIERS_AND_STATUS_ONLY',
      unknownCommit: 'NEUTRAL_NO_BLIND_RETRY',
      futureIdentity: 'DEDICATED_LEAST_PRIVILEGE_BOOTSTRAP_IDENTITY',
      implementedInP0: false,
    },
    futureDatabaseBoundary: {
      c1ReaderExpansion: 'FORBIDDEN',
      ownership: 'FORBIDDEN',
      membership: 'FORBIDDEN_BOTH_ORIENTATIONS',
      publicGrant: 'FORBIDDEN',
      defaultGrant: 'FORBIDDEN',
      grantOption: 'FORBIDDEN',
      auditSinks: 'INSERT_ONLY_NO_RETURNING',
      auditRead: 'MASKED_PROJECTION_ONLY',
      writerAndWorker: 'ONLY_REQUIRED_TABLES_COLUMNS_AND_TRANSITIONS',
      delivery: {
        C2a: 'ELEVEN_RESET_INVITATION_RECOVERY_USER_RBAC_OPERATIONS_PLUS_BOOTSTRAP_OUTSIDE_API',
        C2b: 'FOUR_AUDIT_AND_EXPORT_OPERATIONS',
        final: 'FIFTEEN_C2_OPERATIONS_PLUS_TWELVE_C1_OPERATIONS',
      },
      runtimeAuthorizationMeaning: 'NONE_P0_CONTRACT_ONLY',
      migrationPath: 'NOT_AUTHORIZED_IN_P0_EXACT_LITERAL_REQUIRED_BY_FUTURE_CTO_MANDATE',
      allowlists: {
        C2a: [
          'apps/api/src/admin-security/admin-security.module.ts',
          'apps/api/src/admin-security/admin-security.controller.ts',
          'apps/api/src/admin-security/admin-security.service.ts',
          'apps/api/src/admin-security/admin-security.repository.ts',
          'apps/api/src/admin-security/admin-notification.port.ts',
          'apps/api/src/admin-security/admin-password-compromise.port.ts',
          'apps/api/src/admin-security/admin-notification.worker.ts',
          'apps/api/src/admin-security/admin-bootstrap.command.ts',
          'apps/api/test/admin-security-c2a.integration.spec.ts',
          'apps/api/prisma/schema.prisma',
        ],
        C2b: [
          'apps/api/src/admin-security/admin-audit-query.service.ts',
          'apps/api/src/admin-security/admin-audit-export.service.ts',
          'apps/api/src/admin-security/admin-audit-export.worker.ts',
          'apps/api/test/admin-security-c2b.integration.spec.ts',
          'apps/api/prisma/schema.prisma',
        ],
      },
    },
    asynchronousAudit: {
      action: 'DISTINCT_FROM_INITIATING_HTTP_OPERATION_ID',
      context: 'SYSTEM',
      causality: 'REQUIRES_CAUSATION_EVENT_ID_AND_DELEGATED_BY_ADMIN_USER_ID',
    },
    productionQualification: {
      notificationProvider: 'NOT_QUALIFIED',
      pwnedPasswordProvider: 'NOT_QUALIFIED',
      exportStorageProvider: 'NOT_QUALIFIED',
      signatureKeyProvider: 'NOT_QUALIFIED',
      runtimeImplemented: false,
    },
  },
  unavailability: {
    operationIds: [
      'requestAdminPasswordReset',
      'resetAdminPassword',
      'createAdminRecoveryCase',
      'listAdminRecoveryCases',
      'getAdminRecoveryCase',
      'approveAdminRecoveryCase',
      'listAdminAuditLogs',
      'createAdminAuditLogExport',
      'getAdminAuditLogExport',
      'downloadAdminAuditLogExport',
      'createAdminInvitation',
      'acceptAdminInvitation',
      'listAdminUsers',
      'changeAdminUserRole',
      'changeAdminUserStatus',
    ],
    httpStatus: 503,
    errorCode: 'SERVICE_UNAVAILABLE',
    publicMessage: 'Service temporairement indisponible.',
    publicDetails: 'EMPTY_OBJECT',
    retryable: false,
    dependencyDisclosure: 'FORBIDDEN',
    requiredDependencyFailure: 'FAIL_CLOSED',
    criticalMutationWithoutDurableAudit: 'FORBIDDEN',
    auditDurabilityImpossible:
      'ROLLBACK_UNCOMMITTED_RETURN_SAFE_503_NEUTRALIZED_OPERATIONAL_OBSERVATION_NO_DURABLE_AUDIT_CLAIM',
    commitAcknowledgementLoss: 'UNKNOWN_OUTCOME_NO_SUCCESS_OR_SECRET_NO_BLIND_AUTOMATIC_RETRY',
    idempotencyAndSingleUseRulesPreserved: true,
  },
} as const;

export const adminSecurityOperations = [
  {
    path: '/api/v1/admin/auth/login',
    method: 'POST',
    operationId: 'loginAdmin',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'PUBLIC',
    securityRequirement: [],
    roles: [],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'ADMIN_SECURITY_EVENT',
    auditContextProof: null,
    failureAuditSink: 'ADMIN_SECURITY_EVENT',
    rateLimitProfile: 'PASSWORD',
    fetchMetadataPolicy: 'REJECT_CROSS_SITE_REQUIRE_SAME_ORIGIN',
    publicFailureTiming: 'ACCOUNT_UNKNOWN_BAD_PASSWORD_DISABLED_OR_LOCKED_COMPARABLE',
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminLoginRequest',
    },
    requestHeaders: [
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminPreAuthEnvelope',
      headers: ['Set-Cookie', 'Cache-Control', 'X-Content-Type-Options'],
    },
  },
  {
    path: '/api/v1/admin/auth/totp/enrollments',
    method: 'POST',
    operationId: 'createAdminTotpEnrollment',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'PREAUTH',
    securityRequirement: ['adminPreAuthCookie', 'adminCsrfCookie', 'adminCsrfHeader'],
    roles: [],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG_ADMIN_RECOVERY_IF_SERVER_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    auditContextProof:
      'SERVER_VERIFIED_MFA_RECOVERY_OWNERSHIP_ACTOR_BINDING_STATE_AND_EXPIRY_CLIENT_INPUT_NEVER_SUFFICIENT',
    failureAuditSink: 'AUDIT_LOG_ADMIN_RECOVERY_IF_SERVER_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: true,
      replay: 'REPLAY_SAME_RESPONSE_FOR_SAME_PAYLOAD_DIFFERENT_PAYLOAD_409',
    },
    request: null,
    requestHeaders: [
      {
        scheme: 'adminPreAuthCookie',
        in: 'cookie',
        name: '__Host-kora_admin_preauth',
        required: true,
      },
      {
        scheme: 'adminCsrfCookie',
        in: 'cookie',
        name: '__Host-kora_admin_csrf',
        required: true,
      },
      {
        scheme: 'adminCsrfHeader',
        in: 'header',
        name: 'X-Kora-CSRF',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '201',
      mediaType: 'application/json',
      schema: 'AdminTotpEnrollmentEnvelope',
      headers: ['Cache-Control', 'X-Content-Type-Options'],
    },
  },
  {
    path: '/api/v1/admin/auth/totp/enrollments/{enrollmentId}/qr',
    method: 'POST',
    operationId: 'deliverAdminTotpEnrollmentQr',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'PREAUTH',
    securityRequirement: ['adminPreAuthCookie', 'adminCsrfCookie', 'adminCsrfHeader'],
    roles: [],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG_ADMIN_RECOVERY_IF_SERVER_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    auditContextProof:
      'SERVER_VERIFIED_MFA_RECOVERY_OWNERSHIP_ACTOR_BINDING_STATE_AND_EXPIRY_CLIENT_INPUT_NEVER_SUFFICIENT',
    failureAuditSink: 'AUDIT_LOG_ADMIN_RECOVERY_IF_SERVER_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: true,
      replay: 'SECRET_RESPONSE_RETRY_409',
    },
    request: null,
    requestHeaders: [
      {
        scheme: 'adminPreAuthCookie',
        in: 'cookie',
        name: '__Host-kora_admin_preauth',
        required: true,
      },
      {
        scheme: 'adminCsrfCookie',
        in: 'cookie',
        name: '__Host-kora_admin_csrf',
        required: true,
      },
      {
        scheme: 'adminCsrfHeader',
        in: 'header',
        name: 'X-Kora-CSRF',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'image/png',
      schema: 'binary',
      headers: ['Cache-Control', 'X-Content-Type-Options'],
    },
  },
  {
    path: '/api/v1/admin/auth/totp/enrollments/{enrollmentId}/confirm',
    method: 'POST',
    operationId: 'confirmAdminTotpEnrollment',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'PREAUTH',
    securityRequirement: ['adminPreAuthCookie', 'adminCsrfCookie', 'adminCsrfHeader'],
    roles: [],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: 'TOTP',
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: true,
      replay: 'SECRET_RESPONSE_RETRY_409',
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminTotpVerificationRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminPreAuthCookie',
        in: 'cookie',
        name: '__Host-kora_admin_preauth',
        required: true,
      },
      {
        scheme: 'adminCsrfCookie',
        in: 'cookie',
        name: '__Host-kora_admin_csrf',
        required: true,
      },
      {
        scheme: 'adminCsrfHeader',
        in: 'header',
        name: 'X-Kora-CSRF',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminEnrollmentConfirmationEnvelope',
      headers: ['Set-Cookie', 'Cache-Control', 'X-Content-Type-Options'],
    },
  },
  {
    path: '/api/v1/admin/auth/totp/verify',
    method: 'POST',
    operationId: 'verifyAdminTotp',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'PREAUTH',
    securityRequirement: ['adminPreAuthCookie', 'adminCsrfCookie', 'adminCsrfHeader'],
    roles: [],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: 'TOTP',
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminTotpVerificationRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminPreAuthCookie',
        in: 'cookie',
        name: '__Host-kora_admin_preauth',
        required: true,
      },
      {
        scheme: 'adminCsrfCookie',
        in: 'cookie',
        name: '__Host-kora_admin_csrf',
        required: true,
      },
      {
        scheme: 'adminCsrfHeader',
        in: 'header',
        name: 'X-Kora-CSRF',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminSessionEnvelope',
      headers: ['Set-Cookie', 'Cache-Control', 'X-Content-Type-Options'],
    },
  },
  {
    path: '/api/v1/admin/auth/recovery-codes/verify',
    method: 'POST',
    operationId: 'verifyAdminRecoveryCode',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'PREAUTH',
    securityRequirement: ['adminPreAuthCookie', 'adminCsrfCookie', 'adminCsrfHeader'],
    roles: [],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: 'RECOVERY',
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminRecoveryCodeVerificationRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminPreAuthCookie',
        in: 'cookie',
        name: '__Host-kora_admin_preauth',
        required: true,
      },
      {
        scheme: 'adminCsrfCookie',
        in: 'cookie',
        name: '__Host-kora_admin_csrf',
        required: true,
      },
      {
        scheme: 'adminCsrfHeader',
        in: 'header',
        name: 'X-Kora-CSRF',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminRecoveryContextEnvelope',
      headers: ['Set-Cookie', 'Cache-Control', 'X-Content-Type-Options'],
    },
  },
  {
    path: '/api/v1/admin/auth/recovery-codes/rotate',
    method: 'POST',
    operationId: 'rotateAdminRecoveryCodes',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN', 'CONTENT_EDITOR', 'FINANCE_MANAGER', 'SUPPORT'],
    stepUpRequired: true,
    stepUpMode: 'INLINE_TOTP_REQUEST_BODY',
    stepUpPurpose: 'RECOVERY_CODE_ROTATION',
    priorStepUpPolicy: 'NOT_REQUIRED_AND_DOES_NOT_SUBSTITUTE_FOR_BODY_TOTP',
    totpCounterPolicy: 'GLOBAL_PER_ADMIN_USER_REJECT_REUSE',
    transactionalEffects: [
      'CONSUME_TOTP_COUNTER',
      'REPLACE_RECOVERY_CODE_BATCH',
      'RECORD_IDEMPOTENCY',
      'WRITE_AUDIT_LOG',
    ],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: 'TOTP',
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: true,
      replay: 'SECRET_RESPONSE_RETRY_409',
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminTotpVerificationRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminRecoveryCodesEnvelope',
      headers: ['Cache-Control', 'X-Content-Type-Options'],
    },
  },
  {
    path: '/api/v1/admin/auth/step-up',
    method: 'POST',
    operationId: 'stepUpAdminSession',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN', 'CONTENT_EDITOR', 'FINANCE_MANAGER', 'SUPPORT'],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: 'TOTP',
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminStepUpRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminStepUpEnvelope',
      headers: ['Cache-Control', 'X-Content-Type-Options'],
    },
  },
  {
    path: '/api/v1/admin/auth/sessions/refresh',
    method: 'POST',
    operationId: 'refreshAdminSession',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'REFRESH',
    securityRequirement: ['adminRefreshCookie', 'adminCsrfCookie', 'adminCsrfHeader'],
    roles: [],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: 'REFRESH',
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: null,
    requestHeaders: [
      {
        scheme: 'adminRefreshCookie',
        in: 'cookie',
        name: '__Host-kora_admin_refresh',
        required: true,
      },
      {
        scheme: 'adminCsrfCookie',
        in: 'cookie',
        name: '__Host-kora_admin_csrf',
        required: true,
      },
      {
        scheme: 'adminCsrfHeader',
        in: 'header',
        name: 'X-Kora-CSRF',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminSessionEnvelope',
      headers: ['Set-Cookie', 'Cache-Control', 'X-Content-Type-Options'],
    },
  },
  {
    path: '/api/v1/admin/auth/sessions/current',
    method: 'DELETE',
    operationId: 'revokeCurrentAdminSession',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN', 'CONTENT_EDITOR', 'FINANCE_MANAGER', 'SUPPORT'],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: null,
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '204',
      mediaType: null,
      schema: null,
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/auth/sessions',
    method: 'GET',
    operationId: 'listAdminSessions',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN', 'CONTENT_EDITOR', 'FINANCE_MANAGER', 'SUPPORT'],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'NONE',
    auditContextProof: null,
    failureAuditSink: 'NONE_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: null,
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminSessionPage',
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/auth/sessions/{sessionId}/revocations',
    method: 'POST',
    operationId: 'revokeAdminSession',
    deliverySlice: 'S1.2-03C1',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN'],
    stepUpRequired: true,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminReasonRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '204',
      mediaType: null,
      schema: null,
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/auth/password/reset-requests',
    method: 'POST',
    operationId: 'requestAdminPasswordReset',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'PUBLIC',
    securityRequirement: [],
    roles: [],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'ADMIN_SECURITY_EVENT',
    auditContextProof: null,
    failureAuditSink: 'ADMIN_SECURITY_EVENT',
    rateLimitProfile: 'RECOVERY',
    fetchMetadataPolicy: null,
    publicFailureTiming: 'ACCOUNT_UNKNOWN_OR_KNOWN_COMPARABLE',
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminPasswordResetRequest',
    },
    requestHeaders: [
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '202',
      mediaType: 'application/json',
      schema: 'AdminAcceptedEnvelope',
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/auth/password/reset',
    method: 'POST',
    operationId: 'resetAdminPassword',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'PUBLIC',
    securityRequirement: [],
    roles: [],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: 'RECOVERY',
    fetchMetadataPolicy: null,
    publicFailureTiming: 'UNKNOWN_EXPIRED_CONSUMED_REVOKED_OR_ACCOUNT_STATE_COMPARABLE',
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminPasswordResetCompletionRequest',
    },
    requestHeaders: [
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '204',
      mediaType: null,
      schema: null,
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/recovery-cases',
    method: 'POST',
    operationId: 'createAdminRecoveryCase',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN', 'SUPPORT'],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: true,
      replay: 'REPLAY_SAME_RESPONSE_FOR_SAME_PAYLOAD_DIFFERENT_PAYLOAD_409',
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminRecoveryCaseCreateRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '201',
      mediaType: 'application/json',
      schema: 'AdminRecoveryCaseEnvelope',
      headers: ['Location'],
    },
  },
  {
    path: '/api/v1/admin/recovery-cases',
    method: 'GET',
    operationId: 'listAdminRecoveryCases',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN', 'SUPPORT'],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'NONE',
    auditContextProof: null,
    failureAuditSink: 'NONE_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: null,
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
    ],
    queryParameters: [
      {
        name: 'cursor',
        required: false,
        schema: 'string',
        format: null,
      },
      {
        name: 'limit',
        required: false,
        schema: 'integer',
        format: null,
      },
    ],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminRecoveryCasePage',
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/recovery-cases/{caseId}',
    method: 'GET',
    operationId: 'getAdminRecoveryCase',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN', 'SUPPORT'],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'NONE',
    auditContextProof: null,
    failureAuditSink: 'NONE_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: null,
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminRecoveryCaseEnvelope',
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/recovery-cases/{caseId}/approve',
    method: 'POST',
    operationId: 'approveAdminRecoveryCase',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN'],
    stepUpRequired: true,
    stepUpMode: null,
    stepUpPurpose: 'RECOVERY_APPROVAL',
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: true,
      replay: 'REPLAY_SAME_RESPONSE_FOR_SAME_PAYLOAD_DIFFERENT_PAYLOAD_409',
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminReasonRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '204',
      mediaType: null,
      schema: null,
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/audit-logs',
    method: 'GET',
    operationId: 'listAdminAuditLogs',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN'],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: null,
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
    ],
    queryParameters: [
      {
        name: 'cursor',
        required: false,
        schema: 'string',
        format: null,
      },
      {
        name: 'limit',
        required: false,
        schema: 'integer',
        format: null,
      },
      {
        name: 'actorAdminUserId',
        required: false,
        schema: 'Identifier',
        format: null,
      },
      {
        name: 'action',
        required: false,
        schema: 'string',
        format: null,
      },
      {
        name: 'entityType',
        required: false,
        schema: 'string',
        format: null,
      },
      {
        name: 'entityId',
        required: false,
        schema: 'Identifier',
        format: null,
      },
      {
        name: 'createdFrom',
        required: false,
        schema: 'Timestamp',
        format: null,
      },
      {
        name: 'createdTo',
        required: false,
        schema: 'Timestamp',
        format: null,
      },
    ],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminAuditLogPage',
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/audit-log-exports',
    method: 'POST',
    operationId: 'createAdminAuditLogExport',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN'],
    stepUpRequired: true,
    stepUpMode: null,
    stepUpPurpose: 'AUDIT_EXPORT',
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: true,
      replay: 'REPLAY_SAME_RESPONSE_FOR_SAME_PAYLOAD_DIFFERENT_PAYLOAD_409',
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminAuditExportRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '202',
      mediaType: 'application/json',
      schema: 'AdminAuditExportEnvelope',
      headers: ['Location'],
    },
  },
  {
    path: '/api/v1/admin/audit-log-exports/{exportId}',
    method: 'GET',
    operationId: 'getAdminAuditLogExport',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN'],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: null,
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminAuditExportEnvelope',
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/audit-log-exports/{exportId}/content',
    method: 'GET',
    operationId: 'downloadAdminAuditLogExport',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN'],
    stepUpRequired: true,
    stepUpMode: null,
    stepUpPurpose: 'AUDIT_EXPORT',
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: {
      manifestPath: 'manifest.json',
      signaturePath: 'manifest.sig',
      canonicalization: 'RFC8785_JCS_UTF8',
      digestAlgorithm: 'SHA-256',
      signatureFormat: 'JWS_COMPACT_DETACHED',
      signatureAlgorithm: 'EdDSA',
      signatureCurve: 'Ed25519',
      payload: 'RFC8785_JCS_CANONICAL_MANIFEST_UTF8_BYTES',
      protectedHeader: 'EXACTLY_alg_EdDSA_AND_kid_SIGNATURE_KEY_ID',
      payloadEncoding: 'BASE64URL_NO_PADDING',
      unencodedPayload: false,
      signatureInput:
        'ASCII(BASE64URL_NO_PADDING(PROTECTED_HEADER_UTF8).BASE64URL_NO_PADDING(PAYLOAD))',
      detachedSerialization:
        'BASE64URL_NO_PADDING(PROTECTED_HEADER_UTF8)..BASE64URL_NO_PADDING(SIGNATURE)',
      payloadEntrySet: 'EXACTLY_ALL_ZIP_ENTRIES_EXCEPT_MANIFEST_JSON_AND_MANIFEST_SIG',
      payloadPathPolicy:
        'RELATIVE_FORWARD_SLASH_NFC_NO_DOT_SEGMENTS_NO_DOT_DOT_NO_ABSOLUTE_NO_BACKSLASH_UNIQUE_CASE_SENSITIVE',
      coverage:
        'CANONICAL_MANIFEST_BINDS_EXPORT_ID_CREATED_AT_EXPIRES_AT_AND_SORTED_UNIQUE_PAYLOAD_PATH_SIZE_SHA256',
      rejectUnlistedEntries: true,
      rejectMissingEntries: true,
      rejectDuplicateEntries: true,
      verificationKeyDistribution: 'ADMIN_DEPLOYMENT_TRUST_BUNDLE_BY_SIGNATURE_KEY_ID',
      keyRotation: 'OVERLAPPING_VERIFY_OLD_KEYS_UNTIL_ALL_REFERENCED_EXPORTS_EXPIRE',
    },
    idempotency: {
      required: false,
      replay: null,
    },
    request: null,
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/zip',
      schema: 'binary',
      headers: ['Cache-Control', 'X-Content-Type-Options', 'Content-Disposition'],
    },
  },
  {
    path: '/api/v1/admin/invitations',
    method: 'POST',
    operationId: 'createAdminInvitation',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN'],
    stepUpRequired: true,
    stepUpMode: null,
    stepUpPurpose: 'INVITATION',
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: true,
      replay: 'REPLAY_SAME_RESPONSE_FOR_SAME_PAYLOAD_DIFFERENT_PAYLOAD_409',
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminInvitationCreateRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '201',
      mediaType: 'application/json',
      schema: 'AdminInvitationEnvelope',
      headers: ['Location'],
    },
  },
  {
    path: '/api/v1/admin/auth/invitations/accept',
    method: 'POST',
    operationId: 'acceptAdminInvitation',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'PUBLIC',
    securityRequirement: [],
    roles: [],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'ADMIN_SECURITY_EVENT',
    auditContextProof: null,
    failureAuditSink: 'ADMIN_SECURITY_EVENT',
    rateLimitProfile: 'RECOVERY',
    fetchMetadataPolicy: null,
    publicFailureTiming: 'UNKNOWN_EXPIRED_CONSUMED_REVOKED_OR_ACCOUNT_STATE_COMPARABLE',
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminInvitationAcceptRequest',
    },
    requestHeaders: [
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminPreAuthEnvelope',
      headers: ['Set-Cookie', 'Cache-Control', 'X-Content-Type-Options'],
    },
  },
  {
    path: '/api/v1/admin/users',
    method: 'GET',
    operationId: 'listAdminUsers',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN'],
    stepUpRequired: false,
    stepUpMode: null,
    stepUpPurpose: null,
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'NONE',
    auditContextProof: null,
    failureAuditSink: 'NONE_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: false,
      replay: null,
    },
    request: null,
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
    ],
    queryParameters: [
      {
        name: 'cursor',
        required: false,
        schema: 'string',
        format: null,
      },
      {
        name: 'limit',
        required: false,
        schema: 'integer',
        format: null,
      },
    ],
    response: {
      status: '200',
      mediaType: 'application/json',
      schema: 'AdminUserPage',
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/users/{adminUserId}/role-changes',
    method: 'POST',
    operationId: 'changeAdminUserRole',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN'],
    stepUpRequired: true,
    stepUpMode: null,
    stepUpPurpose: 'ROLE_CHANGE',
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: true,
      replay: 'REPLAY_SAME_RESPONSE_FOR_SAME_PAYLOAD_DIFFERENT_PAYLOAD_409',
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminRoleChangeRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '204',
      mediaType: null,
      schema: null,
      headers: [],
    },
  },
  {
    path: '/api/v1/admin/users/{adminUserId}/status-changes',
    method: 'POST',
    operationId: 'changeAdminUserStatus',
    deliverySlice: 'S1.2-03C2',
    authorizationClass: 'ADMIN_SESSION',
    securityRequirement: ['adminSession'],
    roles: ['SUPER_ADMIN'],
    stepUpRequired: true,
    stepUpMode: null,
    stepUpPurpose: 'STATUS_CHANGE',
    priorStepUpPolicy: null,
    totpCounterPolicy: null,
    transactionalEffects: [],
    auditSink: 'AUDIT_LOG',
    auditContextProof: null,
    failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT',
    rateLimitProfile: null,
    fetchMetadataPolicy: null,
    publicFailureTiming: null,
    serviceUnavailable: {
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      publicMessage: 'Service temporairement indisponible.',
    },
    signedManifest: null,
    idempotency: {
      required: true,
      replay: 'REPLAY_SAME_RESPONSE_FOR_SAME_PAYLOAD_DIFFERENT_PAYLOAD_409',
    },
    request: {
      mediaType: 'application/json',
      schema: 'AdminStatusChangeRequest',
    },
    requestHeaders: [
      {
        scheme: 'adminSession',
        in: 'header',
        name: 'Authorization',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Origin',
        required: true,
      },
      {
        scheme: null,
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
      },
    ],
    queryParameters: [],
    response: {
      status: '204',
      mediaType: null,
      schema: null,
      headers: [],
    },
  },
] as const;

export type AdminSecurityOperation = (typeof adminSecurityOperations)[number];

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

export type ResponseMeta = {
  readonly requestId: string;
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
  | 'AUTH_REFRESH_INVALID'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_TOO_MANY_ATTEMPTS'
  | 'OTP_ALREADY_CONSUMED'
  | 'CONTENT_NOT_FOUND'
  | 'CONTENT_MEDIA_NOT_READY'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ALREADY_SETTLED'
  | 'ALREADY_ENTITLED'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PAYMENT_PROVIDER_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'PAYMENT_ATTEMPT_NOT_FOUND'
  | 'PAYMENT_ATTEMPT_TERMINAL'
  | 'PAYMENT_WEBHOOK_INVALID'
  | 'MEDIA_WEBHOOK_INVALID'
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
  | 'ARTIST_CONFLICT'
  | 'SENSITIVE_RESPONSE_ALREADY_DELIVERED'
  | 'ADMIN_RECOVERY_CODE_INVALID'
  | 'ADMIN_RECOVERY_INVALID'
  | 'ADMIN_SESSION_NOT_FOUND'
  | 'ADMIN_USER_NOT_FOUND'
  | 'RECOVERY_CASE_NOT_FOUND'
  | 'RECOVERY_CASE_EXPIRED'
  | 'RECOVERY_CASE_CONFLICT'
  | 'LAST_SUPER_ADMIN_PROTECTED'
  | 'AUDIT_EXPORT_NOT_FOUND'
  | 'AUDIT_EXPORT_NOT_READY'
  | 'AUDIT_EXPORT_EXPIRED'
  | 'ADMIN_INVITATION_INVALID';

export type ErrorDetails = {
  readonly field?: string;
  readonly reason?:
    | 'CONFLICT'
    | 'EXPIRED'
    | 'INVALID_FORMAT'
    | 'INVALID_STATE'
    | 'NOT_AVAILABLE'
    | 'OUT_OF_RANGE'
    | 'RATE_LIMITED'
    | 'REQUIRED';
  readonly operatorReason?: string;
  readonly retryAfterSeconds?: number;
};

export type ErrorResponse = {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details: ErrorDetails;
    readonly retryable?: boolean;
  };
  readonly requestId: string;
};

export type PublishConflictError = {
  readonly error: {
    readonly code: 'CONTENT_MEDIA_NOT_READY' | 'IDEMPOTENCY_CONFLICT' | 'INVALID_STATE_TRANSITION';
    readonly message: string;
    readonly details: ErrorDetails;
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
  readonly cover: PublicCoverImage;
  readonly priceCfa: MoneyCfa;
  readonly settledSalesCount: number;
  readonly durationSeconds: number;
  readonly previewAvailable: boolean;
  readonly previewSeconds: number;
};

export type AudioContentDetail = {
  readonly contentId: Identifier;
  readonly title: string;
  readonly description: string | null;
  readonly artist: ArtistSummary;
  readonly cover: PublicCoverImage;
  readonly priceCfa: MoneyCfa;
  readonly settledSalesCount: number;
  readonly durationSeconds: number;
  readonly previewAvailable: boolean;
  readonly previewSeconds: number;
};

export type ArtistSummary = {
  readonly artistId: Identifier;
  readonly stageName: string;
};

export type PublicCoverImage = {
  readonly contentId: Identifier;
  readonly mediaAssetVersion: number;
  readonly representation: 'CONTROLLED_API';
};

export type AudioCatalogPage = {
  readonly data: ReadonlyArray<AudioCatalogItem>;
  readonly meta: CursorMeta;
};

export type AudioContentEnvelope = {
  readonly data: AudioContentDetail;
  readonly meta: ResponseMeta;
};

export type E164Phone = string;

export type CustomerPassword = string;

export type CustomerDeviceRegistration = {
  readonly fingerprint: string;
  readonly platform: 'ANDROID' | 'IOS';
};

export type RegisterCustomerRequest = {
  readonly phone: E164Phone;
  readonly password: CustomerPassword;
  readonly device: CustomerDeviceRegistration;
};

export type LoginCustomerRequest = {
  readonly phone: E164Phone;
  readonly password: CustomerPassword;
  readonly device: CustomerDeviceRegistration;
};

export type OtpChallenge = {
  readonly challengeId: Identifier;
  readonly expiresAt: Timestamp;
  readonly retryAfterSeconds: number;
  readonly purpose: 'REGISTER' | 'LOGIN' | 'STEP_UP';
};

export type OtpChallengeEnvelope = {
  readonly data: OtpChallenge;
  readonly meta: ResponseMeta;
};

export type OtpVerificationRequest = {
  readonly code: string;
};

export type StepUpChallengeRequest = {
  readonly purpose: 'ACCOUNT_SECURITY' | 'ARTIST_PAYOUT';
};

export type StepUpVerificationRequest = {
  readonly code: string;
};

export type StepUpVerification = {
  readonly sessionId: Identifier;
  readonly verifiedAt: Timestamp;
};

export type StepUpVerificationEnvelope = {
  readonly data: StepUpVerification;
  readonly meta: ResponseMeta;
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
  readonly meta: ResponseMeta;
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
  readonly meta: ResponseMeta;
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
  readonly meta: ResponseMeta;
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
  readonly meta: ResponseMeta;
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
  readonly meta: ResponseMeta;
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
  readonly meta: ResponseMeta;
};

export type MuxMediaWebhookRequest = {
  readonly id: string;
  readonly type: 'video.asset.ready' | 'video.asset.errored' | 'video.upload.asset_created';
  readonly data: {
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
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
  readonly meta: ResponseMeta;
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
  readonly meta: ResponseMeta;
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
  readonly meta: ResponseMeta;
};

export type UpsertArtistRequest = {
  readonly stageName: string;
  readonly status: 'ACTIVE' | 'SUSPENDED';
};

export type AdminArtist = {
  readonly artistId: Identifier;
  readonly createdByAdminId: Identifier;
  readonly stageName: string;
  readonly status: 'ACTIVE' | 'SUSPENDED';
};

export type AdminArtistEnvelope = {
  readonly data: AdminArtist;
  readonly meta: ResponseMeta;
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
  readonly createdByAdminId: Identifier;
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
  readonly meta: ResponseMeta;
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
  readonly meta: ResponseMeta;
};

export type MediaPreparation = {
  readonly preparationToken: string;
  readonly expiresInSeconds: number;
  readonly expiresAt: Timestamp;
};

export type MediaPreparationEnvelope = {
  readonly data: MediaPreparation;
  readonly meta: ResponseMeta;
};

export type AdminRole = 'SUPER_ADMIN' | 'CONTENT_EDITOR' | 'FINANCE_MANAGER' | 'SUPPORT';

export type AdminStatus = 'INVITED' | 'PENDING_MFA' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export type AdminPassword = string;

export type AdminLoginRequest = {
  readonly email: string;
  readonly password: AdminPassword;
};

export type AdminPreAuth = {
  readonly challengeId: Identifier;
  readonly expiresAt: Timestamp;
  readonly nextStep: 'TOTP_VERIFY' | 'FIRST_TOTP_ENROLLMENT' | 'MFA_RECOVERY_TOTP_ENROLLMENT';
};

export type AdminPreAuthEnvelope = {
  readonly data: AdminPreAuth;
  readonly meta: ResponseMeta;
};

export type AdminTotpEnrollment = {
  readonly enrollmentId: Identifier;
  readonly expiresAt: Timestamp;
};

export type AdminTotpEnrollmentEnvelope = {
  readonly data: AdminTotpEnrollment;
  readonly meta: ResponseMeta;
};

export type AdminTotpVerificationRequest = {
  readonly code: string;
};

export type AdminAccessSession = {
  readonly sessionId: Identifier;
  readonly accessToken: string;
  readonly accessExpiresAt: Timestamp;
  readonly idleExpiresAt: Timestamp;
  readonly absoluteExpiresAt: Timestamp;
  readonly authorizationVersion: number;
  readonly role: AdminRole;
};

export type AdminSessionEnvelope = {
  readonly data: AdminAccessSession;
  readonly meta: ResponseMeta;
};

export type AdminRecoveryCode = {
  readonly selector: string;
  readonly verifier: string;
};

export type AdminRecoveryCodes = {
  readonly codes: ReadonlyArray<AdminRecoveryCode>;
};

export type AdminRecoveryCodesEnvelope = {
  readonly data: AdminRecoveryCodes;
  readonly meta: ResponseMeta;
};

export type AdminEnrollmentConfirmation = {
  readonly session: AdminAccessSession;
  readonly recoveryCodes: AdminRecoveryCodes;
};

export type AdminEnrollmentConfirmationEnvelope = {
  readonly data: AdminEnrollmentConfirmation;
  readonly meta: ResponseMeta;
};

export type AdminRecoveryCodeVerificationRequest = {
  readonly selector: string;
  readonly verifier: string;
};

export type AdminRecoveryContext = {
  readonly recoveryContextId: Identifier;
  readonly expiresAt: Timestamp;
  readonly nextStep: 'ENROLL_TOTP';
};

export type AdminRecoveryContextEnvelope = {
  readonly data: AdminRecoveryContext;
  readonly meta: ResponseMeta;
};

export type AdminStepUpRequest = {
  readonly purpose:
    | 'SESSION_REVOCATION'
    | 'RECOVERY_APPROVAL'
    | 'AUDIT_EXPORT'
    | 'INVITATION'
    | 'ROLE_CHANGE'
    | 'STATUS_CHANGE';
  readonly totpCode: string;
};

export type AdminStepUp = {
  readonly verifiedAt: Timestamp;
  readonly expiresAt: Timestamp;
};

export type AdminStepUpEnvelope = {
  readonly data: AdminStepUp;
  readonly meta: ResponseMeta;
};

export type AdminSessionSummary = {
  readonly sessionId: Identifier;
  readonly createdAt: Timestamp;
  readonly lastSeenAt: Timestamp;
  readonly idleExpiresAt: Timestamp;
  readonly absoluteExpiresAt: Timestamp;
  readonly current: boolean;
};

export type AdminSessionPage = {
  readonly data: ReadonlyArray<AdminSessionSummary>;
  readonly meta: CursorMeta;
};

export type AdminReasonCode =
  | 'SECURITY_RESPONSE'
  | 'ACCOUNT_RECOVERY'
  | 'ROLE_ADMINISTRATION'
  | 'STATUS_ADMINISTRATION'
  | 'AUDIT_EXPORT'
  | 'INVITATION_ADMINISTRATION';

export type AdminReasonRequest = {
  readonly reasonCode: AdminReasonCode;
  readonly operatorReason: string;
};

export type AdminPasswordResetRequest = {
  readonly email: string;
};

export type AdminPasswordResetCompletionRequest = {
  readonly resetCode: string;
  readonly newPassword: AdminPassword;
};

export type AdminAccepted = {
  readonly accepted: true;
};

export type AdminAcceptedEnvelope = {
  readonly data: AdminAccepted;
  readonly meta: ResponseMeta;
};

export type AdminRecoveryCaseCreateRequest = {
  readonly subjectAdminUserId: Identifier;
  readonly reasonCode: AdminReasonCode;
  readonly operatorReason: string;
};

export type AdminRecoveryCaseState = 'PENDING' | 'APPROVED' | 'CANCELLED' | 'EXPIRED';

export type AdminRecoveryCase =
  | ({
      readonly caseId: Identifier;
      readonly creatorAdminUserId: Identifier;
      readonly subjectAdminUserId: Identifier;
      readonly state: AdminRecoveryCaseState;
      readonly createdAt: Timestamp;
      readonly expiresAt: Timestamp;
      readonly approverAdminUserId: string | null;
    } & {
      readonly state: 'APPROVED';
      readonly approverAdminUserId: string;
    })
  | ({
      readonly caseId: Identifier;
      readonly creatorAdminUserId: Identifier;
      readonly subjectAdminUserId: Identifier;
      readonly state: AdminRecoveryCaseState;
      readonly createdAt: Timestamp;
      readonly expiresAt: Timestamp;
      readonly approverAdminUserId: string | null;
    } & {
      readonly state: 'PENDING' | 'CANCELLED' | 'EXPIRED';
      readonly approverAdminUserId: null;
    });

export type AdminRecoveryCaseEnvelope = {
  readonly data: AdminRecoveryCase;
  readonly meta: ResponseMeta;
};

export type AdminRecoveryCasePage = {
  readonly data: ReadonlyArray<AdminRecoveryCase>;
  readonly meta: CursorMeta;
};

export type AdminAuditContext = 'ADMIN_SESSION' | 'ADMIN_RECOVERY' | 'SYSTEM';

export type AdminAuditLogEntry =
  | ({
      readonly eventId: Identifier;
      readonly action: string;
      readonly eventClass: 'LOGIN' | 'SESSION' | 'EXPORT' | 'BUSINESS';
      readonly context: AdminAuditContext;
      readonly actorAdminUserId: string | null;
      readonly subjectAdminUserId: string | null;
      readonly delegatedByAdminUserId: string | null;
      readonly adminSessionId: string | null;
      readonly adminRecoveryContextId: string | null;
      readonly systemExecutionRefHash: string | null;
      readonly entityType: string;
      readonly entityId: Identifier;
      readonly maskedBefore: {
        readonly [key: string]: string | number | boolean | null;
      } | null;
      readonly maskedAfter: {
        readonly [key: string]: string | number | boolean | null;
      } | null;
      readonly reasonCode: AdminReasonCode;
      readonly operatorReason: string | null;
      readonly requestId: string;
      readonly causationEventId: string | null;
      readonly createdAt: Timestamp;
    } & {
      readonly context: 'ADMIN_SESSION';
      readonly actorAdminUserId: string;
      readonly adminSessionId: string;
      readonly adminRecoveryContextId: null;
      readonly systemExecutionRefHash: null;
      readonly delegatedByAdminUserId: null;
    })
  | ({
      readonly eventId: Identifier;
      readonly action: string;
      readonly eventClass: 'LOGIN' | 'SESSION' | 'EXPORT' | 'BUSINESS';
      readonly context: AdminAuditContext;
      readonly actorAdminUserId: string | null;
      readonly subjectAdminUserId: string | null;
      readonly delegatedByAdminUserId: string | null;
      readonly adminSessionId: string | null;
      readonly adminRecoveryContextId: string | null;
      readonly systemExecutionRefHash: string | null;
      readonly entityType: string;
      readonly entityId: Identifier;
      readonly maskedBefore: {
        readonly [key: string]: string | number | boolean | null;
      } | null;
      readonly maskedAfter: {
        readonly [key: string]: string | number | boolean | null;
      } | null;
      readonly reasonCode: AdminReasonCode;
      readonly operatorReason: string | null;
      readonly requestId: string;
      readonly causationEventId: string | null;
      readonly createdAt: Timestamp;
    } & {
      readonly context: 'ADMIN_RECOVERY';
      readonly actorAdminUserId: string;
      readonly adminSessionId: null;
      readonly adminRecoveryContextId: string;
      readonly systemExecutionRefHash: null;
      readonly delegatedByAdminUserId: null;
    })
  | ({
      readonly eventId: Identifier;
      readonly action: string;
      readonly eventClass: 'LOGIN' | 'SESSION' | 'EXPORT' | 'BUSINESS';
      readonly context: AdminAuditContext;
      readonly actorAdminUserId: string | null;
      readonly subjectAdminUserId: string | null;
      readonly delegatedByAdminUserId: string | null;
      readonly adminSessionId: string | null;
      readonly adminRecoveryContextId: string | null;
      readonly systemExecutionRefHash: string | null;
      readonly entityType: string;
      readonly entityId: Identifier;
      readonly maskedBefore: {
        readonly [key: string]: string | number | boolean | null;
      } | null;
      readonly maskedAfter: {
        readonly [key: string]: string | number | boolean | null;
      } | null;
      readonly reasonCode: AdminReasonCode;
      readonly operatorReason: string | null;
      readonly requestId: string;
      readonly causationEventId: string | null;
      readonly createdAt: Timestamp;
    } & (
      | ({
          readonly context: 'SYSTEM';
          readonly actorAdminUserId: null;
          readonly adminSessionId: null;
          readonly adminRecoveryContextId: null;
          readonly systemExecutionRefHash: string;
        } & {
          readonly causationEventId: null;
          readonly delegatedByAdminUserId: null;
        })
      | ({
          readonly context: 'SYSTEM';
          readonly actorAdminUserId: null;
          readonly adminSessionId: null;
          readonly adminRecoveryContextId: null;
          readonly systemExecutionRefHash: string;
        } & {
          readonly causationEventId: string;
          readonly delegatedByAdminUserId: string;
        })
    ));

export type AdminAuditLogPage = {
  readonly data: ReadonlyArray<AdminAuditLogEntry>;
  readonly meta: CursorMeta;
};

export type AdminAuditExportRequest = {
  readonly from: Timestamp;
  readonly to: Timestamp;
  readonly actorAdminUserId?: Identifier;
  readonly action?: string;
  readonly entityType?: string;
  readonly entityId?: Identifier;
  readonly reasonCode: AdminReasonCode;
  readonly operatorReason: string;
};

export type AdminAuditExportState = 'PENDING' | 'PROCESSING' | 'READY' | 'EXPIRED' | 'FAILED';

export type AdminAuditExport =
  | ({
      readonly exportId: Identifier;
      readonly state: AdminAuditExportState;
      readonly createdAt: Timestamp;
      readonly expiresAt: string | null;
      readonly contentSha256: string | null;
      readonly signatureKeyId: string | null;
    } & {
      readonly state: 'READY' | 'EXPIRED';
      readonly expiresAt: string;
      readonly contentSha256: string;
      readonly signatureKeyId: string;
    })
  | ({
      readonly exportId: Identifier;
      readonly state: AdminAuditExportState;
      readonly createdAt: Timestamp;
      readonly expiresAt: string | null;
      readonly contentSha256: string | null;
      readonly signatureKeyId: string | null;
    } & {
      readonly state: 'PENDING' | 'PROCESSING' | 'FAILED';
      readonly expiresAt: null;
      readonly contentSha256: null;
      readonly signatureKeyId: null;
    });

export type AdminAuditExportEnvelope = {
  readonly data: AdminAuditExport;
  readonly meta: ResponseMeta;
};

export type AdminInvitationCreateRequest = {
  readonly email: string;
  readonly role: AdminRole;
  readonly reasonCode: AdminReasonCode;
  readonly operatorReason: string;
};

export type AdminInvitationAcceptRequest = {
  readonly invitationCode: string;
  readonly password: AdminPassword;
};

export type AdminInvitation = {
  readonly invitationId: Identifier;
  readonly email: string;
  readonly role: AdminRole;
  readonly status: 'PENDING';
  readonly expiresAt: Timestamp;
};

export type AdminInvitationEnvelope = {
  readonly data: AdminInvitation;
  readonly meta: ResponseMeta;
};

export type AdminUser = {
  readonly adminUserId: Identifier;
  readonly email: string;
  readonly role: AdminRole;
  readonly status: AdminStatus;
  readonly authorizationVersion: number;
};

export type AdminUserPage = {
  readonly data: ReadonlyArray<AdminUser>;
  readonly meta: CursorMeta;
};

export type AdminRoleChangeRequest = {
  readonly role: AdminRole;
  readonly reasonCode: AdminReasonCode;
  readonly operatorReason: string;
};

export type AdminStatusChangeRequest = {
  readonly status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  readonly reasonCode: AdminReasonCode;
  readonly operatorReason: string;
};
