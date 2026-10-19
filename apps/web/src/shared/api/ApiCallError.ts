export class ApiCallError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
    public readonly data: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiCallError";
  }
}
