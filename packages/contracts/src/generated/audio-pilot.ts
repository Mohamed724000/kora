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
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: null,
        successSink: 'ADMIN_SECURITY_EVENT',
        action: 'requestAdminPasswordReset',
        eventClass: 'LOGIN',
        entityType: 'ADMIN_PASSWORD_RESET_REQUEST',
        maskedSnapshots: ['REDACTED_SUBJECT_DIGEST', 'DELIVERY_REQUEST_STATE'],
        atomicity: 'RESET_REQUEST_ENCRYPTED_OUTBOX_AND_SECURITY_EVENT',
        asynchronousTransitions: ['PASSWORD_RESET_NOTIFICATION_DELIVERY_SYSTEM_AUDIT'],
        auditContextProof: 'NONE_PUBLIC_NO_AUDIT_CONTEXT',
        authorizationChecks: [],
        postProofBusinessChecks: ['ELIGIBLE_ACCOUNT_CHECK_WITHOUT_ORACLE'],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'NOT_APPLICABLE',
          stepUpAbsentAfterProof: 'NOT_APPLICABLE',
          stepUpExpiredAfterProof: 'NOT_APPLICABLE',
          stepUpInvalidAfterProof: 'NOT_APPLICABLE',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'NOT_APPLICABLE_NO_PROVEN_AUDIT_CONTEXT',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'ADMIN_SECURITY_EVENT_FAILED',
        },
      },
      resetAdminPassword: {
        roles: [],
        proofPurpose: 'PASSWORD_RESET',
        forbiddenProofPurpose: 'MFA_RECOVERY',
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_RECOVERY',
        successSink: 'AUDIT_LOG',
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
        auditContextProof:
          'SERVER_VERIFIED_RECOVERY_CONTEXT_ACTOR_BINDING_ACTIVE_NOT_EXPIRED_NOT_CONSUMED_NOT_REVOKED',
        authorizationChecks: ['PASSWORD_RESET_PURPOSE_AND_SUBJECT_ELIGIBILITY'],
        postProofBusinessChecks: ['NEW_PASSWORD_POLICY_AND_HIBP_FAIL_CLOSED'],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'NOT_APPLICABLE',
          stepUpAbsentAfterProof: 'NOT_APPLICABLE',
          stepUpExpiredAfterProof: 'NOT_APPLICABLE',
          stepUpInvalidAfterProof: 'NOT_APPLICABLE',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'AUDIT_LOG_REJECTED_IF_DURABILITY_CONFIRMED',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'AUDIT_LOG_REJECTED',
        },
      },
      createAdminRecoveryCase: {
        roles: ['SUPER_ADMIN', 'SUPPORT'],
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: ['ACCOUNT_RECOVERY', 'SECURITY_RESPONSE'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        action: 'createAdminRecoveryCase',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_RECOVERY_CASE',
        maskedSnapshots: ['CASE_STATE', 'SUBJECT_ADMIN_USER_ID'],
        atomicity:
          'CANCEL_OLDER_PENDING_WITH_SYSTEM_AUDITS_CREATE_CASE_RECORD_IDEMPOTENCY_AND_INITIATING_AUDIT_IN_ONE_POSTGRESQL_TRANSACTION',
        asynchronousTransitions: ['RECOVERY_CASE_SERVER_EXPIRATION_SYSTEM_AUDIT'],
        transactionalSystemTransitions: ['RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT'],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN_SUPPORT'],
        postProofBusinessChecks: [
          'SUBJECT_ELIGIBLE_DISTINCT_AND_REASON_VALID',
          'IDEMPOTENCY_PAYLOAD_MATCH',
        ],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpAbsentAfterProof: 'NOT_APPLICABLE',
          stepUpExpiredAfterProof: 'NOT_APPLICABLE',
          stepUpInvalidAfterProof: 'NOT_APPLICABLE',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'AUDIT_LOG_REJECTED_IF_DURABILITY_CONFIRMED',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'AUDIT_LOG_REJECTED',
        },
      },
      listAdminRecoveryCases: {
        roles: ['SUPER_ADMIN', 'SUPPORT'],
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'NONE',
        action: 'listAdminRecoveryCases',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_RECOVERY_CASE_SNAPSHOT',
        maskedSnapshots: ['SAFE_PROJECTION_DIGEST'],
        atomicity: 'MATERIALIZED_SAFE_SNAPSHOT_READ',
        asynchronousTransitions: [],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN_SUPPORT'],
        postProofBusinessChecks: ['FILTER_CURSOR_AND_SNAPSHOT_LIMITS'],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'NONE',
          stepUpAbsentAfterProof: 'NOT_APPLICABLE',
          stepUpExpiredAfterProof: 'NOT_APPLICABLE',
          stepUpInvalidAfterProof: 'NOT_APPLICABLE',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'NONE_NEUTRAL_503_NO_DURABLE_AUDIT',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'NOT_APPLICABLE_NO_DURABLE_AUDIT_SINK',
          commitUnknown: 'READ_ONLY_SNAPSHOT_CONFIRMATION_UNKNOWN_NEUTRAL_503_NO_RETRY',
          businessRejectedAfterProof: 'NONE',
        },
      },
      getAdminRecoveryCase: {
        roles: ['SUPER_ADMIN', 'SUPPORT'],
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'NONE',
        action: 'getAdminRecoveryCase',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_RECOVERY_CASE',
        maskedSnapshots: ['SAFE_CASE_PROJECTION'],
        atomicity: 'READ_ONLY',
        asynchronousTransitions: [],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN_SUPPORT'],
        postProofBusinessChecks: ['CASE_VISIBLE_OR_NEUTRAL_NOT_FOUND'],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'NONE',
          stepUpAbsentAfterProof: 'NOT_APPLICABLE',
          stepUpExpiredAfterProof: 'NOT_APPLICABLE',
          stepUpInvalidAfterProof: 'NOT_APPLICABLE',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'NONE_NEUTRAL_503_NO_DURABLE_AUDIT',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'NOT_APPLICABLE_NO_DURABLE_AUDIT_SINK',
          commitUnknown: 'NOT_APPLICABLE_NO_DURABLE_WRITE',
          businessRejectedAfterProof: 'NONE',
        },
      },
      approveAdminRecoveryCase: {
        roles: ['SUPER_ADMIN'],
        stepUpPurpose: 'RECOVERY_APPROVAL',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: ['ACCOUNT_RECOVERY', 'SECURITY_RESPONSE'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        action: 'approveAdminRecoveryCase',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_RECOVERY_CASE',
        maskedSnapshots: ['CASE_STATE', 'SUBJECT_AUTHORIZATION_AND_MFA_STATE'],
        atomicity:
          'CONSUME_CASE_RESET_SUBJECT_TO_PENDING_MFA_REVOKE_SECURITY_MATERIAL_RECORD_IDEMPOTENCY_AND_AUDIT',
        asynchronousTransitions: [],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_RECOVERY_APPROVAL'],
        postProofBusinessChecks: [
          'CASE_PENDING_NOT_EXPIRED_CREATOR_APPROVER_SUBJECT_DISTINCT',
          'SUBJECT_ELIGIBLE_AND_REASON_VALID',
          'IDEMPOTENCY_PAYLOAD_MATCH',
        ],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpAbsentAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpExpiredAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpInvalidAfterProof: 'AUDIT_LOG_REJECTED',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'AUDIT_LOG_REJECTED_IF_DURABILITY_CONFIRMED',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'AUDIT_LOG_REJECTED',
        },
      },
      listAdminAuditLogs: {
        roles: ['SUPER_ADMIN'],
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        action: 'listAdminAuditLogs',
        eventClass: 'EXPORT',
        entityType: 'AUDIT_LOG_SNAPSHOT',
        maskedSnapshots: ['FILTER_DIGEST', 'SNAPSHOT_BOUNDS'],
        atomicity: 'MATERIALIZE_SNAPSHOT_BEFORE_AUDIT_READ_EVENT_TO_EXCLUDE_SELF',
        asynchronousTransitions: [],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN'],
        postProofBusinessChecks: ['FILTER_CURSOR_SNAPSHOT_AND_PROJECTION_BUDGET'],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpAbsentAfterProof: 'NOT_APPLICABLE',
          stepUpExpiredAfterProof: 'NOT_APPLICABLE',
          stepUpInvalidAfterProof: 'NOT_APPLICABLE',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'AUDIT_LOG_REJECTED_IF_DURABILITY_CONFIRMED',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'AUDIT_LOG_REJECTED',
        },
      },
      createAdminAuditLogExport: {
        roles: ['SUPER_ADMIN'],
        stepUpPurpose: 'AUDIT_EXPORT',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: ['AUDIT_EXPORT'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        action: 'createAdminAuditLogExport',
        eventClass: 'EXPORT',
        entityType: 'ADMIN_AUDIT_EXPORT',
        maskedSnapshots: ['FILTER_DIGEST', 'EXPORT_STATE'],
        atomicity: 'CREATE_IMMUTABLE_SNAPSHOT_EXPORT_JOB_RECORD_IDEMPOTENCY_AND_AUDIT',
        asynchronousTransitions: ['EXPORT_BUILD_SYSTEM_AUDIT', 'EXPORT_EXPIRY_SYSTEM_AUDIT'],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_AUDIT_EXPORT'],
        postProofBusinessChecks: [
          'FILTER_SNAPSHOT_REASON_AND_IDEMPOTENCY',
          'EXPORT_BUDGET_DECLARED',
        ],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpAbsentAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpExpiredAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpInvalidAfterProof: 'AUDIT_LOG_REJECTED',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'AUDIT_LOG_REJECTED_IF_DURABILITY_CONFIRMED',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'AUDIT_LOG_REJECTED',
        },
      },
      getAdminAuditLogExport: {
        roles: ['SUPER_ADMIN'],
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        action: 'getAdminAuditLogExport',
        eventClass: 'EXPORT',
        entityType: 'ADMIN_AUDIT_EXPORT',
        maskedSnapshots: ['EXPORT_STATE', 'INTEGRITY_METADATA'],
        atomicity: 'AUDIT_DURABLE_BEFORE_RESPONSE',
        asynchronousTransitions: [],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN'],
        postProofBusinessChecks: ['EXPORT_VISIBLE_OR_NEUTRAL_NOT_FOUND'],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpAbsentAfterProof: 'NOT_APPLICABLE',
          stepUpExpiredAfterProof: 'NOT_APPLICABLE',
          stepUpInvalidAfterProof: 'NOT_APPLICABLE',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'AUDIT_LOG_REJECTED_IF_DURABILITY_CONFIRMED',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'AUDIT_LOG_REJECTED',
        },
      },
      downloadAdminAuditLogExport: {
        roles: ['SUPER_ADMIN'],
        stepUpPurpose: 'AUDIT_EXPORT',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        action: 'downloadAdminAuditLogExport',
        eventClass: 'EXPORT',
        entityType: 'ADMIN_AUDIT_EXPORT',
        maskedSnapshots: ['EXPORT_STATE', 'INTEGRITY_METADATA'],
        atomicity: 'AUTHORIZATION_STEP_UP_INTEGRITY_AND_AUDIT_DURABLE_BEFORE_FIRST_BYTE',
        asynchronousTransitions: [],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_AUDIT_EXPORT'],
        postProofBusinessChecks: ['EXPORT_READY_NOT_EXPIRED', 'CONTENT_HASH_AND_JWS_INTEGRITY'],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpAbsentAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpExpiredAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpInvalidAfterProof: 'AUDIT_LOG_REJECTED',
          integrityRejectedAfterProof: 'AUDIT_LOG_REJECTED',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'AUDIT_LOG_REJECTED_IF_DURABILITY_CONFIRMED',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'AUDIT_LOG_REJECTED',
        },
      },
      createAdminInvitation: {
        roles: ['SUPER_ADMIN'],
        stepUpPurpose: 'INVITATION',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: ['INVITATION_ADMINISTRATION'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        action: 'createAdminInvitation',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_INVITATION',
        maskedSnapshots: ['CANONICAL_EMAIL_DIGEST', 'ROLE', 'INVITATION_STATE'],
        atomicity:
          'REVOKE_PRIOR_VALID_INVITATION_CREATE_INVITATION_ENCRYPTED_OUTBOX_RECORD_IDEMPOTENCY_AND_AUDIT',
        asynchronousTransitions: ['INVITATION_NOTIFICATION_DELIVERY_SYSTEM_AUDIT'],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_INVITATION'],
        postProofBusinessChecks: [
          'EMAIL_COLLISION_AND_ROLE_REASON_VALID',
          'PASSWORD_PROVIDER_NOT_APPLICABLE',
          'IDEMPOTENCY_PAYLOAD_MATCH',
        ],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpAbsentAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpExpiredAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpInvalidAfterProof: 'AUDIT_LOG_REJECTED',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'AUDIT_LOG_REJECTED_IF_DURABILITY_CONFIRMED',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'AUDIT_LOG_REJECTED',
        },
      },
      acceptAdminInvitation: {
        roles: [],
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: null,
        successSink: 'ADMIN_SECURITY_EVENT',
        action: 'acceptAdminInvitation',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_INVITATION',
        maskedSnapshots: ['INVITATION_STATE', 'PENDING_MFA_ACCOUNT_STATE'],
        atomicity:
          'CONSUME_INVITATION_CREATE_PENDING_MFA_ACCOUNT_CREATE_ARGON2ID_PASSWORD_CREDENTIAL_CREATE_FIRST_TOTP_ENROLLMENT_PREAUTH_10_MINUTES_AND_SECURITY_EVENT',
        asynchronousTransitions: [],
        auditContextProof: 'NONE_PUBLIC_NO_AUDIT_CONTEXT',
        authorizationChecks: [],
        postProofBusinessChecks: [
          'INVITATION_ACTIVE_SINGLE_USE_EMAIL_COLLISION_FREE',
          'PASSWORD_POLICY_AND_HIBP_FAIL_CLOSED',
        ],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'NOT_APPLICABLE',
          stepUpAbsentAfterProof: 'NOT_APPLICABLE',
          stepUpExpiredAfterProof: 'NOT_APPLICABLE',
          stepUpInvalidAfterProof: 'NOT_APPLICABLE',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'NOT_APPLICABLE_NO_PROVEN_AUDIT_CONTEXT',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'ADMIN_SECURITY_EVENT_FAILED',
        },
      },
      listAdminUsers: {
        roles: ['SUPER_ADMIN'],
        stepUpPurpose: null,
        stepUpApplicability: 'NOT_APPLICABLE',
        clientReasonCodes: [],
        operatorReason: 'NOT_APPLICABLE',
        auditContext: 'ADMIN_SESSION',
        successSink: 'NONE',
        action: 'listAdminUsers',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_USER_SNAPSHOT',
        maskedSnapshots: ['SAFE_USER_PROJECTION_DIGEST'],
        atomicity: 'MATERIALIZED_SAFE_SNAPSHOT_READ',
        asynchronousTransitions: [],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN'],
        postProofBusinessChecks: ['FILTER_CURSOR_AND_SNAPSHOT_LIMITS'],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'NONE',
          stepUpAbsentAfterProof: 'NOT_APPLICABLE',
          stepUpExpiredAfterProof: 'NOT_APPLICABLE',
          stepUpInvalidAfterProof: 'NOT_APPLICABLE',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'NONE_NEUTRAL_503_NO_DURABLE_AUDIT',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'NOT_APPLICABLE_NO_DURABLE_AUDIT_SINK',
          commitUnknown: 'READ_ONLY_SNAPSHOT_CONFIRMATION_UNKNOWN_NEUTRAL_503_NO_RETRY',
          businessRejectedAfterProof: 'NONE',
        },
      },
      changeAdminUserRole: {
        roles: ['SUPER_ADMIN'],
        stepUpPurpose: 'ROLE_CHANGE',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: ['ROLE_ADMINISTRATION'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        action: 'changeAdminUserRole',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_USER',
        maskedSnapshots: ['ROLE', 'AUTHORIZATION_VERSION', 'SESSION_REVOCATION_STATE'],
        atomicity:
          'CHANGE_ROLE_INCREMENT_AUTHORIZATION_VERSION_REVOKE_SESSIONS_CANCEL_PENDING_RECOVERY_CASES_WITH_SYSTEM_AUDITS_RECORD_IDEMPOTENCY_AND_INITIATING_AUDIT_IN_ONE_POSTGRESQL_TRANSACTION',
        asynchronousTransitions: [],
        transactionalSystemTransitions: ['RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT'],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_ROLE_CHANGE'],
        postProofBusinessChecks: [
          'TARGET_EXISTS_LAST_SUPER_ADMIN_PROTECTION_AND_REASON_VALID',
          'IDEMPOTENCY_PAYLOAD_MATCH',
        ],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpAbsentAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpExpiredAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpInvalidAfterProof: 'AUDIT_LOG_REJECTED',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'AUDIT_LOG_REJECTED_IF_DURABILITY_CONFIRMED',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'AUDIT_LOG_REJECTED',
        },
      },
      changeAdminUserStatus: {
        roles: ['SUPER_ADMIN'],
        stepUpPurpose: 'STATUS_CHANGE',
        stepUpApplicability: 'REQUIRED',
        clientReasonCodes: ['STATUS_ADMINISTRATION', 'SECURITY_RESPONSE'],
        operatorReason: 'REQUIRED',
        auditContext: 'ADMIN_SESSION',
        successSink: 'AUDIT_LOG',
        action: 'changeAdminUserStatus',
        eventClass: 'BUSINESS',
        entityType: 'ADMIN_USER',
        maskedSnapshots: ['STATUS', 'AUTHORIZATION_VERSION', 'SESSION_REVOCATION_STATE'],
        atomicity:
          'CHANGE_STATUS_INCREMENT_AUTHORIZATION_VERSION_REVOKE_SESSIONS_CANCEL_PENDING_RECOVERY_CASES_WITH_SYSTEM_AUDITS_RECORD_IDEMPOTENCY_AND_INITIATING_AUDIT_IN_ONE_POSTGRESQL_TRANSACTION',
        asynchronousTransitions: [],
        transactionalSystemTransitions: ['RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT'],
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_STATUS_CHANGE'],
        postProofBusinessChecks: [
          'TARGET_EXISTS_LAST_SUPER_ADMIN_PROTECTION_AND_REASON_VALID',
          'IDEMPOTENCY_PAYLOAD_MATCH',
        ],
        phaseOrder: [
          'INPUT',
          'AUDIT_CONTEXT_PROOF',
          'AUTHORIZATION_CHECKS',
          'POST_PROOF_BUSINESS_CHECKS',
          'MUTATION_OR_SNAPSHOT',
          'AUDIT',
          'COMMIT',
          'RESPONSE',
          'CONTINUATION',
        ],
        failureSinks: {
          beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED',
          roleDeniedAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpAbsentAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpExpiredAfterProof: 'AUDIT_LOG_REJECTED',
          stepUpInvalidAfterProof: 'AUDIT_LOG_REJECTED',
          integrityRejectedAfterProof: 'NOT_APPLICABLE',
          dependencyUnavailable: {
            beforeCompleteProof: 'ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED',
            afterCompleteProof: 'AUDIT_LOG_REJECTED_IF_DURABILITY_CONFIRMED',
            response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
            durabilityRule: 'IF_REQUIRED_SINK_COMMIT_NOT_CONFIRMED_ROLLBACK_OR_NO_DURABILITY_CLAIM',
          },
          sinkUnavailable: 'ROLLBACK_NEUTRAL_503_NO_FALLBACK_NO_DURABLE_AUDIT_CLAIM',
          commitUnknown: 'NEUTRAL_503_NO_SECOND_SINK_RECONCILE_DURABLE_STATE',
          businessRejectedAfterProof: 'AUDIT_LOG_REJECTED',
        },
      },
    },
    failureCodeByTrigger: {
      scope: 'ADMIN_AUDIT_LOG_V3_REJECTED_ONLY',
      successRule: 'SUCCESS_REQUIRES_FAILURE_CODE_NULL',
      rejectionRule: 'REJECTED_REQUIRES_EXACT_NON_NULL_FAILURE_CODE_FROM_THIS_TABLE',
      nonAuditLogRule: 'ADMIN_SECURITY_EVENT_AND_NONE_SINK_OPERATIONS_MUST_NOT_CREATE_AUDIT_LOG_V3',
      globalAuditLogV3: {
        ROLE_DENIED_AFTER_COMPLETE_PROOF: 'FORBIDDEN',
        STEP_UP_ABSENT_AFTER_COMPLETE_PROOF: 'STEP_UP_REQUIRED',
        STEP_UP_EXPIRED_AFTER_COMPLETE_PROOF: 'STEP_UP_EXPIRED',
        STEP_UP_INVALID_AFTER_COMPLETE_PROOF: 'STEP_UP_INVALID',
        INTEGRITY_REJECTED_AFTER_COMPLETE_PROOF: 'INTEGRITY_REJECTED',
        DEPENDENCY_UNAVAILABLE_AFTER_COMPLETE_PROOF: 'DEPENDENCY_UNAVAILABLE',
        AUDIT_SINK_UNAVAILABLE: 'NO_V3_RECORD_COMMIT_POSSIBLE_RETURN_NEUTRAL_503',
      },
      businessByOperation: {
        requestAdminPasswordReset: 'NOT_APPLICABLE_ADMIN_SECURITY_EVENT',
        resetAdminPassword: {
          PASSWORD_RESET_PURPOSE_OR_SUBJECT_NOT_AUTHORIZED: 'FORBIDDEN',
          NEW_PASSWORD_POLICY_REJECTED: 'VALIDATION_ERROR',
          HIBP_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
          RECOVERY_CONTEXT_INVALID: 'NOT_APPLICABLE_BEFORE_COMPLETE_PROOF',
        },
        createAdminRecoveryCase: {
          SUBJECT_ELIGIBILITY_DISTINCTNESS_OR_REASON_REJECTED: 'VALIDATION_ERROR',
          IDEMPOTENCY_PAYLOAD_MISMATCH: 'IDEMPOTENCY_CONFLICT',
        },
        listAdminRecoveryCases: 'NOT_APPLICABLE_NONE_SINK',
        getAdminRecoveryCase: 'NOT_APPLICABLE_NONE_SINK',
        approveAdminRecoveryCase: {
          CASE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
          CASE_NOT_PENDING_OR_DISTINCTNESS_CONFLICT: 'RESOURCE_CONFLICT',
          CASE_EXPIRED: 'RESOURCE_EXPIRED',
          SUBJECT_ELIGIBILITY_OR_REASON_REJECTED: 'VALIDATION_ERROR',
          IDEMPOTENCY_PAYLOAD_MISMATCH: 'IDEMPOTENCY_CONFLICT',
        },
        listAdminAuditLogs: {
          FILTER_OR_CURSOR_REJECTED: 'VALIDATION_ERROR',
          PROJECTION_BUDGET_EXCEEDED: 'PROJECTION_BUDGET_EXCEEDED',
        },
        createAdminAuditLogExport: {
          FILTER_SNAPSHOT_OR_REASON_REJECTED: 'VALIDATION_ERROR',
          IDEMPOTENCY_PAYLOAD_MISMATCH: 'IDEMPOTENCY_CONFLICT',
          EXPORT_BUDGET_EXCEEDED: 'PROJECTION_BUDGET_EXCEEDED',
        },
        getAdminAuditLogExport: {
          EXPORT_NOT_FOUND: 'RESOURCE_NOT_FOUND',
        },
        downloadAdminAuditLogExport: {
          EXPORT_NOT_FOUND: 'RESOURCE_NOT_FOUND',
          EXPORT_NOT_READY: 'RESOURCE_CONFLICT',
          EXPORT_EXPIRED: 'RESOURCE_EXPIRED',
          CONTENT_HASH_OR_JWS_INVALID: 'INTEGRITY_REJECTED',
        },
        createAdminInvitation: {
          EMAIL_COLLISION: 'RESOURCE_CONFLICT',
          ROLE_REASON_OR_PROVIDER_REJECTED: 'VALIDATION_ERROR',
          IDEMPOTENCY_PAYLOAD_MISMATCH: 'IDEMPOTENCY_CONFLICT',
        },
        acceptAdminInvitation: 'NOT_APPLICABLE_ADMIN_SECURITY_EVENT',
        listAdminUsers: 'NOT_APPLICABLE_NONE_SINK',
        changeAdminUserRole: {
          TARGET_NOT_FOUND: 'RESOURCE_NOT_FOUND',
          LAST_SUPER_ADMIN_PROTECTED: 'RESOURCE_CONFLICT',
          REASON_REJECTED: 'VALIDATION_ERROR',
          IDEMPOTENCY_PAYLOAD_MISMATCH: 'IDEMPOTENCY_CONFLICT',
        },
        changeAdminUserStatus: {
          TARGET_NOT_FOUND: 'RESOURCE_NOT_FOUND',
          LAST_SUPER_ADMIN_PROTECTED: 'RESOURCE_CONFLICT',
          REASON_REJECTED: 'VALIDATION_ERROR',
          IDEMPOTENCY_PAYLOAD_MISMATCH: 'IDEMPOTENCY_CONFLICT',
        },
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
      overflow: 'NEUTRAL_503_SERVICE_UNAVAILABLE_NO_PARTIAL_PAGE_REDUCE_FILTERS',
      auditSnapshotRule: 'MATERIALIZE_BEFORE_AUDIT_READ_EVENT_NO_SELF_INCLUSION',
      retentionMeaning: 'TECHNICAL_ONLY_NOT_LEGAL',
    },
    auditProjection: {
      entrySchema: 'AdminAuditLogEntry',
      versionDiscriminator: 'version',
      exclusiveVersions: [1, 2, 3],
      listAndExportProjection: 'EXACT_SAME_VERSIONED_SCHEMA_AND_MASKING',
      legacyV1: {
        physicalVersion: 1,
        identityAndHistoricalAttributes:
          'PRESERVE_REPRESENTABLE_VALUES_WITHOUT_UUID_OR_V2_LENGTH_INVENTION',
        v2Metadata: 'EXPLICIT_NULL_NO_BACKFILL_NO_SYNTHETIC_ATTRIBUTION',
        rawLegacyReason: 'OMITTED_AT_POSTGRESQL_COLUMN_ALLOWLIST_NEVER_READ_NEVER_DELIVERED',
        legacyReasonRedacted: true,
        masking: 'POSITIVE_ALLOWLIST_BY_ACTION',
        projectionIndicatorIsHistoricalMetadata: false,
        representability:
          'NO_UUID_OR_LENGTH_REQUIREMENT_ON_TEXT_IDENTIFIERS_ANY_JSON_VALUE_FOR_MASKED_COLUMNS_AND_NO_PROJECTION_TRUNCATION',
        physicalDdlFacts: {
          nonEmpty: ['action', 'entityType', 'entityId', 'legacyReason'],
          requestIdLength: '8_TO_128_IN_CURRENT_BASELINE_CHECK',
          unboundedMaximum: ['action', 'entityType', 'entityId', 'legacyReason'],
          identifierFormat: 'UNCONSTRAINED_TEXT',
          snapshotJsonShape: 'UNCONSTRAINED_JSONB',
        },
      },
      v2: {
        physicalVersion: 2,
        eventClassContextReasonCode: 'NON_NULL',
        executionContexts: ['ADMIN_SESSION', 'ADMIN_RECOVERY', 'SYSTEM'],
        systemOrigins: ['AUTONOMOUS', 'ADMIN_DELEGATION', 'PUBLIC_PASSWORD_RESET'],
        legacyReasonRedacted: 'FORBIDDEN',
      },
      filters: {
        common: ['actorAdminUserId', 'action', 'entityType', 'entityId'],
        dateRange: {
          list: ['createdFrom', 'createdTo'],
          export: ['from', 'to'],
          semantics: 'SAME_TIME_RANGE_WITH_SURFACE_SPECIFIC_NAMES',
        },
        version: 'auditVersion',
        v1WithoutVersionOrTypedOnlyFilters: 'INCLUDED_WHEN_COMMON_FILTERS_MATCH',
        v1WithExplicitVersion1: 'INCLUDED_WHEN_COMMON_FILTERS_MATCH',
        unknownHistoricalValue: 'NEVER_SYNTHETICALLY_MATCH_CLASS_CONTEXT_OR_REASON',
        combination: 'ALL_SUPPLIED_FILTERS_ARE_COMBINED_WITH_AND',
        cursorAndSnapshotBinding: 'EXACT_FILTER_SET_AND_VALUES',
        orderPaginationSnapshotLimitsMasking: 'IDENTICAL_FOR_V1_V2_AND_V3',
        typedVersions: [2, 3],
        typedOnly: ['auditEventClass', 'auditContext', 'auditReasonCode'],
        v1WithAnyTypedFilter: 'NEVER_MATCH',
        v2Outcome: 'ALWAYS_UNKNOWN_NO_OUTCOME_OR_FAILURE_FILTER_MATCH',
        v3Outcome: 'EXPLICIT_OUTCOME_AND_NORMATIVE_FAILURE_CODE',
      },
      operatorReason: {
        durableStorage: 'PRESERVED_WHEN_REQUIRED',
        listAndExport: 'ALWAYS_NULL_WITH_OPERATOR_REASON_REDACTED_TRUE',
        presentationTransformOnly: true,
        durableMutation: false,
        forbiddenCanaries: ['EMAIL', 'PHONE', 'SECRET', 'FREE_TEXT'],
      },
      historicalOutcome: 'UNKNOWN_WITH_HISTORICAL_UNKNOWN_PROVENANCE_NO_ACTION_OR_REASON_INFERENCE',
      budgetOverflow: {
        truncate: false,
        omitRow: false,
        fabricateValue: false,
        list: 'NEUTRAL_503_SERVICE_UNAVAILABLE_NO_PARTIAL_PAGE_REDUCE_FILTERS',
        export: 'FAILED_WITH_PROJECTION_BUDGET_EXCEEDED_NO_PARTIAL_ARTIFACT',
      },
    },
    auditReasons: {
      auditLogOperations: {
        resetAdminPassword: {
          source: 'SERVER_FIXED',
          reasonCode: 'ACCOUNT_RECOVERY',
        },
        createAdminRecoveryCase: {
          source: 'VALIDATED_CLIENT_ONLY',
          allowedReasonCodes: ['ACCOUNT_RECOVERY', 'SECURITY_RESPONSE'],
        },
        approveAdminRecoveryCase: {
          source: 'VALIDATED_CLIENT_ONLY',
          allowedReasonCodes: ['ACCOUNT_RECOVERY', 'SECURITY_RESPONSE'],
        },
        listAdminAuditLogs: {
          source: 'SERVER_FIXED',
          reasonCode: 'AUDIT_EXPORT',
        },
        createAdminAuditLogExport: {
          source: 'VALIDATED_CLIENT_ONLY',
          allowedReasonCodes: ['AUDIT_EXPORT'],
        },
        getAdminAuditLogExport: {
          source: 'SERVER_FIXED',
          reasonCode: 'AUDIT_EXPORT',
        },
        downloadAdminAuditLogExport: {
          source: 'SERVER_FIXED',
          reasonCode: 'AUDIT_EXPORT',
        },
        createAdminInvitation: {
          source: 'VALIDATED_CLIENT_ONLY',
          allowedReasonCodes: ['INVITATION_ADMINISTRATION'],
        },
        changeAdminUserRole: {
          source: 'VALIDATED_CLIENT_ONLY',
          allowedReasonCodes: ['ROLE_ADMINISTRATION'],
        },
        changeAdminUserStatus: {
          source: 'VALIDATED_CLIENT_ONLY',
          allowedReasonCodes: ['STATUS_ADMINISTRATION', 'SECURITY_RESPONSE'],
        },
      },
      validatedClientRule: {
        acceptedPath: 'USE_EXACT_EXPLICIT_ALLOWED_VALUE_NO_ENUM_FIRST_NO_DEFAULT',
        missingOrInvalidAfterProof: {
          source: 'SERVER_FIXED_REJECTION',
          reasonCode: 'SECURITY_RESPONSE',
          operatorReason: null,
          invalidClientTextReuse: 'FORBIDDEN',
        },
      },
      systemTransitions: {
        PASSWORD_RESET_NOTIFICATION_DELIVERY_SYSTEM_AUDIT: {
          systemOrigin: 'PUBLIC_PASSWORD_RESET',
          validatedSource: 'PASSWORD_RESET_REQUEST_ADMIN_SECURITY_EVENT_AND_OUTBOX',
          reasonCode: 'ACCOUNT_RECOVERY',
        },
        INVITATION_NOTIFICATION_DELIVERY_SYSTEM_AUDIT: {
          systemOrigin: 'ADMIN_DELEGATION',
          validatedSource: 'CREATE_ADMIN_INVITATION_AUDIT_AND_OUTBOX',
          reasonCode: 'INVITATION_ADMINISTRATION',
        },
        EXPORT_BUILD_SYSTEM_AUDIT: {
          systemOrigin: 'ADMIN_DELEGATION',
          validatedSource: 'CREATE_ADMIN_AUDIT_LOG_EXPORT_AUDIT',
          reasonCode: 'AUDIT_EXPORT',
        },
        EXPORT_EXPIRY_SYSTEM_AUDIT: {
          systemOrigin: 'AUTONOMOUS',
          validatedSource: 'EXPORT_EXPIRY_CLOCK',
          reasonCode: 'AUDIT_EXPORT',
        },
        RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT: {
          systemOrigin: 'ADMIN_DELEGATION',
          validatedSource: 'ALLOWLISTED_CREATE_RECOVERY_OR_ROLE_STATUS_AUDIT',
          reasonCode: 'ACCOUNT_RECOVERY',
        },
        RECOVERY_CASE_SERVER_EXPIRATION_SYSTEM_AUDIT: {
          systemOrigin: 'AUTONOMOUS',
          validatedSource: 'RECOVERY_CASE_EXPIRY_CLOCK',
          reasonCode: 'ACCOUNT_RECOVERY',
        },
        ADMIN_BOOTSTRAP_SYSTEM_AUDIT: {
          systemOrigin: 'AUTONOMOUS',
          validatedSource: 'BOOTSTRAP_CLI_SINGLETON_GUARD',
          reasonCode: 'SECURITY_RESPONSE',
        },
      },
      transitionSelection: 'EXACT_VALIDATED_SERVER_ORIGIN_NEVER_CLIENT_FREE_TEXT',
      systemTransitionOperatorReason: null,
      nonAuditLogOperations: {
        ADMIN_SECURITY_EVENT: ['requestAdminPasswordReset', 'acceptAdminInvitation'],
        NONE: ['listAdminRecoveryCases', 'getAdminRecoveryCase', 'listAdminUsers'],
      },
      beforeProofFailures: 'ADMIN_SECURITY_EVENT_WITHOUT_SQL_AUDIT_REASON',
      legacyReasonStorage: 'EXACT_SERVER_LITERAL_C2_RUNTIME_NEVER_CLIENT_TEXT_NOT_PROJECTED',
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
      contentSha256: {
        algorithm: 'SHA-256',
        encoding: 'LOWERCASE_HEX_64',
        input: 'EXACT_FINAL_ZIP_ARTIFACT_BYTES',
        includes: ['ALL_ZIP_BYTES', 'manifest.json', 'manifest.sig'],
        computed: 'AFTER_FINAL_ZIP_ASSEMBLY_BEFORE_STORAGE_ENCRYPTION',
        mustEqual: ['POST_DECRYPTION_PLAINTEXT_BYTES', 'EXACT_DOWNLOAD_RESPONSE_BODY_BYTES'],
        excludes: [
          'STORAGE_CIPHERTEXT',
          'MANIFEST_ONLY',
          'PAYLOADS_ONLY',
          'HTTP_HEADERS',
          'HTTP_TRANSPORT_FRAMING',
        ],
        readyArtifact: 'IMMUTABLE_NO_RECOMPRESSION_NO_RECONSTRUCTION_AT_DOWNLOAD',
        expiredState: 'HASH_PRESERVED_AFTER_DERIVED_STORAGE_DELETION',
        selfReference: 'contentSha256_FORBIDDEN_INSIDE_ZIP_AND_MANIFEST',
      },
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
      stateMachine: {
        initial: 'PENDING',
        transitions: {
          PENDING: ['PROCESSING'],
          PROCESSING: ['READY', 'FAILED', 'PROCESSING'],
          READY: ['EXPIRED'],
          FAILED: [],
          EXPIRED: [],
        },
        leaseReclaimCondition:
          'STATE_PROCESSING_OWNER_CURRENT_NEXT_ATTEMPT_AT_NULL_LEASE_EXPIRED_ATTEMPTS_REMAIN_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE',
        leaseReclaimEffect:
          'BEFORE_ATTEMPT_DEADLINE_CAS_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_CLEAR_OWNER_SET_NEXT_ATTEMPT_AT_TO_EXPIRED_LEASE_TIME_THEN_DUE_OWNER_NULL_CLAIM_INCREMENTS_GENERATION_AND_REPLACES_ATTEMPT_ID',
        forbidden: ['PENDING_TO_READY', 'FAILED_TO_PROCESSING', 'EXPIRED_TO_READY'],
      },
      workerProtocol: {
        leaseSeconds: 120,
        leaseRenewalSeconds: 30,
        maximumProcessingSecondsPerAttempt: 600,
        maximumAttempts: 3,
        maximumAttemptsSemantics: 'INCLUDES_INITIAL_ATTEMPT_1',
        retryBackoffSecondsByNextAttempt: {
          '2': 30,
          '3': 120,
        },
        retryableFailureClasses: [
          'TRANSIENT_DEPENDENCY_UNAVAILABLE',
          'PROCESS_TIMEOUT_BEFORE_TERMINAL_CAS',
          'LEASE_HEARTBEAT_LOST_WHILE_CURRENT_FENCE',
        ],
        terminalFailureCodeByClass: {
          PROJECTION_BUDGET_EXCEEDED: 'PROJECTION_BUDGET_EXCEEDED',
          INTEGRITY_FAILED: 'INTEGRITY_FAILED',
          NON_RETRYABLE_DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
          RETRYABLE_FAILURE_AT_MAXIMUM_ATTEMPT: 'RETRY_BUDGET_EXHAUSTED',
          CRASH_OR_HANG_AT_MAXIMUM_ATTEMPT: 'RETRY_BUDGET_EXHAUSTED',
        },
        knownRetryableFailure:
          'CAS_PROCESSING_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE_CLEAR_OWNER_AND_LEASE_KEEP_PROCESSING_SET_NEXT_ATTEMPT_AT_NOW_PLUS_BACKOFF_FOR_NEXT_ATTEMPT_NO_AUDIT',
        crashOrHang:
          'IF_NEXT_ATTEMPT_AT_NOT_NULL_FOLLOW_SCHEDULE_ELSE_IF_NOW_GTE_IMMUTABLE_ATTEMPT_DEADLINE_USE_ATTEMPT_DEADLINE_WATCHDOG_ELSE_AT_LEASE_EXPIRY_BEFORE_ATTEMPT_DEADLINE_CAS_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_IF_ATTEMPTS_REMAIN_CLEAR_OWNER_SET_NEXT_ATTEMPT_AT_TO_LEASE_EXPIRY_THEN_DUE_OWNER_NULL_CLAIM_ELSE_TO_FAILED_RETRY_BUDGET_EXHAUSTED_AND_SINGLE_SYSTEM_AUDIT_IN_ONE_TRANSACTION',
        claim:
          'POSTGRESQL_CAS_PROCESSING_OWNER_NULL_ATTEMPTS_REMAIN_AND_NOW_GTE_NEXT_ATTEMPT_AT_INCREMENT_GENERATION_AND_ATTEMPT_NUMBER_REPLACE_ATTEMPT_ID_SET_ATTEMPT_STARTED_AT_NOW_AND_IMMUTABLE_ATTEMPT_DEADLINE_NOW_PLUS_600_SECONDS_SET_LEASE_EXPIRES_AT_MIN_NOW_PLUS_120_SECONDS_ATTEMPT_DEADLINE',
        leaseRenewal:
          'CAS_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_WHILE_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE_SET_LEASE_EXPIRES_AT_MIN_NOW_PLUS_120_SECONDS_ATTEMPT_DEADLINE_NEVER_EXTEND_ATTEMPT_DEADLINE',
        attemptDeadlineExpiry:
          'WATCHDOG_AT_OR_AFTER_IMMUTABLE_ATTEMPT_DEADLINE_REJECT_READY_FAILED_AND_RENEW_THEN_CAS_PROCESSING_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_IF_ATTEMPTS_REMAIN_CLEAR_OWNER_AND_LEASE_SET_NEXT_ATTEMPT_AT_NOW_PLUS_BACKOFF_NO_AUDIT_ELSE_TO_FAILED_RETRY_BUDGET_EXHAUSTED_AND_SINGLE_SYSTEM_AUDIT_IN_ONE_TRANSACTION',
        fencingToken: 'MONOTONIC_GENERATION_PLUS_RANDOM_ATTEMPT_ID',
        staleWorker:
          'CANNOT_CAS_RETRY_SCHEDULE_READY_OR_FAILED_CANNOT_PUBLISH_METADATA_VISIBILITY_OR_AUDIT_AFTER_FENCE_CHANGE',
        stalePutCompletion:
          'AN_ALREADY_STARTED_PUT_MAY_FINISH_ONLY_AT_ITS_IMMUTABLE_EXPORT_GENERATION_ATTEMPT_STAGING_KEY_REMAINS_INVISIBLE_AND_BECOMES_TARGETED_ORPHAN',
        stableIdentity: 'EXPORT_ID_ATTEMPT_ID_GENERATION_AND_IMMUTABLE_STAGING_OBJECT_KEY',
        order: [
          'CLAIM',
          'BUILD_PAYLOADS',
          'BUILD_JCS_MANIFEST',
          'SIGN_JWS_ED25519',
          'ASSEMBLE_FINAL_ZIP',
          'HASH_FINAL_ZIP',
          'ENCRYPT_AND_UPLOAD_STAGING_OBJECT',
          'READ_BACK_DECRYPT_VERIFY_HASH_AND_JWS',
          'POSTGRESQL_CAS_READY_METADATA_AND_SYSTEM_AUDIT_IN_ONE_TRANSACTION',
          'CONFIRM_COMMIT_BEFORE_VISIBILITY',
        ],
        readyTransaction:
          'CAS_PROCESSING_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE_TO_READY_PLUS_OBJECT_METADATA_CONTENT_SHA256_SIGNATURE_KEY_ID_AND_SINGLE_SYSTEM_AUDIT',
        distributedTransaction: false,
        uploadSucceededThenCrash:
          'STAGING_OBJECT_REMAINS_INVISIBLE_RECONCILE_FROM_POSTGRESQL_AND_VERIFIED_OBJECT',
        commitUnknown:
          'READ_POSTGRESQL_BY_EXPORT_ID_AND_GENERATION_IF_READY_MATCHES_STOP_IF_FAILED_MATCHES_STOP_AND_VERIFY_FAILURE_CODE_AND_SINGLE_AUDIT_IF_PROCESSING_SAME_FENCE_RESUME_TERMINAL_CAS_ONLY_WHILE_CURRENT_OWNER_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_ATTEMPT_DEADLINE_ELSE_FOLLOW_SCHEDULED_RETRY_LEASE_EXPIRY_RECLAIM_OR_DEADLINE_WATCHDOG_IF_STALE_MARK_TARGETED_ORPHAN_NO_BLIND_RETRY',
        orphanDeletion:
          'ONLY_STAGING_OBJECT_PROVEN_UNREFERENCED_NOT_READ_LEASED_AND_OLDER_THAN_24_HOURS',
        duplicatePrevention:
          'UNIQUE_EXPORT_ID_TERMINAL_GENERATION_SYSTEM_ACTION_AND_CAS_PREVENT_DOUBLE_READY_FAILED_PUBLICATION_OR_AUDIT',
        failedTransaction:
          'CAS_PROCESSING_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE_TO_FAILED_PLUS_CLOSED_EXPORT_FAILURE_CODE_AND_SINGLE_SYSTEM_AUDIT_IN_ONE_TRANSACTION',
        nonTerminalRetryAudit: 'NO_AUDIT_LOG_FOR_NON_TERMINAL_RETRY',
        terminalFailureAuditUniqueness: 'EXPORT_ID+FAILED_GENERATION+SYSTEM_ACTION',
      },
      downloadExpirationArbitration: {
        authorizationBeforeFirstByte: true,
        acquireReadLease:
          'POSTGRESQL_CAS_READY_NOT_EXPIRED_VERIFIED_OBJECT_AND_STEP_UP_BEFORE_SUCCESS_AUDIT',
        readLeaseSeconds: 300,
        readLeaseHeartbeatSeconds: 30,
        maximumProtectedReadSeconds: 900,
        newOpenAfterExpiry: 'REJECT_AUDIT_EXPORT_EXPIRED',
        expiryWithActiveRead:
          'CAS_READY_TO_EXPIRED_WITH_SYSTEM_AUDIT_THEN_DEFER_OBJECT_DELETE_UNTIL_ALL_VALID_READ_LEASES_RELEASE_OR_EXPIRE',
        release: 'EXPLICIT_ON_COMPLETE_OR_INTERRUPT',
        crashRecovery: 'LEASE_TIMEOUT_THEN_TARGETED_DELETE_ELIGIBILITY_RECHECK',
        successMeaning:
          'AUTHORIZATION_READ_LEASE_AND_BEGINNING_DURABLY_RECORDED_NOT_CLIENT_RECEIPT',
        terminalObservation:
          'SEPARATE_OPERATIONAL_COMPLETE_INTERRUPTED_OR_UNKNOWN_NEVER_REWRITES_APPEND_ONLY_AUDIT',
      },
      unknownCommitReconciliationBranches: [
        {
          durableState: 'READY_MATCHING_GENERATION',
          requiredAction: 'STOP_RETURN_DURABLE_READY_NO_RETRY',
          terminalAudit: 'EXACTLY_ONE_SUCCESS',
          resumeCas: false,
        },
        {
          durableState: 'FAILED_MATCHING_GENERATION',
          requiredAction: 'STOP_RETURN_DURABLE_FAILED_WITH_CLOSED_FAILURE_CODE_NO_RETRY',
          terminalAudit: 'EXACTLY_ONE_REJECTED_WITH_MAPPED_FAILURE_CODE',
          resumeCas: false,
        },
        {
          durableState: 'PROCESSING_SAME_FENCE',
          requiredAction:
            'IF_CURRENT_ATTEMPT_ID_AND_OWNER_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE_RESUME_SINGLE_FENCED_CAS_FROM_VERIFIED_STAGING_STATE_ELSE_NO_TERMINAL_CAS_FOLLOW_EXISTING_RETRY_SCHEDULE_OR_LEASE_EXPIRY_RECLAIM_OR_ATTEMPT_DEADLINE_WATCHDOG',
          terminalAudit: 'NONE_UNTIL_TERMINAL_CAS',
          resumeCas: 'CONDITIONAL',
          terminalEligibility:
            'CURRENT_ATTEMPT_ID_AND_OWNER_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE',
          ineligibleAction:
            'NO_TERMINAL_CAS_FOLLOW_EXISTING_RETRY_SCHEDULE_OR_LEASE_EXPIRY_RECLAIM_OR_ATTEMPT_DEADLINE_WATCHDOG',
        },
        {
          durableState: 'STALE_FENCE_OR_DIFFERENT_GENERATION',
          requiredAction: 'STOP_NO_MUTATION_PUBLICATION_OR_AUDIT_NEVER_TOUCH_CURRENT_OBJECT',
          terminalAudit: 'NONE_BY_STALE_WORKER',
          resumeCas: false,
          stagingRule:
            'OLD_STAGING_ONLY_TARGETED_CLEANUP_ELIGIBLE_AFTER_UNREFERENCED_NO_READ_LEASE_AND_24_HOURS',
        },
      ],
      unknownCommitEligibilityTraces: [
        {
          name: 'SAME_FENCE_ACTIVE_OWNER_LEASE_AND_DEADLINE_RESUMES_TERMINAL_CAS',
          initial: {
            currentOwner: true,
            leaseExpiresAt: 120,
            nextAttemptAt: null,
            attemptDeadline: 600,
            now: 119,
          },
          expectedAction: 'RESUME_TERMINAL_CAS',
        },
        {
          name: 'SAME_FENCE_SCHEDULED_RETRY_DOES_NOT_RESUME_TERMINAL_CAS',
          initial: {
            currentOwner: false,
            leaseExpiresAt: null,
            nextAttemptAt: 30,
            attemptDeadline: 600,
            now: 10,
          },
          expectedAction: 'FOLLOW_SCHEDULED_RETRY',
        },
        {
          name: 'SAME_FENCE_EXPIRED_LEASE_FOLLOWS_RECLAIM',
          initial: {
            currentOwner: true,
            leaseExpiresAt: 120,
            nextAttemptAt: null,
            attemptDeadline: 600,
            now: 120,
          },
          expectedAction: 'FOLLOW_LEASE_EXPIRY_RECLAIM',
        },
        {
          name: 'SAME_FENCE_ATTEMPT_DEADLINE_FOLLOWS_WATCHDOG',
          initial: {
            currentOwner: true,
            leaseExpiresAt: 600,
            nextAttemptAt: null,
            attemptDeadline: 600,
            now: 600,
          },
          expectedAction: 'FOLLOW_ATTEMPT_DEADLINE_WATCHDOG',
        },
      ],
      contractualTraces: [
        {
          name: 'TWO_WORKERS_ONLY_ONE_CAS_CLAIM',
          initial: {
            state: 'PENDING',
            generation: 0,
          },
          events: [
            {
              type: 'CLAIM',
              worker: 'A',
              expectedGeneration: 0,
            },
            {
              type: 'CLAIM',
              worker: 'B',
              expectedGeneration: 0,
            },
          ],
          expected: {
            state: 'PROCESSING',
            generation: 1,
            owner: 'A',
            visible: false,
            auditCount: 0,
          },
        },
        {
          name: 'EXPIRED_LEASE_RECLAIM_INCREMENTS_FENCE',
          initial: {
            state: 'PROCESSING',
            generation: 1,
            owner: 'A',
            leaseExpired: true,
          },
          events: [
            {
              type: 'CLAIM',
              worker: 'B',
              expectedGeneration: 1,
            },
          ],
          expected: {
            state: 'PROCESSING',
            generation: 2,
            owner: 'B',
            visible: false,
            auditCount: 0,
          },
        },
        {
          name: 'LATE_OLD_WORKER_REJECTED_BY_FENCE',
          initial: {
            state: 'PROCESSING',
            generation: 2,
            owner: 'B',
          },
          events: [
            {
              type: 'PUBLISH',
              worker: 'A',
              expectedGeneration: 1,
            },
          ],
          expected: {
            state: 'PROCESSING',
            generation: 2,
            owner: 'B',
            visible: false,
            auditCount: 0,
          },
        },
        {
          name: 'CRASH_AFTER_UPLOAD_RECONCILES_STAGING_OBJECT',
          initial: {
            state: 'PROCESSING',
            generation: 1,
            owner: 'A',
          },
          events: [
            {
              type: 'UPLOAD_STAGING',
              worker: 'A',
              expectedGeneration: 1,
            },
            {
              type: 'CRASH',
              worker: 'A',
            },
            {
              type: 'CLAIM',
              worker: 'B',
              expectedGeneration: 1,
            },
            {
              type: 'RECONCILE_STAGING',
              worker: 'B',
              expectedGeneration: 2,
            },
            {
              type: 'UPLOAD_STAGING',
              worker: 'B',
              expectedGeneration: 2,
            },
            {
              type: 'PUBLISH',
              worker: 'B',
              expectedGeneration: 2,
            },
          ],
          expected: {
            state: 'READY',
            generation: 2,
            owner: 'B',
            visible: true,
            auditCount: 1,
            targetedOrphans: ['A:1'],
          },
        },
        {
          name: 'UNKNOWN_COMMIT_READS_DURABLE_STATE_BEFORE_ACTION',
          initial: {
            state: 'PROCESSING',
            generation: 1,
            owner: 'A',
            stagingVerified: true,
            currentStaging: 'A:1',
          },
          events: [
            {
              type: 'COMMIT_READY',
              worker: 'A',
              expectedGeneration: 1,
              ack: 'UNKNOWN',
            },
            {
              type: 'READ_DURABLE',
              worker: 'A',
              expectedGeneration: 1,
            },
          ],
          expected: {
            state: 'READY',
            generation: 1,
            owner: 'A',
            visible: true,
            auditCount: 1,
          },
        },
        {
          name: 'CONCURRENT_EXPIRY_DOWNLOAD_PROTECTS_ACQUIRED_READ_AND_REJECTS_NEW_OPEN',
          initial: {
            state: 'READY',
            generation: 1,
            visible: true,
            downloadAuditCount: 0,
            expiryAuditCount: 0,
          },
          events: [
            {
              type: 'ACQUIRE_READ',
              reader: 'R1',
            },
            {
              type: 'AUDIT_DOWNLOAD_COMMIT',
              reader: 'R1',
            },
            {
              type: 'BEGIN_STREAM',
              reader: 'R1',
            },
            {
              type: 'EXPIRE_READY',
            },
            {
              type: 'EXPIRE_READY',
            },
            {
              type: 'OPEN_READ',
              reader: 'R2',
            },
            {
              type: 'COMPLETE_READ',
              reader: 'R1',
            },
          ],
          expected: {
            state: 'EXPIRED',
            generation: 1,
            owner: null,
            visible: false,
            auditCount: 2,
            downloadAuditCount: 1,
            expiryAuditCount: 1,
            completedReaders: ['R1'],
            streamingReaders: ['R1'],
            rejectedReaders: ['R2'],
          },
        },
      ],
      retryContractualTraces: [
        {
          name: 'KNOWN_RETRYABLE_FAILURE_SCHEDULES_ATTEMPT_2',
          initial: {
            state: 'PROCESSING',
            generation: 1,
            attemptNumber: 1,
            owner: 'A',
            now: 0,
          },
          events: [
            {
              type: 'KNOWN_FAILURE',
              worker: 'A',
              expectedGeneration: 1,
              failureClass: 'TRANSIENT_DEPENDENCY_UNAVAILABLE',
            },
          ],
          expected: {
            state: 'PROCESSING',
            generation: 1,
            attemptNumber: 1,
            owner: null,
            nextAttemptAt: 30,
            visible: false,
            auditCount: 0,
          },
        },
        {
          name: 'RETRY_BEFORE_DEADLINE_REJECTED_THEN_DUE_CLAIM_ACCEPTED',
          initial: {
            state: 'PROCESSING',
            generation: 1,
            attemptNumber: 1,
            owner: null,
            nextAttemptAt: 30,
          },
          events: [
            {
              type: 'CLAIM_RETRY',
              worker: 'B',
              now: 29,
              expectedGeneration: 1,
            },
            {
              type: 'CLAIM_RETRY',
              worker: 'B',
              now: 30,
              expectedGeneration: 1,
            },
          ],
          expected: {
            state: 'PROCESSING',
            generation: 2,
            attemptNumber: 2,
            owner: 'B',
            nextAttemptAt: null,
            rejectedClaims: 1,
            visible: false,
            auditCount: 0,
          },
        },
        {
          name: 'SCHEDULED_RETRY_REVOKES_OLD_WORKER_BEFORE_NEXT_CLAIM',
          initial: {
            state: 'PROCESSING',
            generation: 1,
            attemptNumber: 1,
            owner: 'A',
            leaseExpiresAt: 120,
            attemptDeadline: 600,
            now: 0,
          },
          events: [
            {
              type: 'KNOWN_FAILURE',
              worker: 'A',
              expectedGeneration: 1,
              failureClass: 'TRANSIENT_DEPENDENCY_UNAVAILABLE',
              now: 0,
            },
            {
              type: 'PUT_COMPLETE',
              worker: 'A',
              expectedGeneration: 1,
              now: 10,
            },
            {
              type: 'COMMIT_READY',
              worker: 'A',
              expectedGeneration: 1,
              expectedAttemptNumber: 1,
              now: 10,
            },
            {
              type: 'CLAIM_RETRY',
              worker: 'B',
              now: 30,
              expectedGeneration: 1,
            },
          ],
          expected: {
            state: 'PROCESSING',
            generation: 2,
            attemptNumber: 2,
            owner: 'B',
            nextAttemptAt: null,
            visible: false,
            auditCount: 0,
            terminalCasRejected: 1,
            targetedOrphans: ['A:1'],
          },
        },
        {
          name: 'TERMINAL_CAS_BEFORE_ATTEMPT_DEADLINE_ACCEPTED',
          initial: {
            state: 'PROCESSING',
            generation: 1,
            attemptNumber: 1,
            owner: 'A',
            leaseExpiresAt: 600,
            attemptDeadline: 600,
            nextAttemptAt: null,
          },
          events: [
            {
              type: 'COMMIT_READY',
              worker: 'A',
              expectedGeneration: 1,
              expectedAttemptNumber: 1,
              now: 599,
            },
          ],
          expected: {
            state: 'READY',
            generation: 1,
            attemptNumber: 1,
            owner: null,
            visible: true,
            auditCount: 1,
            terminalCasRejected: 0,
          },
        },
        {
          name: 'TERMINAL_CAS_AT_ATTEMPT_DEADLINE_REJECTED_AND_TIMEOUT_SCHEDULED',
          initial: {
            state: 'PROCESSING',
            generation: 1,
            attemptNumber: 1,
            owner: 'A',
            leaseExpiresAt: 600,
            attemptDeadline: 600,
            nextAttemptAt: null,
          },
          events: [
            {
              type: 'COMMIT_READY',
              worker: 'A',
              expectedGeneration: 1,
              expectedAttemptNumber: 1,
              now: 600,
            },
            {
              type: 'ATTEMPT_DEADLINE',
              worker: 'A',
              expectedGeneration: 1,
              expectedAttemptNumber: 1,
              now: 600,
            },
          ],
          expected: {
            state: 'PROCESSING',
            generation: 1,
            attemptNumber: 1,
            owner: null,
            nextAttemptAt: 630,
            visible: false,
            auditCount: 0,
            terminalCasRejected: 1,
            timeoutCount: 1,
          },
        },
        {
          name: 'LEASE_AND_DEADLINE_COLLISION_PRIORITIZES_WATCHDOG_BACKOFF',
          initial: {
            state: 'PROCESSING',
            generation: 1,
            attemptNumber: 1,
            owner: 'A',
            leaseExpiresAt: 600,
            attemptDeadline: 600,
            nextAttemptAt: null,
          },
          events: [
            {
              type: 'CRASH',
              worker: 'A',
              now: 10,
            },
            {
              type: 'CLAIM_AFTER_CRASH',
              worker: 'B',
              now: 600,
              expectedGeneration: 1,
            },
            {
              type: 'ATTEMPT_DEADLINE',
              worker: 'A',
              expectedGeneration: 1,
              expectedAttemptNumber: 1,
              now: 600,
            },
          ],
          expected: {
            state: 'PROCESSING',
            generation: 1,
            attemptNumber: 1,
            owner: null,
            nextAttemptAt: 630,
            rejectedClaims: 1,
            visible: false,
            auditCount: 0,
            timeoutCount: 1,
          },
        },
        {
          name: 'THIRD_ATTEMPT_DEADLINE_TIMEOUT_FAILS_WITH_UNIQUE_AUDIT',
          initial: {
            state: 'PROCESSING',
            generation: 3,
            attemptNumber: 3,
            owner: 'C',
            leaseExpiresAt: 1800,
            attemptDeadline: 1800,
            nextAttemptAt: null,
          },
          events: [
            {
              type: 'CRASH',
              worker: 'C',
              now: 1700,
            },
            {
              type: 'CLAIM_AFTER_CRASH',
              worker: 'D',
              now: 1800,
              expectedGeneration: 3,
            },
            {
              type: 'ATTEMPT_DEADLINE',
              worker: 'C',
              expectedGeneration: 3,
              expectedAttemptNumber: 3,
              now: 1800,
            },
          ],
          expected: {
            state: 'FAILED',
            generation: 3,
            attemptNumber: 3,
            owner: null,
            failureCode: 'RETRY_BUDGET_EXHAUSTED',
            visible: false,
            auditCount: 1,
            rejectedClaims: 1,
            timeoutCount: 1,
          },
        },
        {
          name: 'THIRD_ATTEMPT_CRASH_BEFORE_DEADLINE_FAILS_WITH_UNIQUE_AUDIT',
          initial: {
            state: 'PROCESSING',
            generation: 3,
            attemptNumber: 3,
            owner: 'C',
            leaseExpiresAt: 120,
            attemptDeadline: 600,
            nextAttemptAt: null,
          },
          events: [
            {
              type: 'CRASH',
              worker: 'C',
              now: 10,
            },
            {
              type: 'CLAIM_AFTER_CRASH',
              worker: 'D',
              now: 120,
              expectedGeneration: 3,
            },
          ],
          expected: {
            state: 'FAILED',
            generation: 3,
            attemptNumber: 3,
            owner: null,
            failureCode: 'RETRY_BUDGET_EXHAUSTED',
            visible: false,
            auditCount: 1,
            rejectedClaims: 0,
          },
        },
        {
          name: 'NON_RETRYABLE_FAILURE_TERMINATES',
          initial: {
            state: 'PROCESSING',
            generation: 1,
            attemptNumber: 1,
            owner: 'A',
          },
          events: [
            {
              type: 'KNOWN_FAILURE',
              worker: 'A',
              expectedGeneration: 1,
              failureClass: 'INTEGRITY_FAILED',
            },
          ],
          expected: {
            state: 'FAILED',
            generation: 1,
            attemptNumber: 1,
            owner: null,
            failureCode: 'INTEGRITY_FAILED',
            visible: false,
            auditCount: 1,
          },
        },
        {
          name: 'THIRD_RETRYABLE_FAILURE_EXHAUSTS_BUDGET',
          initial: {
            state: 'PROCESSING',
            generation: 3,
            attemptNumber: 3,
            owner: 'C',
          },
          events: [
            {
              type: 'KNOWN_FAILURE',
              worker: 'C',
              expectedGeneration: 3,
              failureClass: 'TRANSIENT_DEPENDENCY_UNAVAILABLE',
            },
          ],
          expected: {
            state: 'FAILED',
            generation: 3,
            attemptNumber: 3,
            owner: null,
            failureCode: 'RETRY_BUDGET_EXHAUSTED',
            visible: false,
            auditCount: 1,
          },
        },
        {
          name: 'STALE_SCHEDULE_CAS_REJECTED_AND_OLD_PUT_ORPHANED',
          initial: {
            state: 'PROCESSING',
            generation: 2,
            attemptNumber: 2,
            owner: 'B',
          },
          events: [
            {
              type: 'PUT_COMPLETE',
              worker: 'A',
              expectedGeneration: 1,
            },
            {
              type: 'SCHEDULE_RETRY',
              worker: 'A',
              expectedGeneration: 1,
            },
          ],
          expected: {
            state: 'PROCESSING',
            generation: 2,
            attemptNumber: 2,
            owner: 'B',
            visible: false,
            auditCount: 0,
            retryScheduleRejected: true,
            targetedOrphans: ['A:1'],
          },
        },
        {
          name: 'CRASH_WAITS_FOR_LEASE_EXPIRY_THEN_DUE_CLAIM',
          initial: {
            state: 'PROCESSING',
            generation: 1,
            attemptNumber: 1,
            owner: 'A',
            leaseExpiresAt: 120,
            attemptDeadline: 600,
          },
          events: [
            {
              type: 'CRASH',
              worker: 'A',
              now: 10,
            },
            {
              type: 'CLAIM_AFTER_CRASH',
              worker: 'B',
              now: 119,
              expectedGeneration: 1,
            },
            {
              type: 'CLAIM_AFTER_CRASH',
              worker: 'B',
              now: 120,
              expectedGeneration: 1,
            },
          ],
          expected: {
            state: 'PROCESSING',
            generation: 2,
            attemptNumber: 2,
            owner: 'B',
            nextAttemptAt: null,
            rejectedClaims: 1,
            visible: false,
            auditCount: 0,
          },
        },
      ],
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
    transactionClientDisposal: {
      scope: ['HTTP', 'BOOTSTRAP', 'OUTBOX', 'JOBS', 'SYSTEM_TRANSITIONS'],
      appliesTo: 'ALL_FUTURE_C2_WRITERS',
      runtimeImplementedInP0R6: false,
      acquisitionAndCallbackLiveness: {
        runtimeAuthorizationPrerequisite:
          'OPERATION_SPECIFIC_MONOTONIC_DEADLINES_DECLARED_AND_TESTED',
        deadlineValuesInP0R6: 'NOT_DEFINED_NO_RUNTIME_AUTHORIZED',
        unboundedAcquisitionOrCallback: 'FORBIDDEN',
        lateAcquisition: 'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE_NO_BEGIN_NO_CALLBACK',
        callbackDeadline:
          'ABORT_SIGNAL_THEN_ROLLBACK_ONLY_IF_CALLBACK_QUIESCENCE_CONFIRMED_ELSE_DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE',
        postDeadlineCallbackQuery: 'FORBIDDEN',
      },
      begin: {
        deadlineMilliseconds: 2000,
        deadlineClock: 'MONOTONIC_ELAPSED',
        callbackAllowedWhen: 'BEGIN_CONFIRMED',
        explicitRejectionDisposition:
          'REUSABLE_SINGLE_RELEASE_ONLY_IF_POST_COMMAND_READY_FOR_QUERY_IDLE_SAME_CLIENT_AND_CLIENT_USABLE',
        unconfirmedOutcomes: ['DEADLINE_EXCEEDED', 'CONNECTION_LOST', 'ACKNOWLEDGEMENT_LOST'],
        unconfirmedDisposition: 'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE',
        callbackAfterRejectedOrUnconfirmedBegin: 'FORBIDDEN',
        transactionRetry: 'FORBIDDEN',
        lateSettlement:
          'OBSERVE_ONLY_NO_CALLBACK_NO_RECLASSIFICATION_NO_RESPONSE_NO_RELEASE_NO_RETRY',
      },
      rollback: {
        requiredWhen: 'ANY_FAILURE_OR_ABORT_AFTER_BEGIN_CONFIRMED_BEFORE_COMMIT_ATTEMPT',
        deadlineMilliseconds: 2000,
        deadlineClock: 'MONOTONIC_ELAPSED',
        reuseAllowedWhen:
          'ROLLBACK_CONFIRMED_BEFORE_DEADLINE_AND_POST_COMMAND_READY_FOR_QUERY_IDLE_SAME_CLIENT_AND_CLIENT_USABLE',
        reusableReadyForQueryStates: ['I'],
        discardReadyForQueryStates: ['T', 'E', 'UNKNOWN'],
        unconfirmedOutcomes: ['REJECTED', 'DEADLINE_EXCEEDED', 'CONNECTION_LOST'],
        unconfirmedDisposition: 'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE',
        lateSettlement: 'OBSERVE_ONLY_NO_REUSE_NO_SECOND_RELEASE',
      },
      commit: {
        attemptBoundary: 'MARK_COMMIT_ATTEMPTED_BEFORE_DRIVER_CALL',
        acknowledgementDeadlineMilliseconds: 2000,
        deadlineClock: 'MONOTONIC_ELAPSED',
        acknowledgedWhen: 'TERMINAL_SERVER_RESULT_RECEIVED_BEFORE_DEADLINE',
        successOutcome: 'COMMIT_CONFIRMED_DURABLE_SUCCESS_NOT_RECLASSIFIED_BY_CLIENT_DISPOSITION',
        successReuseAllowedWhen: 'POST_COMMAND_READY_FOR_QUERY_IDLE_SAME_CLIENT_AND_CLIENT_USABLE',
        successOtherwiseDisposition:
          'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE_WITH_SUCCESS_RESPONSE_PRESERVED',
        explicitServerRejection:
          'CONFIRMED_NOT_COMMITTED_NEUTRAL_503_NO_ROLLBACK_AFTER_COMMIT_ATTEMPT_NO_REPLAY',
        explicitServerRejectionReuseAllowedWhen:
          'POST_COMMAND_READY_FOR_QUERY_IDLE_SAME_CLIENT_AND_CLIENT_USABLE',
        explicitServerRejectionOtherwiseDisposition: 'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE',
        unknownOutcomes: ['DEADLINE_EXCEEDED', 'CONNECTION_LOST', 'ACKNOWLEDGEMENT_LOST'],
        unknownDisposition: 'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE',
        lateSettlement: 'OBSERVE_ONLY_NO_RECLASSIFICATION_NO_RESPONSE_NO_RELEASE_NO_REPLAY',
      },
      release: {
        totalCardinality: 'EXACTLY_ONCE',
        reusable: 'POOL_RELEASE_REUSABLE_ONLY_AFTER_CONFIRMED_IDLE',
        discard: 'PUBLIC_POOL_CLIENT_DESTROY_OR_EQUIVALENT_PHYSICAL_CONNECTION_DISCARD',
        defaultForAcquiredClientNotMeetingReusablePredicate:
          'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE',
        doubleRelease: 'FORBIDDEN',
      },
      errors: {
        primary: 'PRESERVE_SEPARATELY',
        begin: 'PRESERVE_SEPARATELY_AS_ERROR_OR_TERMINAL_OUTCOME',
        rollback: 'PRESERVE_SEPARATELY_AS_ERROR_OR_TERMINAL_OUTCOME',
        commit: 'PRESERVE_SEPARATELY_AS_ERROR_OR_TERMINAL_OUTCOME',
        operationalObservation: 'SANITIZED_WITHOUT_PUBLIC_DISCLOSURE',
        rollbackSuccessClaim: 'FORBIDDEN_WITHOUT_CONFIRMATION',
      },
      phaseExclusivity: {
        commitAttemptBoundary: 'MARK_COMMIT_ATTEMPTED_BEFORE_DRIVER_CALL',
        preCommitConnectionLoss: 'COMMIT_NOT_ATTEMPTED',
        postCommitAttemptConnectionLoss: 'COMMIT_UNKNOWN_EXCLUSIVELY',
        rollbackAfterCommitAttempt: 'FORBIDDEN',
        overlap: 'FORBIDDEN',
      },
      publicFailure: {
        response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
        transactionRetry: 'FORBIDDEN',
        secondSink: 'FORBIDDEN',
        durableRollbackClaim: 'FORBIDDEN_WITHOUT_CONFIRMATION',
      },
      commitUnknown: {
        classification: 'SEPARATE_FROM_PRE_COMMIT_ROLLBACK_FAILURE',
        clientDisposition: 'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE',
        rollbackAttempt: 'FORBIDDEN',
        rollbackClaim: 'FORBIDDEN',
        mutationReplay: 'FORBIDDEN',
        response: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
        continuation: 'RECONCILE_DURABLE_STATE_BEFORE_ANY_STATE_MACHINE_AUTHORIZED_ACTION',
      },
      jobRetryBoundary:
        'STATE_MACHINE_AUTHORIZED_NEW_ATTEMPT_NEVER_AUTHORIZES_REPLAY_OF_UNKNOWN_OUTCOME_MUTATION',
      contractualTraces: [
        {
          name: 'CALLBACK_FAILED_ROLLBACK_CONFIRMED',
          begin: 'CONFIRMED_BEFORE_CALLBACK',
          callback: 'FAILED_BEFORE_COMMIT',
          rollback: 'CONFIRMED_BEFORE_2000_MS',
          commit: 'NOT_ATTEMPTED',
          readyForQuery: 'POST_ROLLBACK_I_SAME_CLIENT',
          clientDisposition:
            'REUSABLE_SINGLE_RELEASE_IF_POST_COMMAND_I_SAME_CLIENT_AND_CLIENT_USABLE_ELSE_DISCARD_EXACTLY_ONCE',
          publicOutcome: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
          transactionRetry: 'FORBIDDEN',
          secondSink: 'FORBIDDEN',
        },
        {
          name: 'ROLLBACK_REJECTED',
          begin: 'CONFIRMED_BEFORE_CALLBACK',
          callback: 'FAILED_BEFORE_COMMIT',
          rollback: 'REJECTED',
          commit: 'NOT_ATTEMPTED',
          readyForQuery: 'UNKNOWN',
          clientDisposition: 'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE',
          publicOutcome: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
          transactionRetry: 'FORBIDDEN',
          secondSink: 'FORBIDDEN',
        },
        {
          name: 'ROLLBACK_SUSPENDED',
          begin: 'CONFIRMED_BEFORE_CALLBACK',
          callback: 'FAILED_BEFORE_COMMIT',
          rollback: 'DEADLINE_EXCEEDED_2000_MS',
          commit: 'NOT_ATTEMPTED',
          readyForQuery: 'UNKNOWN',
          clientDisposition:
            'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE_LATE_SETTLEMENT_OBSERVED_ONLY',
          publicOutcome: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
          transactionRetry: 'FORBIDDEN',
          secondSink: 'FORBIDDEN',
        },
        {
          name: 'CONNECTION_LOST',
          begin: 'CONFIRMED_BEFORE_CALLBACK',
          callback: 'FAILED_BEFORE_COMMIT',
          rollback: 'UNCONFIRMED_CONNECTION_LOST',
          commit: 'NOT_ATTEMPTED',
          connectionLossPhase: 'PRE_COMMIT_ONLY',
          readyForQuery: 'UNKNOWN',
          clientDisposition: 'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE',
          publicOutcome: 'NEUTRAL_503_SERVICE_UNAVAILABLE',
          transactionRetry: 'FORBIDDEN',
          secondSink: 'FORBIDDEN',
        },
        {
          name: 'COMMIT_CONFIRMED',
          begin: 'CONFIRMED_BEFORE_CALLBACK',
          callback: 'SUCCEEDED',
          rollback: 'NOT_ATTEMPTED',
          commit: 'CONFIRMED_BEFORE_2000_MS',
          readyForQuery: 'POST_COMMIT_I_SAME_CLIENT',
          clientDisposition: 'REUSABLE_SINGLE_RELEASE_IF_CLIENT_USABLE',
          publicOutcome: 'OPERATION_SUCCESS_RESPONSE',
          transactionRetry: 'NOT_APPLICABLE',
          secondSink: 'FORBIDDEN',
        },
        {
          name: 'COMMIT_UNKNOWN',
          begin: 'CONFIRMED_BEFORE_CALLBACK',
          callback: 'SUCCEEDED',
          rollback: 'FORBIDDEN_NOT_CLAIMED',
          commit: 'ATTEMPTED_ACKNOWLEDGEMENT_NOT_CONFIRMED_BY_2000_MS',
          connectionLossPhase: 'AT_OR_AFTER_COMMIT_ATTEMPT',
          readyForQuery: 'UNKNOWN',
          clientDisposition: 'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE',
          publicOutcome: 'NEUTRAL_503_SERVICE_UNAVAILABLE_RECONCILE_DURABLE_STATE',
          transactionRetry: 'FORBIDDEN_NO_MUTATION_REPLAY',
          secondSink: 'FORBIDDEN',
        },
      ],
    },
    systemAuditCausality: {
      typedSecurityEventField: 'causationSecurityEventId',
      clientSupplied: false,
      sourceOfTruth: 'DURABLE_SERVER_CREATED_STATE_ONLY',
      origins: {
        AUTONOMOUS: {
          causationEventId: 'NULL',
          causationSecurityEventId: 'NULL',
          delegatedByAdminUserId: 'NULL',
        },
        ADMIN_DELEGATION: {
          causationEventId: 'AUDIT_LOG_ID_REQUIRED',
          causationSecurityEventId: 'NULL',
          delegatedByAdminUserId: 'ADMIN_USER_ID_REQUIRED',
        },
        PUBLIC_PASSWORD_RESET: {
          causationEventId: 'NULL',
          causationSecurityEventId: 'ADMIN_SECURITY_EVENT_ID_REQUIRED',
          delegatedByAdminUserId: 'NULL',
        },
      },
      publicPasswordReset: {
        initiatingOperationId: 'requestAdminPasswordReset',
        authentication: 'PUBLIC_NO_AUTHENTICATED_ACTOR',
        sourceRecordType: 'AdminSecurityEvent',
        sourceAction: 'requestAdminPasswordReset',
        sourceEventClass: 'LOGIN',
        sourceEntityType: 'ADMIN_PASSWORD_RESET_REQUEST',
        atomicCreation: 'RESET_REQUEST_ENCRYPTED_OUTBOX_AND_SECURITY_EVENT',
        workerAuditOrigin: 'PUBLIC_PASSWORD_RESET',
        workerValidation: [
          'SOURCE_RECORD_TYPE',
          'SOURCE_ACTION',
          'SOURCE_EVENT_CLASS',
          'SOURCE_ENTITY_TYPE',
          'RESET_REQUEST_BINDING',
          'OUTBOX_BINDING',
        ],
        forbiddenDelegatorSources: [
          'REQUESTED_EMAIL',
          'RECIPIENT_ACCOUNT',
          'SUBJECT_ADMIN_USER_ID',
          'CLIENT_DECLARED_IDENTITY',
        ],
        publicResponseCausalityDisclosure: 'FORBIDDEN',
        autonomousReclassification: 'FORBIDDEN',
      },
    },
    asynchronousAudit: {
      action: 'DISTINCT_FROM_INITIATING_HTTP_OPERATION_ID',
      context: 'SYSTEM',
      causality: 'EXACTLY_ONE_OF_AUTONOMOUS_ADMIN_DELEGATION_OR_PUBLIC_PASSWORD_RESET',
      origins: ['AUTONOMOUS', 'ADMIN_DELEGATION', 'PUBLIC_PASSWORD_RESET'],
    },
    productionQualification: {
      notificationProvider: 'NOT_QUALIFIED',
      pwnedPasswordProvider: 'NOT_QUALIFIED',
      exportStorageProvider: 'NOT_QUALIFIED',
      signatureKeyProvider: 'NOT_QUALIFIED',
      runtimeImplemented: false,
    },
    operationExecutionMatrix: {
      requestAdminPasswordReset: {
        input: 'JSON_EMAIL',
        auditContextProof: 'NONE_PUBLIC_NO_AUDIT_CONTEXT',
        authorizationChecks: [],
        postProofBusinessChecks: ['ELIGIBLE_ACCOUNT_CHECK_WITHOUT_ORACLE'],
        mutationOrSnapshot: 'RESET_REQUEST_ENCRYPTED_OUTBOX',
        audit: 'ADMIN_SECURITY_EVENT',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'PASSWORD_RESET_NOTIFICATION_DELIVERY_SYSTEM_AUDIT',
      },
      resetAdminPassword: {
        input: 'JSON_PASSWORD_RESET_CONTEXT_AND_NEW_PASSWORD',
        auditContextProof:
          'SERVER_VERIFIED_RECOVERY_CONTEXT_ACTOR_BINDING_ACTIVE_NOT_EXPIRED_NOT_CONSUMED_NOT_REVOKED',
        authorizationChecks: ['PASSWORD_RESET_PURPOSE_AND_SUBJECT_ELIGIBILITY'],
        postProofBusinessChecks: ['NEW_PASSWORD_POLICY_AND_HIBP_FAIL_CLOSED'],
        mutationOrSnapshot:
          'PASSWORD_AUTHORIZATION_VERSION_SESSION_REVOCATION_AND_CONTEXT_CONSUMPTION',
        audit: 'AUDIT_LOG',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'NONE',
      },
      createAdminRecoveryCase: {
        input: 'JSON_SUBJECT_REASON_AND_IDEMPOTENCY_KEY',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN_SUPPORT'],
        postProofBusinessChecks: [
          'SUBJECT_ELIGIBLE_DISTINCT_AND_REASON_VALID',
          'IDEMPOTENCY_PAYLOAD_MATCH',
        ],
        mutationOrSnapshot: 'CANCEL_OLDER_PENDING_CREATE_CASE_AND_IDEMPOTENCY_IN_ONE_TRANSACTION',
        audit: 'INITIATING_AUDIT_LOG_AND_ONE_SYSTEM_CANCELLATION_AUDIT_PER_CANCELLED_CASE',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'RECOVERY_CASE_SERVER_EXPIRATION_SYSTEM_AUDIT',
        transactionalSystemEffects: 'RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT',
      },
      listAdminRecoveryCases: {
        input: 'QUERY_FILTERS_CURSOR_LIMIT',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN_SUPPORT'],
        postProofBusinessChecks: ['FILTER_CURSOR_AND_SNAPSHOT_LIMITS'],
        mutationOrSnapshot: 'IMMUTABLE_RECOVERY_CASE_SNAPSHOT',
        audit: 'NONE',
        commit: 'READ_ONLY_TRANSACTION_SNAPSHOT_CONFIRMATION',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'NONE',
      },
      getAdminRecoveryCase: {
        input: 'PATH_RECOVERY_CASE_ID',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN_SUPPORT'],
        postProofBusinessChecks: ['CASE_VISIBLE_OR_NEUTRAL_NOT_FOUND'],
        mutationOrSnapshot: 'READ_RECOVERY_CASE',
        audit: 'NONE',
        commit: 'NOT_APPLICABLE_NO_DURABLE_WRITE',
        response: 'AFTER_SUCCESSFUL_READ_AND_COMPLETE_SERVER_CHECKS',
        continuation: 'NONE',
      },
      approveAdminRecoveryCase: {
        input: 'PATH_CASE_JSON_REASON_STEP_UP_AND_IDEMPOTENCY_KEY',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_RECOVERY_APPROVAL'],
        postProofBusinessChecks: [
          'CASE_PENDING_NOT_EXPIRED_CREATOR_APPROVER_SUBJECT_DISTINCT',
          'SUBJECT_ELIGIBLE_AND_REASON_VALID',
          'IDEMPOTENCY_PAYLOAD_MATCH',
        ],
        mutationOrSnapshot: 'CASE_APPROVAL_SUBJECT_RESET_AND_IDEMPOTENCY',
        audit: 'AUDIT_LOG',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'NONE',
      },
      listAdminAuditLogs: {
        input: 'QUERY_FILTERS_CURSOR_LIMIT',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN'],
        postProofBusinessChecks: ['FILTER_CURSOR_SNAPSHOT_AND_PROJECTION_BUDGET'],
        mutationOrSnapshot: 'IMMUTABLE_AUDIT_SNAPSHOT_BEFORE_READ_AUDIT',
        audit: 'AUDIT_LOG',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'NONE',
      },
      createAdminAuditLogExport: {
        input: 'JSON_FILTERS_REASON_STEP_UP_AND_IDEMPOTENCY_KEY',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_AUDIT_EXPORT'],
        postProofBusinessChecks: [
          'FILTER_SNAPSHOT_REASON_AND_IDEMPOTENCY',
          'EXPORT_BUDGET_DECLARED',
        ],
        mutationOrSnapshot: 'EXPORT_SNAPSHOT_JOB_AND_IDEMPOTENCY',
        audit: 'AUDIT_LOG',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'EXPORT_BUILD_SYSTEM_AUDIT+EXPORT_EXPIRY_SYSTEM_AUDIT',
      },
      getAdminAuditLogExport: {
        input: 'PATH_EXPORT_ID',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN'],
        postProofBusinessChecks: ['EXPORT_VISIBLE_OR_NEUTRAL_NOT_FOUND'],
        mutationOrSnapshot: 'READ_EXPORT_STATE',
        audit: 'AUDIT_LOG',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'NONE',
      },
      downloadAdminAuditLogExport: {
        input: 'PATH_EXPORT_ID',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_AUDIT_EXPORT'],
        postProofBusinessChecks: ['EXPORT_READY_NOT_EXPIRED', 'CONTENT_HASH_AND_JWS_INTEGRITY'],
        mutationOrSnapshot: 'ACQUIRE_BOUNDED_READ_LEASE_AND_VERIFY_ARTIFACT',
        audit: 'AUDIT_LOG',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'BEGIN_STREAM_ONLY_AFTER_DURABLE_SUCCESS_AUDIT_AND_READ_LEASE',
        continuation: 'NONE',
      },
      createAdminInvitation: {
        input: 'JSON_EMAIL_ROLE_REASON_STEP_UP_AND_IDEMPOTENCY_KEY',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_INVITATION'],
        postProofBusinessChecks: [
          'EMAIL_COLLISION_AND_ROLE_REASON_VALID',
          'PASSWORD_PROVIDER_NOT_APPLICABLE',
          'IDEMPOTENCY_PAYLOAD_MATCH',
        ],
        mutationOrSnapshot: 'REVOKE_PRIOR_CREATE_INVITATION_ENCRYPTED_OUTBOX_AND_IDEMPOTENCY',
        audit: 'AUDIT_LOG',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'INVITATION_NOTIFICATION_DELIVERY_SYSTEM_AUDIT',
      },
      acceptAdminInvitation: {
        input: 'JSON_INVITATION_CODE_AND_PASSWORD',
        auditContextProof: 'NONE_PUBLIC_NO_AUDIT_CONTEXT',
        authorizationChecks: [],
        postProofBusinessChecks: [
          'INVITATION_ACTIVE_SINGLE_USE_EMAIL_COLLISION_FREE',
          'PASSWORD_POLICY_AND_HIBP_FAIL_CLOSED',
        ],
        mutationOrSnapshot:
          'CONSUME_INVITATION_CREATE_PENDING_MFA_PASSWORD_CREDENTIAL_AND_FIRST_TOTP_PREAUTH',
        audit: 'ADMIN_SECURITY_EVENT',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'NONE',
      },
      listAdminUsers: {
        input: 'QUERY_FILTERS_CURSOR_LIMIT',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN'],
        postProofBusinessChecks: ['FILTER_CURSOR_AND_SNAPSHOT_LIMITS'],
        mutationOrSnapshot: 'IMMUTABLE_ADMIN_USER_SNAPSHOT',
        audit: 'NONE',
        commit: 'READ_ONLY_TRANSACTION_SNAPSHOT_CONFIRMATION',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'NONE',
      },
      changeAdminUserRole: {
        input: 'PATH_ADMIN_USER_JSON_ROLE_REASON_STEP_UP_AND_IDEMPOTENCY_KEY',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_ROLE_CHANGE'],
        postProofBusinessChecks: [
          'TARGET_EXISTS_LAST_SUPER_ADMIN_PROTECTION_AND_REASON_VALID',
          'IDEMPOTENCY_PAYLOAD_MATCH',
        ],
        mutationOrSnapshot:
          'ROLE_AUTHORIZATION_VERSION_SESSION_REVOCATION_PENDING_CASE_CANCELLATION_AND_IDEMPOTENCY_IN_ONE_TRANSACTION',
        audit: 'INITIATING_AUDIT_LOG_AND_ONE_SYSTEM_CANCELLATION_AUDIT_PER_CANCELLED_CASE',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'NONE',
        transactionalSystemEffects: 'RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT',
      },
      changeAdminUserStatus: {
        input: 'PATH_ADMIN_USER_JSON_STATUS_REASON_STEP_UP_AND_IDEMPOTENCY_KEY',
        auditContextProof:
          'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
        authorizationChecks: ['ROLE_ONE_OF_SUPER_ADMIN', 'FRESH_STEP_UP_STATUS_CHANGE'],
        postProofBusinessChecks: [
          'TARGET_EXISTS_LAST_SUPER_ADMIN_PROTECTION_AND_REASON_VALID',
          'IDEMPOTENCY_PAYLOAD_MATCH',
        ],
        mutationOrSnapshot:
          'STATUS_AUTHORIZATION_VERSION_SESSION_REVOCATION_PENDING_CASE_CANCELLATION_AND_IDEMPOTENCY_IN_ONE_TRANSACTION',
        audit: 'INITIATING_AUDIT_LOG_AND_ONE_SYSTEM_CANCELLATION_AUDIT_PER_CANCELLED_CASE',
        commit: 'POSTGRESQL_CONFIRMATION_REQUIRED_BEFORE_SUCCESS_OR_SECRET',
        response: 'AFTER_CONFIRMED_COMMIT',
        continuation: 'NONE',
        transactionalSystemEffects: 'RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT',
      },
    },
    auditOutcome: {
      newC2Values: ['SUCCESS', 'REJECTED'],
      success: 'OUTCOME_SUCCESS_FAILURE_CODE_NULL',
      rejection: 'OUTCOME_REJECTED_NORMATIVE_NON_NULL_FAILURE_CODE',
      forbidden: [
        'SUCCESS_WITH_FAILURE_CODE',
        'REJECTED_WITHOUT_FAILURE_CODE',
        'ARBITRARY_FAILURE_CODE',
      ],
      historicalV1AndExistingV2C1: {
        outcome: 'UNKNOWN',
        failureCode: null,
        provenance: 'HISTORICAL_UNKNOWN',
        rewrite: false,
        backfill: false,
        inferFromReasonCode: false,
        defaultSuccess: false,
        verifiedHistoricalActionClassificationTable: [],
      },
      downloadSuccess: 'AUTHORIZATION_READ_LEASE_AND_BEGINNING_DURABLY_RECORDED_NOT_CLIENT_RECEIPT',
      downloadTerminalObservation:
        'SEPARATE_NON_AUDIT_OPERATIONAL_OBSERVATION_COMPLETE_INTERRUPTED_OR_UNKNOWN',
      socketCloseProvesReceipt: false,
      unknownCommit: 'NO_CONTRADICTORY_SUCCESS_OR_REJECTION_RECONCILE_FIRST',
      futureDatabaseConstraint:
        'C2_ONLY_STRICT_CHECK_NOT_CLAIMED_PRESENT_IN_CURRENT_PRISMA_OR_MIGRATIONS',
    },
    systemSourcePredicates: {
      PASSWORD_RESET_NOTIFICATION_DELIVERY_SYSTEM_AUDIT: {
        sourceType: 'AdminSecurityEvent',
        sourceVersion: 'C1_TYPED',
        sourceAction: 'requestAdminPasswordReset',
        sourceEventClass: 'LOGIN',
        sourceOutcome: 'SUCCEEDED',
        sourceFailureCode: null,
        action: 'deliverAdminPasswordResetNotification',
        eventClass: 'LOGIN',
        context: 'SYSTEM',
        outcome: 'SUCCESS',
        actorAdminUserId: null,
        entityType: 'ADMIN_PASSWORD_RESET_REQUEST',
        resourceBinding: 'RESET_REQUEST_ID',
        requiredLinks: ['SECURITY_EVENT_REQUEST_ID', 'RESET_REQUEST_ID', 'OUTBOX_ID', 'JOB_ID'],
        delegatedByRule: 'NULL_PUBLIC_NO_ADMIN_ACTOR',
        uniquenessKey: 'OUTBOX_ID+SYSTEM_ACTION',
        invalidSources: [
          'UNRELATED_RECORD',
          'OUTCOME_FAILED',
          'MISSING_REQUIRED_LINK',
          'DELEGATOR_ACTOR_MISMATCH',
        ],
        sourceContext: 'NOT_APPLICABLE_ADMIN_SECURITY_EVENT',
        sourceOutcomeProvenance: 'C1_TYPED_SECURITY_EVENT',
      },
      INVITATION_NOTIFICATION_DELIVERY_SYSTEM_AUDIT: {
        sourceType: 'AuditLog',
        sourceVersion: 3,
        sourceAction: 'createAdminInvitation',
        sourceEventClass: 'BUSINESS',
        sourceOutcome: 'SUCCESS',
        action: 'deliverAdminInvitationNotification',
        eventClass: 'BUSINESS',
        context: 'SYSTEM',
        outcome: 'SUCCESS',
        actorAdminUserId: null,
        entityType: 'ADMIN_INVITATION',
        resourceBinding: 'INVITATION_ID',
        requiredLinks: ['CAUSATION_AUDIT_ID', 'INVITATION_ID', 'OUTBOX_ID', 'JOB_ID'],
        delegatedByRule: 'EQUALS_CAUSAL_AUDIT_ACTOR_ADMIN_USER_ID',
        uniquenessKey: 'OUTBOX_ID+SYSTEM_ACTION',
        invalidSources: [
          'UNRELATED_RECORD',
          'HISTORICAL_V1',
          'OUTCOME_UNKNOWN',
          'OUTCOME_REJECTED',
          'MISSING_REQUIRED_LINK',
          'DELEGATOR_ACTOR_MISMATCH',
        ],
        sourceContext: 'ADMIN_SESSION',
        sourceOutcomeProvenance: 'EXPLICIT_C2',
        sourceFailureCode: null,
        sourceResourceEquality: 'CAUSAL_AUDIT_ENTITY_ID_EQUALS_INVITATION_ID',
      },
      EXPORT_BUILD_SYSTEM_AUDIT: {
        sourceType: 'AuditLog',
        sourceVersion: 3,
        sourceAction: 'createAdminAuditLogExport',
        sourceEventClass: 'EXPORT',
        sourceOutcome: 'SUCCESS',
        action: 'buildAdminAuditLogExport',
        eventClass: 'EXPORT',
        context: 'SYSTEM',
        actorAdminUserId: null,
        entityType: 'ADMIN_AUDIT_EXPORT',
        resourceBinding: 'EXPORT_ID',
        requiredLinks: ['CAUSATION_AUDIT_ID', 'EXPORT_ID', 'JOB_ID', 'ATTEMPT_ID'],
        delegatedByRule: 'EQUALS_CAUSAL_AUDIT_ACTOR_ADMIN_USER_ID',
        uniquenessKey: 'EXPORT_ID+TERMINAL_GENERATION+SYSTEM_ACTION',
        invalidSources: [
          'UNRELATED_RECORD',
          'HISTORICAL_V1',
          'OUTCOME_UNKNOWN',
          'OUTCOME_REJECTED',
          'MISSING_REQUIRED_LINK',
          'DELEGATOR_ACTOR_MISMATCH',
        ],
        sourceContext: 'ADMIN_SESSION',
        sourceOutcomeProvenance: 'EXPLICIT_C2',
        sourceFailureCode: null,
        sourceResourceEquality: 'CAUSAL_AUDIT_ENTITY_ID_EQUALS_EXPORT_ID',
        resultOutcomes: {
          READY: {
            outcome: 'SUCCESS',
            failureCode: null,
          },
          FAILED: {
            outcome: 'REJECTED',
            failureCodeByExportFailureCode: {
              RETRY_BUDGET_EXHAUSTED: 'DEPENDENCY_UNAVAILABLE',
              PROJECTION_BUDGET_EXCEEDED: 'PROJECTION_BUDGET_EXCEEDED',
              INTEGRITY_FAILED: 'INTEGRITY_REJECTED',
              DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
            },
          },
        },
      },
      EXPORT_EXPIRY_SYSTEM_AUDIT: {
        sourceType: 'SERVER_STATE',
        sourceVersion: 'EXPORT_READY_V1',
        sourceAction: 'READY_EXPIRY_CLOCK',
        sourceEventClass: 'EXPORT',
        sourceOutcome: 'READY_CONFIRMED',
        action: 'expireAdminAuditLogExport',
        eventClass: 'EXPORT',
        context: 'SYSTEM',
        outcome: 'SUCCESS',
        actorAdminUserId: null,
        entityType: 'ADMIN_AUDIT_EXPORT',
        resourceBinding: 'EXPORT_ID',
        requiredLinks: ['EXPORT_ID', 'READY_GENERATION', 'EXPIRES_AT'],
        delegatedByRule: 'NULL_AUTONOMOUS',
        uniquenessKey: 'EXPORT_ID+EXPIRED_GENERATION+SYSTEM_ACTION',
        invalidSources: [
          'UNRELATED_RECORD',
          'STATE_NOT_READY',
          'GENERATION_MISMATCH',
          'MISSING_REQUIRED_LINK',
        ],
        sourceContext: 'NOT_APPLICABLE_SERVER_STATE',
        sourceOutcomeProvenance: 'DURABLE_SERVER_STATE',
        sourceFailureCode: null,
      },
      RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT: {
        sourceType: 'AuditLog',
        sourceVersion: 3,
        sourceActions: ['createAdminRecoveryCase', 'changeAdminUserRole', 'changeAdminUserStatus'],
        sourceEventClass: 'BUSINESS',
        sourceOutcome: 'SUCCESS',
        action: 'cancelAdminRecoveryCase',
        eventClass: 'BUSINESS',
        context: 'SYSTEM',
        outcome: 'SUCCESS',
        actorAdminUserId: null,
        entityType: 'ADMIN_RECOVERY_CASE',
        resourceBinding: 'CANCELLED_RECOVERY_CASE_ID',
        exactRequiredLinksByAction: {
          createAdminRecoveryCase: [
            'CAUSATION_AUDIT_ID',
            'SUPERSEDING_RECOVERY_CASE_ID',
            'CANCELLED_RECOVERY_CASE_ID',
            'STATE_GENERATION',
          ],
          changeAdminUserRole: [
            'CAUSATION_AUDIT_ID',
            'SUBJECT_ADMIN_USER_ID',
            'CANCELLED_RECOVERY_CASE_ID',
            'STATE_GENERATION',
          ],
          changeAdminUserStatus: [
            'CAUSATION_AUDIT_ID',
            'SUBJECT_ADMIN_USER_ID',
            'CANCELLED_RECOVERY_CASE_ID',
            'STATE_GENERATION',
          ],
        },
        delegatedByRule: 'EQUALS_CAUSAL_AUDIT_ACTOR_ADMIN_USER_ID',
        uniquenessKey: 'CANCELLED_RECOVERY_CASE_ID+CANCELLED_GENERATION+SYSTEM_ACTION',
        invalidSources: [
          'UNRELATED_RECORD',
          'HISTORICAL_V1',
          'OUTCOME_UNKNOWN',
          'OUTCOME_REJECTED',
          'MISSING_REQUIRED_LINK',
          'DELEGATOR_ACTOR_MISMATCH',
        ],
        sourceContext: 'ADMIN_SESSION',
        sourceOutcomeProvenance: 'EXPLICIT_C2',
        sourceFailureCode: null,
        executionModeByAction: {
          createAdminRecoveryCase: 'SAME_POSTGRESQL_TRANSACTION_BEFORE_RESPONSE',
          changeAdminUserRole: 'SAME_POSTGRESQL_TRANSACTION_BEFORE_RESPONSE',
          changeAdminUserStatus: 'SAME_POSTGRESQL_TRANSACTION_BEFORE_RESPONSE',
        },
        transactionalCardinality:
          'EXACTLY_ONE_SYSTEM_AUDIT_PER_CANCELLED_PENDING_CASE_ZERO_WHEN_NO_CASE_MATCHES',
        sourceResourceBindingByAction: {
          createAdminRecoveryCase: {
            causalAuditEntityId: 'SUPERSEDING_RECOVERY_CASE_ID',
            systemAuditEntityId: 'CANCELLED_RECOVERY_CASE_ID',
            relation: 'DISTINCT_SUPERSEDING_AND_CANCELLED_CASE_IDS',
          },
          changeAdminUserRole: {
            causalAuditEntityId: 'SUBJECT_ADMIN_USER_ID',
            systemAuditEntityId: 'CANCELLED_RECOVERY_CASE_ID',
            relation: 'CANCELLED_CASE_SUBJECT_EQUALS_CAUSAL_ADMIN_USER_ID',
          },
          changeAdminUserStatus: {
            causalAuditEntityId: 'SUBJECT_ADMIN_USER_ID',
            systemAuditEntityId: 'CANCELLED_RECOVERY_CASE_ID',
            relation: 'CANCELLED_CASE_SUBJECT_EQUALS_CAUSAL_ADMIN_USER_ID',
          },
        },
      },
      RECOVERY_CASE_SERVER_EXPIRATION_SYSTEM_AUDIT: {
        sourceType: 'SERVER_STATE',
        sourceVersion: 'RECOVERY_CASE_PENDING_V1',
        sourceAction: 'PENDING_EXPIRY_CLOCK',
        sourceEventClass: 'BUSINESS',
        sourceOutcome: 'PENDING_CONFIRMED',
        action: 'expireAdminRecoveryCase',
        eventClass: 'BUSINESS',
        context: 'SYSTEM',
        outcome: 'SUCCESS',
        actorAdminUserId: null,
        entityType: 'ADMIN_RECOVERY_CASE',
        resourceBinding: 'RECOVERY_CASE_ID',
        requiredLinks: ['RECOVERY_CASE_ID', 'STATE_GENERATION', 'EXPIRES_AT'],
        delegatedByRule: 'NULL_AUTONOMOUS',
        uniquenessKey: 'RECOVERY_CASE_ID+EXPIRED_GENERATION+SYSTEM_ACTION',
        invalidSources: [
          'UNRELATED_RECORD',
          'STATE_NOT_PENDING',
          'GENERATION_MISMATCH',
          'MISSING_REQUIRED_LINK',
        ],
        sourceContext: 'NOT_APPLICABLE_SERVER_STATE',
        sourceOutcomeProvenance: 'DURABLE_SERVER_STATE',
        sourceFailureCode: null,
      },
      ADMIN_BOOTSTRAP_SYSTEM_AUDIT: {
        sourceType: 'SERVER_STATE',
        sourceVersion: 'BOOTSTRAP_GUARD_V1',
        sourceAction: 'BOOTSTRAP_SINGLETON_GUARD',
        sourceEventClass: 'BUSINESS',
        sourceOutcome: 'GUARD_ACQUIRED',
        action: 'bootstrapAdminUser',
        eventClass: 'BUSINESS',
        context: 'SYSTEM',
        outcome: 'SUCCESS',
        actorAdminUserId: null,
        entityType: 'ADMIN_USER',
        resourceBinding: 'BOOTSTRAPPED_ADMIN_USER_ID',
        requiredLinks: ['BOOTSTRAP_GUARD_ID', 'ADMIN_USER_ID'],
        delegatedByRule: 'NULL_AUTONOMOUS',
        uniquenessKey: 'BOOTSTRAP_GUARD_ID+SYSTEM_ACTION',
        invalidSources: [
          'UNRELATED_RECORD',
          'BOOTSTRAP_GUARD_NOT_ACQUIRED',
          'ADMIN_USER_ID_MISMATCH',
          'MISSING_REQUIRED_LINK',
        ],
        sourceContext: 'NOT_APPLICABLE_SERVER_STATE',
        sourceOutcomeProvenance: 'DURABLE_SERVER_STATE',
        sourceFailureCode: null,
      },
    },
    invitationAcceptance: {
      transaction: [
        'CONSUME_INVITATION',
        'CREATE_ADMIN_USER_PENDING_MFA',
        'CREATE_ARGON2ID_PASSWORD_CREDENTIAL',
        'CREATE_FIRST_TOTP_ENROLLMENT_PREAUTH_10_MINUTES',
        'WRITE_ADMIN_SECURITY_EVENT',
      ],
      preCommitFailure: 'NO_DURABLE_CONSUMPTION_USER_PASSWORD_CREDENTIAL_PREAUTH_OR_SECURITY_EVENT',
      cookie: 'ISSUE_ONLY_AFTER_CONFIRMED_COMMIT',
      commitUnknown: 'NEUTRAL_503_NO_COOKIE_NO_BLIND_RETRY_RECONCILE_BY_LOGIN',
      failureBoundaryTraces: [
        {
          name: 'PRE_COMMIT_FAILURE',
          commit: 'NOT_COMMITTED',
          durableEffects: [],
          cookieIssued: false,
          automaticRetry: false,
        },
        {
          name: 'CONFIRMED_COMMIT',
          commit: 'CONFIRMED',
          durableEffects: [
            'INVITATION_CONSUMED',
            'USER_PENDING_MFA',
            'PASSWORD_CREDENTIAL_CREATED',
            'FIRST_TOTP_PREAUTH',
            'ADMIN_SECURITY_EVENT',
          ],
          cookieIssued: true,
          automaticRetry: false,
        },
        {
          name: 'UNKNOWN_COMMIT',
          commit: 'UNKNOWN',
          durableEffects: 'UNKNOWN_UNTIL_RECONCILIATION',
          cookieIssued: false,
          automaticRetry: false,
          reconciliation: 'LOGIN_READS_DURABLE_USER_STATE_NO_BLIND_ACCEPT_RETRY',
        },
        {
          name: 'LOST_RESPONSE_AFTER_CONFIRMED_COMMIT',
          commit: 'CONFIRMED',
          durableEffects: [
            'INVITATION_CONSUMED',
            'USER_PENDING_MFA',
            'PASSWORD_CREDENTIAL_CREATED',
            'FIRST_TOTP_PREAUTH',
            'ADMIN_SECURITY_EVENT',
          ],
          preauthState: 'VALID_OR_EVENTUALLY_EXPIRES',
          cookieDelivery: 'UNKNOWN',
          usablePreauthCookie: 'UNKNOWN',
          automaticRetry: false,
          recovery: 'AdminAuthService.login_CREATES_NEW_FIRST_TOTP_PREAUTH_10_MINUTES',
        },
        {
          name: 'EXPIRED_FIRST_TOTP_PREAUTH',
          commit: 'CONFIRMED',
          durableEffects: [
            'INVITATION_CONSUMED',
            'USER_PENDING_MFA',
            'PASSWORD_CREDENTIAL_CREATED',
            'FIRST_TOTP_PREAUTH_EXPIRED',
            'ADMIN_SECURITY_EVENT',
          ],
          preauthState: 'EXPIRED_REPLACED_ONLY_AFTER_PASSWORD_LOGIN',
          cookieDelivery: 'UNKNOWN',
          usablePreauthCookie: false,
          automaticRetry: false,
          recovery: 'AdminAuthService.login_CREATES_NEW_FIRST_TOTP_PREAUTH_10_MINUTES',
        },
      ],
      recoveryPath: {
        operationId: 'loginAdmin',
        runtimeSymbol: 'AdminAuthService.login',
        sourcePath: 'apps/api/src/admin-auth/admin-auth.service.ts',
        eligibility: 'PENDING_MFA_WITH_VALID_PASSWORD',
        result: 'NEW_FIRST_TOTP_ENROLLMENT_PREAUTH_10_MINUTES',
        appliesTo: ['LOST_ACCEPT_RESPONSE', 'EXPIRED_FIRST_TOTP_PREAUTH'],
        newEndpoint: false,
      },
    },
  },
  operationErrors: {
    requestAdminPasswordReset: ['VALIDATION_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE'],
    resetAdminPassword: [
      'VALIDATION_ERROR',
      'ADMIN_RECOVERY_INVALID',
      'RATE_LIMITED',
      'SERVICE_UNAVAILABLE',
    ],
    createAdminRecoveryCase: [
      'VALIDATION_ERROR',
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'IDEMPOTENCY_CONFLICT',
      'SERVICE_UNAVAILABLE',
    ],
    listAdminRecoveryCases: [
      'VALIDATION_ERROR',
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'SERVICE_UNAVAILABLE',
    ],
    getAdminRecoveryCase: [
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'RECOVERY_CASE_NOT_FOUND',
      'SERVICE_UNAVAILABLE',
    ],
    approveAdminRecoveryCase: [
      'VALIDATION_ERROR',
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'RECOVERY_CASE_NOT_FOUND',
      'RECOVERY_CASE_CONFLICT',
      'IDEMPOTENCY_CONFLICT',
      'RECOVERY_CASE_EXPIRED',
      'SERVICE_UNAVAILABLE',
    ],
    listAdminAuditLogs: ['VALIDATION_ERROR', 'AUTH_REQUIRED', 'FORBIDDEN', 'SERVICE_UNAVAILABLE'],
    createAdminAuditLogExport: [
      'VALIDATION_ERROR',
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'IDEMPOTENCY_CONFLICT',
      'SERVICE_UNAVAILABLE',
    ],
    getAdminAuditLogExport: [
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'AUDIT_EXPORT_NOT_FOUND',
      'SERVICE_UNAVAILABLE',
    ],
    downloadAdminAuditLogExport: [
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'AUDIT_EXPORT_NOT_FOUND',
      'AUDIT_EXPORT_NOT_READY',
      'AUDIT_EXPORT_EXPIRED',
      'SERVICE_UNAVAILABLE',
    ],
    createAdminInvitation: [
      'VALIDATION_ERROR',
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'IDEMPOTENCY_CONFLICT',
      'SERVICE_UNAVAILABLE',
    ],
    acceptAdminInvitation: [
      'VALIDATION_ERROR',
      'ADMIN_INVITATION_INVALID',
      'RATE_LIMITED',
      'SERVICE_UNAVAILABLE',
    ],
    listAdminUsers: ['VALIDATION_ERROR', 'AUTH_REQUIRED', 'FORBIDDEN', 'SERVICE_UNAVAILABLE'],
    changeAdminUserRole: [
      'VALIDATION_ERROR',
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'ADMIN_USER_NOT_FOUND',
      'IDEMPOTENCY_CONFLICT',
      'LAST_SUPER_ADMIN_PROTECTED',
      'SERVICE_UNAVAILABLE',
    ],
    changeAdminUserStatus: [
      'VALIDATION_ERROR',
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'ADMIN_USER_NOT_FOUND',
      'IDEMPOTENCY_CONFLICT',
      'LAST_SUPER_ADMIN_PROTECTED',
      'SERVICE_UNAVAILABLE',
    ],
  },
  errorStatuses: {
    VALIDATION_ERROR: 400,
    RATE_LIMITED: 429,
    SERVICE_UNAVAILABLE: 503,
    ADMIN_RECOVERY_INVALID: 400,
    AUTH_REQUIRED: 401,
    FORBIDDEN: 403,
    IDEMPOTENCY_CONFLICT: 409,
    RECOVERY_CASE_NOT_FOUND: 404,
    RECOVERY_CASE_CONFLICT: 409,
    RECOVERY_CASE_EXPIRED: 410,
    AUDIT_EXPORT_NOT_FOUND: 404,
    AUDIT_EXPORT_NOT_READY: 409,
    AUDIT_EXPORT_EXPIRED: 410,
    ADMIN_INVITATION_INVALID: 400,
    ADMIN_USER_NOT_FOUND: 404,
    LAST_SUPER_ADMIN_PROTECTED: 409,
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
    rollbackBeforeReuse: 'REQUIRED_CONFIRMATION_AND_IDLE_USABLE_CLIENT',
    rollbackUnconfirmedClientDisposition: 'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE',
    commitUnknownClientDisposition:
      'DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE_NO_ROLLBACK_CLAIM_NO_MUTATION_REPLAY',
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
    auditContextProof: 'NONE_PUBLIC_NO_AUDIT_CONTEXT',
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
    auditContextProof:
      'SERVER_VERIFIED_RECOVERY_CONTEXT_ACTOR_BINDING_ACTIVE_NOT_EXPIRED_NOT_CONSUMED_NOT_REVOKED',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
        schema: 'string',
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
        schema: 'string',
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
      {
        name: 'auditVersion',
        required: false,
        schema: 'integer',
        format: null,
      },
      {
        name: 'auditEventClass',
        required: false,
        schema: 'string',
        format: null,
      },
      {
        name: 'auditContext',
        required: false,
        schema: 'AdminAuditContext',
        format: null,
      },
      {
        name: 'auditReasonCode',
        required: false,
        schema: 'AdminReasonCode',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
      profile: 'KORA_ADMIN_AUDIT_EXPORT_MANIFEST_V2',
      manifestVersion: 2,
      manifestFields: ['createdAt', 'entries', 'expirationRule', 'exportId', 'version'],
      createdAtSemantics: 'EXPORT_REQUEST_CREATED_AT',
      expirationRule: 'READY_PLUS_24_HOURS',
      absoluteOperationalTimestamps: 'READY_AT_AND_EXPIRES_AT_NOT_INCLUDED_OR_SIGNED',
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
        'CANONICAL_MANIFEST_V2_BINDS_EXPORT_ID_REQUEST_CREATED_AT_READY_PLUS_24_HOURS_RULE_AND_SORTED_UNIQUE_PAYLOAD_PATH_SIZE_SHA256',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
    auditContextProof: 'NONE_PUBLIC_NO_AUDIT_CONTEXT',
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
      schema: 'AdminInvitationAcceptedPreAuthEnvelope',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
    auditContextProof: 'SERVER_VERIFIED_SESSION_USER_JTI_AUTHORIZATION_VERSION_ACTIVE_NOT_REVOKED',
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
  readonly requiredMediaAssets: ReadonlyArray<RequiredReadyMediaAsset> & unknown & unknown;
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

export type AdminAuditLogEntry = AdminAuditLogEntryV1 | AdminAuditLogEntryV2 | AdminAuditLogEntryV3;

export type AdminAuditLogEntryV1 = {
  readonly version: 1;
  readonly eventId: string;
  readonly action: string;
  readonly eventClass: null;
  readonly context: null;
  readonly actorAdminUserId: string;
  readonly subjectAdminUserId: null;
  readonly delegatedByAdminUserId: null;
  readonly adminSessionId: string;
  readonly adminRecoveryContextId: null;
  readonly systemExecutionRefHash: null;
  readonly entityType: string;
  readonly entityId: string;
  readonly maskedBefore:
    | {
        readonly [key: string]: unknown;
      }
    | ReadonlyArray<unknown>
    | string
    | number
    | boolean
    | null;
  readonly maskedAfter:
    | {
        readonly [key: string]: unknown;
      }
    | ReadonlyArray<unknown>
    | string
    | number
    | boolean
    | null;
  readonly reasonCode: null;
  readonly operatorReason: null;
  readonly requestId: string;
  readonly causationEventId: null;
  readonly causationSecurityEventId: null;
  readonly createdAt: Timestamp;
  readonly legacyReasonRedacted: true;
  readonly outcome: 'UNKNOWN';
  readonly failureCode: null;
  readonly outcomeProvenance: 'HISTORICAL_UNKNOWN';
  readonly operatorReasonRedacted: true;
};

export type AdminAuditLogEntryV2 =
  | ({
      readonly version: 2;
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
      readonly operatorReason: null;
      readonly requestId: string;
      readonly causationEventId: string | null;
      readonly causationSecurityEventId: string | null;
      readonly createdAt: Timestamp;
      readonly outcome: 'UNKNOWN';
      readonly failureCode: null;
      readonly outcomeProvenance: 'HISTORICAL_UNKNOWN';
      readonly operatorReasonRedacted: true;
    } & {
      readonly context: 'ADMIN_SESSION';
      readonly actorAdminUserId: string;
      readonly adminSessionId: string;
      readonly adminRecoveryContextId: null;
      readonly systemExecutionRefHash: null;
      readonly causationSecurityEventId: null;
      readonly delegatedByAdminUserId: null;
    })
  | ({
      readonly version: 2;
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
      readonly operatorReason: null;
      readonly requestId: string;
      readonly causationEventId: string | null;
      readonly causationSecurityEventId: string | null;
      readonly createdAt: Timestamp;
      readonly outcome: 'UNKNOWN';
      readonly failureCode: null;
      readonly outcomeProvenance: 'HISTORICAL_UNKNOWN';
      readonly operatorReasonRedacted: true;
    } & {
      readonly context: 'ADMIN_RECOVERY';
      readonly actorAdminUserId: string;
      readonly adminSessionId: null;
      readonly adminRecoveryContextId: string;
      readonly systemExecutionRefHash: null;
      readonly causationSecurityEventId: null;
      readonly delegatedByAdminUserId: null;
    })
  | ({
      readonly version: 2;
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
      readonly operatorReason: null;
      readonly requestId: string;
      readonly causationEventId: string | null;
      readonly causationSecurityEventId: string | null;
      readonly createdAt: Timestamp;
      readonly outcome: 'UNKNOWN';
      readonly failureCode: null;
      readonly outcomeProvenance: 'HISTORICAL_UNKNOWN';
      readonly operatorReasonRedacted: true;
    } & (
      | ({
          readonly context: 'SYSTEM';
          readonly actorAdminUserId: null;
          readonly adminSessionId: null;
          readonly adminRecoveryContextId: null;
          readonly systemExecutionRefHash: string;
        } & {
          readonly causationEventId: null;
          readonly causationSecurityEventId: null;
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
          readonly causationSecurityEventId: null;
          readonly delegatedByAdminUserId: string;
        })
      | ({
          readonly context: 'SYSTEM';
          readonly actorAdminUserId: null;
          readonly adminSessionId: null;
          readonly adminRecoveryContextId: null;
          readonly systemExecutionRefHash: string;
        } & {
          readonly causationEventId: null;
          readonly causationSecurityEventId: string;
          readonly delegatedByAdminUserId: null;
        })
    ));

export type AdminAuditLogPage = {
  readonly data: ReadonlyArray<AdminAuditLogEntry>;
  readonly meta: CursorMeta;
};

export type AdminAuditExportRequest = {
  readonly from: Timestamp;
  readonly to: Timestamp;
  readonly actorAdminUserId?: string;
  readonly action?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly auditVersion?: 1 | 2 | 3;
  readonly auditEventClass?: 'LOGIN' | 'SESSION' | 'EXPORT' | 'BUSINESS';
  readonly auditContext?: AdminAuditContext;
  readonly auditReasonCode?: AdminReasonCode;
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
      readonly failureCode:
        | 'RETRY_BUDGET_EXHAUSTED'
        | 'PROJECTION_BUDGET_EXCEEDED'
        | 'INTEGRITY_FAILED'
        | 'DEPENDENCY_UNAVAILABLE'
        | null;
    } & {
      readonly state: 'READY' | 'EXPIRED';
      readonly expiresAt: string;
      readonly contentSha256: string;
      readonly signatureKeyId: string;
      readonly failureCode: null;
    })
  | ({
      readonly exportId: Identifier;
      readonly state: AdminAuditExportState;
      readonly createdAt: Timestamp;
      readonly expiresAt: string | null;
      readonly contentSha256: string | null;
      readonly signatureKeyId: string | null;
      readonly failureCode:
        | 'RETRY_BUDGET_EXHAUSTED'
        | 'PROJECTION_BUDGET_EXCEEDED'
        | 'INTEGRITY_FAILED'
        | 'DEPENDENCY_UNAVAILABLE'
        | null;
    } & {
      readonly state: 'PENDING' | 'PROCESSING';
      readonly expiresAt: null;
      readonly contentSha256: null;
      readonly signatureKeyId: null;
      readonly failureCode: null;
    })
  | ({
      readonly exportId: Identifier;
      readonly state: AdminAuditExportState;
      readonly createdAt: Timestamp;
      readonly expiresAt: string | null;
      readonly contentSha256: string | null;
      readonly signatureKeyId: string | null;
      readonly failureCode:
        | 'RETRY_BUDGET_EXHAUSTED'
        | 'PROJECTION_BUDGET_EXCEEDED'
        | 'INTEGRITY_FAILED'
        | 'DEPENDENCY_UNAVAILABLE'
        | null;
    } & {
      readonly state: 'FAILED';
      readonly expiresAt: null;
      readonly contentSha256: null;
      readonly signatureKeyId: null;
      readonly failureCode:
        | 'RETRY_BUDGET_EXHAUSTED'
        | 'PROJECTION_BUDGET_EXCEEDED'
        | 'INTEGRITY_FAILED'
        | 'DEPENDENCY_UNAVAILABLE';
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

export type AdminAuditLogEntryV3 = (
  | ({
      readonly version: 3;
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
      readonly operatorReason: null;
      readonly requestId: string;
      readonly causationEventId: string | null;
      readonly causationSecurityEventId: string | null;
      readonly createdAt: Timestamp;
      readonly outcome: 'SUCCESS' | 'REJECTED';
      readonly failureCode: string | null;
      readonly outcomeProvenance: 'EXPLICIT_C2';
      readonly operatorReasonRedacted: true;
    } & {
      readonly context: 'ADMIN_SESSION';
      readonly actorAdminUserId: string;
      readonly adminSessionId: string;
      readonly adminRecoveryContextId: null;
      readonly systemExecutionRefHash: null;
      readonly causationSecurityEventId: null;
      readonly delegatedByAdminUserId: null;
    })
  | ({
      readonly version: 3;
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
      readonly operatorReason: null;
      readonly requestId: string;
      readonly causationEventId: string | null;
      readonly causationSecurityEventId: string | null;
      readonly createdAt: Timestamp;
      readonly outcome: 'SUCCESS' | 'REJECTED';
      readonly failureCode: string | null;
      readonly outcomeProvenance: 'EXPLICIT_C2';
      readonly operatorReasonRedacted: true;
    } & {
      readonly context: 'ADMIN_RECOVERY';
      readonly actorAdminUserId: string;
      readonly adminSessionId: null;
      readonly adminRecoveryContextId: string;
      readonly systemExecutionRefHash: null;
      readonly causationSecurityEventId: null;
      readonly delegatedByAdminUserId: null;
    })
  | ({
      readonly version: 3;
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
      readonly operatorReason: null;
      readonly requestId: string;
      readonly causationEventId: string | null;
      readonly causationSecurityEventId: string | null;
      readonly createdAt: Timestamp;
      readonly outcome: 'SUCCESS' | 'REJECTED';
      readonly failureCode: string | null;
      readonly outcomeProvenance: 'EXPLICIT_C2';
      readonly operatorReasonRedacted: true;
    } & (
      | ({
          readonly context: 'SYSTEM';
          readonly actorAdminUserId: null;
          readonly adminSessionId: null;
          readonly adminRecoveryContextId: null;
          readonly systemExecutionRefHash: string;
        } & {
          readonly causationEventId: null;
          readonly causationSecurityEventId: null;
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
          readonly causationSecurityEventId: null;
          readonly delegatedByAdminUserId: string;
        })
      | ({
          readonly context: 'SYSTEM';
          readonly actorAdminUserId: null;
          readonly adminSessionId: null;
          readonly adminRecoveryContextId: null;
          readonly systemExecutionRefHash: string;
        } & {
          readonly causationEventId: null;
          readonly causationSecurityEventId: string;
          readonly delegatedByAdminUserId: null;
        })
    ))
) &
  (
    | {
        readonly outcome: 'SUCCESS';
        readonly failureCode: null;
        readonly outcomeProvenance: 'EXPLICIT_C2';
        readonly [key: string]: unknown;
      }
    | {
        readonly outcome: 'REJECTED';
        readonly failureCode:
          | 'VALIDATION_ERROR'
          | 'FORBIDDEN'
          | 'STEP_UP_REQUIRED'
          | 'STEP_UP_EXPIRED'
          | 'STEP_UP_INVALID'
          | 'INTEGRITY_REJECTED'
          | 'DEPENDENCY_UNAVAILABLE'
          | 'IDEMPOTENCY_CONFLICT'
          | 'RESOURCE_NOT_FOUND'
          | 'RESOURCE_CONFLICT'
          | 'RESOURCE_EXPIRED'
          | 'PROJECTION_BUDGET_EXCEEDED';
        readonly outcomeProvenance: 'EXPLICIT_C2';
        readonly [key: string]: unknown;
      }
  );

export type AdminInvitationAcceptedPreAuthEnvelope = {
  readonly data: {
    readonly challengeId: Identifier;
    readonly expiresAt: Timestamp;
    readonly nextStep: 'FIRST_TOTP_ENROLLMENT';
  };
  readonly meta: ResponseMeta;
};
