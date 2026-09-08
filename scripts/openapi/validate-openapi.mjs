import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OPENAPI_PATH = resolve("docs", "api", "openapi.yaml");
export const PRISMA_PATH = resolve("apps", "api", "prisma", "schema.prisma");

export const EXPECTED_PATHS = [
  "/health/live",
  "/health/ready",
  "/api/v1/catalog/audio",
  "/api/v1/catalog/audio/{contentId}",
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
];

const EXPECTED_OPERATIONS = new Map([
  ["GET /health/live", "healthLiveness"],
  ["GET /health/ready", "healthReadiness"],
  ["GET /api/v1/catalog/audio", "listPublicAudioCatalog"],
  ["GET /api/v1/catalog/audio/{contentId}", "getPublicAudioContent"],
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

const PUBLIC_BUSINESS_OPERATIONS = new Set([
  "listPublicAudioCatalog",
  "getPublicAudioContent",
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
};

const ADMIN_ROLES = new Set([
  "SUPER_ADMIN",
  "CONTENT_EDITOR",
  "FINANCE_MANAGER",
  "SUPPORT",
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
  /^(?:media|preview|playback|receipt|upload)?u(?:rl|ri)$|r2|mux|storage(?:object)?key|providersecret|providerassetref|rawpayload/i;
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
        !Array.isArray(operation["x-kora-clients"]) ||
        operation["x-kora-clients"].length === 0
      ) {
        fail(`${method.toUpperCase()} ${path} requires x-kora-clients`);
      }
      if (Object.keys(operation.responses ?? {}).length === 0) {
        fail(`${method.toUpperCase()} ${path} requires responses`);
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
        if (
          !Array.isArray(roles) ||
          roles.length === 0 ||
          roles.some((role) => !ADMIN_ROLES.has(role))
        ) {
          fail(
            `${operation.operationId} requires explicit approved admin roles`,
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
      const authorizationClasses = [
        PUBLIC_BUSINESS_OPERATIONS.has(operation.operationId),
        CUSTOMER_BEARER_OPERATIONS.has(operation.operationId),
        clients.includes("admin"),
        clients.includes("provider"),
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
    adminScheme?.bearerFormat !== "short-lived admin access token"
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
    fail("S1.1 requires at least three coherent non-sensitive schema examples");
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
      if (path.includes("payment-webhooks")) {
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
}

function validateCommerceGates(document) {
  const provider = document.components.schemas.PaymentProvider;
  const operational = document.components.schemas.OperationalPaymentProvider;
  if (
    provider.const !== "SANDBOX_NEUTRAL" ||
    operational.properties.code.const !== "SANDBOX_NEUTRAL" ||
    operational.properties.status.const !== "OPERATIONAL"
  ) {
    fail("only the operational provider-neutral sandbox may appear in S1.1");
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

export function validateOpenApiDocument(document) {
  if (document.openapi !== "3.1.0") {
    fail("openapi must be exactly 3.1.0");
  }
  if (
    document.info?.title !== "KORA+ Audio Pilot API" ||
    document.info?.version !== "1.1.0"
  ) {
    fail("S1.1 audio-pilot title or version is incorrect");
  }
  if (!stableEqual(Object.keys(document.paths ?? {}), EXPECTED_PATHS)) {
    fail(
      `paths must be exactly the ${EXPECTED_PATHS.length} approved S1.1 paths`,
    );
  }
  if (!stableEqual(document["x-kora-invariants"] ?? [], REQUIRED_INVARIANTS)) {
    fail("the formal S1.1 invariant set is incomplete or has drifted");
  }

  validateReferences(document);
  validateOperationShape(document);
  validateStateMachines(document);
  validateErrorsAndAuthorization(document);
  validateSafeSchemaSurface(document);
  validateAuthenticationContract(document);
  validateExamples(document);
  validateArtistEarningPolicy(document);
  validateCursorPagination(document);
  validateIdempotency(document);
  validateMediaAndClientGates(document);
  validateCommerceGates(document);
  validatePublicationAndArchiveGates(document);

  return {
    invariants: REQUIRED_INVARIANTS.length,
    paths: EXPECTED_PATHS.length,
    references: "resolved",
    schemas: Object.keys(document.components.schemas).length,
  };
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

export function validatePrismaTargetSchema(source) {
  const requiredModels = [
    "Customer",
    "CustomerDevice",
    "CustomerSession",
    "OtpChallenge",
    "AdminUser",
    "Artist",
    "AudioContent",
    "MediaAsset",
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
  if (!/@@unique\(\[provider, providerEventKey\]\)/.test(inbox)) {
    fail("PaymentWebhookInbox requires provider/event deduplication");
  }
  const publication = prismaModel(source, "ContentPublication");
  const publicationMedia = prismaModel(source, "PublicationMediaAsset");
  if (
    !/mediaAssets\s+PublicationMediaAsset\[\]/.test(publication) ||
    !/@@index\(\[audioContentId, archivedAt\]\)/.test(publication) ||
    !/@@unique\(\[publicationId, kind\]\)/.test(publicationMedia) ||
    !/mediaAsset\s+MediaAsset\s+@relation\(fields: \[mediaAssetId, audioContentId, kind, mediaAssetVersion\], references: \[id, audioContentId, kind, version\]\)/.test(
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
  if (/updatedAt|deletedAt/.test(audit) || !/requestId\s+String/.test(audit)) {
    fail("AuditLog must be append-only and request-correlated");
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
    models: requiredModels.length,
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
    `S1.1 contract valid: ${result.openapi.paths} paths, ${result.openapi.schemas} schemas, ${result.openapi.invariants} invariants, ${result.prisma.models} target models.`,
  );
}
