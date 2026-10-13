import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PolicyService } from './policy.service';
import { PermissionScope, Principal } from './policy.types';

export const REQUIRE_PERMISSION = 'bbda:require-permission';

export interface RequiredPermission {
  key: string;
  minScope?: PermissionScope;
}

export const RequirePermission = (key: string, minScope?: PermissionScope) =>
  SetMetadata(REQUIRE_PERMISSION, { key, minScope } satisfies RequiredPermission);

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policy: PolicyService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(REQUIRE_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ principal?: Principal }>();
    if (!request.principal) throw new UnauthorizedException();

    const decision = this.policy.decide(request.principal, required.key, { minScope: required.minScope });
    if (!decision.allowed) throw new ForbiddenException({ code: 'FORBIDDEN', permission: required.key });
    return true;
  }
}
