import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../../platform/policy/public.decorator';
import { Principal, RoleCode } from '../../platform/policy/policy.types';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; principal?: Principal }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    }
    const claims = this.tokens.verify(token, 'access');
    if (!claims?.sub || !claims.sid || !claims.role || !(await this.auth.sessionIsActive(claims.sid, claims.sub))) {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    }
    request.principal = { userId: claims.sub, role: claims.role as RoleCode, sessionId: claims.sid, grants: await this.auth.loadGrants(claims.sub, claims.role) };
    return true;
  }
}
