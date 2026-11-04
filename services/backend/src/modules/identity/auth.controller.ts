import { eq } from 'drizzle-orm';
import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { Principal, STEP_UP_WINDOW_MS, stepUpIsFresh } from '../../platform/policy/policy.types';
import { Public } from '../../platform/policy/public.decorator';
import { TokenService } from '../../platform/security/token.service';
import { AuthService } from './auth.service';
import { appUser } from './schema';
import { AuthSupport } from './auth.support';
import {
  AcceptedDto, ChangePasswordDto, LoginDto, MeDto, MfaChallengeDto, OtpChallengeDto, PhoneDto, RefreshDto, RegisterDto, ResetOutcomeDto, ResetPasswordDto,
  ResetTokenDto, SetPasswordDto, SetupTokenDto, StaffMfaDto, StepUpDto, StepUpResultDto, TokenPairDto, VerifyOtpDto,
} from './auth.dto';
import { PasswordFlowService } from './password-flow.service';
import { SessionService } from './session.service';

interface Req {
  ip?: string;
  principal?: Principal;
}

@ApiTags('auth')
@ApiExtraModels(SetupTokenDto, ResetTokenDto, TokenPairDto, MfaChallengeDto)
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordFlowService,
    private readonly sessions: SessionService,
    private readonly support: AuthSupport,
    private readonly tokens: TokenService,
  ) {}

  @Public() @Post('auth/register') @HttpCode(202) @ApiResponse({ status: 202, type: OtpChallengeDto })
  register(@Body() dto: RegisterDto, @Req() req: Req) {
    return this.auth.register({ ...dto, ip: req.ip });
  }

  @Public() @Post('auth/login-otp') @HttpCode(202) @ApiResponse({ status: 202, type: AcceptedDto, description: 'Same response whether or not the number is registered' })
  loginOtp(@Body() dto: PhoneDto, @Req() req: Req) {
    return this.auth.loginOtp({ phone: dto.phone, ip: req.ip });
  }

  @Public() @Post('auth/verify-otp') @HttpCode(200)
  @ApiOkResponse({ schema: { oneOf: [{ $ref: getSchemaPath(SetupTokenDto) }, { $ref: getSchemaPath(ResetTokenDto) }, { $ref: getSchemaPath(TokenPairDto) }] } })
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Req) {
    return this.auth.verifyOtp({ ...dto, ip: req.ip });
  }

  @Public() @Post('auth/set-password') @HttpCode(201) @ApiResponse({ status: 201, type: TokenPairDto })
  setPassword(@Body() dto: SetPasswordDto, @Req() req: Req) {
    return this.auth.setPassword({ ...dto, ip: req.ip });
  }

  @Public() @Post('auth/login') @HttpCode(200)
  @ApiOkResponse({ schema: { oneOf: [{ $ref: getSchemaPath(TokenPairDto) }, { $ref: getSchemaPath(MfaChallengeDto) }] } })
  login(@Body() dto: LoginDto, @Req() req: Req) {
    return this.auth.login({ ...dto, ip: req.ip });
  }

  @Public() @Post('auth/staff/verify-code') @HttpCode(200) @ApiOkResponse({ type: TokenPairDto })
  staffVerify(@Body() dto: StaffMfaDto, @Req() req: Req) {
    return this.auth.verifyStaffMfa({ ...dto, ip: req.ip });
  }

  @Public() @Post('auth/refresh') @HttpCode(200) @ApiOkResponse({ type: TokenPairDto })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken, dto.proof);
  }

  @Public() @Post('auth/password/forgot') @HttpCode(202) @ApiResponse({ status: 202, type: AcceptedDto, description: 'Same response whether or not the number is registered' })
  forgotPassword(@Body() dto: PhoneDto, @Req() req: Req) {
    return this.passwords.forgot({ phone: dto.phone, ip: req.ip });
  }

  @Public() @Post('auth/password/reset') @HttpCode(200) @ApiOkResponse({ type: ResetOutcomeDto })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Req) {
    return this.passwords.reset({ ...dto, ip: req.ip });
  }

  @Public() @Get('auth/jwks') @ApiOkResponse({ description: 'Public keys for access-token verification (key rotation with overlapping validity)' })
  jwks() {
    return this.tokens.jwks();
  }

  @ApiBearerAuth() @Post('auth/password/change') @HttpCode(200)
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: Req) {
    return this.passwords.change(req.principal!, dto);
  }

  @ApiBearerAuth() @Post('auth/step-up/challenge') @HttpCode(202) @ApiResponse({ status: 202, type: OtpChallengeDto })
  stepUpChallenge(@Req() req: Req) {
    return this.sessions.stepUpChallenge(req.principal!, req.ip);
  }

  @ApiBearerAuth() @Post('auth/step-up') @HttpCode(200) @ApiOkResponse({ type: StepUpResultDto })
  stepUp(@Body() dto: StepUpDto, @Req() req: Req) {
    return this.sessions.stepUp(req.principal!, dto);
  }

  @ApiBearerAuth() @Post('auth/logout') @HttpCode(204)
  async logout(@Req() req: Req) {
    const p = req.principal!;
    await this.auth.logout(p.sessionId!, p.userId, p.role);
  }

  @ApiBearerAuth() @Get('me') @ApiOkResponse({ type: MeDto })
  async me(@Req() req: Req): Promise<MeDto> {
    const p = req.principal!;
    return {
      userId: p.userId,
      role: p.role,
      roles: await this.support.activeRoles(this.support.database, p.userId),
      displayName: (await this.support.database.orm.select({ name: appUser.displayName }).from(appUser).where(eq(appUser.id, p.userId)))[0]?.name ?? null,
      stepUpValidUntil: stepUpIsFresh(p) && p.stepUpAt ? new Date(p.stepUpAt.getTime() + STEP_UP_WINDOW_MS) : null,
      permissions: p.grants.map((g) => ({ key: g.key, scope: g.scope, requiresStepUp: g.requiresStepUp ?? false })),
    };
  }
}
