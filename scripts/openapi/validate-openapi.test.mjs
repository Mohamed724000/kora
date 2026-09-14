import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  EXACT_PRETTIER_VERSION,
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

function documentFixture() {
  return structuredClone(sourceDocument);
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

test("the S1.2-01 OpenAPI and Prisma target contracts are semantically valid", () => {
  const result = readAndValidateOpenApi();

  assert.equal(result.openapi.paths, 34);
  assert.equal(result.openapi.invariants, 18);
  assert.equal(result.openapi.references, "resolved");
  assert.equal(result.openapi.schemas, 87);
  assert.equal(result.prisma.models, 33);
  assert.ok(result.prisma.integerFinancialFields >= 10);
  assert.equal(EXPECTED_PATHS.length, 34);
});

test("rejects an unapproved OpenAPI schema", () => {
  const document = documentFixture();
  document.components.schemas.UnapprovedExtra = { type: "string" };

  assert.throws(
    () => validateOpenApiDocument(document),
    /schemas must be exactly the 87 approved schemas/,
  );
});

test("rejects an unapproved Prisma target model", () => {
  const invalid = `${prismaSource}\nmodel UnapprovedExtra {\n  id String @id\n}\n`;

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /Prisma target models must be exactly the 33 approved models/,
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

  assert.equal(
    normalizeContractSyntax(current),
    normalizeContractSyntax(generatedSyntax),
  );
  if (existsSync(resolve("node_modules", "prettier", "package.json"))) {
    assert.equal(current, await readGeneratedContract());
  } else {
    await assert.rejects(
      readGeneratedContract(),
      new RegExp(`Prettier ${EXACT_PRETTIER_VERSION}.*unavailable`),
    );
  }
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
    /adminSession\s+AdminSession\s+@relation\(fields: \[adminSessionId, adminUserId\], references: \[id, adminUserId\], onDelete: Restrict, onUpdate: Restrict\)/,
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
    [/reason\s+String/, "reason String?"],
    [/requestId\s+String/, ""],
    [/createdAt\s+DateTime\s+@default\(now\(\)\)/, "createdAt DateTime?"],
    [/action\s+String/, "transaction String"],
    [/reason\s+String/, "treason String"],
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
    /adminSession\s+AdminSession\s+@relation\(fields: \[adminSessionId, adminUserId\], references: \[id, adminUserId\], onDelete: Restrict, onUpdate: Restrict\)/,
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
    "adminSession AdminSession @relation(fields: [adminSessionId, adminUserId], references: [id, adminUserId], onDelete: Restrict, onUpdate: Restrict)";
  for (const [name, lineBreak] of [
    ["LF", "\n"],
    ["CR", "\r"],
    ["CRLF", "\r\n"],
  ]) {
    const invalid = replaceWithinModel(
      prismaSource,
      "AuditLog",
      /adminSession\s+AdminSession\s+@relation\(fields: \[adminSessionId, adminUserId\], references: \[id, adminUserId\], onDelete: Restrict, onUpdate: Restrict\)/,
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
