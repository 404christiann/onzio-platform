/** Signals retryable database or RPC failures at registration server boundaries. */
export class RegistrationInfrastructureError extends Error {
  constructor(code: string, cause?: { message?: string } | null) {
    super(cause?.message ?? code);
    this.name = "RegistrationInfrastructureError";
    this.code = code;
  }

  readonly code: string;
}
