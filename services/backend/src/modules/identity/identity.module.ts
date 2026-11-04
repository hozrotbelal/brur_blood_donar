import { Module } from '@nestjs/common';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { DonorController } from './donor.controller';
import { DonorService } from './donor.service';
import { DonationRecordProjector } from './donation-record.projector';
import { IdentityCoreModule } from './identity-core.module';
import { SecurityController } from './security.controller';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { WebAuthController } from './web-auth.controller';
import { WebAuthService } from './web-auth.service';

@Module({
  imports: [IdentityCoreModule],
  controllers: [AuthController, SecurityController, WebAuthController, DonorController, StaffController],
  providers: [AuthGuard, DonorService, StaffService, WebAuthService, DonationRecordProjector, StatusHistoryService],
  exports: [IdentityCoreModule, AuthGuard],
})
export class IdentityModule {}
