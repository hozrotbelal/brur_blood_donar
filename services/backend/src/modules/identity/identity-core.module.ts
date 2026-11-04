import { Module } from '@nestjs/common';
import { BearerAuthenticator } from '../../platform/security/bearer-authenticator';
import { TokenService } from '../../platform/security/token.service';
import { AuthService } from './auth.service';
import { AuthSupport } from './auth.support';
import { BearerAuthService } from './bearer-auth.service';
import { PasswordFlowService } from './password-flow.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { LogSmsSender, SmsSender } from './sms.port';

@Module({
  providers: [
    TokenService,
    PasswordService,
    AuthSupport,
    AuthService,
    PasswordFlowService,
    SessionService,
    BearerAuthService,
    { provide: BearerAuthenticator, useExisting: BearerAuthService },
    { provide: SmsSender, useClass: LogSmsSender },
  ],
  exports: [TokenService, PasswordService, AuthSupport, AuthService, PasswordFlowService, SessionService, BearerAuthenticator, SmsSender],
})
export class IdentityCoreModule {}
