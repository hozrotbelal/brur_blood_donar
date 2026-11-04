import { Body, Controller, Headers, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { Public } from '../../platform/policy/public.decorator';
import { WebLoginDto, WebMfaChallengeDto, WebSignedInDto, WebStaffVerifyDto } from './web-auth.dto';
import { CSRF_HEADER, WebAuthService, WebContext, WebResult } from './web-auth.service';

interface Reply {
  header(name: string, value: string | string[]): unknown;
}

@ApiTags('web-auth')
@ApiExtraModels(WebMfaChallengeDto, WebSignedInDto)
@Controller('web/auth')
export class WebAuthController {
  constructor(private readonly web: WebAuthService) {}

  @Public() @Post('login') @HttpCode(200) @ApiOkResponse({ schema: { oneOf: [{ $ref: getSchemaPath(WebMfaChallengeDto) }, { $ref: getSchemaPath(WebSignedInDto) }] } })
  login(@Body() dto: WebLoginDto, @Headers() h: Record<string, string | undefined>, @Req() req: { ip?: string }, @Res({ passthrough: true }) reply: Reply) {
    return this.send(reply, this.web.login(dto, this.ctx(h, req.ip)));
  }

  @Public() @Post('staff/verify-code') @HttpCode(200) @ApiOkResponse({ type: WebSignedInDto })
  verify(@Body() dto: WebStaffVerifyDto, @Headers() h: Record<string, string | undefined>, @Req() req: { ip?: string }, @Res({ passthrough: true }) reply: Reply) {
    return this.send(reply, this.web.verifyStaff(dto, this.ctx(h, req.ip)));
  }

  @Public() @Post('refresh') @HttpCode(200) @ApiOkResponse({ type: WebSignedInDto })
  refresh(@Headers() h: Record<string, string | undefined>, @Req() req: { ip?: string }, @Res({ passthrough: true }) reply: Reply) {
    return this.send(reply, this.web.refresh(this.ctx(h, req.ip)));
  }

  @Public() @Post('logout') @HttpCode(204)
  async logout(@Headers() h: Record<string, string | undefined>, @Req() req: { ip?: string }, @Res({ passthrough: true }) reply: Reply) {
    await this.send(reply, this.web.logout(this.ctx(h, req.ip)));
  }

  private ctx(h: Record<string, string | undefined>, ip?: string): WebContext {
    return { origin: h.origin, cookieHeader: h.cookie, csrfHeader: h[CSRF_HEADER], userAgent: h['user-agent'], ip };
  }

  private async send<T>(reply: Reply, work: Promise<WebResult<T>>): Promise<T> {
    const result = await work;
    if (result.cookies.length) reply.header('set-cookie', result.cookies);
    return result.body;
  }
}
