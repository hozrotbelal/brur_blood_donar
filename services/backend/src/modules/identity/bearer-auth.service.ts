import { Inject, Injectable } from '@nestjs/common';
import { Principal, RoleCode } from '../../platform/policy/policy.types';
import { BearerAuthenticator } from '../../platform/security/bearer-authenticator';
import { TokenService } from '../../platform/security/token.service';
import { AuthService } from './auth.service';

@Injectable()
export class BearerAuthService extends BearerAuthenticator {
  constructor(
    private readonly tokens: TokenService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {
    super();
  }

  async authenticate(token: string): Promise<Principal | null> {
    const claims = this.tokens.verify(token, 'access');
    if (!claims?.sub || !claims.sid || !claims.role) return null;
    const session = await this.auth.resolveSession(claims.sid, claims.sub, claims.role);
    if (!session) return null;
    return {
      userId: claims.sub,
      role: claims.role as RoleCode,
      sessionId: claims.sid,
      stepUpAt: session.stepUpAt,
      grants: await this.auth.loadGrants(claims.sub, claims.role),
    };
  }
}
