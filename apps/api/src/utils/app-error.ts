import type { ApiErrorCode, ApiErrorDetail } from "@hookrelay/shared";

/** The only error services throw on purpose; the error middleware turns it into the §5 error body. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: ApiErrorDetail[] | undefined;

  constructor(status: number, code: ApiErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
