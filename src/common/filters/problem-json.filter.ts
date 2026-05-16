import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * RFC 7807 problem+json error format.
 * Reference: https://datatracker.ietf.org/doc/html/rfc7807
 *
 * Shape:
 *   {
 *     "type": "https://api.tap-in.click/errors/<slug>",
 *     "title": "Human-readable summary",
 *     "status": 400,
 *     "detail": "Specifics for this occurrence",
 *     "instance": "/v1/auth/login"
 *   }
 */
interface ProblemJson {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  // Allow extension members per RFC 7807 § 3.2
  [key: string]: unknown;
}

@Catch()
export class ProblemJsonFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemJsonFilter.name);
  private readonly baseUri = 'https://api.tap-in.click/errors';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.resolveStatus(exception);
    const { title, detail, extra } = this.resolvePayload(exception, status);

    const problem: ProblemJson = {
      type: `${this.baseUri}/${this.slugify(title)}`,
      title,
      status,
      detail,
      instance: request.originalUrl ?? request.url,
      ...extra,
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${problem.instance} → ${status} ${title}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).type('application/problem+json').json(problem);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolvePayload(
    exception: unknown,
    status: number,
  ): { title: string; detail?: string; extra: Record<string, unknown> } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return { title: this.statusText(status), detail: res, extra: {} };
      }
      const obj = res as Record<string, unknown>;
      const message = obj.message;
      return {
        title: (obj.error as string) ?? this.statusText(status),
        detail: Array.isArray(message) ? message.join('; ') : (message as string | undefined),
        extra: Array.isArray(message) ? { errors: message } : {},
      };
    }

    return {
      title: 'Internal Server Error',
      detail: exception instanceof Error ? exception.message : 'Unknown error',
      extra: {},
    };
  }

  private statusText(status: number): string {
    return (
      {
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        409: 'Conflict',
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
      }[status] ?? 'Error'
    );
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
