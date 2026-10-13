import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Principal } from '../../platform/policy/policy.types';
import { Public } from '../../platform/policy/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto, SetPasswordDto, StaffMfaDto, VerifyOtpDto } from './auth.dto';

interface Req {
  ip?: string;
  principal?: Principal;
}

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('auth/register') @HttpCode(202)
  register(@Body() dto: RegisterDto, @Req() req: Req) {
    return this.auth.register({ ...dto, ip: req.ip });
  }

  @Public() @Post('auth/verify-otp') @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }

  @Public() @Post('auth/set-password') @HttpCode(201)
  setPassword(@Body() dto: SetPasswordDto, @Req() req: Req) {
    return this.auth.setPassword({ ...dto, ip: req.ip });
  }

  @Public() @Post('auth/login') @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Req) {
    return this.auth.login({ ...dto, ip: req.ip });
  }

  @Public() @Post('auth/staff/verify-code') @HttpCode(200)
  staffVerify(@Body() dto: StaffMfaDto, @Req() req: Req) {
    return this.auth.verifyStaffMfa({ ...dto, ip: req.ip });
  }

  @Public() @Post('auth/refresh') @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth() @Post('auth/logout') @HttpCode(204)
  async logout(@Req() req: Req) {
    const p = req.principal!;
    await this.auth.logout(p.sessionId!, p.userId, p.role);
  }

  @ApiBearerAuth() @Get('me')
  me(@Req() req: Req) {
    const p = req.principal!;
    return { userId: p.userId, role: p.role };
  }
}
