import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { QueryResult, QueryResultRow } from 'pg';

export const ADMIN_C2_TRANSACTION_BUDGETS = Object.freeze({
  acquireMs: 2_000,
  beginMs: 2_000,
  callbackMs: 5_000,
  rollbackMs: 2_000,
  commitAcknowledgementMs: 2_000,
  terminalGraceMs: 500,
});

export type AdminC2TransactionStatus = 'I' | 'T' | 'E' | 'UNKNOWN';

export type AdminC2TransactionErrorCode =
  | 'ACQUISITION_FAILED'
  | 'ACQUISITION_TIMEOUT'
  | 'DRIVER_CONTRACT_VIOLATION'
  | 'BEGIN_FAILED'
  | 'BEGIN_TIMEOUT'
  | 'CALLBACK_FAILED'
  | 'CALLBACK_TIMEOUT'
  | 'CALLBACK_NOT_QUIESCENT'
  | 'TRANSACTION_STATE_INVALID'
  | 'ROLLBACK_FAILED'
  | 'ROLLBACK_TIMEOUT'
  | 'COMMIT_REJECTED'
  | 'COMMIT_UNKNOWN'
  | 'CLEANUP_FAILED';

export class AdminC2TransactionError extends Error {
  constructor(
    readonly code: AdminC2TransactionErrorCode,
    message: string,
    readonly primaryError?: unknown,
    readonly rollbackError?: unknown,
    readonly cleanupError?: unknown,
  ) {
    super(message);
    this.name = 'AdminC2TransactionError';
  }
}

export interface AdminC2PgClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
  release(destroy?: boolean | Error): void;
}

export interface AdminC2PgPool {
  connect(): Promise<AdminC2PgClient>;
}

export interface AdminC2Transaction {
  readonly signal: AbortSignal;
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface AdminC2TimeSource {
  now(): number;
  setTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
}

export interface AdminC2DriverObservation<T> {
  readonly promise: Promise<T>;
  remove(): void;
}

export interface AdminC2ClientErrorObservation extends AdminC2DriverObservation<unknown> {
  currentError(): unknown | undefined;
}

export interface AdminC2DriverContract {
  assertInstalledDriver(): void;
  transactionStatus(client: AdminC2PgClient): AdminC2TransactionStatus;
  observeReadyForQuery(client: AdminC2PgClient): AdminC2DriverObservation<AdminC2TransactionStatus>;
  observeTransportClose(client: AdminC2PgClient): AdminC2DriverObservation<void>;
  observeClientError(client: AdminC2PgClient): AdminC2ClientErrorObservation;
}

export interface AdminC2TransactionDiagnostic {
  readonly phase:
    'late-acquisition-disposal' | 'confirmed-commit-observability' | 'confirmed-commit-disposal';
  readonly error: unknown;
}

export type AdminC2TransactionDiagnosticReporter = (
  diagnostic: AdminC2TransactionDiagnostic,
) => void;

interface EventEmitterLike {
  on(event: string, listener: (...arguments_: unknown[]) => void): unknown;
  once(event: string, listener: (...arguments_: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...arguments_: unknown[]) => void): unknown;
}

interface StreamLike extends EventEmitterLike {
  readonly closed?: boolean;
}

interface ConnectionLike extends EventEmitterLike {
  readonly stream: StreamLike;
}

interface InternalPgClient extends AdminC2PgClient, EventEmitterLike {
  readonly connection: ConnectionLike;
  getTransactionStatus(): unknown;
}

interface Settled<T> {
  status: 'fulfilled' | 'rejected';
  value?: T;
  reason?: unknown;
}

interface StartedQuery<T extends QueryResultRow = QueryResultRow> {
  readonly settled: Promise<Settled<QueryResult<T>>>;
  readonly synchronousError?: unknown;
}

interface ControlResult {
  readonly status: AdminC2TransactionStatus;
  readonly timedOut: boolean;
  readonly query: Settled<QueryResult>;
  readonly transportError?: unknown;
  readonly contractError?: unknown;
}

const TRANSACTION_CONTROL_KEYWORDS = new Set([
  'ABORT',
  'BEGIN',
  'COMMIT',
  'END',
  'PREPARE',
  'RELEASE',
  'ROLLBACK',
  'SAVEPOINT',
  'SET',
  'START',
]);

function containsTransactionControl(sql: string): boolean {
  const statements: string[][] = [[]];
  let token = '';
  let index = 0;
  let quote: 'single' | 'double' | undefined;
  let dollarTag: string | undefined;
  const flushToken = (): void => {
    if (token !== '') {
      statements.at(-1)?.push(token.toUpperCase());
      token = '';
    }
  };

  while (index < sql.length) {
    const character = sql[index] as string;
    const next = sql[index + 1];
    if (dollarTag !== undefined) {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        dollarTag = undefined;
      } else index += 1;
      continue;
    }
    if (quote === 'single') {
      if (character === "'" && next === "'") index += 2;
      else {
        if (character === "'") quote = undefined;
        index += 1;
      }
      continue;
    }
    if (quote === 'double') {
      if (character === '"' && next === '"') index += 2;
      else {
        if (character === '"') quote = undefined;
        index += 1;
      }
      continue;
    }
    if (character === '-' && next === '-') {
      flushToken();
      index += 2;
      while (index < sql.length && sql[index] !== '\n') index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      flushToken();
      index += 2;
      let depth = 1;
      while (index < sql.length && depth > 0) {
        if (sql[index] === '/' && sql[index + 1] === '*') {
          depth += 1;
          index += 2;
        } else if (sql[index] === '*' && sql[index + 1] === '/') {
          depth -= 1;
          index += 2;
        } else index += 1;
      }
      continue;
    }
    if (character === "'") {
      flushToken();
      quote = 'single';
      index += 1;
      continue;
    }
    if (character === '"') {
      flushToken();
      quote = 'double';
      index += 1;
      continue;
    }
    if (character === '$') {
      const match = /^\$[a-zA-Z_][a-zA-Z0-9_]*\$|^\$\$/.exec(sql.slice(index));
      if (match !== null) {
        flushToken();
        dollarTag = match[0];
        index += dollarTag.length;
        continue;
      }
    }
    if (character === ';') {
      flushToken();
      statements.push([]);
      index += 1;
      continue;
    }
    if (/[a-zA-Z_]/.test(character)) token += character;
    else flushToken();
    index += 1;
  }
  flushToken();

  return statements.some((tokens) => {
    const first = tokens[0];
    if (first === undefined || !TRANSACTION_CONTROL_KEYWORDS.has(first)) return false;
    if (first === 'START') return tokens[1] === 'TRANSACTION';
    if (first === 'PREPARE') return tokens[1] === 'TRANSACTION';
    if (first === 'RELEASE') return tokens[1] === 'SAVEPOINT';
    if (first === 'SET') {
      return (
        tokens[1] === 'TRANSACTION' ||
        (tokens[1] === 'SESSION' &&
          tokens[2] === 'CHARACTERISTICS' &&
          tokens[3] === 'AS' &&
          tokens[4] === 'TRANSACTION')
      );
    }
    return true;
  });
}

const systemTimeSource: AdminC2TimeSource = {
  now: () => performance.now(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
};

const systemDiagnosticReporter: AdminC2TransactionDiagnosticReporter = (diagnostic) => {
  process.emitWarning(
    'C2 transaction diagnostic at ' + diagnostic.phase + '; inspect structured application logs.',
    { code: 'KORA_ADMIN_C2_TRANSACTION_DIAGNOSTIC' },
  );
};

const nodeRequire = createRequire(__filename);
let installedDriverVerified = false;

function packageVersion(path: string): string | undefined {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (
    typeof manifest === 'object' &&
    manifest !== null &&
    'version' in manifest &&
    typeof manifest.version === 'string'
  ) {
    return manifest.version;
  }
  return undefined;
}

function isEmitter(value: unknown): value is EventEmitterLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<EventEmitterLike>;
  return (
    typeof candidate.on === 'function' &&
    typeof candidate.once === 'function' &&
    typeof candidate.removeListener === 'function'
  );
}

function internalClient(client: AdminC2PgClient): InternalPgClient {
  const candidate = client as Partial<InternalPgClient>;
  if (
    !isEmitter(client as unknown) ||
    typeof candidate.getTransactionStatus !== 'function' ||
    typeof candidate.connection !== 'object' ||
    candidate.connection === null ||
    !isEmitter(candidate.connection) ||
    typeof candidate.connection.stream !== 'object' ||
    candidate.connection.stream === null ||
    !isEmitter(candidate.connection.stream)
  ) {
    throw new AdminC2TransactionError(
      'DRIVER_CONTRACT_VIOLATION',
      'pg@8.22.0 internal client shape is unavailable.',
    );
  }
  return candidate as InternalPgClient;
}

export const pg822DriverContract: AdminC2DriverContract = {
  assertInstalledDriver(): void {
    if (installedDriverVerified) {
      return;
    }
    const pgPackagePath = nodeRequire.resolve('pg/package.json');
    const modulesDirectory = dirname(dirname(pgPackagePath));
    const poolPackagePath = join(modulesDirectory, 'pg-pool', 'package.json');
    const clientSource = readFileSync(join(dirname(pgPackagePath), 'lib', 'client.js'), 'utf8');
    const connectionSource = readFileSync(
      join(dirname(pgPackagePath), 'lib', 'connection.js'),
      'utf8',
    );
    const poolSource = readFileSync(join(modulesDirectory, 'pg-pool', 'index.js'), 'utf8');

    if (
      packageVersion(pgPackagePath) !== '8.22.0' ||
      packageVersion(poolPackagePath) !== '3.14.0' ||
      !clientSource.includes("con.on('readyForQuery', this._handleReadyForQuery.bind(this))") ||
      !clientSource.includes('this._txStatus = msg?.status ?? null') ||
      !clientSource.includes('activeQuery.handleReadyForQuery(this.connection)') ||
      !clientSource.includes('getTransactionStatus()') ||
      !clientSource.includes('return this._txStatus') ||
      !clientSource.includes("this.emit('error', err)") ||
      !connectionSource.includes('this.emit(eventName, msg)') ||
      !connectionSource.includes("this.stream.on('close'") ||
      !poolSource.includes('client.end(() => {') ||
      !poolSource.includes('if (err || this.ending || !client._queryable || client._ending')
    ) {
      throw new AdminC2TransactionError(
        'DRIVER_CONTRACT_VIOLATION',
        'The qualified pg@8.22.0/pg-pool@3.14.0 causal and disposal contract is unavailable.',
      );
    }
    installedDriverVerified = true;
  },

  transactionStatus(client: AdminC2PgClient): AdminC2TransactionStatus {
    const status = internalClient(client).getTransactionStatus();
    return status === 'I' || status === 'T' || status === 'E' ? status : 'UNKNOWN';
  },

  observeReadyForQuery(
    client: AdminC2PgClient,
  ): AdminC2DriverObservation<AdminC2TransactionStatus> {
    const qualifiedClient = internalClient(client);
    let listener: ((...arguments_: unknown[]) => void) | undefined;
    const promise = new Promise<AdminC2TransactionStatus>((resolve) => {
      listener = () => resolve(this.transactionStatus(client));
      qualifiedClient.connection.once('readyForQuery', listener);
    });
    return {
      promise,
      remove: () => {
        if (listener !== undefined) {
          qualifiedClient.connection.removeListener('readyForQuery', listener);
        }
      },
    };
  },

  observeTransportClose(client: AdminC2PgClient): AdminC2DriverObservation<void> {
    const stream = internalClient(client).connection.stream;
    if (stream.closed === true) {
      return { promise: Promise.resolve(), remove: () => undefined };
    }
    let listener: ((...arguments_: unknown[]) => void) | undefined;
    const promise = new Promise<void>((resolve) => {
      listener = () => resolve();
      stream.once('close', listener);
    });
    return {
      promise,
      remove: () => {
        if (listener !== undefined) {
          stream.removeListener('close', listener);
        }
      },
    };
  },

  observeClientError(client: AdminC2PgClient): AdminC2ClientErrorObservation {
    const qualifiedClient = internalClient(client);
    let observedError: unknown;
    let resolveError: ((error: unknown) => void) | undefined;
    const listener = (...arguments_: unknown[]): void => {
      const error = arguments_[0] ?? new Error('Unknown PostgreSQL client transport error.');
      if (observedError === undefined) {
        observedError = error;
        resolveError?.(error);
      }
    };
    const promise = new Promise<unknown>((resolve) => {
      resolveError = resolve;
    });
    qualifiedClient.on('error', listener);
    return {
      promise,
      currentError: () => observedError,
      remove: () => qualifiedClient.removeListener('error', listener),
    };
  },
};

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason: unknown) => ({ status: 'rejected' as const, reason }),
  );
}

function observedRejection<T>(error: unknown): Promise<T> {
  const rejected = Promise.reject<T>(error);
  void rejected.catch(() => undefined);
  return rejected;
}

function startQuery<Row extends QueryResultRow = QueryResultRow>(
  client: AdminC2PgClient,
  text: string,
  values?: readonly unknown[],
): StartedQuery<Row> {
  try {
    return { settled: settle(client.query<Row>(text, values)) };
  } catch (error: unknown) {
    return {
      settled: Promise.resolve({ status: 'rejected', reason: error }),
      synchronousError: error,
    };
  }
}

function remaining(timeSource: AdminC2TimeSource, deadline: number): number {
  return Math.max(0, deadline - timeSource.now());
}

async function beforeDeadline<T>(
  promise: Promise<T>,
  deadline: number,
  timeSource: AdminC2TimeSource,
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  const delayMs = remaining(timeSource, deadline);
  if (delayMs === 0) {
    void settle(promise);
    return { timedOut: true };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = timeSource.setTimer(() => resolve({ timedOut: true }), delayMs);
  });
  const result = await Promise.race([
    promise.then((value) => ({ timedOut: false as const, value })),
    timeout,
  ]);
  if (timer !== undefined) {
    timeSource.clearTimer(timer);
  }
  return result;
}

async function executeControl(
  client: AdminC2PgClient,
  sql: 'BEGIN' | 'ROLLBACK' | 'COMMIT',
  deadline: number,
  timeSource: AdminC2TimeSource,
  driver: AdminC2DriverContract,
  clientFailure: AdminC2ClientErrorObservation,
  trackRaw: <T>(promise: Promise<T>) => Promise<T>,
): Promise<ControlResult> {
  let ready: AdminC2DriverObservation<AdminC2TransactionStatus>;
  try {
    ready = driver.observeReadyForQuery(client);
  } catch (error: unknown) {
    return {
      status: 'UNKNOWN',
      timedOut: false,
      query: { status: 'rejected', reason: error },
      contractError: error,
    };
  }

  const started = startQuery(client, sql);
  const raw = trackRaw(started.settled);
  const causal = raw.then(async (query): Promise<Omit<ControlResult, 'timedOut'>> => {
    if (started.synchronousError !== undefined) {
      return {
        status: driver.transactionStatus(client),
        query,
        contractError: started.synchronousError,
      };
    }
    return Promise.race([
      ready.promise.then((status) => ({ status, query })),
      clientFailure.promise.then((transportError) => ({
        status: 'UNKNOWN' as const,
        query,
        transportError,
      })),
    ]);
  });
  const completion = Promise.race([
    causal,
    clientFailure.promise.then((transportError) => ({
      status: 'UNKNOWN' as const,
      query: { status: 'rejected' as const, reason: transportError },
      transportError,
    })),
  ]);
  const result = await beforeDeadline(completion, deadline, timeSource);
  ready.remove();
  if (result.timedOut) {
    void settle(completion);
    return {
      status: 'UNKNOWN',
      timedOut: true,
      query: { status: 'rejected', reason: new Error(sql + ' acknowledgement timeout') },
    };
  }
  return { ...result.value, timedOut: false };
}

export class AdminC2TransactionService {
  constructor(
    private readonly pool: AdminC2PgPool,
    private readonly driver: AdminC2DriverContract = pg822DriverContract,
    private readonly timeSource: AdminC2TimeSource = systemTimeSource,
    private readonly reportDiagnostic: AdminC2TransactionDiagnosticReporter = systemDiagnosticReporter,
  ) {}

  private report(diagnostic: AdminC2TransactionDiagnostic): void {
    try {
      this.reportDiagnostic(diagnostic);
    } catch {
      // Diagnostics cannot change a confirmed database outcome.
    }
  }

  async transaction<T>(callback: (transaction: AdminC2Transaction) => Promise<T>): Promise<T> {
    const acquisition = settle(this.pool.connect());
    const acquired = await beforeDeadline(
      acquisition,
      this.timeSource.now() + ADMIN_C2_TRANSACTION_BUDGETS.acquireMs,
      this.timeSource,
    );
    if (acquired.timedOut) {
      void acquisition.then((lateResult) => {
        if (lateResult.status === 'fulfilled' && lateResult.value !== undefined) {
          try {
            lateResult.value.release(true);
          } catch (error: unknown) {
            this.report({ phase: 'late-acquisition-disposal', error });
          }
        }
      });
      throw new AdminC2TransactionError(
        'ACQUISITION_TIMEOUT',
        'C2 transaction client acquisition timed out.',
      );
    }
    if (acquired.value.status === 'rejected' || acquired.value.value === undefined) {
      throw new AdminC2TransactionError(
        'ACQUISITION_FAILED',
        'C2 transaction client acquisition failed.',
        acquired.value.reason,
      );
    }

    const client = acquired.value.value;
    try {
      this.driver.assertInstalledDriver();
    } catch (error: unknown) {
      let cleanupError: unknown;
      try {
        client.release(true);
      } catch (releaseError: unknown) {
        cleanupError = releaseError;
      }
      const primary =
        error instanceof AdminC2TransactionError
          ? error
          : new AdminC2TransactionError(
              'DRIVER_CONTRACT_VIOLATION',
              'C2 transaction driver verification failed.',
              error,
            );
      if (cleanupError !== undefined) {
        throw new AdminC2TransactionError(
          'CLEANUP_FAILED',
          'C2 transaction cleanup failed after driver verification.',
          primary,
          undefined,
          cleanupError,
        );
      }
      throw primary;
    }

    let clientFailure: AdminC2ClientErrorObservation;
    try {
      clientFailure = this.driver.observeClientError(client);
    } catch (error: unknown) {
      try {
        client.release(true);
      } catch {
        // The original structural violation remains authoritative here.
      }
      throw new AdminC2TransactionError(
        'DRIVER_CONTRACT_VIOLATION',
        'C2 client error observation is unavailable.',
        error,
      );
    }

    const pendingRaw = new Set<Promise<unknown>>();
    const trackRaw = <Value>(promise: Promise<Value>): Promise<Value> => {
      pendingRaw.add(promise);
      void promise.then(
        () => pendingRaw.delete(promise),
        () => pendingRaw.delete(promise),
      );
      return promise;
    };

    let disposed = false;
    const dispose = async (
      destroy: boolean,
      terminalDeadline?: number,
    ): Promise<unknown | undefined> => {
      if (disposed) {
        return new Error('C2 transaction client disposal was attempted more than once.');
      }
      disposed = true;
      const cleanupErrors: unknown[] = [];
      let closeObservation: AdminC2DriverObservation<void> | undefined;
      if (destroy) {
        try {
          closeObservation = this.driver.observeTransportClose(client);
        } catch (error: unknown) {
          cleanupErrors.push(error);
        }
      }

      let releaseSucceeded = false;
      try {
        client.release(destroy ? true : undefined);
        releaseSucceeded = true;
      } catch (error: unknown) {
        cleanupErrors.push(error);
      }

      if (destroy) {
        if (terminalDeadline === undefined) {
          cleanupErrors.push(new Error('Terminal disposal deadline is missing.'));
        } else if (closeObservation === undefined) {
          cleanupErrors.push(new Error('Transport close observation is unavailable.'));
        } else {
          const terminal = await beforeDeadline(
            Promise.all([closeObservation.promise, ...pendingRaw]),
            terminalDeadline,
            this.timeSource,
          );
          if (terminal.timedOut) {
            cleanupErrors.push(
              new Error('Transport close or raw PostgreSQL operation exceeded terminal grace.'),
            );
          }
        }
        closeObservation?.remove();
      }
      if (releaseSucceeded) {
        clientFailure.remove();
      }
      return cleanupErrors[0];
    };

    const throwFailure = (error: AdminC2TransactionError, cleanupError?: unknown): never => {
      if (cleanupError === undefined) {
        throw error;
      }
      throw new AdminC2TransactionError(
        'CLEANUP_FAILED',
        'C2 transaction cleanup failed.',
        error,
        error.rollbackError,
        cleanupError,
      );
    };

    const fail = async (
      error: AdminC2TransactionError,
      destroy: boolean,
      terminalDeadline?: number,
    ): Promise<never> => {
      const deadline =
        terminalDeadline ??
        (destroy
          ? this.timeSource.now() + ADMIN_C2_TRANSACTION_BUDGETS.terminalGraceMs
          : undefined);
      const cleanupError = await dispose(destroy, deadline);
      return throwFailure(error, cleanupError);
    };

    let entryStatus: AdminC2TransactionStatus;
    try {
      entryStatus = this.driver.transactionStatus(client);
    } catch (error: unknown) {
      return fail(
        new AdminC2TransactionError(
          'DRIVER_CONTRACT_VIOLATION',
          'C2 transaction status is unavailable before BEGIN.',
          error,
        ),
        true,
      );
    }
    if (entryStatus !== 'I') {
      return fail(
        new AdminC2TransactionError(
          'DRIVER_CONTRACT_VIOLATION',
          'C2 transaction client was not idle before BEGIN.',
        ),
        true,
      );
    }

    const begin = await executeControl(
      client,
      'BEGIN',
      this.timeSource.now() + ADMIN_C2_TRANSACTION_BUDGETS.beginMs,
      this.timeSource,
      this.driver,
      clientFailure,
      trackRaw,
    );
    if (begin.contractError !== undefined) {
      return fail(
        new AdminC2TransactionError(
          'DRIVER_CONTRACT_VIOLATION',
          'C2 BEGIN could not use the qualified driver contract.',
          begin.contractError,
        ),
        true,
      );
    }
    if (begin.timedOut) {
      return fail(
        new AdminC2TransactionError('BEGIN_TIMEOUT', 'C2 BEGIN acknowledgement timed out.'),
        true,
      );
    }
    if (
      begin.query.status === 'rejected' ||
      begin.query.value?.command !== 'BEGIN' ||
      begin.status !== 'T' ||
      begin.transportError !== undefined
    ) {
      return fail(
        new AdminC2TransactionError(
          'BEGIN_FAILED',
          'C2 BEGIN was rejected or did not enter a transaction.',
          begin.transportError ?? begin.query.reason,
        ),
        true,
      );
    }

    const abortController = new AbortController();
    const callbackDeadline = this.timeSource.now() + ADMIN_C2_TRANSACTION_BUDGETS.callbackMs;
    const inFlight = new Set<Promise<unknown>>();
    let acceptingQueries = true;
    let queryContractError: unknown;
    let queryTail: Promise<void> = Promise.resolve();

    const transaction: AdminC2Transaction = {
      signal: abortController.signal,
      query: <Row extends QueryResultRow = QueryResultRow>(
        text: string,
        values: readonly unknown[] = [],
      ): Promise<QueryResult<Row>> => {
        if (!acceptingQueries || abortController.signal.aborted) {
          return observedRejection(new Error('C2 transaction callback is closed.'));
        }
        if (containsTransactionControl(text)) {
          const error = new Error(
            'C2 transaction callbacks cannot issue transaction-control commands.',
          );
          queryContractError = error;
          return observedRejection(error);
        }

        const operation = queryTail.then(async (): Promise<QueryResult<Row>> => {
          if (abortController.signal.aborted) {
            throw new Error('C2 transaction query aborted before execution.');
          }
          let ready: AdminC2DriverObservation<AdminC2TransactionStatus>;
          try {
            ready = this.driver.observeReadyForQuery(client);
          } catch (error: unknown) {
            queryContractError = error;
            throw error;
          }
          let rejectAborted: ((error: Error) => void) | undefined;
          const aborted = new Promise<never>((_resolve, reject) => {
            rejectAborted = reject;
          });
          const abortListener = (): void => {
            rejectAborted?.(new Error('C2 transaction query aborted.'));
          };
          abortController.signal.addEventListener('abort', abortListener, { once: true });
          try {
            const started = startQuery<Row>(client, text, values);
            const raw = trackRaw(started.settled);
            const causal = raw.then(async (queryResult): Promise<QueryResult<Row>> => {
              if (started.synchronousError !== undefined) throw started.synchronousError;
              const readyResult = await Promise.race([
                ready.promise.then(() => ({ transportError: undefined })),
                clientFailure.promise.then((transportError) => ({ transportError })),
              ]);
              if (readyResult.transportError !== undefined) throw readyResult.transportError;
              if (queryResult.status === 'rejected') throw queryResult.reason;
              return queryResult.value as QueryResult<Row>;
            });
            return await Promise.race([
              causal,
              clientFailure.promise.then((error) => Promise.reject(error)),
              aborted,
            ]);
          } finally {
            abortController.signal.removeEventListener('abort', abortListener);
            ready.remove();
          }
        });
        queryTail = operation.then(
          () => undefined,
          () => undefined,
        );
        const tracked = operation.finally(() => {
          inFlight.delete(tracked);
        });
        inFlight.add(tracked);
        void settle(tracked);
        return tracked;
      },
    };

    const callbackResultPromise = settle(Promise.resolve().then(() => callback(transaction)));
    const callbackResult = await beforeDeadline(
      callbackResultPromise,
      callbackDeadline,
      this.timeSource,
    );
    acceptingQueries = false;

    const waitForInflight = async (deadline: number): Promise<boolean> => {
      while (inFlight.size > 0) {
        const current = [...inFlight];
        const result = await beforeDeadline(
          Promise.all(current.map(settle)),
          deadline,
          this.timeSource,
        );
        if (result.timedOut) {
          return false;
        }
      }
      return true;
    };

    if (callbackResult.timedOut) {
      abortController.abort();
      const terminalDeadline = this.timeSource.now() + ADMIN_C2_TRANSACTION_BUDGETS.terminalGraceMs;
      const cleanupError = await dispose(true, terminalDeadline);
      await beforeDeadline(callbackResultPromise, terminalDeadline, this.timeSource);
      return throwFailure(
        new AdminC2TransactionError(
          'CALLBACK_TIMEOUT',
          'C2 transaction callback exceeded its monotonic deadline.',
        ),
        cleanupError,
      );
    }

    const callbackSettled = callbackResult.value;
    const quiescent = await waitForInflight(callbackDeadline);
    if (!quiescent) {
      abortController.abort();
      const terminalDeadline = this.timeSource.now() + ADMIN_C2_TRANSACTION_BUDGETS.terminalGraceMs;
      const cleanupError = await dispose(true, terminalDeadline);
      return throwFailure(
        new AdminC2TransactionError(
          'CALLBACK_NOT_QUIESCENT',
          'C2 transaction callback did not become quiescent.',
          callbackSettled.reason,
        ),
        cleanupError,
      );
    }

    let statusAfterCallback: AdminC2TransactionStatus = 'UNKNOWN';
    try {
      statusAfterCallback = this.driver.transactionStatus(client);
    } catch (error: unknown) {
      queryContractError = queryContractError ?? error;
    }
    const observedTransportError = clientFailure.currentError();

    if (queryContractError !== undefined || observedTransportError !== undefined) {
      abortController.abort();
      return fail(
        new AdminC2TransactionError(
          'TRANSACTION_STATE_INVALID',
          'C2 transaction lost its qualified driver or transport state.',
          queryContractError ?? observedTransportError,
        ),
        true,
      );
    }

    if (callbackSettled.status === 'rejected' || statusAfterCallback !== 'T') {
      abortController.abort();
      if (statusAfterCallback !== 'T' && statusAfterCallback !== 'E') {
        return fail(
          new AdminC2TransactionError(
            'TRANSACTION_STATE_INVALID',
            'C2 callback left an unknown transaction state.',
            callbackSettled.reason,
          ),
          true,
        );
      }
      const rollback = await executeControl(
        client,
        'ROLLBACK',
        this.timeSource.now() + ADMIN_C2_TRANSACTION_BUDGETS.rollbackMs,
        this.timeSource,
        this.driver,
        clientFailure,
        trackRaw,
      );
      if (rollback.contractError !== undefined) {
        return fail(
          new AdminC2TransactionError(
            'ROLLBACK_FAILED',
            'C2 ROLLBACK could not use the qualified driver contract.',
            callbackSettled.reason,
            rollback.contractError,
          ),
          true,
        );
      }
      if (rollback.timedOut) {
        return fail(
          new AdminC2TransactionError(
            'ROLLBACK_TIMEOUT',
            'C2 ROLLBACK acknowledgement timed out.',
            callbackSettled.reason,
            rollback.query.reason,
          ),
          true,
        );
      }
      if (
        rollback.query.status === 'rejected' ||
        rollback.query.value?.command !== 'ROLLBACK' ||
        rollback.status !== 'I' ||
        rollback.transportError !== undefined
      ) {
        return fail(
          new AdminC2TransactionError(
            'ROLLBACK_FAILED',
            'C2 ROLLBACK failed or did not return to idle.',
            callbackSettled.reason,
            rollback.transportError ?? rollback.query.reason,
          ),
          true,
        );
      }
      const primary = new AdminC2TransactionError(
        callbackSettled.status === 'rejected' ? 'CALLBACK_FAILED' : 'TRANSACTION_STATE_INVALID',
        'C2 transaction callback failed.',
        callbackSettled.reason,
      );
      return fail(primary, false);
    }

    const commit = await executeControl(
      client,
      'COMMIT',
      this.timeSource.now() + ADMIN_C2_TRANSACTION_BUDGETS.commitAcknowledgementMs,
      this.timeSource,
      this.driver,
      clientFailure,
      trackRaw,
    );
    if (commit.timedOut) {
      return fail(
        new AdminC2TransactionError(
          'COMMIT_UNKNOWN',
          'C2 COMMIT acknowledgement is unknown; no rollback or replay is allowed.',
          commit.query.reason,
        ),
        true,
      );
    }
    if (commit.query.status === 'rejected' && commit.status === 'I') {
      return fail(
        new AdminC2TransactionError(
          'COMMIT_REJECTED',
          'C2 COMMIT was explicitly rejected and returned to idle.',
          commit.query.reason,
        ),
        true,
      );
    }
    if (
      commit.query.status === 'fulfilled' &&
      commit.query.value?.command !== 'COMMIT' &&
      commit.status === 'I'
    ) {
      return fail(
        new AdminC2TransactionError(
          'COMMIT_REJECTED',
          `C2 COMMIT returned ${commit.query.value?.command ?? 'an unknown command'} and did not commit.`,
        ),
        true,
      );
    }
    if (commit.query.status === 'rejected' || commit.transportError !== undefined) {
      return fail(
        new AdminC2TransactionError(
          'COMMIT_UNKNOWN',
          'C2 COMMIT outcome is unknown; no rollback or replay is allowed.',
          commit.transportError ?? commit.query.reason,
        ),
        true,
      );
    }

    if (commit.query.value?.command !== 'COMMIT') {
      return fail(
        new AdminC2TransactionError(
          'COMMIT_UNKNOWN',
          'C2 COMMIT returned an unexpected command without a causal idle state.',
        ),
        true,
      );
    }

    const mustDestroyConfirmedClient = commit.status !== 'I' || commit.contractError !== undefined;
    if (mustDestroyConfirmedClient) {
      this.report({
        phase: 'confirmed-commit-observability',
        error:
          commit.contractError ??
          new Error('COMMIT was fulfilled but the post-COMMIT state was not idle.'),
      });
    }
    const confirmedCleanupError = await dispose(
      mustDestroyConfirmedClient,
      mustDestroyConfirmedClient
        ? this.timeSource.now() + ADMIN_C2_TRANSACTION_BUDGETS.terminalGraceMs
        : undefined,
    );
    if (confirmedCleanupError !== undefined) {
      this.report({
        phase: 'confirmed-commit-disposal',
        error: confirmedCleanupError,
      });
    }
    return callbackSettled.value as T;
  }
}
