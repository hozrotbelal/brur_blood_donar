import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InvalidTransitionError } from '../status/state-machine';

interface Reply {
  status(code: number): Reply;
  send(body: unknown): void;
}

@Catch()
export class ErrorModelFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<Reply>();
    const correlationId = randomUUID();
    if (exception instanceof InvalidTransitionError) {
      return reply.status(422).send({ code: 'INVALID_TRANSITION', correlation_id: correlationId });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const code = typeof body === 'object' && body !== null && 'code' in body ? (body as { code: string }).code : undefined;
      return reply.status(status).send({
        code: code ?? HttpStatus[status] ?? 'ERROR',
        message: typeof body === 'string' ? body : (body as { message?: unknown }).message,
        correlation_id: correlationId,
      });
    }
    new Logger('Errors').error(`${correlationId} ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`);
    return reply.status(500).send({ code: 'INTERNAL_ERROR', correlation_id: correlationId });
  }
}
