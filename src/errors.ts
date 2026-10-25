export class PalimError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'PalimError';
  }
}
export function invariant(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new PalimError(code, message);
}
export function publicError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof PalimError) return error;
  return {
    code: 'UNAVAILABLE',
    message: 'The operation could not finish. No delivery outcome is implied.',
    status: 503,
  };
}
