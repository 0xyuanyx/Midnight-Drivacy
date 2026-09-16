/**
 * The common error shape gives later API modules one predictable boundary
 * without prematurely defining the full product error-code catalogue.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  public constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
