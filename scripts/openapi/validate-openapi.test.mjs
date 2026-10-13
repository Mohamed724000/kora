import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  sign as signBytes,
  verify as verifyBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  EXACT_PRETTIER_VERSION,
  buildAdminC1ContractPolicies,
  buildAdminC2ContractPolicies,
  buildAdminSecurityOperations,
  buildContractTypes,
  loadExactPrettier,
  normalizeContractSyntax,
  readGeneratedContract,
} from "./generate-contract-types.mjs";
import {
  ARTIST_EARNING_ALLOCATION_POLICY,
  allocateSettlementArtistEarnings,
} from "./artist-earning-allocation.mjs";

import {
  ADMIN_C2_EXACT_OPERATION_ERRORS,
  ADMIN_STRUCTURAL_VALIDATION_OPERATIONS,
  ADMIN_SECURITY_CONTRACTS,
  EXPECTED_PATHS,
  OPENAPI_PATH,
  PRISMA_PATH,
  readAndValidateOpenApi,
  validateOpenApiDocument,
  validatePrismaTargetSchema,
  validateSchemaInstance,
} from "./validate-openapi.mjs";

const sourceDocument = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
const prismaSource = readFileSync(PRISMA_PATH, "utf8");
const EXPECTED_ADMIN_STRUCTURAL_VALIDATION_OPERATIONS = [
  "confirmAdminTotpEnrollment",
  "verifyAdminTotp",
  "verifyAdminRecoveryCode",
  "rotateAdminRecoveryCodes",
  "stepUpAdminSession",
];

function documentFixture() {
  return structuredClone(sourceDocument);
}

function adminSecurityOperation(document, operationId) {
  const contract = ADMIN_SECURITY_CONTRACTS.find(
    (entry) => entry.operationId === operationId,
  );
  assert.ok(contract, `fixture must include ${operationId}`);
  return document.paths[contract.path][contract.method];
}

function adminSystemAuditFixture(overrides = {}) {
  return {
    version: 3,
    eventId: "00000000-0000-4000-8000-000000000001",
    action: "deliverAdminPasswordResetNotification",
    eventClass: "LOGIN",
    context: "SYSTEM",
    actorAdminUserId: null,
    subjectAdminUserId: null,
    delegatedByAdminUserId: null,
    adminSessionId: null,
    adminRecoveryContextId: null,
    systemExecutionRefHash: "a".repeat(64),
    entityType: "ADMIN_PASSWORD_RESET_DELIVERY",
    entityId: "00000000-0000-4000-8000-000000000002",
    maskedBefore: null,
    maskedAfter: null,
    reasonCode: "ACCOUNT_RECOVERY",
    operatorReason: null,
    requestId: "request-r2-system-audit",
    causationEventId: null,
    causationSecurityEventId: null,
    createdAt: "2026-10-10T00:00:00.000Z",
    outcome: "SUCCESS",
    failureCode: null,
    outcomeProvenance: "EXPLICIT_C2",
    operatorReasonRedacted: true,
    ...overrides,
  };
}

function adminLegacyAuditFixture(overrides = {}) {
  return {
    version: 1,
    eventId: "legacy-audit",
    action: `legacy-${"action".repeat(25)}`,
    eventClass: null,
    context: null,
    actorAdminUserId: "legacy-admin",
    subjectAdminUserId: null,
    delegatedByAdminUserId: null,
    adminSessionId: "legacy-session",
    adminRecoveryContextId: null,
    systemExecutionRefHash: null,
    entityType: `legacy-${"entity".repeat(25)}`,
    entityId: "legacy-entity",
    maskedBefore: null,
    maskedAfter: null,
    reasonCode: null,
    operatorReason: null,
    requestId: "legacy-request-id",
    causationEventId: null,
    causationSecurityEventId: null,
    createdAt: "2026-10-10T00:00:00.000Z",
    legacyReasonRedacted: true,
    outcome: "UNKNOWN",
    failureCode: null,
    outcomeProvenance: "HISTORICAL_UNKNOWN",
    operatorReasonRedacted: true,
    ...overrides,
  };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [path, value] of entries) {
    const name = Buffer.from(path, "utf8");
    const body = Buffer.from(value);
    const checksum = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function base64UrlNoPadding(value) {
  return Buffer.from(value).toString("base64url");
}

function verifyDetachedAuditManifestJws({
  compact,
  expectedKid,
  payload,
  publicKey,
}) {
  const [protectedSegment, detachedPayloadSegment, signatureSegment, extra] =
    compact.split(".");
  if (
    extra !== undefined ||
    !protectedSegment ||
    detachedPayloadSegment !== "" ||
    !signatureSegment ||
    protectedSegment.includes("=") ||
    signatureSegment.includes("=")
  ) {
    return false;
  }

  let protectedHeader;
  try {
    protectedHeader = JSON.parse(
      Buffer.from(protectedSegment, "base64url").toString("utf8"),
    );
  } catch {
    return false;
  }
  if (
    protectedHeader.alg !== "EdDSA" ||
    protectedHeader.kid !== expectedKid ||
    Object.keys(protectedHeader).sort().join(",") !== "alg,kid"
  ) {
    return false;
  }

  const encodedPayload = base64UrlNoPadding(payload);
  const signingInput = Buffer.from(
    `${protectedSegment}.${encodedPayload}`,
    "ascii",
  );
  return verifyBytes(
    null,
    signingInput,
    publicKey,
    Buffer.from(signatureSegment, "base64url"),
  );
}

function replaceWithinModel(source, modelName, original, replacement) {
  const pattern = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`);
  const model = pattern.exec(source)?.[0];
  assert.ok(model, `fixture must include ${modelName}`);
  const updatedModel = model.replace(original, replacement);
  assert.notEqual(updatedModel, model, `fixture must mutate ${modelName}`);
  return source.replace(model, updatedModel);
}

function commentOutWithinModel(source, modelName, original, style = "line") {
  const replacement = (match) =>
    style === "block" ? `/* ${match} */` : `// ${match}`;
  return replaceWithinModel(source, modelName, original, replacement);
}

function earningCandidate({
  basis = 101n,
  bps = 2_000n,
  artistSettlementId = "artist-settlement-1",
  settlementId = "settlement-1",
  orderId = "order-1",
  orderItemId = "item-a",
  artistId = "artist-a",
  audioContentId = "content-a",
  orderItemOrderId = orderId,
  orderItemAudioContentId = audioContentId,
  audioContentArtistId = artistId,
} = {}) {
  return {
    artistId,
    artistRevenueShareBps: bps,
    artistSettlementId,
    audioContentId,
    audioContentArtistId,
    frozenBasisCfa: basis,
    orderId,
    orderItemId,
    orderItemAudioContentId,
    orderItemOrderId,
    settlementId,
  };
}

function artistSettlementInput({
  artistId = "artist-a",
  artistSettlementId = "artist-settlement-1",
  carryInNumerator = 0n,
  earnings,
  previousArtistSettlement = null,
  settlementId = "settlement-1",
  settlementOrderId = "order-1",
  settlementSequence = 1n,
} = {}) {
  return {
    artistId,
    artistSettlementId,
    carryInNumerator,
    earnings: earnings ?? [
      earningCandidate({
        artistId,
        artistSettlementId,
        settlementId,
        orderId: settlementOrderId,
        basis: 101n,
        bps: 2_000n,
      }),
    ],
    previousArtistSettlement,
    settlementId,
    settlementOrderId,
    settlementSequence,
  };
}

function predecessorFrom(result, consumedByArtistSettlementId = null) {
  return {
    artistId: result.artistId,
    carryOutNumerator: result.carryOutNumerator,
    consumedByArtistSettlementId,
    id: result.artistSettlementId,
    settlementSequence: result.settlementSequence,
  };
}

test("the S1.2-03C2-P0 OpenAPI and preserved S1.2-03C1 Prisma target contracts are semantically valid", () => {
  const result = readAndValidateOpenApi();

  assert.equal(result.openapi.paths, 60);
  assert.equal(result.openapi.operations, 67);
  assert.equal(result.openapi.invariants, 18);
  assert.equal(result.openapi.references, "resolved");
  assert.equal(result.openapi.schemas, 141);
  assert.equal(result.prisma.models, 39);
  assert.ok(result.prisma.integerFinancialFields >= 10);
  assert.equal(EXPECTED_PATHS.length, 60);
});

test("proves the detached audit-manifest JWS signing input independently", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const expectedKid = "audit-export-signing-key-2026-10";
  const protectedHeader = Buffer.from(
    JSON.stringify({ alg: "EdDSA", kid: expectedKid }),
    "utf8",
  );
  const payload = Buffer.from(
    '{"createdAt":"2026-10-01T00:00:00Z","entries":[],"exportId":"export-1"}',
    "utf8",
  );
  const protectedSegment = base64UrlNoPadding(protectedHeader);
  const encodedPayload = base64UrlNoPadding(payload);
  const signingInput = Buffer.from(
    `${protectedSegment}.${encodedPayload}`,
    "ascii",
  );
  const signature = signBytes(null, signingInput, privateKey);
  const compact = `${protectedSegment}..${base64UrlNoPadding(signature)}`;

  assert.equal(
    signingInput.toString("ascii"),
    `${protectedSegment}.${encodedPayload}`,
  );
  assert.equal(compact.split(".")[1], "");
  assert.ok(
    verifyDetachedAuditManifestJws({
      compact,
      expectedKid,
      payload,
      publicKey,
    }),
  );

  const payloadOnlySignature = signBytes(null, payload, privateKey);
  assert.equal(
    verifyDetachedAuditManifestJws({
      compact: `${protectedSegment}..${base64UrlNoPadding(payloadOnlySignature)}`,
      expectedKid,
      payload,
      publicKey,
    }),
    false,
  );

  const alteredProtectedSegment = base64UrlNoPadding(
    Buffer.from(
      JSON.stringify({ alg: "EdDSA", kid: `${expectedKid}-altered` }),
      "utf8",
    ),
  );
  assert.equal(
    verifyDetachedAuditManifestJws({
      compact: `${alteredProtectedSegment}..${base64UrlNoPadding(signature)}`,
      expectedKid: `${expectedKid}-altered`,
      payload,
      publicKey,
    }),
    false,
  );
  assert.equal(
    verifyDetachedAuditManifestJws({
      compact,
      expectedKid,
      payload: Buffer.from(`${payload.toString("utf8")} `, "utf8"),
      publicKey,
    }),
    false,
  );

  const unencodedProtectedSegment = base64UrlNoPadding(
    Buffer.from(
      JSON.stringify({
        alg: "EdDSA",
        b64: false,
        crit: ["b64"],
        kid: expectedKid,
      }),
      "utf8",
    ),
  );
  const unencodedSigningInput = Buffer.concat([
    Buffer.from(`${unencodedProtectedSegment}.`, "ascii"),
    payload,
  ]);
  const unencodedSignature = signBytes(null, unencodedSigningInput, privateKey);
  assert.equal(
    verifyDetachedAuditManifestJws({
      compact: `${unencodedProtectedSegment}..${base64UrlNoPadding(unencodedSignature)}`,
      expectedKid,
      payload,
      publicKey,
    }),
    false,
  );
});

test("rejects an unapproved OpenAPI schema", () => {
  const document = documentFixture();
  document.components.schemas.UnapprovedExtra = { type: "string" };

  assert.throws(
    () => validateOpenApiDocument(document),
    /schemas must be exactly the 141 approved schemas/,
  );
});

test("rejects an unapproved Prisma target model", () => {
  const invalid = `${prismaSource}\nmodel UnapprovedExtra {\n  id String @id\n}\n`;

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /Prisma target models must be exactly the 39 approved models/,
  );
});

test("rejects drift from the accepted admin authentication data policy", () => {
  const document = documentFixture();
  document["x-kora-admin-auth-data-policy"].recoveryCodeCount = 9;

  assert.throws(
    () => validateOpenApiDocument(document),
    /admin authentication data must enforce RFC 6238/,
  );
});

test("requires admin TOTP at every login and protected refresh-cookie storage", () => {
  for (const [field, value] of [
    ["totpRequiredEveryLogin", false],
    ["totpEnrollmentRequiredBeforeProtectedAccess", false],
    ["recoveryAndResetAudited", false],
    ["refreshCookieHttpOnly", false],
    ["refreshCookieSecure", false],
    ["refreshCookieSameSiteRequired", false],
    ["localStorageForbidden", false],
  ]) {
    const document = documentFixture();
    document["x-kora-admin-auth-data-policy"][field] = value;

    assert.throws(
      () => validateOpenApiDocument(document),
      /admin authentication data must enforce RFC 6238/,
    );
  }
});

test("requires phone and password before registration or login OTP", () => {
  for (const schemaName of [
    "RegisterCustomerRequest",
    "LoginCustomerRequest",
  ]) {
    const document = documentFixture();
    document.components.schemas[schemaName].required = ["device", "phone"];

    assert.throws(
      () => validateOpenApiDocument(document),
      /must require phone, password and device/,
    );
  }
});

test("rejects an unapproved registration field outside the exact auth context", () => {
  const document = documentFixture();
  document.components.schemas.RegisterCustomerRequest.properties.fullName = {
    type: "string",
  };

  assert.throws(
    () => validateOpenApiDocument(document),
    /must require phone, password and device/,
  );
});

test("rejects an unknown required registration field", () => {
  const document = documentFixture();
  document.components.schemas.RegisterCustomerRequest.required.push(
    "displayName",
  );

  assert.throws(
    () => validateOpenApiDocument(document),
    /must require phone, password and device/,
  );
});

for (const [schemaName, field] of [
  ["OtpChallenge", "pendingPasswordHash"],
  ["OtpChallenge", "codeHash"],
  ["Session", "refreshTokenHash"],
  ["CustomerDeviceRegistration", "fingerprintHash"],
  ["Session", "credentialHash"],
  ["Session", "refreshTokenDigest"],
  ["Session", "passwordHashV2"],
]) {
  test(`rejects public server authentication field ${schemaName}.${field}`, () => {
    const document = documentFixture();
    document.components.schemas[schemaName].properties[field] = {
      type: "string",
    };

    assert.throws(
      () => validateOpenApiDocument(document),
      new RegExp(`forbidden public field ${field}`),
    );
  });
}

test("rejects a password added to the public Session result", () => {
  const document = documentFixture();
  document.components.schemas.Session.properties.password = { type: "string" };

  assert.throws(
    () => validateOpenApiDocument(document),
    /Session must expose only the exact bounded public token result/,
  );
});

for (const [schemaName, error] of [
  ["StepUpVerification", /exact safe result/],
  ["Session", /exact bounded public token result/],
  ["DeviceSummary", /exact safe session metadata/],
  [
    "DeviceListEnvelope",
    /exact \{data, meta\} success envelope|exact bounded safe device list/,
  ],
]) {
  test(`rejects an extra field on auth result ${schemaName}`, () => {
    const document = documentFixture();
    document.components.schemas[schemaName].properties.unapproved = {
      type: "string",
    };

    assert.throws(() => validateOpenApiDocument(document), error);
  });
}

test("rejects an extra refresh-session input", () => {
  const document = documentFixture();
  document.components.schemas.RefreshSessionRequest.properties.unapproved = {
    type: "string",
  };

  assert.throws(
    () => validateOpenApiDocument(document),
    /expose only the bounded refresh token/,
  );
});

test("rejects auth envelopes that wrap another payload", () => {
  const document = documentFixture();
  document.components.schemas.SessionEnvelope.properties.data.$ref =
    "#/components/schemas/DeviceSummary";

  assert.throws(
    () => validateOpenApiDocument(document),
    /SessionEnvelope must wrap only its exact safe auth payload/,
  );
});

for (const [schemaName, error] of [
  ["OtpChallenge", /exact safe public shape/],
  [
    "OtpVerificationRequest",
    /consume only the password-verified challenge code/,
  ],
  ["StepUpChallengeRequest", /limited to account security and artist payout/],
  ["StepUpVerificationRequest", /exact OTP code input/],
]) {
  test(`rejects extensible public auth schema ${schemaName}`, () => {
    const document = documentFixture();
    document.components.schemas[schemaName].additionalProperties = true;

    assert.throws(() => validateOpenApiDocument(document), error);
  });
}

test("rejects an extra step-up verification input", () => {
  const document = documentFixture();
  document.components.schemas.StepUpVerificationRequest.properties.sessionId = {
    type: "string",
  };

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact OTP code input/,
  );
});

test("accepts international E.164 and rejects ambiguous local phones", () => {
  assert.equal(
    validateSchemaInstance(sourceDocument, "E164Phone", "+22370000000"),
    true,
  );
  assert.equal(
    validateSchemaInstance(sourceDocument, "E164Phone", "+33612345678"),
    true,
  );
  for (const phone of ["70000000", "22370000000", "+02370000000"]) {
    assert.throws(
      () => validateSchemaInstance(sourceDocument, "E164Phone", phone),
      /required pattern/,
    );
  }
});

for (const [path, operationId] of [
  ["/api/v1/auth/step-up/challenges", "createCustomerStepUpChallenge"],
  [
    "/api/v1/auth/step-up/challenges/{challengeId}/verify",
    "verifyCustomerStepUp",
  ],
]) {
  for (const replacement of [
    undefined,
    [],
    [{ adminSession: [] }],
    [{ providerSignature: [] }],
  ]) {
    test(`rejects ${operationId} security substitution ${JSON.stringify(replacement)}`, () => {
      const document = documentFixture();
      const operation = document.paths[path].post;
      if (replacement === undefined) delete operation.security;
      else operation.security = replacement;

      assert.throws(
        () => validateOpenApiDocument(document),
        new RegExp(`${operationId} requires customerBearer exactly`),
      );
    });
  }
}

for (const [name, path, method] of [
  ["customer", "/api/v1/orders", "post"],
  ["admin", "/api/v1/admin/audio-content", "post"],
  ["provider", "/api/v1/payment-webhooks/{provider}", "post"],
]) {
  test(`rejects an anonymous OR alternative on a ${name} operation`, () => {
    const document = documentFixture();
    document.paths[path][method].security.push({});

    assert.throws(
      () => validateOpenApiDocument(document),
      /requires customerBearer exactly|requires the short-lived admin access credential|requires the sandbox provider signature/,
    );
  });
}

test("rejects root security that changes explicitly public operations", () => {
  const document = documentFixture();
  document.security = [{ customerBearer: [] }];

  assert.throws(
    () => validateOpenApiDocument(document),
    /root security is forbidden/,
  );
});

test("rejects an additional method on a health path", () => {
  const document = documentFixture();
  document.paths["/health/live"].post = {
    operationId: "unexpectedHealthMutation",
    summary: "Must not exist.",
    "x-kora-clients": ["operations"],
    responses: { 204: { description: "Must not exist." } },
  };

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact approved inventory/,
  );
});

test("rejects security on an exact public health operation", () => {
  const document = documentFixture();
  document.paths["/health/live"].get.security = [{ adminSession: [] }, {}];

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact public health operation/,
  );
});

test("rejects an unclassified mobile business operation", () => {
  const document = documentFixture();
  const operation = structuredClone(
    document.paths["/api/v1/catalog/audio"].get,
  );
  operation.operationId = "unclassifiedMobileOperation";
  operation["x-kora-clients"] = ["mobile"];
  document.paths["/api/v1/catalog/audio"].post = operation;
  document["x-kora-operation-errors"].unclassifiedMobileOperation = [
    "VALIDATION_ERROR",
  ];

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact approved inventory|must belong to exactly one approved authorization class/,
  );
});

test("rejects customerBearer scheme drift", () => {
  const document = documentFixture();
  document.components.securitySchemes.customerBearer.bearerFormat = "opaque";

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact HTTP bearer JWT scheme/,
  );
});

test("rejects adminSession format drift", () => {
  const document = documentFixture();
  document.components.securitySchemes.adminSession.bearerFormat = "opaque";

  assert.throws(
    () => validateOpenApiDocument(document),
    /short-lived bearer access credential/,
  );
});

test("rejects providerSignature outside the approved header", () => {
  const document = documentFixture();
  document.components.securitySchemes.providerSignature.in = "query";

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact sandbox signature header/,
  );
});

test("rejects a customer operation made public", () => {
  const document = documentFixture();
  delete document.paths["/api/v1/orders"].post.security;

  assert.throws(
    () => validateOpenApiDocument(document),
    /createCustomerOrder requires customerBearer exactly/,
  );
});

test("rejects a public auth operation protected by a substituted scheme", () => {
  const document = documentFixture();
  document.paths["/api/v1/auth/login"].post.security = [{ customerBearer: [] }];

  assert.throws(
    () => validateOpenApiDocument(document),
    /loginCustomer must be an exact public operation/,
  );
});

for (const [name, mutate] of [
  [
    "an envelope borrowed from another operation",
    (document) => {
      document.paths["/api/v1/orders"].post.responses["201"].content[
        "application/json"
      ].schema.$ref = "#/components/schemas/PaymentAttemptEnvelope";
    },
  ],
  [
    "a substituted success status",
    (document) => {
      const responses = document.paths["/api/v1/orders"].post.responses;
      responses["200"] = responses["201"];
      delete responses["201"];
    },
  ],
  [
    "an additional success media type",
    (document) => {
      document.paths["/api/v1/orders"].post.responses["201"].content[
        "text/plain"
      ] = { schema: { type: "string" } };
    },
  ],
  [
    "an additional generic 2XX response",
    (document) => {
      document.paths["/api/v1/orders"].post.responses["2XX"] = structuredClone(
        document.paths["/api/v1/orders"].post.responses["201"],
      );
    },
  ],
  [
    "an augmented success schema binding",
    (document) => {
      document.paths["/api/v1/orders"].post.responses["201"].content[
        "application/json"
      ].schema.description = "Unexpected schema sibling";
    },
  ],
  [
    "content on a 204 success",
    (document) => {
      document.paths["/api/v1/auth/sessions/current"].delete.responses[
        "204"
      ].content = {
        "application/json": {
          schema: { $ref: "#/components/schemas/SessionEnvelope" },
        },
      };
    },
  ],
]) {
  test(`rejects ${name} in an operation success binding`, () => {
    const document = documentFixture();
    mutate(document);

    assert.throws(
      () => validateOpenApiDocument(document),
      /success response must|approved success response/,
    );
  });
}

test("rejects a successful business response without data and meta", () => {
  const document = documentFixture();
  document.components.schemas.OrderEnvelope.required = ["data"];

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact \{data, meta\} success envelope/,
  );
});

test("rejects a successful business response without required data", () => {
  const document = documentFixture();
  document.components.schemas.OrderEnvelope.required = ["meta"];

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact \{data, meta\} success envelope/,
  );
});

test("rejects an extensible success envelope with an extra property", () => {
  const document = documentFixture();
  const envelope = document.components.schemas.OrderEnvelope;
  envelope.additionalProperties = true;
  envelope.properties.debug = { type: "string" };

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact \{data, meta\} success envelope/,
  );
});

test("rejects a successful business response with an unrelated meta schema", () => {
  const document = documentFixture();
  document.components.schemas.OrderEnvelope.properties.meta.$ref =
    "#/components/schemas/ErrorDetails";

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact \{data, meta\} success envelope/,
  );
});

test("rejects an error response without required details", () => {
  const document = documentFixture();
  document.components.schemas.ErrorResponse.properties.error.required = [
    "code",
    "message",
  ];

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact \{code, message, details\} error body/,
  );
});

test("rejects an extensible error body", () => {
  const document = documentFixture();
  document.components.schemas.ErrorResponse.properties.error.additionalProperties = true;

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact \{code, message, details\} error body/,
  );
});

test("rejects sensitive or undeclared error details", () => {
  assert.throws(
    () =>
      validateSchemaInstance(sourceDocument, "ErrorDetails", {
        refreshToken: "secret-value",
      }),
    /rejects property refreshToken/,
  );
});

test("rejects a public registration account-existence oracle", () => {
  const document = documentFixture();
  document.components.schemas.ErrorCode.enum.push("AUTH_PHONE_ALREADY_USED");
  document["x-kora-error-statuses"].AUTH_PHONE_ALREADY_USED = 409;
  document["x-kora-operation-errors"].registerCustomer.push(
    "AUTH_PHONE_ALREADY_USED",
  );
  document.paths["/api/v1/auth/register"].post.responses["409"] = {
    $ref: "#/components/responses/ClientError",
  };

  assert.throws(
    () => validateOpenApiDocument(document),
    /must not reveal account existence/,
  );
});

for (const [operationId, path, code, status] of [
  ["registerCustomer", "/api/v1/auth/register", "ACCOUNT_EXISTS", "400"],
  ["loginCustomer", "/api/v1/auth/login", "USER_DISABLED", "401"],
]) {
  test(`rejects account-existence alias ${code} on ${operationId}`, () => {
    const document = documentFixture();
    document.components.schemas.ErrorCode.enum.push(code);
    document["x-kora-error-statuses"][code] = Number(status);
    document["x-kora-operation-errors"][operationId].push(code);
    assert.ok(document.paths[path].post.responses[status]);

    assert.throws(
      () => validateOpenApiDocument(document),
      /must not reveal account existence/,
    );
  });
}

for (const precondition of [
  "AUTH_PUBLIC_OUTCOMES_DO_NOT_REVEAL_ACCOUNT_EXISTENCE",
  "AUTH_OTP_CHALLENGE_BINDS_HASHED_DEVICE_FINGERPRINT_AND_PLATFORM",
  "AUTH_REGISTER_CHALLENGE_BINDS_PENDING_PASSWORD_HASH",
  "AUTH_LOGIN_CHALLENGE_BINDS_PASSWORD_VERIFIED_CUSTOMER",
  "AUTH_STEP_UP_CHALLENGE_BINDS_EXISTING_CUSTOMER_SESSION",
]) {
  test(`rejects removal of auth precondition ${precondition}`, () => {
    const document = documentFixture();
    document["x-kora-transaction-preconditions"] = document[
      "x-kora-transaction-preconditions"
    ].filter((value) => value !== precondition);

    assert.throws(
      () => validateOpenApiDocument(document),
      /transaction-precondition set is incomplete/,
    );
  });
}

test("rejects OTP verification that accepts a replacement device", () => {
  const document = documentFixture();
  const schema = document.components.schemas.OtpVerificationRequest;
  schema.properties.device = {
    $ref: "#/components/schemas/CustomerDeviceRegistration",
  };

  assert.throws(
    () => validateOpenApiDocument(document),
    /consume only the password-verified challenge code/,
  );
});

test("the shared TypeScript boundary is generated from the current OpenAPI", async () => {
  const current = readFileSync(
    resolve("packages", "contracts", "src", "generated", "audio-pilot.ts"),
    "utf8",
  );
  const generatedSyntax = buildContractTypes(sourceDocument);

  assert.match(generatedSyntax, /export const adminSecurityOperations/);
  assert.equal(current, await readGeneratedContract());
});

test("the exact generator fails closed when Prettier is unavailable", async () => {
  await assert.rejects(
    loadExactPrettier({
      readPackageJson() {
        throw Object.assign(new Error("module missing"), {
          code: "MODULE_NOT_FOUND",
        });
      },
    }),
    new RegExp(`Prettier ${EXACT_PRETTIER_VERSION}.*unavailable`),
  );
});

test("the exact generator rejects a substituted Prettier version", async () => {
  await assert.rejects(
    loadExactPrettier({
      readPackageJson: () => ({ version: "3.9.5" }),
    }),
    /Prettier 3\.9\.6 is required.*found 3\.9\.5/,
  );
});

test("generated contract normalization preserves token boundaries", () => {
  assert.notEqual(
    normalizeContractSyntax("export type Example = string;"),
    normalizeContractSyntax("exporttype Example = string;"),
  );
  assert.notEqual(
    normalizeContractSyntax("readonly value: string;"),
    normalizeContractSyntax("readonlyvalue: string;"),
  );
  assert.notEqual(
    normalizeContractSyntax("// generated boundary\nexport const value = 1;"),
    normalizeContractSyntax("// generated boundary export const value = 1;"),
  );
  assert.match(
    normalizeContractSyntax("// generated boundary\nexport const value = 1;"),
    /\/\/ generated boundary\nexport/,
  );
});

test("carries the mandatory 20.2 then 0.8 CFA example for one artist", () => {
  const first = allocateSettlementArtistEarnings(artistSettlementInput());
  const second = allocateSettlementArtistEarnings(
    artistSettlementInput({
      artistSettlementId: "artist-settlement-2",
      carryInNumerator: first.carryOutNumerator,
      earnings: [
        earningCandidate({
          artistSettlementId: "artist-settlement-2",
          settlementId: "settlement-2",
          orderId: "order-2",
          basis: 4n,
          bps: 2_000n,
        }),
      ],
      previousArtistSettlement: predecessorFrom(first),
      settlementId: "settlement-2",
      settlementOrderId: "order-2",
      settlementSequence: 2n,
    }),
  );

  assert.equal(first.policy, ARTIST_EARNING_ALLOCATION_POLICY);
  assert.equal(first.payableAmountCfa, 20n);
  assert.equal(first.carryOutNumerator, 2_000n);
  assert.equal(second.exactNumerator, 10_000n);
  assert.equal(second.payableAmountCfa, 1n);
  assert.equal(second.carryOutNumerator, 0n);
});

test("sums several earnings before flooring one artist settlement", () => {
  const result = allocateSettlementArtistEarnings(
    artistSettlementInput({
      earnings: [
        earningCandidate({ basis: 101n, bps: 2_000n }),
        earningCandidate({
          basis: 4n,
          bps: 2_000n,
          orderItemId: "item-b",
          audioContentId: "content-b",
        }),
      ],
    }),
  );

  assert.equal(result.exactEarningsNumerator, 210_000n);
  assert.equal(result.payableAmountCfa, 21n);
  assert.equal(result.carryOutNumerator, 0n);
  assert.deepEqual(
    result.earnings.map((earning) => earning.orderItemId),
    ["item-a", "item-b"],
  );
});

test("chains several successive settlements in strict artist order", () => {
  let result = allocateSettlementArtistEarnings(
    artistSettlementInput({
      earnings: [earningCandidate({ basis: 1n, bps: 3_333n })],
    }),
  );

  for (const sequence of [2n, 3n, 4n]) {
    const artistSettlementId = `artist-settlement-${sequence}`;
    const settlementId = `settlement-${sequence}`;
    const orderId = `order-${sequence}`;
    result = allocateSettlementArtistEarnings(
      artistSettlementInput({
        artistSettlementId,
        carryInNumerator: result.carryOutNumerator,
        earnings: [
          earningCandidate({
            artistSettlementId,
            settlementId,
            orderId,
            basis: 1n,
            bps: 3_333n,
          }),
        ],
        previousArtistSettlement: predecessorFrom(result),
        settlementId,
        settlementOrderId: orderId,
        settlementSequence: sequence,
      }),
    );
  }

  assert.equal(result.payableAmountCfa, 1n);
  assert.equal(result.carryOutNumerator, 3_332n);
});

test("keeps two artists' carry chains independent", () => {
  const artistA = allocateSettlementArtistEarnings(artistSettlementInput());
  const artistB = allocateSettlementArtistEarnings(
    artistSettlementInput({
      artistId: "artist-b",
      artistSettlementId: "artist-b-settlement-1",
      earnings: [
        earningCandidate({
          artistId: "artist-b",
          artistSettlementId: "artist-b-settlement-1",
          basis: 3n,
          bps: 2_000n,
          orderItemId: "item-b",
          audioContentId: "content-b",
        }),
      ],
    }),
  );

  assert.equal(artistA.carryOutNumerator, 2_000n);
  assert.equal(artistB.carryOutNumerator, 6_000n);
});

test("supports zero, boundary BPS and carry 9999 without fractional loss", () => {
  const zero = allocateSettlementArtistEarnings(
    artistSettlementInput({
      earnings: [earningCandidate({ basis: 0n, bps: 0n })],
    }),
  );
  assert.equal(zero.payableAmountCfa, 0n);
  assert.equal(zero.carryOutNumerator, 0n);

  const previous = {
    artistId: "artist-a",
    carryOutNumerator: 9_999n,
    consumedByArtistSettlementId: null,
    id: "artist-settlement-1",
    settlementSequence: 1n,
  };
  const maximum = allocateSettlementArtistEarnings(
    artistSettlementInput({
      artistSettlementId: "artist-settlement-2",
      carryInNumerator: 9_999n,
      earnings: [
        earningCandidate({
          artistSettlementId: "artist-settlement-2",
          settlementId: "settlement-2",
          orderId: "order-2",
          basis: 2n,
          bps: 10_000n,
        }),
      ],
      previousArtistSettlement: previous,
      settlementId: "settlement-2",
      settlementOrderId: "order-2",
      settlementSequence: 2n,
    }),
  );
  assert.equal(maximum.payableAmountCfa, 2n);
  assert.equal(maximum.carryOutNumerator, 9_999n);
});

test("uses BigInt above the JavaScript safe-integer boundary", () => {
  const basis = 9_007_199_254_740_993n;
  const result = allocateSettlementArtistEarnings(
    artistSettlementInput({
      earnings: [earningCandidate({ basis, bps: 10_000n })],
    }),
  );

  assert.equal(result.payableAmountCfa, basis);
  assert.equal(result.platformAmountCfa, 0n);
  assert.equal(result.earnings[0].exactEarningNumerator, basis * 10_000n);
});

test("keeps the financial reference free of Number and implicit rounding", () => {
  const source = readFileSync(
    resolve("scripts", "openapi", "artist-earning-allocation.mjs"),
    "utf8",
  );

  assert.doesNotMatch(source, /\bNumber\s*\(|\bMath\.|parse(?:Int|Float)\s*\(/);
});

test("proves the exact numerator conservation equation", () => {
  const result = allocateSettlementArtistEarnings(
    artistSettlementInput({
      earnings: [
        earningCandidate({ basis: 101n, bps: 2_000n }),
        earningCandidate({
          basis: 259n,
          bps: 3_333n,
          orderItemId: "item-b",
          audioContentId: "content-b",
        }),
      ],
    }),
  );

  assert.equal(
    result.carryInNumerator + result.exactEarningsNumerator,
    result.payableAmountCfa * 10_000n + result.carryOutNumerator,
  );
});

for (const [name, mutate, error] of [
  [
    "an earning from another settlement",
    (input) => (input.earnings[0].settlementId = "settlement-other"),
    /earnings\[0\]\.settlementId must match settlementId/,
  ],
  [
    "an earning from another order item",
    (input) => (input.earnings[0].orderItemOrderId = "order-other"),
    /earnings\[0\]\.orderItemOrderId must match settlementOrderId/,
  ],
  [
    "an earning for another audio content",
    (input) => (input.earnings[0].orderItemAudioContentId = "content-other"),
    /earnings\[0\]\.orderItemAudioContentId must match audioContentId/,
  ],
  [
    "an earning for another artist",
    (input) => (input.earnings[0].artistId = "artist-other"),
    /earnings\[0\]\.artistId must match artistId/,
  ],
  [
    "content owned by another artist",
    (input) => (input.earnings[0].audioContentArtistId = "artist-other"),
    /earnings\[0\]\.audioContentArtistId must match artistId/,
  ],
]) {
  test(`rejects ${name}`, () => {
    const input = artistSettlementInput();
    mutate(input);
    assert.throws(() => allocateSettlementArtistEarnings(input), error);
  });
}

test("rejects invalid financial bounds and non-BigInt inputs", () => {
  for (const [candidate, error] of [
    [earningCandidate({ basis: -1n }), /frozenBasisCfa must be non-negative/],
    [
      earningCandidate({ bps: -1n }),
      /artistRevenueShareBps must be between 0 and 10000/,
    ],
    [
      earningCandidate({ bps: 10_001n }),
      /artistRevenueShareBps must be between 0 and 10000/,
    ],
    [earningCandidate({ basis: 1 }), /frozenBasisCfa must be a BigInt/],
  ]) {
    assert.throws(
      () =>
        allocateSettlementArtistEarnings(
          artistSettlementInput({ earnings: [candidate] }),
        ),
      error,
    );
  }
});

test("rejects duplicate remuneration for one order item", () => {
  const earning = earningCandidate({ basis: 1n });
  assert.throws(
    () =>
      allocateSettlementArtistEarnings(
        artistSettlementInput({
          earnings: [
            earning,
            {
              ...earning,
              audioContentId: "content-b",
              orderItemAudioContentId: "content-b",
            },
          ],
        }),
      ),
    /duplicate artist earning orderItemId/,
  );
});

test("rejects carry consumption more than once", () => {
  const first = allocateSettlementArtistEarnings(artistSettlementInput());
  assert.throws(
    () =>
      allocateSettlementArtistEarnings(
        artistSettlementInput({
          artistSettlementId: "artist-settlement-2",
          carryInNumerator: first.carryOutNumerator,
          earnings: [
            earningCandidate({
              artistSettlementId: "artist-settlement-2",
              settlementId: "settlement-2",
              orderId: "order-2",
            }),
          ],
          previousArtistSettlement: predecessorFrom(
            first,
            "artist-settlement-already-consuming",
          ),
          settlementId: "settlement-2",
          settlementOrderId: "order-2",
          settlementSequence: 2n,
        }),
      ),
    /previous artist settlement carry is already consumed/,
  );
});

test("rejects a predecessor belonging to another artist", () => {
  assert.throws(
    () =>
      allocateSettlementArtistEarnings(
        artistSettlementInput({
          artistSettlementId: "artist-settlement-2",
          carryInNumerator: 2_000n,
          previousArtistSettlement: {
            artistId: "artist-other",
            carryOutNumerator: 2_000n,
            consumedByArtistSettlementId: null,
            id: "artist-settlement-1",
            settlementSequence: 1n,
          },
          settlementSequence: 2n,
        }),
      ),
    /previous artist settlement belongs to another artist/,
  );
});

test("rejects an incoherent artist settlement order", () => {
  assert.throws(
    () =>
      allocateSettlementArtistEarnings(
        artistSettlementInput({
          artistSettlementId: "artist-settlement-3",
          carryInNumerator: 2_000n,
          previousArtistSettlement: {
            artistId: "artist-a",
            carryOutNumerator: 2_000n,
            consumedByArtistSettlementId: null,
            id: "artist-settlement-1",
            settlementSequence: 1n,
          },
          settlementSequence: 3n,
        }),
      ),
    /sequence must immediately follow its predecessor/,
  );
});

test("rejects a non-zero carry on the first artist settlement", () => {
  assert.throws(
    () =>
      allocateSettlementArtistEarnings(
        artistSettlementInput({ carryInNumerator: 1n }),
      ),
    /first artist settlement carryInNumerator must be zero/,
  );
});

test("rejects carry that differs from the immediate predecessor", () => {
  assert.throws(
    () =>
      allocateSettlementArtistEarnings(
        artistSettlementInput({
          artistSettlementId: "artist-settlement-2",
          carryInNumerator: 2_001n,
          previousArtistSettlement: {
            artistId: "artist-a",
            carryOutNumerator: 2_000n,
            consumedByArtistSettlementId: null,
            id: "artist-settlement-1",
            settlementSequence: 1n,
          },
          settlementSequence: 2n,
        }),
      ),
    /carryInNumerator must equal predecessor carryOutNumerator/,
  );
});

test("rejects a public cover that is not bound to the active publication", () => {
  const document = documentFixture();
  document.components.schemas.PublicCoverImage["x-kora-content-binding"] =
    "UNBOUND_MEDIA_ASSET";

  assert.throws(
    () => validateOpenApiDocument(document),
    /public cover metadata must resolve only through the controlled API/,
  );
});

test("rejects a public cover response that exposes a location", () => {
  const document = documentFixture();
  document.components.schemas.PublicCoverImage.properties.url = {
    type: "string",
  };

  assert.throws(
    () => validateOpenApiDocument(document),
    /public cover metadata must resolve only through the controlled API|raw media or private provider fields/,
  );
});

test("requires the exact active-publication cover version in the request", () => {
  const document = documentFixture();
  document.paths["/api/v1/catalog/audio/{contentId}/cover"].get.parameters = [
    { $ref: "#/components/parameters/ContentId" },
  ];

  assert.throws(
    () => validateOpenApiDocument(document),
    /getPublicAudioCover must declare exactly one mediaAssetVersion parameter/,
  );
});

test("rejects a duplicate public cover mediaAssetVersion parameter", () => {
  const document = documentFixture();
  document.paths["/api/v1/catalog/audio/{contentId}/cover"].parameters = [
    {
      name: "mediaAssetVersion",
      in: "query",
      required: true,
      schema: { type: "integer", minimum: 0 },
    },
  ];

  assert.throws(
    () => validateOpenApiDocument(document),
    /getPublicAudioCover must declare exactly one mediaAssetVersion parameter/,
  );
});

for (const [name, mutate] of [
  [
    "a non-integer mediaAssetVersion",
    (parameter) => {
      parameter.schema.type = "number";
    },
  ],
  [
    "a mediaAssetVersion below one",
    (parameter) => {
      parameter.schema.minimum = 0;
    },
  ],
]) {
  test(`rejects ${name} in the public cover contract`, () => {
    const document = documentFixture();
    const parameter = document.paths[
      "/api/v1/catalog/audio/{contentId}/cover"
    ].get.parameters.find((entry) => entry.name === "mediaAssetVersion");
    assert.ok(parameter);
    mutate(parameter);

    assert.throws(
      () => validateOpenApiDocument(document),
      /public cover bytes require the exact controlled representation path/,
    );
  });
}

test("requires HTTP 400 for invalid public cover versions", () => {
  const document = documentFixture();
  delete document.paths["/api/v1/catalog/audio/{contentId}/cover"].get
    .responses["400"];

  assert.throws(
    () => validateOpenApiDocument(document),
    /getPublicAudioCover does not expose the HTTP status mapped to VALIDATION_ERROR/,
  );
});

test("requires VALIDATION_ERROR for invalid public cover versions", () => {
  const document = documentFixture();
  document["x-kora-operation-errors"].getPublicAudioCover = [
    "CONTENT_NOT_FOUND",
  ];

  assert.throws(
    () => validateOpenApiDocument(document),
    /getPublicAudioCover HTTP 400 lacks a mapped stable error code/,
  );
});

test("rejects a synthetic or writable public sales count", () => {
  for (const mutation of [
    (sales) => {
      sales["x-kora-pre-p4-value"] = 1;
    },
    (sales) => {
      sales.readOnly = false;
    },
  ]) {
    const document = documentFixture();
    mutation(
      document.components.schemas.AudioCatalogItem.properties.settledSalesCount,
    );

    assert.throws(
      () => validateOpenApiDocument(document),
      /real settled sales only/,
    );
  }
});

test("rejects client-supplied catalog provenance", () => {
  const document = documentFixture();
  document.components.schemas.UpsertAudioContentRequest.properties.createdByAdminId =
    {
      $ref: "#/components/schemas/Identifier",
    };

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact approved content-authority fields|server-assigned admin provenance/,
  );
});

test("rejects finance authority or spoofed actor fields in admin requests", () => {
  for (const [schemaName, fieldName, schema] of [
    [
      "UpsertArtistRequest",
      "artistRevenueShareBps",
      { type: "integer", minimum: 0, maximum: 10000 },
    ],
    [
      "PublishAudioContentRequest",
      "publishedByAdminId",
      { $ref: "#/components/schemas/Identifier" },
    ],
    [
      "ArchiveAudioContentRequest",
      "archivedByAdminId",
      { $ref: "#/components/schemas/Identifier" },
    ],
    [
      "CreateMediaAssetRequest",
      "createdByAdminId",
      { $ref: "#/components/schemas/Identifier" },
    ],
  ]) {
    const document = documentFixture();
    document.components.schemas[schemaName].properties[fieldName] = schema;

    assert.throws(
      () => validateOpenApiDocument(document),
      /exact approved content-authority fields/,
    );
  }
});

test("rejects a catalog mutation that can rewrite provenance", () => {
  const document = documentFixture();
  delete document.paths["/api/v1/admin/artists/{artistId}"].patch[
    "x-kora-provenance"
  ];

  assert.throws(
    () => validateOpenApiDocument(document),
    /immutable authenticated-admin provenance/,
  );
});

for (const precondition of [
  "CATALOG_PROVENANCE_COLUMN_IMMUTABLE_AFTER_INSERT",
  "MEDIA_PROVIDER_UPLOAD_AND_ASSET_REFERENCES_SET_ONCE_AND_RESOLVE_UNIQUELY",
]) {
  test(`rejects removal of readiness precondition ${precondition}`, () => {
    const document = documentFixture();
    document["x-kora-transaction-preconditions"] = document[
      "x-kora-transaction-preconditions"
    ].filter((value) => value !== precondition);

    assert.throws(
      () => validateOpenApiDocument(document),
      /transaction-precondition set is incomplete/,
    );
  });
}

test("rejects raw media aliases across every sensitive response surface", () => {
  for (const [schemaName, fieldName] of [
    ["AudioCatalogItem", "sourceUrl"],
    ["AudioContentDetail", "providerAssetId"],
    ["LibraryAudioItem", "assetKey"],
    ["PreviewGrant", "originKey"],
    ["PlaybackDescriptor", "sourceObjectKey"],
    ["MediaPreparation", "mediaLocator"],
    ["MediaAssetStatus", "signedUrl"],
  ]) {
    const document = documentFixture();
    document.components.schemas[schemaName].properties[fieldName] = {
      type: "string",
    };

    assert.throws(
      () => validateOpenApiDocument(document),
      /exact safe media properties|raw media or private provider field/,
    );
  }
});

test("rejects floating-point CFA money", () => {
  const document = documentFixture();
  document.components.schemas.MoneyCfa.type = "number";
  document.components.schemas.MoneyCfa.format = "double";

  assert.throws(
    () => validateOpenApiDocument(document),
    /money field|floating-point/,
  );
});

test("rejects publication without an exact ready-media precondition", () => {
  const document = documentFixture();
  delete document.paths["/api/v1/admin/audio-content/{contentId}/publish"].post[
    "x-kora-precondition"
  ];

  assert.throws(
    () => validateOpenApiDocument(document),
    /publishing must expose stable conflicts/,
  );
});

test("rejects a state machine with an outgoing terminal transition", () => {
  const document = documentFixture();
  document["x-kora-state-machines"].PaymentAttempt.transitions.FAILED = [
    "CREATED",
  ];

  assert.throws(
    () => validateOpenApiDocument(document),
    /terminal state FAILED must exist and have no outgoing transition/,
  );
});

test("rejects drift between derived state and append-only event history", () => {
  const document = documentFixture();
  delete document.components.schemas.Order["x-kora-current-state-source"];

  assert.throws(
    () => validateOpenApiDocument(document),
    /Order.state must equal the latest append-only event/,
  );
});

test("rejects a missing business-operation error map", () => {
  const document = documentFixture();
  delete document["x-kora-operation-errors"].createCustomerOrder;

  assert.throws(
    () => validateOpenApiDocument(document),
    /createCustomerOrder must enumerate stable operation error codes/,
  );
});

test("rejects a stable error code whose HTTP status is absent", () => {
  const document = documentFixture();
  document["x-kora-operation-errors"].createCustomerOrder.push(
    "PAYMENT_PROVIDER_UNAVAILABLE",
  );

  assert.throws(
    () => validateOpenApiDocument(document),
    /createCustomerOrder does not expose the HTTP status mapped to PAYMENT_PROVIDER_UNAVAILABLE/,
  );
});

test("rejects an admin route without explicit RBAC", () => {
  const document = documentFixture();
  delete document.paths["/api/v1/admin/artists"].post["x-kora-roles"];

  assert.throws(
    () => validateOpenApiDocument(document),
    /createAdminArtist requires the exact approved admin roles/,
  );
});

test("rejects widening content operations to finance or support roles", () => {
  for (const role of ["FINANCE_MANAGER", "SUPPORT"]) {
    const document = documentFixture();
    document.paths["/api/v1/admin/audio-content"].post["x-kora-roles"].push(
      role,
    );

    assert.throws(
      () => validateOpenApiDocument(document),
      /createAdminAudioContent requires the exact approved admin roles/,
    );
  }
});

test("rejects a publish request that duplicates one required media kind", () => {
  const document = documentFixture();
  document.components.schemas.PublishAudioContentRequest.properties.requiredMediaAssets.allOf[1].contains.properties.kind.const =
    "AUDIO_MASTER";

  assert.throws(
    () => validateOpenApiDocument(document),
    /one exact ready version of every required media kind/,
  );
});

test("validates a flattened detail example and rejects an unexpected property", () => {
  const detail = {
    artist: {
      artistId: "22222222-2222-4222-8222-222222222222",
      stageName: "Awa Traore",
    },
    cover: {
      contentId: "11111111-1111-4111-8111-111111111111",
      mediaAssetVersion: 1,
      representation: "CONTROLLED_API",
    },
    contentId: "11111111-1111-4111-8111-111111111111",
    description: "Une creation du pilote audio.",
    durationSeconds: 192,
    previewAvailable: true,
    previewSeconds: 30,
    priceCfa: 2500,
    settledSalesCount: 0,
    title: "Voix du fleuve",
  };

  assert.equal(
    validateSchemaInstance(sourceDocument, "AudioContentDetail", detail),
    true,
  );
  assert.throws(
    () =>
      validateSchemaInstance(sourceDocument, "AudioContentDetail", {
        ...detail,
        previewUrl: "https://private.invalid/media.m3u8",
      }),
    /rejects property previewUrl/,
  );
});

test("rejects an Entitlement that can exist before Settlement", () => {
  const invalid = prismaSource.replace(
    /(model Entitlement \{[\s\S]*?\n\s*settlementId)\s+String\n/,
    "$1 String?\n",
  );

  assert.notEqual(
    invalid,
    prismaSource,
    "fixture must make settlementId optional",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /Entitlement must require a settlement/,
  );
});

test("rejects a customer session bound to another customer's device", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "CustomerSession",
    /device\s+CustomerDevice\s+@relation\(fields: \[deviceId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "device CustomerDevice @relation(fields: [deviceId], references: [id])",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /CustomerSession must bind its device to the same customer/,
  );
});

test("rejects removal of the device tenant candidate key", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "CustomerDevice",
    "@@unique([id, customerId])",
    "@@index([id, customerId])",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /CustomerSession must bind its device to the same customer/,
  );
});

test("rejects removal of the session tenant candidate key", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "CustomerSession",
    "@@unique([id, customerId])",
    "@@index([id, customerId])",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /CustomerSession must bind its device to the same customer/,
  );
});

for (const [name, modelName, original, replacement, error] of [
  [
    "customer password hash",
    "Customer",
    /passwordHash\s+String/,
    "passwordDigest String",
    /server-side password hash/,
  ],
  [
    "unique rotating refresh hash",
    "CustomerSession",
    /refreshTokenHash\s+String\s+@unique/,
    "refreshTokenHash String",
    /rotating refresh hashes/,
  ],
  [
    "OTP step-up freshness",
    "CustomerSession",
    /lastOtpStepUpAt\s+DateTime\?/,
    "lastOtpStepUp String?",
    /OTP step-up freshness/,
  ],
  [
    "OTP code hash",
    "OtpChallenge",
    /codeHash\s+String/,
    "codeDigest String",
    /bounded password, customer, session and hashed-device context/,
  ],
  [
    "pending registration password hash",
    "OtpChallenge",
    /pendingPasswordHash\s+String\?/,
    "pendingPasswordDigest String?",
    /bounded password, customer, session and hashed-device context/,
  ],
  [
    "password verification timestamp",
    "OtpChallenge",
    /passwordVerifiedAt\s+DateTime\?/,
    "credentialCheckedAt DateTime?",
    /bounded password, customer, session and hashed-device context/,
  ],
  [
    "hashed device fingerprint",
    "OtpChallenge",
    /deviceFingerprintHash\s+String/,
    "deviceFingerprint String",
    /bounded password, customer, session and hashed-device context/,
  ],
  [
    "device platform",
    "OtpChallenge",
    /devicePlatform\s+DevicePlatform/,
    "devicePlatform String",
    /bounded password, customer, session and hashed-device context/,
  ],
]) {
  test(`rejects removal of ${name}`, () => {
    const invalid = replaceWithinModel(
      prismaSource,
      modelName,
      original,
      replacement,
    );

    assert.throws(() => validatePrismaTargetSchema(invalid), error);
  });
}

for (const [name, original, replacement] of [
  [
    "customer",
    /customer\s+Customer\?\s+@relation\(fields: \[customerId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    "customer Customer? @relation(fields: [customerId], references: [id])",
  ],
  [
    "session",
    /session\s+CustomerSession\?\s+@relation\(fields: \[sessionId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "session CustomerSession? @relation(fields: [sessionId], references: [id])",
  ],
]) {
  test(`rejects an OTP challenge detached from its ${name} context`, () => {
    const invalid = replaceWithinModel(
      prismaSource,
      "OtpChallenge",
      original,
      replacement,
    );

    assert.throws(
      () => validatePrismaTargetSchema(invalid),
      /bounded password, customer, session and hashed-device context/,
    );
  });
}

for (const [name, modelName, original, replacement] of [
  [
    "encrypted TOTP secret",
    "AdminUser",
    /totpSecretEncrypted\s+String\?/,
    "totpSecret String?",
  ],
  [
    "token family identifier",
    "AdminSession",
    /tokenFamilyId\s+String/,
    "tokenFamilyId Int",
  ],
  [
    "unique access-token JTI",
    "AdminSession",
    /accessTokenJti\s+String\s+@unique/,
    "accessTokenJti String",
  ],
  [
    "refresh rotation version",
    "AdminSession",
    /refreshTokenVersion\s+Int\s+@default\(1\)/,
    "refreshTokenVersion String",
  ],
  [
    "last activity timestamp",
    "AdminSession",
    /lastActivityAt\s+DateTime\s+@default\(now\(\)\)/,
    "lastActivityAt String",
  ],
  [
    "per-admin token-family uniqueness",
    "AdminSession",
    /@@unique\(\[adminUserId, tokenFamilyId\]\)/,
    "@@index([adminUserId, tokenFamilyId])",
  ],
  [
    "single-use recovery timestamp",
    "AdminRecoveryCode",
    /usedAt\s+DateTime\?/,
    "usedAt String?",
  ],
]) {
  test(`rejects admin authentication data without ${name}`, () => {
    const invalid = replaceWithinModel(
      prismaSource,
      modelName,
      original,
      replacement,
    );

    assert.throws(
      () => validatePrismaTargetSchema(invalid),
      /admin authentication readiness/,
    );
  });
}

test("rejects an audit record detached from its administrator session", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "AuditLog",
    /adminSession\s+AdminSession\?\s+@relation\("AuditSession", fields: \[adminSessionId, actorAdminUserId\], references: \[id, adminUserId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "adminSession AdminSession @relation(fields: [adminSessionId], references: [id])",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /AuditLog must be append-only with complete/,
  );
});

test("rejects incomplete mandatory audit evidence", () => {
  for (const [field, replacement] of [
    [/action\s+String/, ""],
    [/entityType\s+String/, ""],
    [/entityId\s+String/, ""],
    [/maskedBefore\s+Json\?/, ""],
    [/maskedAfter\s+Json\?/, ""],
    [
      /legacyReason\s+String\s+@map\("reason"\)/,
      'legacyReason String? @map("reason")',
    ],
    [/requestId\s+String/, ""],
    [/createdAt\s+DateTime\s+@default\(now\(\)\)/, "createdAt DateTime?"],
    [/action\s+String/, "transaction String"],
    [/legacyReason\s+String/, "legacyTreason String"],
    [/requestId\s+String/, "otherrequestId String"],
  ]) {
    const invalid = replaceWithinModel(
      prismaSource,
      "AuditLog",
      field,
      replacement,
    );

    assert.throws(
      () => validatePrismaTargetSchema(invalid),
      /AuditLog must be append-only with complete/,
    );
  }
});

test("rejects deletion propagation from admin idempotency records", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "AdminIdempotencyRecord",
    /adminUser\s+AdminUser\s+@relation\(fields: \[adminUserId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    "adminUser AdminUser @relation(fields: [adminUserId], references: [id])",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /idempotency records must scope actors/,
  );
});

for (const [name, original, replacement] of [
  [
    "entitlement",
    /entitlement\s+Entitlement\s+@relation\(fields: \[entitlementId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "entitlement Entitlement @relation(fields: [entitlementId], references: [id])",
  ],
  [
    "device",
    /device\s+CustomerDevice\s+@relation\(fields: \[deviceId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "device CustomerDevice @relation(fields: [deviceId], references: [id])",
  ],
]) {
  test(`rejects a purchased descriptor bound to another customer's ${name}`, () => {
    const invalid = replaceWithinModel(
      prismaSource,
      "PurchasedPlaybackDescriptor",
      original,
      replacement,
    );

    assert.notEqual(invalid, prismaSource);
    assert.throws(
      () => validatePrismaTargetSchema(invalid),
      /PurchasedPlaybackDescriptor must bind entitlement and device to the same customer/,
    );
  });
}

test("rejects an idempotency record bound to another customer's order", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "IdempotencyRecord",
    /order\s+Order\?\s+@relation\(fields: \[orderId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "order Order? @relation(fields: [orderId], references: [id])",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /idempotency records must scope actors/,
  );
});

test("rejects removal of the order tenant candidate key", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "Order",
    "@@unique([id, customerId])",
    "@@index([id, customerId])",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /idempotency records must scope actors/,
  );
});

test("rejects removal of the entitlement tenant candidate key", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "Entitlement",
    "@@unique([id, customerId])",
    "@@index([id, customerId])",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /Entitlement must require a settlement and match its order item, content and customer/,
  );
});

test("rejects any overwrite method on PaymentAttempt", () => {
  const document = documentFixture();
  const item =
    document.paths[
      "/api/v1/orders/{orderId}/payment-attempts/{paymentAttemptId}"
    ];
  item.patch = structuredClone(item.get);
  delete item.get;

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact approved inventory|cannot be overwritten/,
  );
});

test("rejects a webhook that is not durably idempotent before acknowledgement", () => {
  const document = documentFixture();
  const webhook = document.paths["/api/v1/payment-webhooks/{provider}"].post;
  webhook["x-kora-idempotent"] = false;

  assert.throws(
    () => validateOpenApiDocument(document),
    /durable-before-ack and idempotent/,
  );
});

test("rejects an idempotent operation without a stable conflict response", () => {
  const document = documentFixture();
  delete document.paths["/api/v1/orders"].post.responses["409"];
  document["x-kora-operation-errors"].createCustomerOrder = [
    "VALIDATION_ERROR",
    "AUTH_REQUIRED",
    "CONTENT_NOT_FOUND",
  ];

  assert.throws(
    () => validateOpenApiDocument(document),
    /HTTP 409|stable idempotency conflict response/,
  );
});

test("rejects media provider/event webhook deduplication drift", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "MediaWebhookInbox",
    "@@unique([provider, providerEventKey])",
    "@@index([provider, providerEventKey])",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /authenticated encrypted payloads/,
  );
});

for (const [name, original, replacement] of [
  [
    "private provider upload reference",
    /privateProviderUploadRef\s+String\?/,
    "privateProviderUploadRef Int?",
  ],
  [
    "private provider asset reference",
    /privateProviderAssetRef\s+String\?/,
    "privateProviderAssetRef Int?",
  ],
  [
    "unique provider upload correlation",
    /@@unique\(\[provider, privateProviderUploadRef\]\)/,
    "@@index([provider, privateProviderUploadRef])",
  ],
  [
    "unique provider asset correlation",
    /@@unique\(\[provider, privateProviderAssetRef\]\)/,
    "@@index([provider, privateProviderAssetRef])",
  ],
]) {
  test(`rejects media data without ${name}`, () => {
    const invalid = replaceWithinModel(
      prismaSource,
      "MediaAsset",
      original,
      replacement,
    );

    assert.throws(
      () => validatePrismaTargetSchema(invalid),
      /authenticated encrypted payloads/,
    );
  });
}

test("rejects a Mux webhook without its exact signature boundary", () => {
  const document = documentFixture();
  document.paths["/api/v1/media-webhooks/mux"].post.security = [
    { providerSignature: [] },
  ];

  assert.throws(() => validateOpenApiDocument(document), /exact Mux signature/);
});

test("rejects a Mux webhook that is not durable or can publish", () => {
  for (const [field, value] of [
    ["x-kora-durable-before-ack", false],
    ["x-kora-never-publishes", false],
    ["x-kora-signed-payload", "PARSED_JSON"],
    ["x-kora-raw-body-ingress-policy", "UNBOUNDED"],
    ["x-kora-persisted-payload", "RAW_BODY"],
  ]) {
    const document = documentFixture();
    document.paths["/api/v1/media-webhooks/mux"].post[field] = value;

    assert.throws(
      () => validateOpenApiDocument(document),
      /Mux callbacks must be signature-authenticated, durable, idempotent and unable to publish/,
    );
  }
});

test("rejects unbounded Mux provider event identifiers", () => {
  const document = documentFixture();
  delete document.components.schemas.MuxMediaWebhookRequest.properties.id
    .maxLength;

  assert.throws(
    () => validateOpenApiDocument(document),
    /Mux callbacks must be signature-authenticated, durable, idempotent and unable to publish/,
  );
});

for (const [name, mutate, error] of [
  [
    "a closed Mux provider payload root",
    (document) => {
      document.components.schemas.MuxMediaWebhookRequest.additionalProperties = false;
    },
    /Mux callbacks must be signature-authenticated/,
  ],
  [
    "closed Mux provider data",
    (document) => {
      document.components.schemas.MuxMediaWebhookRequest.properties.data.additionalProperties = false;
    },
    /Mux callbacks must be signature-authenticated/,
  ],
  [
    "an extensible webhook acknowledgement",
    (document) => {
      document.components.schemas.WebhookAccepted.additionalProperties = true;
    },
    /webhook acknowledgements must remain exact and closed/,
  ],
  [
    "an extra webhook acknowledgement property",
    (document) => {
      document.components.schemas.WebhookAccepted.properties.debug = {
        type: "string",
      };
    },
    /webhook acknowledgements must remain exact and closed/,
  ],
]) {
  test(`rejects ${name}`, () => {
    const document = documentFixture();
    mutate(document);

    assert.throws(() => validateOpenApiDocument(document), error);
  });
}

test("rejects plaintext media webhook payload persistence", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "MediaWebhookInbox",
    /encryptedPayload\s+String/,
    "encryptedPayload String\n  rawPayload Json",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /authenticated encrypted payloads/,
  );
});

test("rejects deletion propagation from media webhook evidence", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "MediaWebhookInbox",
    /mediaAsset\s+MediaAsset\?\s+@relation\(fields: \[mediaAssetId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    "mediaAsset MediaAsset? @relation(fields: [mediaAssetId], references: [id], onDelete: Cascade)",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /authenticated encrypted payloads/,
  );
});

for (const [name, modelName, original, style, error] of [
  [
    "TOTP material present only in a line comment",
    "AdminUser",
    /totpSecretEncrypted\s+String\?/,
    "line",
    /admin authentication readiness/,
  ],
  [
    "session-family uniqueness present only in a block comment",
    "AdminSession",
    /@@unique\(\[adminUserId, tokenFamilyId\]\)/,
    "block",
    /admin authentication readiness/,
  ],
  [
    "Mux upload uniqueness present only in a line comment",
    "MediaAsset",
    /@@unique\(\[provider, privateProviderUploadRef\]\)/,
    "line",
    /authenticated encrypted payloads/,
  ],
  [
    "Mux asset uniqueness present only in a line comment",
    "MediaAsset",
    /@@unique\(\[provider, privateProviderAssetRef\]\)/,
    "line",
    /authenticated encrypted payloads/,
  ],
  [
    "payment Inbox deduplication present only in a line comment",
    "PaymentWebhookInbox",
    /@@unique\(\[provider, providerEventKey\]\)/,
    "line",
    /PaymentWebhookInbox requires provider\/event deduplication/,
  ],
  [
    "media Inbox deduplication present only in a line comment",
    "MediaWebhookInbox",
    /@@unique\(\[provider, providerEventKey\]\)/,
    "line",
    /authenticated encrypted payloads/,
  ],
  [
    "catalog provenance present only in a line comment",
    "Artist",
    /createdByAdmin\s+AdminUser\s+@relation\("ArtistCreatedByAdmin", fields: \[createdByAdminId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    "line",
    /server-owned admin provenance/,
  ],
  [
    "AuditLog actor relation present only in a line comment",
    "AuditLog",
    /adminSession\s+AdminSession\?\s+@relation\("AuditSession", fields: \[adminSessionId, actorAdminUserId\], references: \[id, adminUserId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "line",
    /AuditLog must be append-only with complete/,
  ],
]) {
  test(`rejects ${name}`, () => {
    const invalid = commentOutWithinModel(
      prismaSource,
      modelName,
      original,
      style,
    );

    assert.throws(() => validatePrismaTargetSchema(invalid), error);
  });
}

test("rejects a forbidden relation despite an approved relation in a comment", () => {
  const approved =
    "mediaAsset MediaAsset? @relation(fields: [mediaAssetId], references: [id], onDelete: Restrict, onUpdate: Restrict)";
  const invalid = replaceWithinModel(
    prismaSource,
    "MediaWebhookInbox",
    /mediaAsset\s+MediaAsset\?\s+@relation\(fields: \[mediaAssetId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    `mediaAsset MediaAsset? @relation(fields: [mediaAssetId], references: [id], onDelete: Cascade)\n  // ${approved}`,
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /authenticated encrypted payloads/,
  );
});

test("rejects Mux uniqueness present only in a Prisma string", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "MediaAsset",
    "@@unique([provider, privateProviderAssetRef])",
    '@@map("@@unique([provider, privateProviderAssetRef])")',
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /authenticated encrypted payloads/,
  );
});

test("rejects an approved relation present only in a Prisma string", () => {
  const approved =
    "mediaAsset MediaAsset? @relation(fields: [mediaAssetId], references: [id], onDelete: Restrict, onUpdate: Restrict)";
  const invalid = replaceWithinModel(
    prismaSource,
    "MediaWebhookInbox",
    /mediaAsset\s+MediaAsset\?\s+@relation\(fields: \[mediaAssetId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    `mediaAsset MediaAsset? @relation(fields: [mediaAssetId], references: [id], onDelete: Cascade)\n  @@map("${approved}")`,
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /authenticated encrypted payloads/,
  );
});

test("rejects TOTP material present only in a Prisma string", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "AdminUser",
    /totpSecretEncrypted\s+String\?/,
    'decoy String @default("totpSecretEncrypted String?")',
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /admin authentication readiness/,
  );
});

test("rejects an AuditLog relation after an unterminated Prisma string newline", () => {
  const relation =
    'adminSession AdminSession? @relation("AuditSession", fields: [adminSessionId, actorAdminUserId], references: [id, adminUserId], onDelete: Restrict, onUpdate: Restrict)';
  for (const [name, lineBreak] of [
    ["LF", "\n"],
    ["CR", "\r"],
    ["CRLF", "\r\n"],
  ]) {
    const invalid = replaceWithinModel(
      prismaSource,
      "AuditLog",
      /adminSession\s+AdminSession\?\s+@relation\("AuditSession", fields: \[adminSessionId, actorAdminUserId\], references: \[id, adminUserId\], onDelete: Restrict, onUpdate: Restrict\)/,
      `lexicalProbe String @default("unterminated${lineBreak}  ${relation}`,
    );

    assert.throws(
      () => validatePrismaTargetSchema(invalid),
      /unterminated string literal before a line break/,
      name,
    );
  }
});

test("rejects an unterminated Prisma string at end of file", () => {
  const invalid = `${prismaSource}\n"unterminated`;

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /unterminated string literal at end of file/,
  );
});

for (const [name, modelName, original, replacement, error] of [
  [
    "a prefixed TOTP field name",
    "AdminUser",
    /totpSecretEncrypted\s+String\?/,
    "faketotpSecretEncrypted String?",
    /admin authentication readiness/,
  ],
  [
    "a prefixed media relation name",
    "MediaWebhookInbox",
    /mediaAsset\s+MediaAsset\?\s+@relation\(fields: \[mediaAssetId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    "fakemediaAsset MediaAsset? @relation(fields: [mediaAssetId], references: [id], onDelete: Restrict, onUpdate: Restrict)",
    /authenticated encrypted payloads/,
  ],
  [
    "a prefixed private provider field name",
    "MediaAsset",
    /privateProviderAssetRef\s+String\?/,
    "fakeprivateProviderAssetRef String?",
    /authenticated encrypted payloads/,
  ],
]) {
  test(`rejects ${name}`, () => {
    const invalid = replaceWithinModel(
      prismaSource,
      modelName,
      original,
      replacement,
    );

    assert.throws(() => validatePrismaTargetSchema(invalid), error);
  });
}

test("rejects a non-operational or real payment provider in S1.2-01", () => {
  const document = documentFixture();
  document.components.schemas.OperationalPaymentProvider.properties.code.const =
    "ORANGE_MONEY";

  assert.throws(
    () => validateOpenApiDocument(document),
    /provider-neutral sandbox/,
  );
});

test("rejects a sandbox-provider list whose upper bound exceeds one", () => {
  const document = documentFixture();
  document.components.schemas.OperationalProviderListEnvelope.properties.data.maxItems = 2;

  assert.throws(
    () => validateOpenApiDocument(document),
    /allow zero or one operational provider/,
  );
});

test("rejects response capabilities marked with request-only semantics", () => {
  const document = documentFixture();
  document.components.schemas.PlaybackDescriptor.readOnly = false;
  document.components.schemas.PlaybackDescriptor.writeOnly = true;

  assert.throws(
    () => validateOpenApiDocument(document),
    /opaque, non-persistable/,
  );
});

test("rejects a capability replay that would not reissue safely", () => {
  const document = documentFixture();
  document.paths["/api/v1/admin/media-assets/{mediaAssetId}/prepare"].post[
    "x-kora-idempotent-replay"
  ] = "PERSIST_AND_REPLAY_RAW_TOKEN";

  assert.throws(
    () => validateOpenApiDocument(document),
    /reissue a capability without persisting its token/,
  );
});

test("rejects web preview or playback", () => {
  const document = documentFixture();
  document.paths["/api/v1/mobile/audio/{contentId}/preview-grants"].post[
    "x-kora-clients"
  ] = ["mobile", "web"];

  assert.throws(
    () => validateOpenApiDocument(document),
    /web preview\/playback is forbidden|must not expose transaction or playback to web/,
  );
});

test("rejects an archive contract that cannot represent buyer-library access", () => {
  const document = documentFixture();
  delete document.components.schemas.LibraryAudioItem.properties.archived;

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact safe media properties|archived content must remain representable/,
  );
});

test("rejects a mutable PaymentAttempt target model", () => {
  const invalid = prismaSource.replace(
    /createdAt\s+DateTime\s+@default\(now\(\)\)\n  events/,
    "createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n  events",
  );

  assert.notEqual(
    invalid,
    prismaSource,
    "fixture must add PaymentAttempt.updatedAt",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /PaymentAttempt must be immutable/,
  );
});

test("rejects a settlement that can reference an attempt from another order", () => {
  const invalid = prismaSource.replace(
    /paymentAttempt\s+PaymentAttempt\s+@relation\(fields: \[paymentAttemptId, orderId\], references: \[id, orderId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "paymentAttempt PaymentAttempt @relation(fields: [paymentAttemptId], references: [id])",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /successful attempt and audited artist-allocation totals/,
  );
});

test("rejects deletion propagation into a finalized settlement", () => {
  const invalid = prismaSource.replace(
    /(model Settlement \{[\s\S]*?)order\s+Order\s+@relation\(fields: \[orderId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    "$1order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /successful attempt and audited artist-allocation totals/,
  );
});

test("rejects an artist earning bound to the wrong settlement", () => {
  const invalid = prismaSource.replace(
    /(model ArtistEarning \{[\s\S]*?)settlement\s+Settlement\s+@relation\(fields: \[settlementId, orderId\], references: \[id, orderId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "$1settlement Settlement @relation(fields: [settlementId], references: [id])",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /match its reconciled settlement, order item, content and artist/,
  );
});

test("rejects an artist earning bound to the wrong order item", () => {
  const invalid = prismaSource.replace(
    /(model ArtistEarning \{[\s\S]*?)orderItem\s+OrderItem\s+@relation\(fields: \[orderItemId, orderId, audioContentId\], references: \[id, orderId, audioContentId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "$1orderItem OrderItem @relation(fields: [orderItemId], references: [id])",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /match its reconciled settlement, order item, content and artist/,
  );
});

test("rejects an artist earning bound to the wrong content", () => {
  const invalid = prismaSource.replace(
    /(model ArtistEarning \{[\s\S]*?)audioContent\s+AudioContent\s+@relation\(fields: \[audioContentId, artistId\], references: \[id, artistId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "$1audioContent AudioContent @relation(fields: [audioContentId], references: [id])",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /match its reconciled settlement, order item, content and artist/,
  );
});

test("rejects an artist earning bound to the wrong artist", () => {
  const invalid = prismaSource.replace(
    /(model ArtistEarning \{[\s\S]*?)artist\s+Artist\s+@relation\(fields: \[artistId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
    "$1artist Artist @relation(fields: [artistId], references: [id], onDelete: Cascade)",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /match its reconciled settlement, order item, content and artist/,
  );
});

test("rejects duplicate artist earning business keys", () => {
  const invalid = prismaSource.replace(
    "@@unique([artistSettlementId, settlementId, orderId, orderItemId, audioContentId, artistId])",
    "@@index([artistSettlementId, settlementId, orderId, orderItemId, audioContentId, artistId])",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /business-key uniqueness/,
  );
});

test("rejects carry predecessor reuse across artist settlements", () => {
  const invalid = prismaSource.replace(
    "previousArtistSettlementId String?                       @unique",
    "previousArtistSettlementId String?",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /same-artist predecessor carry/,
  );
});

test("rejects a carry predecessor relation that can cross artists", () => {
  const invalid = prismaSource.replace(
    /previousArtistSettlement\s+ArtistSettlement\?\s+@relation\("ArtistSettlementCarry", fields: \[previousArtistSettlementId, artistId\], references: \[id, artistId\], onDelete: Restrict, onUpdate: Restrict\)/,
    'previousArtistSettlement ArtistSettlement? @relation("ArtistSettlementCarry", fields: [previousArtistSettlementId], references: [id])',
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /same-artist predecessor carry/,
  );
});

test("rejects an artist earning detached from its artist settlement tuple", () => {
  const invalid = prismaSource.replace(
    /artistSettlement\s+ArtistSettlement\s+@relation\(fields: \[artistSettlementId, settlementId, orderId, artistId\], references: \[id, settlementId, orderId, artistId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "artistSettlement ArtistSettlement @relation(fields: [artistSettlementId], references: [id])",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /match its reconciled settlement, order item, content and artist/,
  );
});

test("rejects an artist earning materializable before settlement", () => {
  const invalid = prismaSource.replace(
    /(model ArtistEarning \{[\s\S]*?settlementId)\s+String\n/,
    "$1 String?\n",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /match its reconciled settlement, order item, content and artist/,
  );
});

test("rejects an entitlement whose customer/content/order tuple is not bound", () => {
  const invalid = prismaSource.replace(
    /order\s+Order\s+@relation\(fields: \[orderId, customerId\], references: \[id, customerId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "order Order @relation(fields: [orderId], references: [id])",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /match its order item, content and customer/,
  );
});

test("rejects idempotency persistence of a raw response capability", () => {
  const invalid = prismaSource.replace(
    /(model AdminIdempotencyRecord \{[\s\S]*?responseCode\s+Int\n)/,
    "$1  responseBody Json\n",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /never persist capability response bodies/,
  );
});

test("rejects removal of the active-publication transaction gate", () => {
  const document = documentFixture();
  document["x-kora-transaction-preconditions"] = document[
    "x-kora-transaction-preconditions"
  ].filter(
    (value) => value !== "AT_MOST_ONE_ACTIVE_PUBLICATION_PER_AUDIO_CONTENT",
  );

  assert.throws(
    () => validateOpenApiDocument(document),
    /transaction-precondition set is incomplete/,
  );
});

test("rejects republication that overwrites archived publication history", () => {
  const document = documentFixture();
  document.paths["/api/v1/admin/audio-content/{contentId}/publish"].post[
    "x-kora-republication"
  ] = "REUSE_ARCHIVED_ROW";

  assert.throws(
    () => validateOpenApiDocument(document),
    /republishing archived content must append a new publication/,
  );
});

test("rejects deletion propagation through publication evidence", () => {
  const invalid = replaceWithinModel(
    prismaSource,
    "PublicationMediaAsset",
    /publication\s+ContentPublication\s+@relation\(fields: \[publicationId, audioContentId\], references: \[id, audioContentId\], onDelete: Restrict, onUpdate: Restrict\)/,
    "publication ContentPublication @relation(fields: [publicationId, audioContentId], references: [id, audioContentId], onDelete: Cascade)",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /ContentPublication must bind one exact ready version/,
  );
});

test("rejects drift from the approved per-artist carry policy", () => {
  const document = documentFixture();
  document["x-kora-financial-policies"].artistEarningAllocation.granularity =
    "SETTLEMENT";

  assert.throws(
    () => validateOpenApiDocument(document),
    /exact versioned settlement allocation policy/,
  );
});

test("rejects removal of the artist earning reconciliation precondition", () => {
  const document = documentFixture();
  document["x-kora-transaction-preconditions"] = document[
    "x-kora-transaction-preconditions"
  ].filter(
    (value) =>
      value !==
      "ARTIST_EARNING_REQUIRES_RECONCILED_SETTLEMENT_AND_MATCHING_ORDER_ITEM_CONTENT_AND_ARTIST",
  );

  assert.throws(
    () => validateOpenApiDocument(document),
    /transaction-precondition set is incomplete/,
  );
});

test("rejects removal of single-use predecessor locking", () => {
  const document = documentFixture();
  document["x-kora-transaction-preconditions"] = document[
    "x-kora-transaction-preconditions"
  ].filter(
    (value) =>
      value !== "ARTIST_SETTLEMENT_PREDECESSOR_CARRY_CONSUMED_ONCE_WITH_LOCK",
  );

  assert.throws(
    () => validateOpenApiDocument(document),
    /transaction-precondition set is incomplete/,
  );
});

test("rejects an out-of-range artist carry contract", () => {
  const document = documentFixture();
  document.components.schemas.SettlementArtistAllocationAudit.properties.carryOutNumerator.maximum = 10_000;

  assert.throws(
    () => validateOpenApiDocument(document),
    /bounded single-owner carry conservation/,
  );
});

for (const field of ["artistId", "previousArtistSettlementId", "policy"]) {
  test(`rejects an artist settlement audit without required ${field}`, () => {
    const document = documentFixture();
    const audit = document.components.schemas.SettlementArtistAllocationAudit;
    audit.required = audit.required.filter((required) => required !== field);

    assert.throws(
      () => validateOpenApiDocument(document),
      /bounded single-owner carry conservation/,
    );
  });
}

for (const modelName of ["LedgerTransactionGroup", "LedgerPosting"]) {
  test(`rejects mutable ${modelName} records`, () => {
    const modelPattern = new RegExp(
      `(model ${modelName} \\{[\\s\\S]*?createdAt\\s+DateTime\\s+@default\\(now\\(\\)\\)\\n)`,
    );
    const invalid = prismaSource.replace(
      modelPattern,
      "$1  updatedAt DateTime @updatedAt\n",
    );

    assert.notEqual(invalid, prismaSource);
    assert.throws(
      () => validatePrismaTargetSchema(invalid),
      /balanced append-only ledger/,
    );
  });
}

test("rejects removal of the ledger compensation relation", () => {
  const invalid = prismaSource.replace(
    /  correctionOfGroupId[^\n]*\n  correctionOfGroup[^\n]*\n  corrections[^\n]*\n/,
    "",
  );

  assert.notEqual(invalid, prismaSource);
  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /balanced append-only ledger/,
  );
});

test("rejects an unbalanced-ledger representation without directed integer postings", () => {
  const invalid = prismaSource.replace(
    "direction LedgerDirection",
    "direction String",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /balanced append-only ledger/,
  );
});

test("rejects unresolved local references", () => {
  const document = documentFixture();
  document.components.schemas.ReadinessResponse.properties.checks.properties.redis.$ref =
    "#/components/schemas/Missing";

  assert.throws(
    () => validateOpenApiDocument(document),
    /unresolved reference/,
  );
});

test("locks the generated admin-security inventory to 12 C1 and 15 C2 operations", () => {
  const generated = buildAdminSecurityOperations(sourceDocument);

  assert.equal(generated.length, 27);
  assert.equal(
    generated.filter(({ deliverySlice }) => deliverySlice === "S1.2-03C1")
      .length,
    12,
  );
  assert.equal(
    generated.filter(({ deliverySlice }) => deliverySlice === "S1.2-03C2")
      .length,
    15,
  );
  assert.deepEqual(
    generated.map(({ method, operationId, path }) => ({
      method,
      operationId,
      path,
    })),
    ADMIN_SECURITY_CONTRACTS.map(({ method, operationId, path }) => ({
      method: method.toUpperCase(),
      operationId,
      path,
    })),
  );
});

test("materializes all four C1 CTO arbitration policies in generated metadata", () => {
  const policies = buildAdminC1ContractPolicies(sourceDocument);
  const operations = buildAdminSecurityOperations(sourceDocument);
  const createEnrollment = operations.find(
    ({ operationId }) => operationId === "createAdminTotpEnrollment",
  );
  const deliverQr = operations.find(
    ({ operationId }) => operationId === "deliverAdminTotpEnrollmentQr",
  );
  const rotate = operations.find(
    ({ operationId }) => operationId === "rotateAdminRecoveryCodes",
  );

  assert.equal(
    policies.enrollmentAuditRouting.provenContextSink,
    "AUDIT_LOG_ADMIN_RECOVERY",
  );
  assert.equal(policies.sessionFamilies.overflowPolicy, "ATOMIC_LRU_EVICTION");
  assert.equal(policies.sessionFamilies.refreshCreatesFamily, false);
  assert.equal(policies.unavailability.httpStatus, 503);
  assert.equal(policies.unavailability.errorCode, "SERVICE_UNAVAILABLE");
  assert.equal(
    createEnrollment.auditSink,
    "AUDIT_LOG_ADMIN_RECOVERY_IF_SERVER_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT",
  );
  assert.equal(
    deliverQr.failureAuditSink,
    "AUDIT_LOG_ADMIN_RECOVERY_IF_SERVER_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT",
  );
  assert.match(createEnrollment.auditContextProof, /SERVER_VERIFIED/);
  assert.equal(rotate.stepUpMode, "INLINE_TOTP_REQUEST_BODY");
  assert.equal(rotate.stepUpPurpose, "RECOVERY_CODE_ROTATION");
  assert.equal(
    rotate.priorStepUpPolicy,
    "NOT_REQUIRED_AND_DOES_NOT_SUBSTITUTE_FOR_BODY_TOTP",
  );
  assert.equal(rotate.totpCounterPolicy, "GLOBAL_PER_ADMIN_USER_REJECT_REUSE");
  assert.deepEqual(rotate.transactionalEffects, [
    "CONSUME_TOTP_COUNTER",
    "REPLACE_RECOVERY_CODE_BATCH",
    "RECORD_IDEMPOTENCY",
    "WRITE_AUDIT_LOG",
  ]);
  assert.equal(
    operations.filter(({ serviceUnavailable }) => serviceUnavailable !== null)
      .length,
    27,
  );
});

test("materializes the complete C2-P0 contract policy in generated metadata", () => {
  const policies = buildAdminC2ContractPolicies(sourceDocument);
  const operations = buildAdminSecurityOperations(sourceDocument);

  assert.equal(Object.keys(policies.contract.operationMatrix).length, 15);
  assert.deepEqual(policies.operationErrors, ADMIN_C2_EXACT_OPERATION_ERRORS);
  assert.equal(policies.errorStatuses.VALIDATION_ERROR, 400);
  assert.equal(policies.errorStatuses.SERVICE_UNAVAILABLE, 503);
  assert.equal(policies.unavailability.operationIds.length, 15);
  assert.equal(policies.unavailability.errorCode, "SERVICE_UNAVAILABLE");
  assert.equal(
    policies.unavailability.rollbackUnconfirmedClientDisposition,
    "DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE",
  );
  assert.equal(
    policies.unavailability.commitUnknownClientDisposition,
    "DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE_NO_ROLLBACK_CLAIM_NO_MUTATION_REPLAY",
  );
  const disposal = policies.contract.transactionClientDisposal;
  assert.deepEqual(disposal.scope, [
    "HTTP",
    "BOOTSTRAP",
    "OUTBOX",
    "JOBS",
    "SYSTEM_TRANSITIONS",
  ]);
  assert.equal(disposal.appliesTo, "ALL_FUTURE_C2_WRITERS");
  assert.equal(disposal.runtimeImplementedInP0R6, false);
  assert.equal(
    disposal.acquisitionAndCallbackLiveness.unboundedAcquisitionOrCallback,
    "FORBIDDEN",
  );
  assert.equal(
    disposal.acquisitionAndCallbackLiveness.deadlineValuesInP0R6,
    "NOT_DEFINED_NO_RUNTIME_AUTHORIZED",
  );
  assert.equal(disposal.begin.deadlineMilliseconds, 2000);
  assert.equal(disposal.begin.deadlineClock, "MONOTONIC_ELAPSED");
  assert.equal(disposal.begin.callbackAllowedWhen, "BEGIN_CONFIRMED");
  assert.equal(
    disposal.begin.unconfirmedDisposition,
    "DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE",
  );
  assert.equal(disposal.rollback.deadlineMilliseconds, 2000);
  assert.equal(disposal.rollback.deadlineClock, "MONOTONIC_ELAPSED");
  assert.equal(
    disposal.rollback.requiredWhen,
    "ANY_FAILURE_OR_ABORT_AFTER_BEGIN_CONFIRMED_BEFORE_COMMIT_ATTEMPT",
  );
  assert.equal(
    disposal.rollback.reuseAllowedWhen,
    "ROLLBACK_CONFIRMED_BEFORE_DEADLINE_AND_POST_COMMAND_READY_FOR_QUERY_IDLE_SAME_CLIENT_AND_CLIENT_USABLE",
  );
  assert.deepEqual(disposal.rollback.reusableReadyForQueryStates, ["I"]);
  assert.deepEqual(disposal.rollback.discardReadyForQueryStates, [
    "T",
    "E",
    "UNKNOWN",
  ]);
  assert.equal(disposal.release.totalCardinality, "EXACTLY_ONCE");
  assert.equal(
    disposal.release.discard,
    "PUBLIC_POOL_CLIENT_DESTROY_OR_EQUIVALENT_PHYSICAL_CONNECTION_DISCARD",
  );
  assert.equal(disposal.errors.primary, "PRESERVE_SEPARATELY");
  assert.equal(disposal.commit.acknowledgementDeadlineMilliseconds, 2000);
  assert.equal(disposal.commit.deadlineClock, "MONOTONIC_ELAPSED");
  assert.equal(
    disposal.commit.successOtherwiseDisposition,
    "DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE_WITH_SUCCESS_RESPONSE_PRESERVED",
  );
  assert.equal(
    disposal.commit.explicitServerRejection,
    "CONFIRMED_NOT_COMMITTED_NEUTRAL_503_NO_ROLLBACK_AFTER_COMMIT_ATTEMPT_NO_REPLAY",
  );
  assert.equal(
    disposal.commit.lateSettlement,
    "OBSERVE_ONLY_NO_RECLASSIFICATION_NO_RESPONSE_NO_RELEASE_NO_REPLAY",
  );
  assert.equal(
    disposal.phaseExclusivity.postCommitAttemptConnectionLoss,
    "COMMIT_UNKNOWN_EXCLUSIVELY",
  );
  assert.equal(
    disposal.release.defaultForAcquiredClientNotMeetingReusablePredicate,
    "DISCARD_PHYSICAL_CONNECTION_EXACTLY_ONCE",
  );
  assert.equal(
    disposal.errors.commit,
    "PRESERVE_SEPARATELY_AS_ERROR_OR_TERMINAL_OUTCOME",
  );
  assert.equal(disposal.phaseExclusivity.overlap, "FORBIDDEN");
  assert.equal(disposal.commitUnknown.rollbackClaim, "FORBIDDEN");
  assert.equal(disposal.commitUnknown.mutationReplay, "FORBIDDEN");
  assert.deepEqual(
    disposal.contractualTraces.map(({ name }) => name),
    [
      "CALLBACK_FAILED_ROLLBACK_CONFIRMED",
      "ROLLBACK_REJECTED",
      "ROLLBACK_SUSPENDED",
      "CONNECTION_LOST",
      "COMMIT_CONFIRMED",
      "COMMIT_UNKNOWN",
    ],
  );
  assert.equal(
    policies.contract.operationMatrix.approveAdminRecoveryCase.stepUpPurpose,
    "RECOVERY_APPROVAL",
  );
  assert.equal(
    policies.contract.operationMatrix.resetAdminPassword.proofPurpose,
    "PASSWORD_RESET",
  );
  assert.equal(
    policies.contract.operationMatrix.resetAdminPassword.forbiddenProofPurpose,
    "MFA_RECOVERY",
  );
  assert.deepEqual(policies.contract.preControllerJson.operationIds, [
    "requestAdminPasswordReset",
    "resetAdminPassword",
    "createAdminRecoveryCase",
    "approveAdminRecoveryCase",
    "createAdminAuditLogExport",
    "createAdminInvitation",
    "acceptAdminInvitation",
    "changeAdminUserRole",
    "changeAdminUserStatus",
  ]);
  assert.equal(policies.contract.pagination.defaultLimit, 25);
  assert.equal(policies.contract.pagination.maximumEntries, 10_000);
  assert.equal(policies.contract.auditExport.truncation, "FORBIDDEN");
  assert.equal(
    policies.contract.productionQualification.runtimeImplemented,
    false,
  );
  assert.equal(
    operations.filter(
      ({ deliverySlice, serviceUnavailable }) =>
        deliverySlice === "S1.2-03C2" && serviceUnavailable !== null,
    ).length,
    15,
  );
});

test("accepts exactly the three valid SYSTEM causality origins", () => {
  const autonomous = adminSystemAuditFixture();
  const delegated = adminSystemAuditFixture({
    causationEventId: "00000000-0000-4000-8000-000000000003",
    delegatedByAdminUserId: "00000000-0000-4000-8000-000000000004",
  });
  const publicReset = adminSystemAuditFixture({
    causationSecurityEventId: "00000000-0000-4000-8000-000000000005",
  });

  for (const audit of [autonomous, delegated, publicReset]) {
    assert.equal(
      validateSchemaInstance(sourceDocument, "AdminAuditLogEntry", audit),
      true,
    );
  }
});

test("accepts real legacy v1 identifiers and nullities without exposing legacyReason", () => {
  const legacy = adminLegacyAuditFixture();
  assert.ok(legacy.action.length > 120);
  assert.ok(legacy.entityType.length > 120);
  assert.equal(
    validateSchemaInstance(sourceDocument, "AdminAuditLogEntry", legacy),
    true,
  );
  assert.equal(Object.hasOwn(legacy, "legacyReason"), false);
  assert.equal(legacy.legacyReasonRedacted, true);
});

for (const [name, audit] of [
  ["a missing version", adminLegacyAuditFixture({ version: undefined })],
  ["an unknown version", adminLegacyAuditFixture({ version: 4 })],
  [
    "v2 legacy nullities",
    adminSystemAuditFixture({
      context: null,
      eventClass: null,
      reasonCode: null,
    }),
  ],
  [
    "synthetic v1 class attribution",
    adminLegacyAuditFixture({ eventClass: "LOGIN" }),
  ],
  [
    "synthetic v1 context attribution",
    adminLegacyAuditFixture({ context: "ADMIN_SESSION" }),
  ],
  [
    "synthetic v1 reason attribution",
    adminLegacyAuditFixture({ reasonCode: "ACCOUNT_RECOVERY" }),
  ],
  [
    "a sensitive raw legacyReason canary",
    adminLegacyAuditFixture({
      legacyReason: "CANARY-R3-LEGACY-REASON-MUST-NEVER-BE-DELIVERED",
    }),
  ],
]) {
  test(`rejects audit projection with ${name}`, () => {
    if (audit.version === undefined) delete audit.version;
    assert.throws(
      () => validateSchemaInstance(sourceDocument, "AdminAuditLogEntry", audit),
      /must match exactly one oneOf branch/u,
    );
  });
}

test("binds list and export to one versioned projection and exact filter semantics", () => {
  const policy = sourceDocument["x-kora-admin-c2-contract-policy"];
  const list = adminSecurityOperation(sourceDocument, "listAdminAuditLogs");
  const createExport = adminSecurityOperation(
    sourceDocument,
    "createAdminAuditLogExport",
  );
  const download = adminSecurityOperation(
    sourceDocument,
    "downloadAdminAuditLogExport",
  );
  const exportRequest =
    sourceDocument.components.schemas.AdminAuditExportRequest;
  const listFilterRefs = list.parameters.map((parameter) => parameter.$ref);

  assert.equal(policy.auditProjection.entrySchema, "AdminAuditLogEntry");
  assert.equal(
    policy.auditProjection.filters.v1WithoutVersionOrTypedOnlyFilters,
    "INCLUDED_WHEN_COMMON_FILTERS_MATCH",
  );
  assert.equal(
    policy.auditProjection.filters.v1WithAnyTypedFilter,
    "NEVER_MATCH",
  );
  assert.deepEqual(policy.auditProjection.filters.typedOnly, [
    "auditEventClass",
    "auditContext",
    "auditReasonCode",
  ]);
  for (const name of [
    "AuditVersion",
    "AuditEventClass",
    "AuditContext",
    "AuditReasonCode",
  ]) {
    assert.ok(listFilterRefs.includes(`#/components/parameters/${name}`));
  }
  for (const name of [
    "auditVersion",
    "auditEventClass",
    "auditContext",
    "auditReasonCode",
  ]) {
    assert.ok(exportRequest.properties[name]);
  }
  assert.equal(
    exportRequest.properties.reasonCode.description.includes(
      "not an entry filter",
    ),
    true,
  );
  assert.equal(list["x-kora-entry-schema"], "AdminAuditLogEntry");
  assert.equal(createExport["x-kora-entry-schema"], "AdminAuditLogEntry");
  assert.equal(download["x-kora-entry-schema"], "AdminAuditLogEntry");
});

test("enforces explicit C2 audit outcomes without inventing a historical result", () => {
  const success = adminSystemAuditFixture();
  const rejected = adminSystemAuditFixture({
    outcome: "REJECTED",
    failureCode: "DEPENDENCY_UNAVAILABLE",
  });
  const historicalV2 = adminSystemAuditFixture({
    version: 2,
    outcome: "UNKNOWN",
    failureCode: null,
    outcomeProvenance: "HISTORICAL_UNKNOWN",
  });

  assert.equal(
    validateSchemaInstance(sourceDocument, "AdminAuditLogEntry", success),
    true,
  );
  assert.equal(
    validateSchemaInstance(sourceDocument, "AdminAuditLogEntry", rejected),
    true,
  );
  assert.equal(
    validateSchemaInstance(sourceDocument, "AdminAuditLogEntry", historicalV2),
    true,
  );

  for (const invalid of [
    adminSystemAuditFixture({ failureCode: "DEPENDENCY_UNAVAILABLE" }),
    adminSystemAuditFixture({ outcome: "REJECTED", failureCode: null }),
    adminSystemAuditFixture({
      outcome: "REJECTED",
      failureCode: "ARBITRARY_CLIENT_TEXT",
    }),
  ]) {
    assert.throws(
      () =>
        validateSchemaInstance(sourceDocument, "AdminAuditLogEntry", invalid),
      /must match exactly one oneOf branch/u,
    );
  }

  const policy =
    sourceDocument["x-kora-admin-c2-contract-policy"].failureCodeByTrigger;
  const mapped = new Set();
  const collect = (value) => {
    if (typeof value === "string") {
      if (!value.startsWith("NOT_APPLICABLE") && !value.startsWith("NO_V3_")) {
        mapped.add(value);
      }
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(collect);
    }
  };
  collect(policy.globalAuditLogV3);
  collect(policy.businessByOperation);
  const rejectedCodes =
    sourceDocument.components.schemas.AdminAuditLogEntryV3.allOf[0].oneOf[1]
      .properties.failureCode.enum;
  assert.deepEqual([...mapped].sort(), [...rejectedCodes].sort());
  assert.equal(mapped.has("AUTH_REQUIRED"), false);
  assert.equal(mapped.has("AUDIT_SINK_UNAVAILABLE"), false);

  const document = documentFixture();
  document[
    "x-kora-admin-c2-contract-policy"
  ].failureCodeByTrigger.businessByOperation.resetAdminPassword.PASSWORD_RESET_PURPOSE_OR_SUBJECT_NOT_AUTHORIZED =
    "RESOURCE_NOT_FOUND";
  assert.throws(
    () => validateOpenApiDocument(document),
    /policies must be exact/u,
  );
});

test("redacts every free-form operator reason canary in list and export projections", () => {
  const canaries = [
    "alice@example.test",
    "+22370000000",
    "totp-secret-canary",
    "free text justification canary",
  ];
  for (const canary of canaries) {
    assert.throws(
      () =>
        validateSchemaInstance(
          sourceDocument,
          "AdminAuditLogEntry",
          adminSystemAuditFixture({ operatorReason: canary }),
        ),
      /must match exactly one oneOf branch|only allows null/u,
    );
  }
  for (const version of [
    "AdminAuditLogEntryV1",
    "AdminAuditLogEntryV2",
    "AdminAuditLogEntryV3",
  ]) {
    const schema = sourceDocument.components.schemas[version];
    assert.equal(schema.properties.operatorReason.type, "null");
    assert.equal(schema.properties.operatorReasonRedacted.const, true);
  }
});

test("keeps context proof distinct from role, step-up, integrity and pre-proof rejection sinks", () => {
  const download = adminSecurityOperation(
    sourceDocument,
    "downloadAdminAuditLogExport",
  );
  assert.deepEqual(download["x-kora-authorization-checks"], [
    "ROLE_ONE_OF_SUPER_ADMIN",
    "FRESH_STEP_UP_AUDIT_EXPORT",
  ]);
  assert.deepEqual(download["x-kora-post-proof-business-checks"], [
    "EXPORT_READY_NOT_EXPIRED",
    "CONTENT_HASH_AND_JWS_INTEGRITY",
  ]);
  const mutations = [
    [
      "cookie substituted for server proof",
      (document) => {
        adminSecurityOperation(document, "approveAdminRecoveryCase")[
          "x-kora-audit-context-proof"
        ] = "COOKIE_ONLY";
      },
    ],
    [
      "role refusal removed after proof",
      (document) => {
        adminSecurityOperation(document, "approveAdminRecoveryCase")[
          "x-kora-authorization-checks"
        ] = ["FRESH_STEP_UP_RECOVERY_APPROVAL"];
      },
    ],
    [
      "invalid step-up loses its proved-context sink",
      (document) => {
        adminSecurityOperation(document, "approveAdminRecoveryCase")[
          "x-kora-failure-sinks"
        ].stepUpInvalidAfterProof = "ADMIN_SECURITY_EVENT_FAILED";
      },
    ],
    [
      "integrity refusal loses its proved-context sink",
      (document) => {
        adminSecurityOperation(document, "downloadAdminAuditLogExport")[
          "x-kora-failure-sinks"
        ].integrityRejectedAfterProof = "ADMIN_SECURITY_EVENT_FAILED";
      },
    ],
    [
      "export state and integrity are duplicated into authorization",
      (document) => {
        adminSecurityOperation(document, "downloadAdminAuditLogExport")[
          "x-kora-authorization-checks"
        ].push("EXPORT_READY_NOT_EXPIRED_CONTENT_HASH_AND_JWS_INTEGRITY");
      },
    ],
    [
      "unproved actor is attributed to AuditLog",
      (document) => {
        adminSecurityOperation(document, "changeAdminUserRole")[
          "x-kora-failure-sinks"
        ].beforeCompleteProof = "AUDIT_LOG_REJECTED";
      },
    ],
    [
      "dependency failure before proof loses its named security-event sink",
      (document) => {
        adminSecurityOperation(document, "approveAdminRecoveryCase")[
          "x-kora-failure-sinks"
        ].dependencyUnavailable.beforeCompleteProof = "AUDIT_LOG_REJECTED";
      },
    ],
    [
      "dependency failure after proof loses its named audit sink",
      (document) => {
        adminSecurityOperation(document, "approveAdminRecoveryCase")[
          "x-kora-failure-sinks"
        ].dependencyUnavailable.afterCompleteProof =
          "ADMIN_SECURITY_EVENT_FAILED";
      },
    ],
  ];

  for (const [name, mutate] of mutations) {
    const document = documentFixture();
    mutate(document);
    assert.throws(
      () => validateOpenApiDocument(document),
      /must separate audit-context proof|must be exact/u,
      name,
    );
  }
});

test("keeps the three read-only NONE operations free of success and rejection AuditLog writes", () => {
  const policy = sourceDocument["x-kora-admin-c2-contract-policy"];
  const expected = {
    listAdminRecoveryCases:
      "READ_ONLY_SNAPSHOT_CONFIRMATION_UNKNOWN_NEUTRAL_503_NO_RETRY",
    getAdminRecoveryCase: "NOT_APPLICABLE_NO_DURABLE_WRITE",
    listAdminUsers:
      "READ_ONLY_SNAPSHOT_CONFIRMATION_UNKNOWN_NEUTRAL_503_NO_RETRY",
  };
  for (const [operationId, commitUnknown] of Object.entries(expected)) {
    const sinks = policy.operationMatrix[operationId].failureSinks;
    assert.doesNotMatch(JSON.stringify(sinks), /AUDIT_LOG_REJECTED/u);
    assert.equal(sinks.roleDeniedAfterProof, "NONE");
    assert.equal(sinks.businessRejectedAfterProof, "NONE");
    assert.equal(sinks.commitUnknown, commitUnknown);
  }

  const document = documentFixture();
  document[
    "x-kora-admin-c2-contract-policy"
  ].operationMatrix.listAdminUsers.failureSinks.businessRejectedAfterProof =
    "AUDIT_LOG_REJECTED";
  assert.throws(
    () => validateOpenApiDocument(document),
    /post-proof business rejection|read-only NONE sink/u,
  );
});

test("rejects every independently mutated SYSTEM source predicate", () => {
  const predicates =
    sourceDocument["x-kora-admin-c2-contract-policy"].systemSourcePredicates;
  assert.equal(Object.keys(predicates).length, 7);

  for (const [transition, predicate] of Object.entries(predicates)) {
    for (const key of Object.keys(predicate)) {
      const document = documentFixture();
      const target =
        document["x-kora-admin-c2-contract-policy"].systemSourcePredicates[
          transition
        ];
      const value = target[key];
      target[key] = Array.isArray(value)
        ? value.slice(1)
        : value === null
          ? "INVALID_NON_NULL"
          : typeof value === "number"
            ? value + 1
            : `${value}_INVALID`;
      assert.throws(
        () => validateOpenApiDocument(document),
        /policies must be exact|source actions must exactly match/u,
        `${transition}.${key}`,
      );
    }
  }

  assert.deepEqual(
    Object.entries(
      sourceDocument["x-kora-admin-c2-contract-policy"].operationMatrix,
    )
      .filter(([, operation]) =>
        operation.transactionalSystemTransitions?.includes(
          "RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT",
        ),
      )
      .map(([operationId]) => operationId),
    predicates.RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT.sourceActions,
  );
  const document = documentFixture();
  document[
    "x-kora-admin-c2-contract-policy"
  ].operationMatrix.changeAdminUserRole.transactionalSystemTransitions = [];
  assert.throws(
    () => validateOpenApiDocument(document),
    /transactional SYSTEM effects must match|source actions must exactly match/u,
  );

  const swappedResourceDocument = documentFixture();
  swappedResourceDocument[
    "x-kora-admin-c2-contract-policy"
  ].systemSourcePredicates.RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT.sourceResourceBindingByAction.createAdminRecoveryCase.causalAuditEntityId =
    "CANCELLED_RECOVERY_CASE_ID";
  assert.throws(
    () => validateOpenApiDocument(swappedResourceDocument),
    /policies must be exact/u,
    "superseding and cancelled recovery case identifiers must remain distinct",
  );
});

test("locks export fencing, recovery, publication order and all concurrency and retry traces", () => {
  const policy = sourceDocument["x-kora-admin-c2-contract-policy"].auditExport;
  assert.deepEqual(policy.stateMachine.transitions, {
    PENDING: ["PROCESSING"],
    PROCESSING: ["READY", "FAILED", "PROCESSING"],
    READY: ["EXPIRED"],
    FAILED: [],
    EXPIRED: [],
  });
  assert.equal(
    policy.stateMachine.leaseReclaimCondition,
    "STATE_PROCESSING_OWNER_CURRENT_NEXT_ATTEMPT_AT_NULL_LEASE_EXPIRED_ATTEMPTS_REMAIN_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE",
  );
  assert.equal(
    policy.stateMachine.leaseReclaimEffect,
    "BEFORE_ATTEMPT_DEADLINE_CAS_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_CLEAR_OWNER_SET_NEXT_ATTEMPT_AT_TO_EXPIRED_LEASE_TIME_THEN_DUE_OWNER_NULL_CLAIM_INCREMENTS_GENERATION_AND_REPLACES_ATTEMPT_ID",
  );
  assert.equal(policy.workerProtocol.leaseSeconds, 120);
  assert.equal(policy.workerProtocol.leaseRenewalSeconds, 30);
  assert.equal(policy.workerProtocol.maximumProcessingSecondsPerAttempt, 600);
  assert.equal(policy.workerProtocol.maximumAttempts, 3);
  assert.equal(
    policy.workerProtocol.maximumAttemptsSemantics,
    "INCLUDES_INITIAL_ATTEMPT_1",
  );
  assert.deepEqual(policy.workerProtocol.retryBackoffSecondsByNextAttempt, {
    2: 30,
    3: 120,
  });
  assert.deepEqual(policy.workerProtocol.retryableFailureClasses, [
    "TRANSIENT_DEPENDENCY_UNAVAILABLE",
    "PROCESS_TIMEOUT_BEFORE_TERMINAL_CAS",
    "LEASE_HEARTBEAT_LOST_WHILE_CURRENT_FENCE",
  ]);
  assert.equal(
    policy.workerProtocol.staleWorker,
    "CANNOT_CAS_RETRY_SCHEDULE_READY_OR_FAILED_CANNOT_PUBLISH_METADATA_VISIBILITY_OR_AUDIT_AFTER_FENCE_CHANGE",
  );
  assert.equal(
    policy.workerProtocol.stalePutCompletion,
    "AN_ALREADY_STARTED_PUT_MAY_FINISH_ONLY_AT_ITS_IMMUTABLE_EXPORT_GENERATION_ATTEMPT_STAGING_KEY_REMAINS_INVISIBLE_AND_BECOMES_TARGETED_ORPHAN",
  );
  assert.equal(
    policy.workerProtocol.knownRetryableFailure,
    "CAS_PROCESSING_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE_CLEAR_OWNER_AND_LEASE_KEEP_PROCESSING_SET_NEXT_ATTEMPT_AT_NOW_PLUS_BACKOFF_FOR_NEXT_ATTEMPT_NO_AUDIT",
  );
  assert.equal(
    policy.workerProtocol.readyTransaction,
    "CAS_PROCESSING_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE_TO_READY_PLUS_OBJECT_METADATA_CONTENT_SHA256_SIGNATURE_KEY_ID_AND_SINGLE_SYSTEM_AUDIT",
  );
  assert.equal(
    policy.workerProtocol.failedTransaction,
    "CAS_PROCESSING_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE_TO_FAILED_PLUS_CLOSED_EXPORT_FAILURE_CODE_AND_SINGLE_SYSTEM_AUDIT_IN_ONE_TRANSACTION",
  );
  assert.equal(
    policy.workerProtocol.leaseRenewal,
    "CAS_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_WHILE_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE_SET_LEASE_EXPIRES_AT_MIN_NOW_PLUS_120_SECONDS_ATTEMPT_DEADLINE_NEVER_EXTEND_ATTEMPT_DEADLINE",
  );
  assert.equal(
    policy.workerProtocol.attemptDeadlineExpiry,
    "WATCHDOG_AT_OR_AFTER_IMMUTABLE_ATTEMPT_DEADLINE_REJECT_READY_FAILED_AND_RENEW_THEN_CAS_PROCESSING_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_IF_ATTEMPTS_REMAIN_CLEAR_OWNER_AND_LEASE_SET_NEXT_ATTEMPT_AT_NOW_PLUS_BACKOFF_NO_AUDIT_ELSE_TO_FAILED_RETRY_BUDGET_EXHAUSTED_AND_SINGLE_SYSTEM_AUDIT_IN_ONE_TRANSACTION",
  );
  assert.equal(
    policy.workerProtocol.crashOrHang,
    "IF_NEXT_ATTEMPT_AT_NOT_NULL_FOLLOW_SCHEDULE_ELSE_IF_NOW_GTE_IMMUTABLE_ATTEMPT_DEADLINE_USE_ATTEMPT_DEADLINE_WATCHDOG_ELSE_AT_LEASE_EXPIRY_BEFORE_ATTEMPT_DEADLINE_CAS_CURRENT_GENERATION_ATTEMPT_ID_AND_OWNER_IF_ATTEMPTS_REMAIN_CLEAR_OWNER_SET_NEXT_ATTEMPT_AT_TO_LEASE_EXPIRY_THEN_DUE_OWNER_NULL_CLAIM_ELSE_TO_FAILED_RETRY_BUDGET_EXHAUSTED_AND_SINGLE_SYSTEM_AUDIT_IN_ONE_TRANSACTION",
  );
  assert.equal(
    policy.workerProtocol.claim,
    "POSTGRESQL_CAS_PROCESSING_OWNER_NULL_ATTEMPTS_REMAIN_AND_NOW_GTE_NEXT_ATTEMPT_AT_INCREMENT_GENERATION_AND_ATTEMPT_NUMBER_REPLACE_ATTEMPT_ID_SET_ATTEMPT_STARTED_AT_NOW_AND_IMMUTABLE_ATTEMPT_DEADLINE_NOW_PLUS_600_SECONDS_SET_LEASE_EXPIRES_AT_MIN_NOW_PLUS_120_SECONDS_ATTEMPT_DEADLINE",
  );
  for (const mutate of [
    (worker) => {
      worker.retryBackoffSecondsByNextAttempt[2] = 29;
    },
    (worker) => {
      worker.staleWorker = "CANNOT_UPLOAD";
    },
    (worker) => {
      worker.terminalFailureCodeByClass.RETRYABLE_FAILURE_AT_MAXIMUM_ATTEMPT =
        "DEPENDENCY_UNAVAILABLE";
    },
    (worker) => {
      worker.readyTransaction =
        "CAS_PROCESSING_GENERATION_AND_ATTEMPT_TO_READY";
    },
    (worker) => {
      worker.leaseRenewal = "RENEW_LEASE_AND_EXTEND_DEADLINE";
    },
    (worker) => {
      worker.maximumProcessingSecondsPerAttempt = 601;
    },
  ]) {
    const document = documentFixture();
    mutate(
      document["x-kora-admin-c2-contract-policy"].auditExport.workerProtocol,
    );
    assert.throws(
      () => validateOpenApiDocument(document),
      /audit export retries must preserve exact scheduling/u,
    );
  }
  assert.equal(policy.workerProtocol.distributedTransaction, false);
  assert.equal(
    policy.workerProtocol.nonTerminalRetryAudit,
    "NO_AUDIT_LOG_FOR_NON_TERMINAL_RETRY",
  );
  assert.deepEqual(
    sourceDocument["x-kora-admin-c2-contract-policy"].systemSourcePredicates
      .EXPORT_BUILD_SYSTEM_AUDIT.resultOutcomes,
    {
      READY: { outcome: "SUCCESS", failureCode: null },
      FAILED: {
        outcome: "REJECTED",
        failureCodeByExportFailureCode: {
          RETRY_BUDGET_EXHAUSTED: "DEPENDENCY_UNAVAILABLE",
          PROJECTION_BUDGET_EXCEEDED: "PROJECTION_BUDGET_EXCEEDED",
          INTEGRITY_FAILED: "INTEGRITY_REJECTED",
          DEPENDENCY_UNAVAILABLE: "DEPENDENCY_UNAVAILABLE",
        },
      },
    },
  );
  assert.equal(policy.downloadExpirationArbitration.readLeaseSeconds, 300);
  assert.equal(policy.contractualTraces.length, 6);
  assert.deepEqual(
    policy.unknownCommitReconciliationBranches.map(
      (branch) => branch.durableState,
    ),
    [
      "READY_MATCHING_GENERATION",
      "FAILED_MATCHING_GENERATION",
      "PROCESSING_SAME_FENCE",
      "STALE_FENCE_OR_DIFFERENT_GENERATION",
    ],
  );
  const sameFenceUnknownCommit =
    policy.unknownCommitReconciliationBranches.find(
      (branch) => branch.durableState === "PROCESSING_SAME_FENCE",
    );
  assert.equal(sameFenceUnknownCommit.resumeCas, "CONDITIONAL");
  assert.equal(
    sameFenceUnknownCommit.terminalEligibility,
    "CURRENT_ATTEMPT_ID_AND_OWNER_LEASE_ACTIVE_NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE",
  );
  assert.equal(
    sameFenceUnknownCommit.ineligibleAction,
    "NO_TERMINAL_CAS_FOLLOW_EXISTING_RETRY_SCHEDULE_OR_LEASE_EXPIRY_RECLAIM_OR_ATTEMPT_DEADLINE_WATCHDOG",
  );
  assert.match(
    sameFenceUnknownCommit.requiredAction,
    /RESUME_SINGLE_FENCED_CAS_FROM_VERIFIED_STAGING_STATE_ELSE_NO_TERMINAL_CAS/u,
  );

  const reconcileUnknownCommit = ({ initial }) => {
    if (initial.nextAttemptAt !== null) return "FOLLOW_SCHEDULED_RETRY";
    if (initial.now >= initial.attemptDeadline) {
      return "FOLLOW_ATTEMPT_DEADLINE_WATCHDOG";
    }
    if (!initial.currentOwner || initial.now >= initial.leaseExpiresAt) {
      return "FOLLOW_LEASE_EXPIRY_RECLAIM";
    }
    return "RESUME_TERMINAL_CAS";
  };
  assert.equal(policy.unknownCommitEligibilityTraces.length, 4);
  for (
    let index = 0;
    index < policy.unknownCommitEligibilityTraces.length;
    index += 1
  ) {
    const fixture = policy.unknownCommitEligibilityTraces[index];
    assert.equal(
      reconcileUnknownCommit(fixture),
      fixture.expectedAction,
      fixture.name,
    );
    const document = documentFixture();
    document[
      "x-kora-admin-c2-contract-policy"
    ].auditExport.unknownCommitEligibilityTraces[index].expectedAction =
      "INVALID_ACTION";
    assert.throws(
      () => validateOpenApiDocument(document),
      /policies must be exact/u,
      `unknown commit eligibility trace ${index}`,
    );
  }

  const executeTrace = (fixture) => {
    const state = {
      auditCount: 0,
      completedReaders: [],
      downloadAuditCount: 0,
      downloadAuditedReaders: [],
      expiryAuditCount: 0,
      generation: 0,
      owner: null,
      protectedReaders: [],
      rejectedReaders: [],
      streamingReaders: [],
      stagingObjects: [],
      targetedOrphans: [],
      currentStaging: null,
      stagingVerified: false,
      state: "PENDING",
      visible: false,
      ...fixture.initial,
    };
    for (const event of fixture.events) {
      switch (event.type) {
        case "CLAIM":
          if (
            event.expectedGeneration === state.generation &&
            (state.state === "PENDING" ||
              (state.state === "PROCESSING" && state.leaseExpired === true))
          ) {
            state.state = "PROCESSING";
            state.generation += 1;
            state.owner = event.worker;
            state.leaseExpired = false;
            state.currentStaging = null;
            state.stagingVerified = false;
          }
          break;
        case "UPLOAD_STAGING":
          if (
            state.owner === event.worker &&
            state.generation === event.expectedGeneration
          ) {
            const stagingObject = `${event.worker}:${event.expectedGeneration}`;
            state.stagingObjects.push(stagingObject);
            state.currentStaging = stagingObject;
            state.stagingVerified = true;
          }
          break;
        case "CRASH":
          state.leaseExpired = state.owner === event.worker;
          break;
        case "RECONCILE_STAGING":
          if (
            state.state === "PROCESSING" &&
            state.owner === event.worker &&
            state.generation === event.expectedGeneration
          ) {
            const currentGenerationStaging = `${event.worker}:${event.expectedGeneration}`;
            state.targetedOrphans.push(
              ...state.stagingObjects.filter(
                (stagingObject) => stagingObject !== currentGenerationStaging,
              ),
            );
          }
          break;
        case "PUBLISH":
          if (
            state.owner === event.worker &&
            state.generation === event.expectedGeneration &&
            state.stagingVerified &&
            state.currentStaging ===
              `${event.worker}:${event.expectedGeneration}`
          ) {
            state.state = "READY";
            state.visible = true;
            state.auditCount += 1;
          }
          break;
        case "COMMIT_READY":
          if (
            state.owner === event.worker &&
            state.generation === event.expectedGeneration &&
            state.stagingVerified &&
            state.currentStaging ===
              `${event.worker}:${event.expectedGeneration}`
          ) {
            state.state = "READY";
            state.visible = true;
            state.auditCount += 1;
            state.commitAcknowledgement = event.ack;
          }
          break;
        case "READ_DURABLE":
          assert.equal(state.generation, event.expectedGeneration);
          break;
        case "ACQUIRE_READ":
          if (state.state === "READY" && state.visible) {
            state.protectedReaders.push(event.reader);
          } else {
            state.rejectedReaders.push(event.reader);
          }
          break;
        case "AUDIT_DOWNLOAD_COMMIT":
          if (
            state.protectedReaders.includes(event.reader) &&
            !state.downloadAuditedReaders.includes(event.reader)
          ) {
            state.downloadAuditedReaders.push(event.reader);
            state.downloadAuditCount += 1;
            state.auditCount += 1;
          }
          break;
        case "BEGIN_STREAM":
          assert.ok(
            state.downloadAuditedReaders.includes(event.reader),
            "streaming requires a durable download audit",
          );
          state.streamingReaders.push(event.reader);
          break;
        case "EXPIRE_READY":
          if (state.state === "READY") {
            state.state = "EXPIRED";
            state.visible = false;
            state.expiryAuditCount += 1;
            state.auditCount += 1;
          }
          break;
        case "OPEN_READ":
          if (state.state === "READY" && state.visible) {
            state.protectedReaders.push(event.reader);
          } else {
            state.rejectedReaders.push(event.reader);
          }
          break;
        case "COMPLETE_READ":
          if (state.streamingReaders.includes(event.reader)) {
            state.completedReaders.push(event.reader);
          }
          break;
        default:
          assert.fail(`unknown export trace event ${event.type}`);
      }
    }
    return Object.fromEntries(
      Object.keys(fixture.expected).map((key) => [key, state[key]]),
    );
  };

  for (let index = 0; index < policy.contractualTraces.length; index += 1) {
    const fixture = policy.contractualTraces[index];
    assert.deepEqual(executeTrace(fixture), fixture.expected, fixture.name);
    const document = documentFixture();
    document["x-kora-admin-c2-contract-policy"].auditExport.contractualTraces[
      index
    ].expected.visible = !fixture.expected.visible;
    assert.throws(
      () => validateOpenApiDocument(document),
      /policies must be exact/u,
      `contractual trace ${index}`,
    );
  }

  const executeRetryTrace = (fixture) => {
    const state = {
      attemptNumber: 1,
      attemptDeadline: Number.POSITIVE_INFINITY,
      auditCount: 0,
      failureCode: null,
      generation: 0,
      leaseExpiresAt: Number.POSITIVE_INFINITY,
      nextAttemptAt: null,
      owner: null,
      rejectedClaims: 0,
      retryScheduleRejected: false,
      state: "PENDING",
      targetedOrphans: [],
      terminalCasRejected: 0,
      timeoutCount: 0,
      visible: false,
      ...fixture.initial,
    };
    const retryable = new Set(policy.workerProtocol.retryableFailureClasses);
    const terminalCodes = policy.workerProtocol.terminalFailureCodeByClass;
    const failTerminally = (failureCode) => {
      state.state = "FAILED";
      state.owner = null;
      state.failureCode = failureCode;
      state.auditCount += 1;
    };
    for (const event of fixture.events) {
      switch (event.type) {
        case "KNOWN_FAILURE":
          state.now = event.now ?? state.now ?? 0;
          if (
            state.owner !== event.worker ||
            state.generation !== event.expectedGeneration ||
            state.nextAttemptAt !== null ||
            state.now >= state.leaseExpiresAt ||
            state.now >= state.attemptDeadline
          ) {
            state.retryScheduleRejected = true;
            break;
          }
          if (retryable.has(event.failureClass)) {
            if (state.attemptNumber >= policy.workerProtocol.maximumAttempts) {
              failTerminally(
                terminalCodes.RETRYABLE_FAILURE_AT_MAXIMUM_ATTEMPT,
              );
            } else {
              const nextAttempt = state.attemptNumber + 1;
              state.owner = null;
              state.leaseExpiresAt = null;
              state.nextAttemptAt =
                (state.now ?? 0) +
                policy.workerProtocol.retryBackoffSecondsByNextAttempt[
                  nextAttempt
                ];
            }
          } else if (terminalCodes[event.failureClass]) {
            failTerminally(terminalCodes[event.failureClass]);
          } else {
            assert.fail(`unknown retry failure class ${event.failureClass}`);
          }
          break;
        case "CLAIM_RETRY":
          if (
            state.state === "PROCESSING" &&
            state.owner === null &&
            event.expectedGeneration === state.generation &&
            event.now >= state.nextAttemptAt &&
            state.attemptNumber < policy.workerProtocol.maximumAttempts
          ) {
            state.generation += 1;
            state.attemptNumber += 1;
            state.owner = event.worker;
            state.nextAttemptAt = null;
            state.attemptDeadline =
              event.now +
              policy.workerProtocol.maximumProcessingSecondsPerAttempt;
            state.leaseExpiresAt = Math.min(
              event.now + policy.workerProtocol.leaseSeconds,
              state.attemptDeadline,
            );
          } else {
            state.rejectedClaims += 1;
          }
          break;
        case "PUT_COMPLETE": {
          const stagingObject = `${event.worker}:${event.expectedGeneration}`;
          if (
            event.expectedGeneration !== state.generation ||
            event.worker !== state.owner ||
            state.nextAttemptAt !== null
          ) {
            state.targetedOrphans.push(stagingObject);
          }
          break;
        }
        case "COMMIT_READY":
          if (
            state.state === "PROCESSING" &&
            event.worker === state.owner &&
            event.expectedGeneration === state.generation &&
            event.expectedAttemptNumber === state.attemptNumber &&
            state.nextAttemptAt === null &&
            event.now < state.leaseExpiresAt &&
            event.now < state.attemptDeadline
          ) {
            state.state = "READY";
            state.owner = null;
            state.visible = true;
            state.auditCount += 1;
          } else {
            state.terminalCasRejected += 1;
          }
          break;
        case "ATTEMPT_DEADLINE":
          if (
            state.state === "PROCESSING" &&
            event.worker === state.owner &&
            event.expectedGeneration === state.generation &&
            event.expectedAttemptNumber === state.attemptNumber &&
            event.now >= state.attemptDeadline
          ) {
            state.timeoutCount += 1;
            if (state.attemptNumber >= policy.workerProtocol.maximumAttempts) {
              failTerminally(
                terminalCodes.RETRYABLE_FAILURE_AT_MAXIMUM_ATTEMPT,
              );
            } else {
              const nextAttempt = state.attemptNumber + 1;
              state.owner = null;
              state.leaseExpiresAt = null;
              state.nextAttemptAt =
                event.now +
                policy.workerProtocol.retryBackoffSecondsByNextAttempt[
                  nextAttempt
                ];
            }
          }
          break;
        case "SCHEDULE_RETRY":
          if (
            event.expectedGeneration !== state.generation ||
            event.worker !== state.owner ||
            state.nextAttemptAt !== null ||
            (event.now ?? 0) >= state.leaseExpiresAt ||
            (event.now ?? 0) >= state.attemptDeadline
          ) {
            state.retryScheduleRejected = true;
          }
          break;
        case "CRASH":
          assert.equal(event.worker, state.owner);
          break;
        case "CLAIM_AFTER_CRASH":
          if (
            state.state === "PROCESSING" &&
            state.nextAttemptAt === null &&
            event.expectedGeneration === state.generation &&
            event.now >= state.leaseExpiresAt &&
            event.now < state.attemptDeadline
          ) {
            if (state.attemptNumber >= policy.workerProtocol.maximumAttempts) {
              failTerminally(
                terminalCodes.RETRYABLE_FAILURE_AT_MAXIMUM_ATTEMPT,
              );
            } else {
              state.generation += 1;
              state.attemptNumber += 1;
              state.owner = event.worker;
              state.nextAttemptAt = null;
              state.attemptDeadline =
                event.now +
                policy.workerProtocol.maximumProcessingSecondsPerAttempt;
              state.leaseExpiresAt = Math.min(
                event.now + policy.workerProtocol.leaseSeconds,
                state.attemptDeadline,
              );
            }
          } else {
            state.rejectedClaims += 1;
          }
          break;
        default:
          assert.fail(`unknown retry trace event ${event.type}`);
      }
    }
    return Object.fromEntries(
      Object.keys(fixture.expected).map((key) => [key, state[key]]),
    );
  };

  assert.equal(policy.retryContractualTraces.length, 12);
  for (
    let index = 0;
    index < policy.retryContractualTraces.length;
    index += 1
  ) {
    const fixture = policy.retryContractualTraces[index];
    assert.deepEqual(
      executeRetryTrace(fixture),
      fixture.expected,
      fixture.name,
    );
    const document = documentFixture();
    document[
      "x-kora-admin-c2-contract-policy"
    ].auditExport.retryContractualTraces[index].expected.visible =
      !fixture.expected.visible;
    assert.throws(
      () => validateOpenApiDocument(document),
      /policies must be exact/u,
      `retry contractual trace ${index}`,
    );
  }

  assert.throws(
    () =>
      executeTrace({
        initial: { state: "READY", generation: 1, visible: true },
        events: [
          { type: "ACQUIRE_READ", reader: "R1" },
          { type: "BEGIN_STREAM", reader: "R1" },
        ],
        expected: {},
      }),
    /streaming requires a durable download audit/u,
  );

  for (
    let index = 0;
    index < policy.unknownCommitReconciliationBranches.length;
    index += 1
  ) {
    const document = documentFixture();
    document[
      "x-kora-admin-c2-contract-policy"
    ].auditExport.unknownCommitReconciliationBranches[index].resumeCas =
      !policy.unknownCommitReconciliationBranches[index].resumeCas;
    assert.throws(
      () => validateOpenApiDocument(document),
      /policies must be exact/u,
      `unknown commit branch ${index}`,
    );
  }
});

test("makes invitation acceptance and FIRST_TOTP_ENROLLMENT pre-auth one atomic boundary", () => {
  const policy =
    sourceDocument["x-kora-admin-c2-contract-policy"].invitationAcceptance;
  assert.deepEqual(policy.transaction, [
    "CONSUME_INVITATION",
    "CREATE_ADMIN_USER_PENDING_MFA",
    "CREATE_ARGON2ID_PASSWORD_CREDENTIAL",
    "CREATE_FIRST_TOTP_ENROLLMENT_PREAUTH_10_MINUTES",
    "WRITE_ADMIN_SECURITY_EVENT",
  ]);
  assert.equal(policy.cookie, "ISSUE_ONLY_AFTER_CONFIRMED_COMMIT");
  assert.equal(policy.recoveryPath.runtimeSymbol, "AdminAuthService.login");
  assert.equal(policy.recoveryPath.newEndpoint, false);
  assert.deepEqual(
    policy.failureBoundaryTraces.map((trace) => trace.name),
    [
      "PRE_COMMIT_FAILURE",
      "CONFIRMED_COMMIT",
      "UNKNOWN_COMMIT",
      "LOST_RESPONSE_AFTER_CONFIRMED_COMMIT",
      "EXPIRED_FIRST_TOTP_PREAUTH",
    ],
  );
  const [preCommit, confirmed, unknown, lostResponse, expiredPreauth] =
    policy.failureBoundaryTraces;
  assert.deepEqual(preCommit.durableEffects, []);
  assert.equal(
    policy.preCommitFailure,
    "NO_DURABLE_CONSUMPTION_USER_PASSWORD_CREDENTIAL_PREAUTH_OR_SECURITY_EVENT",
  );
  assert.equal(preCommit.cookieIssued, false);
  assert.equal(confirmed.durableEffects.length, 5);
  assert.equal(confirmed.cookieIssued, true);
  assert.equal(unknown.cookieIssued, false);
  assert.equal(unknown.automaticRetry, false);
  assert.equal(unknown.durableEffects, "UNKNOWN_UNTIL_RECONCILIATION");
  assert.equal(
    unknown.reconciliation,
    "LOGIN_READS_DURABLE_USER_STATE_NO_BLIND_ACCEPT_RETRY",
  );
  assert.equal(lostResponse.durableEffects.length, 5);
  assert.equal(lostResponse.preauthState, "VALID_OR_EVENTUALLY_EXPIRES");
  assert.equal(lostResponse.cookieDelivery, "UNKNOWN");
  assert.equal(lostResponse.usablePreauthCookie, "UNKNOWN");
  assert.equal(
    expiredPreauth.recovery,
    "AdminAuthService.login_CREATES_NEW_FIRST_TOTP_PREAUTH_10_MINUTES",
  );
  assert.equal(
    expiredPreauth.preauthState,
    "EXPIRED_REPLACED_ONLY_AFTER_PASSWORD_LOGIN",
  );
  assert.equal(expiredPreauth.cookieDelivery, "UNKNOWN");
  assert.equal(expiredPreauth.usablePreauthCookie, false);
  for (let index = 0; index < policy.failureBoundaryTraces.length; index += 1) {
    const document = documentFixture();
    document[
      "x-kora-admin-c2-contract-policy"
    ].invitationAcceptance.failureBoundaryTraces[index].automaticRetry = true;
    assert.throws(
      () => validateOpenApiDocument(document),
      /policies must be exact/u,
      `invitation boundary ${index}`,
    );
  }
  assert.equal(
    validateSchemaInstance(
      sourceDocument,
      "AdminInvitationAcceptedPreAuthEnvelope",
      {
        data: {
          challengeId: "00000000-0000-4000-8000-000000000001",
          expiresAt: "2026-10-10T00:10:00.000Z",
          nextStep: "FIRST_TOTP_ENROLLMENT",
        },
        meta: { requestId: "request-r4-invitation" },
      },
    ),
    true,
  );
  assert.throws(
    () =>
      validateSchemaInstance(
        sourceDocument,
        "AdminInvitationAcceptedPreAuthEnvelope",
        {
          data: {
            challengeId: "00000000-0000-4000-8000-000000000001",
            expiresAt: "2026-10-10T00:10:00.000Z",
            nextStep: "MFA_RECOVERY",
          },
          meta: { requestId: "request-r4-invitation" },
        },
      ),
    /must equal its const value/u,
  );
});

test("represents real v1 short and overlong text while failing closed on projection budget", () => {
  const fixtures = [
    adminLegacyAuditFixture({
      actorAdminUserId: "",
      adminSessionId: "",
      eventId: "",
      requestId: "12345678",
    }),
    adminLegacyAuditFixture({
      eventId: `legacy-${"e".repeat(500)}`,
      action: `legacy-${"a".repeat(500)}`,
      entityType: `legacy-${"t".repeat(500)}`,
      entityId: `legacy-${"i".repeat(500)}`,
    }),
    adminLegacyAuditFixture({
      maskedBefore: Object.fromEntries([
        ...Array.from({ length: 51 }, (_, index) => [
          `legacyField${index}`,
          `masked-${index}`,
        ]),
        [
          "nestedSensitiveShape",
          {
            contact: "[REDACTED]",
            metadata: { phone: "[REDACTED]", secret: "[REDACTED]" },
          },
        ],
      ]),
    }),
    adminLegacyAuditFixture({
      maskedBefore: ["[REDACTED]", { nested: [true, 7, null] }],
      maskedAfter: "[REDACTED]",
    }),
    adminLegacyAuditFixture({
      maskedBefore: 7,
      maskedAfter: false,
    }),
  ];
  for (const fixture of fixtures) {
    assert.equal(
      validateSchemaInstance(sourceDocument, "AdminAuditLogEntry", fixture),
      true,
    );
  }
  const narrowedDocument = documentFixture();
  narrowedDocument.components.schemas.AdminAuditLogEntryV1.properties.maskedBefore.type =
    ["object", "null"];
  assert.throws(
    () => validateOpenApiDocument(narrowedDocument),
    /historical v1\/v2 UNKNOWN outcomes/u,
  );
  const budget =
    sourceDocument["x-kora-admin-c2-contract-policy"].auditProjection
      .budgetOverflow;
  assert.deepEqual(budget, {
    truncate: false,
    omitRow: false,
    fabricateValue: false,
    list: "NEUTRAL_503_SERVICE_UNAVAILABLE_NO_PARTIAL_PAGE_REDUCE_FILTERS",
    export: "FAILED_WITH_PROJECTION_BUDGET_EXCEEDED_NO_PARTIAL_ARTIFACT",
  });
  assert.throws(
    () =>
      validateSchemaInstance(
        sourceDocument,
        "AdminAuditLogEntry",
        adminLegacyAuditFixture({
          operatorReason: "alice@example.test +22370000000 secret free text",
        }),
      ),
    /must match exactly one oneOf branch|only allows null/u,
  );
});

test("locks every C2 AuditLog producer to a deterministic reason source", () => {
  const policy = sourceDocument["x-kora-admin-c2-contract-policy"].auditReasons;
  assert.equal(Object.keys(policy.auditLogOperations).length, 10);
  assert.equal(Object.keys(policy.systemTransitions).length, 7);
  assert.deepEqual(policy.auditLogOperations.resetAdminPassword, {
    source: "SERVER_FIXED",
    reasonCode: "ACCOUNT_RECOVERY",
  });
  assert.deepEqual(policy.auditLogOperations.listAdminAuditLogs, {
    source: "SERVER_FIXED",
    reasonCode: "AUDIT_EXPORT",
  });
  assert.deepEqual(policy.validatedClientRule.missingOrInvalidAfterProof, {
    source: "SERVER_FIXED_REJECTION",
    reasonCode: "SECURITY_RESPONSE",
    operatorReason: null,
    invalidClientTextReuse: "FORBIDDEN",
  });
  assert.equal(policy.systemTransitionOperatorReason, null);
  for (const transition of Object.values(policy.systemTransitions)) {
    assert.ok(
      ["AUTONOMOUS", "ADMIN_DELEGATION", "PUBLIC_PASSWORD_RESET"].includes(
        transition.systemOrigin,
      ),
    );
    assert.equal(typeof transition.validatedSource, "string");
  }
  assert.equal(
    policy.legacyReasonStorage,
    "EXACT_SERVER_LITERAL_C2_RUNTIME_NEVER_CLIENT_TEXT_NOT_PROJECTED",
  );
  assert.doesNotMatch(JSON.stringify(policy), /CANARY-R3-LEGACY-REASON/u);
});

test("hashes the exact immutable final ZIP across simulated encrypted storage", () => {
  const payload = Buffer.from(
    '[{"legacyReasonRedacted":true,"version":1}]\n',
    "utf8",
  );
  const payloadSha256 = createHash("sha256").update(payload).digest("hex");
  const manifest = Buffer.from(
    JSON.stringify({
      createdAt: "2026-10-11T00:00:00.000Z",
      entries: [
        {
          path: "audit.json",
          sha256: payloadSha256,
          size: payload.length,
        },
      ],
      expiresAt: "2026-10-12T00:00:00.000Z",
      exportId: "00000000-0000-4000-8000-000000000099",
    }),
    "utf8",
  );
  const signature = Buffer.from("fixture.detached.signature\n", "utf8");
  const zip = buildStoredZip([
    ["audit.json", payload],
    ["manifest.json", manifest],
    ["manifest.sig", signature],
  ]);
  const exactZipSha256 = createHash("sha256").update(zip).digest("hex");

  assert.equal(zip.subarray(0, 4).toString("hex"), "504b0304");
  assert.equal(
    exactZipSha256,
    "0d4f081ba9b3118e0533435becc7f1310266eb12bae03599eac3f38e5d44d79f",
  );
  assert.equal(manifest.includes(Buffer.from("contentSha256")), false);
  assert.notEqual(
    createHash("sha256").update(manifest).digest("hex"),
    exactZipSha256,
  );

  const key = createHash("sha256").update("r3-fixture-storage-key").digest();
  const iv = Buffer.from("000102030405060708090a0b", "hex");
  const aad = Buffer.from("r3-audit-export-fixture", "utf8");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(zip), cipher.final()]);
  const tag = cipher.getAuthTag();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const downloaded = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  assert.deepEqual(downloaded, zip);
  assert.equal(
    createHash("sha256").update(downloaded).digest("hex"),
    exactZipSha256,
  );
  assert.notEqual(
    createHash("sha256").update(ciphertext).digest("hex"),
    exactZipSha256,
  );
  const mutated = Buffer.from(zip);
  mutated[40] ^= 0x01;
  assert.notEqual(
    createHash("sha256").update(mutated).digest("hex"),
    exactZipSha256,
  );
});

for (const [name, audit] of [
  [
    "two causal sources simultaneously",
    adminSystemAuditFixture({
      causationEventId: "00000000-0000-4000-8000-000000000003",
      causationSecurityEventId: "00000000-0000-4000-8000-000000000005",
      delegatedByAdminUserId: "00000000-0000-4000-8000-000000000004",
    }),
  ],
  [
    "missing delegator for AuditLog causation",
    adminSystemAuditFixture({
      causationEventId: "00000000-0000-4000-8000-000000000003",
    }),
  ],
  [
    "forbidden delegator for public-reset causation",
    adminSystemAuditFixture({
      causationSecurityEventId: "00000000-0000-4000-8000-000000000005",
      delegatedByAdminUserId: "00000000-0000-4000-8000-000000000004",
    }),
  ],
]) {
  test(`rejects SYSTEM causality with ${name}`, () => {
    assert.throws(
      () => validateSchemaInstance(sourceDocument, "AdminAuditLogEntry", audit),
      /must match exactly one oneOf branch/u,
    );
  });
}

for (const [name, mutate] of [
  [
    "a removed exact error",
    (document) => document["x-kora-operation-errors"].listAdminUsers.pop(),
  ],
  [
    "an added same-status error",
    (document) =>
      document["x-kora-operation-errors"].requestAdminPasswordReset.push(
        "ADMIN_RECOVERY_CODE_INVALID",
      ),
  ],
  [
    "a duplicated error",
    (document) =>
      document["x-kora-operation-errors"].createAdminInvitation.push(
        "SERVICE_UNAVAILABLE",
      ),
  ],
  [
    "a substituted same-status error",
    (document) => {
      document["x-kora-operation-errors"].resetAdminPassword[1] =
        "ADMIN_RECOVERY_CODE_INVALID";
    },
  ],
  [
    "a permuted error order",
    (document) => {
      const errors =
        document["x-kora-operation-errors"].approveAdminRecoveryCase;
      [errors[3], errors[4]] = [errors[4], errors[3]];
    },
  ],
]) {
  test(`rejects the C2 error table with ${name}`, () => {
    const document = documentFixture();
    mutate(document);
    assert.throws(
      () => validateOpenApiDocument(document),
      /must preserve its exact C2 error list/u,
    );
  });
}

test("rejects an incorrect exact C2 error status", () => {
  const document = documentFixture();
  document["x-kora-error-statuses"].ADMIN_USER_NOT_FOUND = 409;
  assert.throws(
    () => validateOpenApiDocument(document),
    /ADMIN_USER_NOT_FOUND must preserve its exact C2 HTTP status/u,
  );
});

const adminSecurityMutations = [
  [
    "path substitution",
    (document) => {
      document.paths["/api/v1/admin/auth/login-substitute"] =
        document.paths["/api/v1/admin/auth/login"];
      delete document.paths["/api/v1/admin/auth/login"];
    },
  ],
  [
    "method substitution",
    (document) => {
      const path = document.paths["/api/v1/admin/auth/totp/verify"];
      path.put = path.post;
      delete path.post;
    },
  ],
  [
    "operationId substitution",
    (document) => {
      adminSecurityOperation(document, "loginAdmin").operationId =
        "loginAdminSubstitute";
    },
  ],
  [
    "delivery slice substitution",
    (document) => {
      adminSecurityOperation(document, "verifyAdminTotp")[
        "x-kora-delivery-slice"
      ] = "S1.2-03C2";
    },
  ],
  [
    "pre-auth security changed from AND to OR",
    (document) => {
      adminSecurityOperation(document, "verifyAdminTotp").security = [
        { adminPreAuthCookie: [] },
        { adminCsrfCookie: [] },
        { adminCsrfHeader: [] },
      ];
    },
  ],
  [
    "missing CSRF header",
    (document) => {
      delete adminSecurityOperation(document, "verifyAdminTotp").security[0]
        .adminCsrfHeader;
    },
  ],
  [
    "public login protected by an implicit bearer",
    (document) => {
      adminSecurityOperation(document, "loginAdmin").security = [
        { adminSession: [] },
      ];
    },
  ],
  [
    "admin role widening",
    (document) => {
      adminSecurityOperation(document, "listAdminAuditLogs")[
        "x-kora-roles"
      ].push("SUPPORT");
    },
  ],
  [
    "step-up removal",
    (document) => {
      adminSecurityOperation(document, "downloadAdminAuditLogExport")[
        "x-kora-step-up-required"
      ] = false;
    },
  ],
  [
    "idempotency removal",
    (document) => {
      delete adminSecurityOperation(document, "createAdminInvitation")[
        "x-kora-idempotent"
      ];
    },
  ],
  [
    "success status substitution",
    (document) => {
      const responses = adminSecurityOperation(
        document,
        "createAdminAuditLogExport",
      ).responses;
      responses["201"] = responses["202"];
      delete responses["202"];
    },
  ],
  [
    "generic 2XX success",
    (document) => {
      const responses = adminSecurityOperation(
        document,
        "loginAdmin",
      ).responses;
      responses["2XX"] = responses["200"];
      delete responses["200"];
    },
  ],
  [
    "multiple success responses",
    (document) => {
      adminSecurityOperation(document, "loginAdmin").responses["201"] =
        structuredClone(
          adminSecurityOperation(document, "loginAdmin").responses["200"],
        );
    },
  ],
  [
    "QR media substitution",
    (document) => {
      const response = adminSecurityOperation(
        document,
        "deliverAdminTotpEnrollmentQr",
      ).responses["200"];
      response.content["image/svg+xml"] = response.content["image/png"];
      delete response.content["image/png"];
    },
  ],
  [
    "open success envelope",
    (document) => {
      document.components.schemas.AdminSessionEnvelope.additionalProperties = true;
    },
  ],
  [
    "missing no-store response header",
    (document) => {
      delete adminSecurityOperation(document, "deliverAdminTotpEnrollmentQr")
        .responses["200"].headers["Cache-Control"];
    },
  ],
  [
    "missing exact Origin",
    (document) => {
      const operation = adminSecurityOperation(document, "loginAdmin");
      operation.parameters = [];
    },
  ],
  [
    "request media widening",
    (document) => {
      adminSecurityOperation(document, "loginAdmin").requestBody.content[
        "text/plain"
      ] = { schema: { type: "string" } };
    },
  ],
  [
    "internal refresh reuse code exposed publicly",
    (document) => {
      document["x-kora-operation-errors"].refreshAdminSession = [
        "AUTH_REFRESH_REUSED",
      ];
    },
  ],
  [
    "recovery-code count weakened",
    (document) => {
      document.components.schemas.AdminRecoveryCodes.properties.codes.maxItems = 11;
    },
  ],
  [
    "audit execution-context XOR weakened",
    (document) => {
      document.components.schemas.AdminAuditLogEntryV2.oneOf.pop();
    },
  ],
  [
    "operator reason made optional",
    (document) => {
      const schema = document.components.schemas.AdminRoleChangeRequest;
      schema.required = schema.required.filter(
        (field) => field !== "operatorReason",
      );
    },
  ],
  [
    "TOTP seed exposed in JSON",
    (document) => {
      document.components.schemas.AdminTotpEnrollment.properties.seed = {
        type: "string",
      };
    },
  ],
  [
    "recovery verification creates a session",
    (document) => {
      adminSecurityOperation(document, "verifyAdminRecoveryCode").responses[
        "200"
      ].content["application/json"].schema.$ref =
        "#/components/schemas/AdminSessionEnvelope";
    },
  ],
  [
    "SUPPORT reintroduced on historical content reads",
    (document) => {
      document.paths["/api/v1/admin/artists"].get["x-kora-roles"].push(
        "SUPPORT",
      );
    },
  ],
  [
    "audit administrator filter removed",
    (document) => {
      const operation = adminSecurityOperation(document, "listAdminAuditLogs");
      operation.parameters = operation.parameters.filter(
        (parameter) =>
          parameter.$ref !== "#/components/parameters/AuditActorAdminUserId",
      );
    },
  ],
  [
    "legacy v1 excluded by default",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].auditProjection.filters.v1WithoutVersionOrTypedOnlyFilters = "EXCLUDED";
    },
  ],
  [
    "typed filter synthetically attributed to v1",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].auditProjection.filters.v1WithAnyTypedFilter =
        "MATCH_SYNTHETIC_DEFAULT";
    },
  ],
  [
    "list and export use divergent audit projections",
    (document) => {
      adminSecurityOperation(document, "listAdminAuditLogs")[
        "x-kora-entry-schema"
      ] = "AdminAuditLogEntryV2";
    },
  ],
  [
    "server reset reason changed",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].auditReasons.auditLogOperations.resetAdminPassword.reasonCode =
        "SECURITY_RESPONSE";
    },
  ],
  [
    "client reason falls back to first enum",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].auditReasons.validatedClientRule.acceptedPath = "FIRST_ENUM_DEFAULT";
    },
  ],
  [
    "invalid client reason copied to operatorReason",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].auditReasons.validatedClientRule.missingOrInvalidAfterProof.operatorReason =
        "CLIENT_TEXT";
    },
  ],
  [
    "SYSTEM transition origin widened",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].auditReasons.systemTransitions.EXPORT_BUILD_SYSTEM_AUDIT.systemOrigin =
        "AUTONOMOUS";
    },
  ],
  [
    "export content hash reduced to manifest-only",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].auditExport.contentSha256.input = "MANIFEST_ONLY";
    },
  ],
  [
    "export content hash made self-referential",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].auditExport.contentSha256.selfReference =
        "contentSha256_INCLUDED_IN_MANIFEST";
    },
  ],
  [
    "audit entity evidence removed",
    (document) => {
      const schema = document.components.schemas.AdminAuditLogEntryV2;
      schema.required = schema.required.filter(
        (field) => field !== "entityType",
      );
      delete schema.properties.entityType;
    },
  ],
  [
    "session audit actor made nullable",
    (document) => {
      document.components.schemas.AdminAuditLogEntryV2.oneOf[0].properties.actorAdminUserId.type =
        "null";
    },
  ],
  [
    "pre-auth success routed to AuditLog",
    (document) => {
      adminSecurityOperation(document, "loginAdmin")["x-kora-audit-sink"] =
        "AUDIT_LOG";
    },
  ],
  [
    "unproven failure routed to AuditLog",
    (document) => {
      document["x-kora-admin-failure-audit-sinks"].verifyAdminTotp =
        "AUDIT_LOG";
    },
  ],
  [
    "recovery-code response cache protection removed",
    (document) => {
      delete adminSecurityOperation(document, "rotateAdminRecoveryCodes")
        .responses["200"].headers["Cache-Control"];
    },
  ],
  [
    "login Fetch Metadata policy removed",
    (document) => {
      delete adminSecurityOperation(document, "loginAdmin")[
        "x-kora-fetch-metadata-policy"
      ];
    },
  ],
  [
    "CSRF wire header renamed",
    (document) => {
      document.components.securitySchemes.adminCsrfHeader.name = "X-CSRF-Token";
    },
  ],
  [
    "refresh rate-limit profile removed",
    (document) => {
      delete adminSecurityOperation(document, "refreshAdminSession")[
        "x-kora-rate-limit-profile"
      ];
    },
  ],
  [
    "rate-limit Retry-After removed",
    (document) => {
      delete document.components.responses.RateLimitedError.headers[
        "Retry-After"
      ];
    },
  ],
  [
    "approved recovery case without approver",
    (document) => {
      document.components.schemas.AdminRecoveryCase.oneOf[0].required = [];
    },
  ],
  [
    "recovery cancellation transition removed",
    (document) => {
      delete document["x-kora-admin-recovery-case-state-machine"].transitions
        .serverPolicySuperseded;
    },
  ],
  [
    "audit export signed manifest removed",
    (document) => {
      delete adminSecurityOperation(document, "downloadAdminAuditLogExport")[
        "x-kora-signed-manifest"
      ];
    },
  ],
  [
    "audit event class weakened",
    (document) => {
      document.components.schemas.AdminAuditLogEntryV2.properties.eventClass.enum.pop();
    },
  ],
  [
    "invitation public error leaks state",
    (document) => {
      document["x-kora-operation-errors"].acceptAdminInvitation = [
        "VALIDATION_ERROR",
        "INVITATION_EXPIRED",
      ];
    },
  ],
  [
    "audit export signature algorithm weakened",
    (document) => {
      adminSecurityOperation(document, "downloadAdminAuditLogExport")[
        "x-kora-signed-manifest"
      ].signatureAlgorithm = "none";
    },
  ],
  [
    "audit export old payload-only signing input restored in policy",
    (document) => {
      document[
        "x-kora-admin-security-policy"
      ].auditExportManifest.signatureInput =
        "RFC8785_CANONICAL_UTF8_BYTES_OF_MANIFEST_JSON";
    },
  ],
  [
    "audit export old payload-only signing input restored in operation",
    (document) => {
      adminSecurityOperation(document, "downloadAdminAuditLogExport")[
        "x-kora-signed-manifest"
      ].signatureInput = "RFC8785_CANONICAL_UTF8_BYTES_OF_MANIFEST_JSON";
    },
  ],
  [
    "audit export unencoded b64=false payload profile enabled",
    (document) => {
      adminSecurityOperation(document, "downloadAdminAuditLogExport")[
        "x-kora-signed-manifest"
      ].unencodedPayload = true;
    },
  ],
  [
    "audit export contradictory attached serialization declared",
    (document) => {
      adminSecurityOperation(document, "downloadAdminAuditLogExport")[
        "x-kora-signed-manifest"
      ].detachedSerialization = "PROTECTED.PAYLOAD.SIGNATURE";
    },
  ],
  [
    "audit export payload entry set made non-bijective",
    (document) => {
      adminSecurityOperation(document, "downloadAdminAuditLogExport")[
        "x-kora-signed-manifest"
      ].rejectUnlistedEntries = false;
    },
  ],
  [
    "autonomous SYSTEM audit forced to invent causation",
    (document) => {
      document.components.schemas.AdminAuditLogEntryV2.oneOf[2].oneOf.shift();
    },
  ],
  [
    "SYSTEM audit combines AuditLog and AdminSecurityEvent causality",
    (document) => {
      document.components.schemas.AdminAuditLogEntryV2.oneOf[2].oneOf[2].properties.causationEventId =
        {
          type: "string",
          format: "uuid",
        };
    },
  ],
  [
    "public reset SYSTEM audit fabricates a delegating administrator",
    (document) => {
      document.components.schemas.AdminAuditLogEntryV2.oneOf[2].oneOf[2].properties.delegatedByAdminUserId =
        {
          type: "string",
          format: "uuid",
        };
    },
  ],
  [
    "public reset worker accepts the wrong causal record type",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].systemAuditCausality.publicPasswordReset.sourceRecordType = "AuditLog";
    },
  ],
  [
    "public reset delivery loses causality by autonomous reclassification",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].systemAuditCausality.publicPasswordReset.workerAuditOrigin =
        "AUTONOMOUS";
    },
  ],
  [
    "client input becomes trusted SYSTEM causality",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].systemAuditCausality.clientSupplied = true;
    },
  ],
  [
    "TOTP replay policy weakened",
    (document) => {
      document["x-kora-admin-auth-data-policy"].totpReplayWithinAcceptedWindow =
        "ALLOW";
    },
  ],
  [
    "reset comparable timing removed",
    (document) => {
      delete document["x-kora-admin-public-failure-timing"].resetAdminPassword;
    },
  ],
  [
    "recovery enrollment success forced to the unproven-context sink",
    (document) => {
      adminSecurityOperation(document, "createAdminTotpEnrollment")[
        "x-kora-audit-sink"
      ] = "ADMIN_SECURITY_EVENT";
    },
  ],
  [
    "recovery QR failure routing inferred from an unproven success",
    (document) => {
      document[
        "x-kora-admin-failure-audit-sinks"
      ].deliverAdminTotpEnrollmentQr = "ADMIN_SECURITY_EVENT";
    },
  ],
  [
    "recovery enrollment server proof omitted",
    (document) => {
      delete adminSecurityOperation(document, "createAdminTotpEnrollment")[
        "x-kora-audit-context-proof"
      ];
    },
  ],
  [
    "client cookie accepted as recovery-context proof",
    (document) => {
      document[
        "x-kora-admin-enrollment-audit-routing-policy"
      ].clientEvidenceNeverSufficient = ["SELECTOR", "IDENTIFIER"];
    },
  ],
  [
    "recovery-code rotation changed to prior step-up",
    (document) => {
      adminSecurityOperation(document, "rotateAdminRecoveryCodes")[
        "x-kora-step-up-mode"
      ] = "PRIOR_STEP_UP_ENDPOINT";
    },
  ],
  [
    "prior step-up allowed to replace rotation body TOTP",
    (document) => {
      document["x-kora-admin-recovery-code-rotation-policy"].priorStepUpPolicy =
        "MAY_SUBSTITUTE_FOR_BODY_TOTP";
    },
  ],
  [
    "rotation TOTP global anti-replay omitted",
    (document) => {
      delete adminSecurityOperation(document, "rotateAdminRecoveryCodes")[
        "x-kora-totp-counter-policy"
      ];
    },
  ],
  [
    "rotation audit removed from the atomic effects",
    (document) => {
      adminSecurityOperation(document, "rotateAdminRecoveryCodes")[
        "x-kora-transaction-effects"
      ].pop();
    },
  ],
  [
    "fourth session family rejected instead of LRU eviction",
    (document) => {
      document["x-kora-admin-session-family-policy"].overflowPolicy =
        "REJECT_NEW_FAMILY";
    },
  ],
  [
    "session-family active-state definition weakened",
    (document) => {
      document["x-kora-admin-session-family-policy"].activeFamilyDefinition =
        "NOT_REVOKED_ONLY";
    },
  ],
  [
    "session-family deterministic LRU tie-break removed",
    (document) => {
      document["x-kora-admin-session-family-policy"].lruOrder.pop();
    },
  ],
  [
    "refresh allowed to create a new session family",
    (document) => {
      document["x-kora-admin-session-family-policy"].refreshCreatesFamily =
        true;
    },
  ],
  [
    "C1 SERVICE_UNAVAILABLE error omitted",
    (document) => {
      document["x-kora-operation-errors"].loginAdmin = document[
        "x-kora-operation-errors"
      ].loginAdmin.filter((code) => code !== "SERVICE_UNAVAILABLE");
    },
  ],
  [
    "C1 503 response omitted",
    (document) => {
      delete adminSecurityOperation(document, "listAdminSessions").responses[
        "503"
      ];
    },
  ],
  [
    "C1 503 public message discloses PostgreSQL",
    (document) => {
      document.components.responses.AdminServiceUnavailable.content[
        "application/json"
      ].examples.unavailable.value.error.message = "PostgreSQL unavailable.";
    },
  ],
  [
    "C1 503 schema permits a non-generic error code",
    (document) => {
      document.components.responses.AdminServiceUnavailable.content[
        "application/json"
      ].schema.allOf[1].properties.error.properties.code.const =
        "INTERNAL_ERROR";
    },
  ],
  [
    "C1 503 schema permits non-empty public details",
    (document) => {
      document.components.responses.AdminServiceUnavailable.content[
        "application/json"
      ].schema.allOf[1].properties.error.properties.details.maxProperties = 1;
    },
  ],
  [
    "C1 503 schema message discloses a dependency",
    (document) => {
      document.components.responses.AdminServiceUnavailable.content[
        "application/json"
      ].schema.allOf[1].properties.error.properties.message.const =
        "PostgreSQL unavailable.";
    },
  ],
  [
    "C1 503 schema authorizes automatic retry",
    (document) => {
      document.components.responses.AdminServiceUnavailable.content[
        "application/json"
      ].schema.allOf[1].properties.error.properties.retryable.const = true;
    },
  ],
  [
    "generic step-up accepts recovery-code rotation purpose",
    (document) => {
      document.components.schemas.AdminStepUpRequest.properties.purpose.enum.push(
        "RECOVERY_CODE_ROTATION",
      );
    },
  ],
  [
    "C2 SERVICE_UNAVAILABLE error and response omitted",
    (document) => {
      document["x-kora-operation-errors"].requestAdminPasswordReset = document[
        "x-kora-operation-errors"
      ].requestAdminPasswordReset.filter(
        (code) => code !== "SERVICE_UNAVAILABLE",
      );
      delete adminSecurityOperation(document, "requestAdminPasswordReset")
        .responses["503"];
    },
  ],
  [
    "C2 step-up purpose weakened",
    (document) => {
      adminSecurityOperation(document, "approveAdminRecoveryCase")[
        "x-kora-step-up-purpose"
      ] = "AUDIT_EXPORT";
    },
  ],
  [
    "C2 success sink weakened",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].operationMatrix.createAdminInvitation.successSink =
        "ADMIN_SECURITY_EVENT";
    },
  ],
  [
    "C2 reset audit context removed",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].operationMatrix.resetAdminPassword.auditContext = null;
    },
  ],
  [
    "client reset field accepted as server proof",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].operationMatrix.resetAdminPassword.serverProof =
        "CLIENT_RESET_CODE_IS_SUFFICIENT";
    },
  ],
  [
    "password reset aliases MFA recovery",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].passwordReset.recoveryPurpose = "MFA_RECOVERY";
    },
  ],
  [
    "C2 malformed JSON route map weakened",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].preControllerJson.operationIds.pop();
    },
  ],
  [
    "C2 cursor loses principal binding",
    (document) => {
      document["x-kora-admin-c2-contract-policy"].pagination.cursor =
        "OPAQUE_ONLY";
    },
  ],
  [
    "C2 export becomes unbounded",
    (document) => {
      document["x-kora-admin-c2-contract-policy"].auditExport.maximumEntries =
        null;
    },
  ],
  [
    "local provider is falsely production-qualified",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].productionQualification.notificationProvider = "QUALIFIED";
    },
  ],
  [
    "C2 transaction disposal omits physical connection discard",
    (document) => {
      delete document["x-kora-admin-c2-contract-policy"]
        .transactionClientDisposal.release.discard;
    },
  ],
  [
    "C2 rollback rejection returns a reusable client",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.contractualTraces.find(
        ({ name }) => name === "ROLLBACK_REJECTED",
      ).clientDisposition = "REUSABLE_SINGLE_RELEASE";
    },
  ],
  [
    "C2 rollback loses its monotonic deadline",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.rollback.deadlineMilliseconds = null;
    },
  ],
  [
    "C2 transaction client permits double release",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.release.totalCardinality = "AT_LEAST_ONCE";
    },
  ],
  [
    "C2 rollback failure drops the primary error",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.errors.primary =
        "REPLACE_WITH_ROLLBACK_ERROR";
    },
  ],
  [
    "C2 unknown commit falsely claims rollback",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.commitUnknown.rollbackClaim = "CONFIRMED";
    },
  ],
  [
    "C2 state-machine retry replays an unknown mutation",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.jobRetryBoundary =
        "STATE_MACHINE_RETRY_AUTHORIZES_UNKNOWN_MUTATION_REPLAY";
    },
  ],
  [
    "C2 rollback failure emits a contradictory second sink",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.publicFailure.secondSink = "AUDIT_LOG";
    },
  ],
  [
    "C2 callback starts without confirmed BEGIN",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.begin.callbackAllowedWhen = "BEGIN_ATTEMPTED";
    },
  ],
  [
    "C2 unknown BEGIN outcome returns a reusable client",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.begin.unconfirmedDisposition =
        "POOL_RELEASE_REUSABLE";
    },
  ],
  [
    "C2 connection loss overlaps pre-COMMIT and COMMIT_UNKNOWN",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.phaseExclusivity.postCommitAttemptConnectionLoss =
        "PRE_COMMIT_OR_COMMIT_UNKNOWN";
    },
  ],
  [
    "C2 COMMIT acknowledgement loses its monotonic deadline",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.commit.acknowledgementDeadlineMilliseconds =
        null;
    },
  ],
  [
    "C2 transaction reuse accepts a stale ReadyForQuery I",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.rollback.reuseAllowedWhen =
        "ROLLBACK_CONFIRMED_AND_ANY_OBSERVED_IDLE_STATE";
    },
  ],
  [
    "C2 unknown BEGIN late settlement starts the callback",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.begin.lateSettlement =
        "START_CALLBACK_AFTER_LATE_CONFIRMATION";
    },
  ],
  [
    "C2 confirmed COMMIT with unusable client becomes COMMIT_UNKNOWN",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.commit.successOtherwiseDisposition =
        "RECLASSIFY_COMMIT_UNKNOWN";
    },
  ],
  [
    "C2 explicit server COMMIT rejection is treated as unknown",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.commit.explicitServerRejection =
        "COMMIT_UNKNOWN";
    },
  ],
  [
    "C2 rollback is limited to callback failures",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.rollback.requiredWhen =
        "CALLBACK_FAILED_BEFORE_COMMIT";
    },
  ],
  [
    "C2 COMMIT terminal error is not preserved",
    (document) => {
      delete document["x-kora-admin-c2-contract-policy"]
        .transactionClientDisposal.errors.commit;
    },
  ],
  [
    "C2 acquired client without reusable proof has no default discard",
    (document) => {
      delete document["x-kora-admin-c2-contract-policy"]
        .transactionClientDisposal.release
        .defaultForAcquiredClientNotMeetingReusablePredicate;
    },
  ],
  [
    "C2 future writer permits unbounded pool acquisition or callback",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.acquisitionAndCallbackLiveness.unboundedAcquisitionOrCallback =
        "ALLOWED";
    },
  ],
  [
    "C2 callback deadline permits post-deadline queries",
    (document) => {
      document[
        "x-kora-admin-c2-contract-policy"
      ].transactionClientDisposal.acquisitionAndCallbackLiveness.postDeadlineCallbackQuery =
        "ALLOWED";
    },
  ],
  [
    "blind retry allowed after unknown commit outcome",
    (document) => {
      document[
        "x-kora-admin-c1-unavailability-policy"
      ].commitAcknowledgementLoss = "AUTOMATIC_RETRY";
    },
  ],
  [
    "durable audit claimed while durability is impossible",
    (document) => {
      document[
        "x-kora-admin-c1-unavailability-policy"
      ].auditDurabilityImpossible = "CLAIM_DURABLE_AUDIT_AND_RETURN_503";
    },
  ],
];

for (const [name, mutate] of adminSecurityMutations) {
  test(`S1.2-03C2-P0 rejects ${name}`, () => {
    const document = documentFixture();
    mutate(document);

    assert.throws(
      () => validateOpenApiDocument(document),
      /OpenAPI validation failed/,
    );
  });
}

test("locks the five Admin C1 structural validation operations", () => {
  assert.deepEqual(
    ADMIN_STRUCTURAL_VALIDATION_OPERATIONS,
    EXPECTED_ADMIN_STRUCTURAL_VALIDATION_OPERATIONS,
  );
});

for (const operationId of EXPECTED_ADMIN_STRUCTURAL_VALIDATION_OPERATIONS) {
  test(`S1.2-03C1 rejects missing VALIDATION_ERROR for ${operationId}`, () => {
    const document = documentFixture();
    document["x-kora-operation-errors"][operationId] = document[
      "x-kora-operation-errors"
    ][operationId].filter((code) => code !== "VALIDATION_ERROR");

    assert.throws(
      () => validateOpenApiDocument(document),
      new RegExp(
        `${operationId} requires VALIDATION_ERROR for structural request validation`,
        "u",
      ),
    );
  });
}

test("S1.2-03C1 preserves the QR validation remapping as FORBIDDEN", () => {
  const document = documentFixture();
  document["x-kora-operation-errors"].deliverAdminTotpEnrollmentQr.push(
    "VALIDATION_ERROR",
  );

  assert.throws(
    () => validateOpenApiDocument(document),
    /TOTP QR delivery must remain unique, non-loggable and retry-409/u,
  );
});
