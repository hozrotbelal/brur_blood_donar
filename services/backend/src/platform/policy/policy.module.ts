import { Global, Module } from '@nestjs/common';
import { PolicyGuard } from './policy.guard';
import { PolicyService } from './policy.service';

@Global()
@Module({ providers: [PolicyService, PolicyGuard], exports: [PolicyService, PolicyGuard] })
export class PolicyModule {}
