/** A failed API call with the API's own error code, plain reason and full body (e.g. a cart check). */
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
