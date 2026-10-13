import { Module } from '@nestjs/common';
import { DonorController } from './donor.controller';
import { DonorService } from './donor.service';
import { DonationRecordProjector } from './donation-record.projector';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { LogSmsSender, SmsSender } from './sms.port';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController, DonorController, StaffController],
  providers: [
    PasswordService,
    TokenService,
    AuthService,
    AuthGuard,
    DonorService,
    StaffService,
    DonationRecordProjector,
    StatusHistoryService,
    { provide: SmsSender, useClass: LogSmsSender },
  ],
  exports: [PasswordService, AuthGuard],
})
export class IdentityModule {}
