export abstract class RuntimeDatabaseBoundary {
  abstract assertLeastPrivilege(): Promise<void>;
}
