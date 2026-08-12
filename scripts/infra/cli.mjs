import {
  PROJECT_NAME,
  checkInfrastructure,
  downProject,
  prepareLocalFiles,
  pullImages,
  resetProject,
  showStatus,
  upProject,
  validateCompose,
} from "./lib.mjs";

const command = process.argv[2];

function confirmationArgument() {
  const expected = `--confirm=${PROJECT_NAME}`;
  const supplied = process.argv[3];
  if (supplied !== expected || process.argv.length !== 4) {
    throw new Error(`Reset requires the exact argument ${expected}.`);
  }
  return PROJECT_NAME;
}

try {
  switch (command) {
    case "prepare":
      prepareLocalFiles();
      break;
    case "validate":
      validateCompose();
      break;
    case "pull":
      pullImages();
      break;
    case "up":
      upProject();
      break;
    case "status":
      showStatus();
      break;
    case "check":
      checkInfrastructure();
      break;
    case "down":
      downProject();
      break;
    case "reset":
      resetProject(confirmationArgument());
      break;
    default:
      throw new Error(
        "Usage: node scripts/infra/cli.mjs <prepare|validate|pull|up|status|check|down|reset>",
      );
  }
} catch (error) {
  console.error(`Infrastructure command failed: ${error.message}`);
  process.exitCode = 1;
}
