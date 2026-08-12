import { randomBytes } from "node:crypto";

import {
  assertPersistenceMarkers,
  assertPersistenceMarkersAbsent,
  checkInfrastructure,
  createPersistenceMarkers,
  downProject,
  prepareLocalFiles,
  resetProject,
  runCompose,
  upProject,
  validateCompose,
  waitForServiceHealthy,
} from "./lib.mjs";

try {
  prepareLocalFiles();
  validateCompose();
  upProject();
  checkInfrastructure();

  const marker = `s04-${randomBytes(12).toString("hex")}`;
  createPersistenceMarkers(marker);
  runCompose(["restart", "postgres", "redis"]);
  waitForServiceHealthy("postgres");
  waitForServiceHealthy("redis");
  assertPersistenceMarkers(marker);
  console.log("PostgreSQL and Redis markers survived a simple restart.");

  resetProject("kora-plus-local");
  assertPersistenceMarkersAbsent();
  checkInfrastructure();
  console.log("Targeted reset removed only the KORA+ technical markers.");

  upProject();
  downProject();
  downProject();
  upProject();
  upProject();
  checkInfrastructure();
  console.log(
    "Infrastructure start and stop operations are idempotent; final state is healthy.",
  );
} catch (error) {
  console.error(
    `Infrastructure lifecycle verification failed: ${error.message}`,
  );
  process.exitCode = 1;
}
