import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../../platform/policy/public.decorator';
import { Principal } from '../../platform/policy/policy.types';
import { BearerAuthenticator } from '../../platform/security/bearer-authenticator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(BearerAuthenticator) private readonly authenticator: BearerAuthenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; principal?: Principal }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    const principal = token ? await this.authenticator.authenticate(token) : null;
    if (!principal) {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    }
    request.principal = principal;
    return true;
  }
}
