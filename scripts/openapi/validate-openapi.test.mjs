import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { readGeneratedContract } from "./generate-contract-types.mjs";
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

test("the S1.1 OpenAPI and Prisma target contracts are semantically valid", () => {
  const result = readAndValidateOpenApi();

  assert.equal(result.openapi.paths, 29);
  assert.equal(result.openapi.invariants, 11);
  assert.equal(result.openapi.references, "resolved");
  assert.ok(result.openapi.schemas >= 50);
  assert.equal(result.prisma.models, 30);
  assert.ok(result.prisma.integerFinancialFields >= 10);
  assert.equal(EXPECTED_PATHS.length, 29);
});

test("the shared TypeScript boundary is generated from the current OpenAPI", async () => {
  const current = readFileSync(
    resolve("packages", "contracts", "src", "generated", "audio-pilot.ts"),
    "utf8",
  );

  assert.equal(current, await readGeneratedContract());
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

test("rejects a raw media URL in any API schema", () => {
  const document = documentFixture();
  document.components.schemas.AudioCatalogItem.properties.previewUrl = {
    type: "string",
    format: "uri",
  };

  assert.throws(
    () => validateOpenApiDocument(document),
    /raw media or private provider field/,
  );
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
    /createAdminArtist requires explicit approved admin roles/,
  );
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
    contentId: "11111111-1111-4111-8111-111111111111",
    description: "Une creation du pilote audio.",
    durationSeconds: 192,
    previewAvailable: true,
    previewSeconds: 30,
    priceCfa: 2500,
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

test("rejects any overwrite method on PaymentAttempt", () => {
  const document = documentFixture();
  document.paths[
    "/api/v1/orders/{orderId}/payment-attempts/{paymentAttemptId}"
  ].patch = {
    operationId: "overwritePaymentAttempt",
    summary: "Invalid overwrite.",
    "x-kora-clients": ["mobile"],
    security: [{ customerBearer: [] }],
    responses: {
      200: { description: "Invalid." },
      401: { $ref: "#/components/responses/ClientError" },
    },
  };
  document["x-kora-operation-errors"].overwritePaymentAttempt = [
    "AUTH_REQUIRED",
  ];

  assert.throws(
    () => validateOpenApiDocument(document),
    /cannot be overwritten/,
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

test("rejects provider/event webhook deduplication drift", () => {
  const invalid = prismaSource.replace(
    "@@unique([provider, providerEventKey])",
    "@@index([provider, providerEventKey])",
  );

  assert.throws(
    () => validatePrismaTargetSchema(invalid),
    /provider\/event deduplication/,
  );
});

test("rejects a non-operational or real payment provider in S1.1", () => {
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
    /archived content must remain representable/,
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
