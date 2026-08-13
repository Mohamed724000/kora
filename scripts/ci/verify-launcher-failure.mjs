import { fileURLToPath } from "node:url";

import { runCommand } from "../run-workspace-task.mjs";

const self = fileURLToPath(import.meta.url);

if (process.argv[2] === "--controlled-failure") {
  process.exit(23);
}

try {
  await runCommand(process.execPath, [self, "--controlled-failure"]);
  throw new Error("Launcher accepted a controlled child failure.");
} catch (error) {
  if (!/exited with code 23/u.test(error.message)) {
    throw error;
  }
}

console.log(
  "Launcher failure propagation valid: controlled child exit code 23 was rejected.",
);
