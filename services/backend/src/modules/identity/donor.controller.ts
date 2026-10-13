import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../platform/policy/policy.guard';
import { Principal } from '../../platform/policy/policy.types';
import { CONSENT_TYPES, NOTIFICATION_CATEGORIES, ProposeLocationDto, SaveAvailabilityDto, SaveConsentDto, SaveDonorProfileDto, SaveNotificationPreferenceDto } from './donor.dto';
import { DonorService } from './donor.service';

interface Req {
  principal: Principal;
}

const toEnum = (values: readonly string[]) => Object.fromEntries(values.map((v) => [v, v]));
const consentType = new ParseEnumPipe(toEnum(CONSENT_TYPES));
const category = new ParseEnumPipe(toEnum(NOTIFICATION_CATEGORIES));

@ApiTags('donor')
@ApiBearerAuth()
@Controller()
export class DonorController {
  constructor(private readonly donors: DonorService) {}

  @Get('profiles/donor') @RequirePermission('donor_profile.view', 'Own')
  profile(@Req() req: Req) {
    return this.donors.getProfile(req.principal);
  }

  @Put('profiles/donor') @RequirePermission('donor_profile.edit', 'Own')
  saveProfile(@Body() dto: SaveDonorProfileDto, @Req() req: Req) {
    return this.donors.saveProfile(req.principal, dto);
  }

  @Get('profiles/donor/availability') @RequirePermission('donor_profile.view', 'Own')
  availability(@Req() req: Req) {
    return this.donors.getAvailability(req.principal);
  }

  @Put('profiles/donor/availability') @RequirePermission('donor_profile.edit', 'Own')
  saveAvailability(@Body() dto: SaveAvailabilityDto, @Req() req: Req) {
    return this.donors.saveAvailability(req.principal, dto);
  }

  @Get('profiles/donor/locations') @RequirePermission('donor_location.manage_own', 'Own')
  locations(@Req() req: Req) {
    return this.donors.listLocations(req.principal);
  }

  @Post('profiles/donor/locations') @HttpCode(201) @RequirePermission('donor_location.manage_own', 'Own')
  proposeLocation(@Body() dto: ProposeLocationDto, @Req() req: Req) {
    return this.donors.proposeLocation(req.principal, dto);
  }

  @Post('profiles/donor/locations/:id/confirm') @HttpCode(200) @RequirePermission('donor_location.manage_own', 'Own')
  confirmLocation(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.donors.confirmLocation(req.principal, id);
  }

  @Get('consents') @RequirePermission('consent.manage_own', 'Own')
  consents(@Req() req: Req) {
    return this.donors.listConsents(req.principal);
  }

  @Put('consents/:type') @RequirePermission('consent.manage_own', 'Own')
  saveConsent(@Param('type', consentType) type: string, @Body() dto: SaveConsentDto, @Req() req: Req) {
    return this.donors.saveConsent(req.principal, type, dto);
  }

  @Get('notification-preferences') @RequirePermission('account.edit', 'Own')
  preferences(@Req() req: Req) {
    return this.donors.listNotificationPreferences(req.principal);
  }

  @Put('notification-preferences/:category') @RequirePermission('account.edit', 'Own')
  savePreference(@Param('category', category) cat: string, @Body() dto: SaveNotificationPreferenceDto, @Req() req: Req) {
    return this.donors.savePreference(req.principal, cat, dto);
  }
}
