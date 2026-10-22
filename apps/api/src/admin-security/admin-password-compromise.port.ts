export const ADMIN_PASSWORD_COMPROMISE_PORT = Symbol('ADMIN_PASSWORD_COMPROMISE_PORT');

export type AdminPasswordCompromiseResult = 'SAFE' | 'COMPROMISED';

export interface AdminPasswordCompromisePort {
  checkPassword(
    passwordUtf8: string,
    options: Readonly<{ signal: AbortSignal; timeoutMs: 3000 }>,
  ): Promise<AdminPasswordCompromiseResult>;
}

export class AdminPasswordCompromiseUnavailableError extends Error {
  constructor() {
    super('Password-compromise capability is unavailable.');
    this.name = 'AdminPasswordCompromiseUnavailableError';
  }
}

export class UnavailableAdminPasswordCompromisePort implements AdminPasswordCompromisePort {
  async checkPassword(): Promise<never> {
    throw new AdminPasswordCompromiseUnavailableError();
  }
}
