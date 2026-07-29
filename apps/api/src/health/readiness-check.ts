export const READINESS_CHECKS = Symbol('READINESS_CHECKS');

export type DependencyName = 'postgresql' | 'redis';

export interface ReadinessCheck {
  readonly name: DependencyName;
  check(): Promise<void>;
}
