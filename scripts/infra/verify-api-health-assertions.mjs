const REQUIRED_OWNER_VIOLATIONS = [
  "administrative_role_attribute",
  "database_or_schema_write_privilege",
  "unexpected_table_privilege",
];

export function sanitizedOutput(output, secrets) {
  let sanitized = output;
  for (const secret of secrets) {
    sanitized = sanitized.replaceAll(secret, "<redacted-secret>");
  }
  return sanitized
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, "<redacted-database-url>")
    .replace(/redis:\/\/[^\s"']+/giu, "<redacted-redis-url>");
}

export function capturedOutputSummary(output, secrets) {
  const summary = sanitizedOutput(output, secrets)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-10)
    .join(" | ");
  return summary.length === 0 ? "<no-captured-output>" : summary.slice(-4_000);
}

export function assertNoSensitiveValue(serialized, secrets) {
  for (const secret of secrets) {
    if (serialized.includes(secret)) {
      throw new Error("A local credential appeared in an API response or log.");
    }
  }
  if (/postgres(?:ql)?:\/\/|redis:\/\//iu.test(serialized)) {
    throw new Error(
      "A raw database or Redis URL appeared in an API response or log.",
    );
  }
}

export async function assertOwnerRoleRejected({
  createApplication,
  environment,
  log = console.log,
  secrets,
}) {
  const readinessChecks = [
    { async check() {}, name: "postgresql" },
    { async check() {}, name: "redis" },
  ];
  let application;

  try {
    application = await createApplication({ environment, readinessChecks });
  } catch (error) {
    const fatal = capturedOutputSummary(
      `${error?.name ?? "UnknownError"}: ${error?.message ?? "unknown error"}`,
      secrets,
    );
    if (
      error?.name !== "RuntimeDatabaseBoundaryError" ||
      !REQUIRED_OWNER_VIOLATIONS.every((violation) =>
        error?.violations?.includes(violation),
      )
    ) {
      throw new Error(
        `Owner/migrator API rejection returned an unexpected fatal error: ${fatal}.`,
      );
    }
    assertNoSensitiveValue(fatal, secrets);
    log(`API owner/migrator role refused as expected: ${fatal}.`);
    return;
  } finally {
    if (application !== undefined) {
      await application.close();
    }
  }

  throw new Error(
    "API unexpectedly accepted the PostgreSQL owner/migrator role.",
  );
}
