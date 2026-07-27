export class ContractError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "ContractError";
    this.code = code;
  }
}

export function failContract(code: string, message?: string): never {
  throw new ContractError(code, message);
}
