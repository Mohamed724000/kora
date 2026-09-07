export const ARTIST_EARNING_ALLOCATION_POLICY =
  "FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1";

export const BASIS_POINTS_DENOMINATOR = 10_000n;

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareCanonical(left, right) {
  return (
    compareText(left.orderItemId, right.orderItemId) ||
    compareText(left.audioContentId, right.audioContentId)
  );
}

function requireIdentifier(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireBigInt(value, field) {
  if (typeof value !== "bigint") {
    throw new TypeError(`${field} must be a BigInt`);
  }
  return value;
}

function requireCarry(value, field) {
  const carry = requireBigInt(value, field);
  if (carry < 0n || carry >= BASIS_POINTS_DENOMINATOR) {
    throw new RangeError(`${field} must be between 0 and 9999`);
  }
  return carry;
}

function validatePreviousArtistSettlement({
  artistId,
  artistSettlementId,
  carryInNumerator,
  previousArtistSettlement,
  settlementSequence,
}) {
  if (settlementSequence === 1n) {
    if (previousArtistSettlement !== null) {
      throw new Error(
        "first artist settlement must not reference a previous settlement",
      );
    }
    if (carryInNumerator !== 0n) {
      throw new Error("first artist settlement carryInNumerator must be zero");
    }
    return null;
  }

  if (previousArtistSettlement === null) {
    throw new Error("subsequent artist settlement requires its predecessor");
  }

  const previousId = requireIdentifier(
    previousArtistSettlement.id,
    "previousArtistSettlement.id",
  );
  const previousArtistId = requireIdentifier(
    previousArtistSettlement.artistId,
    "previousArtistSettlement.artistId",
  );
  const previousSequence = requireBigInt(
    previousArtistSettlement.settlementSequence,
    "previousArtistSettlement.settlementSequence",
  );
  const previousCarryOut = requireCarry(
    previousArtistSettlement.carryOutNumerator,
    "previousArtistSettlement.carryOutNumerator",
  );

  if (previousId === artistSettlementId) {
    throw new Error("artist settlement cannot consume its own carry");
  }
  if (previousArtistId !== artistId) {
    throw new Error("previous artist settlement belongs to another artist");
  }
  if (previousSequence + 1n !== settlementSequence) {
    throw new Error(
      "artist settlement sequence must immediately follow its predecessor",
    );
  }
  if (previousCarryOut !== carryInNumerator) {
    throw new Error(
      "carryInNumerator must equal predecessor carryOutNumerator",
    );
  }
  if (previousArtistSettlement.consumedByArtistSettlementId != null) {
    throw new Error("previous artist settlement carry is already consumed");
  }

  return previousId;
}

export function allocateSettlementArtistEarnings({
  artistId: rawArtistId,
  artistSettlementId: rawArtistSettlementId,
  carryInNumerator: rawCarryInNumerator,
  earnings,
  previousArtistSettlement = null,
  settlementId: rawSettlementId,
  settlementOrderId: rawSettlementOrderId,
  settlementSequence: rawSettlementSequence,
}) {
  const artistId = requireIdentifier(rawArtistId, "artistId");
  const artistSettlementId = requireIdentifier(
    rawArtistSettlementId,
    "artistSettlementId",
  );
  const settlementId = requireIdentifier(rawSettlementId, "settlementId");
  const settlementOrderId = requireIdentifier(
    rawSettlementOrderId,
    "settlementOrderId",
  );
  const settlementSequence = requireBigInt(
    rawSettlementSequence,
    "settlementSequence",
  );
  const carryInNumerator = requireCarry(
    rawCarryInNumerator,
    "carryInNumerator",
  );

  if (settlementSequence < 1n) {
    throw new RangeError("settlementSequence must be at least 1");
  }
  const previousArtistSettlementId = validatePreviousArtistSettlement({
    artistId,
    artistSettlementId,
    carryInNumerator,
    previousArtistSettlement,
    settlementSequence,
  });

  if (!Array.isArray(earnings) || earnings.length === 0) {
    throw new TypeError(
      "an artist settlement requires at least one earning candidate",
    );
  }

  const seenOrderItems = new Set();
  const normalizedEarnings = earnings.map((earning, index) => {
    const field = `earnings[${index}]`;
    const candidateArtistSettlementId = requireIdentifier(
      earning.artistSettlementId,
      `${field}.artistSettlementId`,
    );
    const candidateSettlementId = requireIdentifier(
      earning.settlementId,
      `${field}.settlementId`,
    );
    const candidateOrderId = requireIdentifier(
      earning.orderId,
      `${field}.orderId`,
    );
    const orderItemId = requireIdentifier(
      earning.orderItemId,
      `${field}.orderItemId`,
    );
    const orderItemOrderId = requireIdentifier(
      earning.orderItemOrderId,
      `${field}.orderItemOrderId`,
    );
    const audioContentId = requireIdentifier(
      earning.audioContentId,
      `${field}.audioContentId`,
    );
    const orderItemAudioContentId = requireIdentifier(
      earning.orderItemAudioContentId,
      `${field}.orderItemAudioContentId`,
    );
    const candidateArtistId = requireIdentifier(
      earning.artistId,
      `${field}.artistId`,
    );
    const audioContentArtistId = requireIdentifier(
      earning.audioContentArtistId,
      `${field}.audioContentArtistId`,
    );

    if (candidateArtistSettlementId !== artistSettlementId) {
      throw new Error(
        `${field}.artistSettlementId must match artistSettlementId`,
      );
    }
    if (candidateSettlementId !== settlementId) {
      throw new Error(`${field}.settlementId must match settlementId`);
    }
    if (candidateOrderId !== settlementOrderId) {
      throw new Error(`${field}.orderId must match settlementOrderId`);
    }
    if (orderItemOrderId !== settlementOrderId) {
      throw new Error(`${field}.orderItemOrderId must match settlementOrderId`);
    }
    if (orderItemAudioContentId !== audioContentId) {
      throw new Error(
        `${field}.orderItemAudioContentId must match audioContentId`,
      );
    }
    if (candidateArtistId !== artistId) {
      throw new Error(`${field}.artistId must match artistId`);
    }
    if (audioContentArtistId !== artistId) {
      throw new Error(`${field}.audioContentArtistId must match artistId`);
    }
    if (seenOrderItems.has(orderItemId)) {
      throw new Error("duplicate artist earning orderItemId");
    }
    seenOrderItems.add(orderItemId);

    const frozenBasisCfa = requireBigInt(
      earning.frozenBasisCfa,
      `${field}.frozenBasisCfa`,
    );
    const artistRevenueShareBps = requireBigInt(
      earning.artistRevenueShareBps,
      `${field}.artistRevenueShareBps`,
    );
    if (frozenBasisCfa < 0n) {
      throw new RangeError(`${field}.frozenBasisCfa must be non-negative`);
    }
    if (
      artistRevenueShareBps < 0n ||
      artistRevenueShareBps > BASIS_POINTS_DENOMINATOR
    ) {
      throw new RangeError(
        `${field}.artistRevenueShareBps must be between 0 and 10000`,
      );
    }

    return {
      artistId,
      artistRevenueShareBps,
      artistSettlementId,
      audioContentId,
      exactEarningNumerator: frozenBasisCfa * artistRevenueShareBps,
      frozenBasisCfa,
      orderId: settlementOrderId,
      orderItemId,
      settlementId,
    };
  });

  const exactEarningsNumerator = normalizedEarnings.reduce(
    (total, earning) => total + earning.exactEarningNumerator,
    0n,
  );
  const exactNumerator = carryInNumerator + exactEarningsNumerator;
  const payableAmountCfa = exactNumerator / BASIS_POINTS_DENOMINATOR;
  const carryOutNumerator = exactNumerator % BASIS_POINTS_DENOMINATOR;
  const distributableBasisCfa = normalizedEarnings.reduce(
    (total, earning) => total + earning.frozenBasisCfa,
    0n,
  );
  const platformAmountCfa = distributableBasisCfa - payableAmountCfa;

  if (
    carryOutNumerator < 0n ||
    carryOutNumerator >= BASIS_POINTS_DENOMINATOR ||
    exactNumerator !==
      payableAmountCfa * BASIS_POINTS_DENOMINATOR + carryOutNumerator
  ) {
    throw new Error("artist settlement violates exact-numerator conservation");
  }
  if (platformAmountCfa < 0n) {
    throw new Error(
      "artist settlement payable exceeds its distributable basis",
    );
  }

  return {
    artistId,
    artistSettlementId,
    carryInNumerator,
    carryOutNumerator,
    distributableBasisCfa,
    earnings: normalizedEarnings.sort(compareCanonical),
    exactEarningsNumerator,
    exactNumerator,
    payableAmountCfa,
    platformAmountCfa,
    policy: ARTIST_EARNING_ALLOCATION_POLICY,
    previousArtistSettlementId,
    settlementId,
    settlementOrderId,
    settlementSequence,
  };
}
