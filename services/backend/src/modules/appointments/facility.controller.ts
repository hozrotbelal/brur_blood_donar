import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FacilityPageDto, FacilityQueryDto } from './facility.dto';
import { FacilityService } from './facility.service';

@ApiTags('reference-data')
@ApiBearerAuth()
@Controller('facilities')
export class FacilityController {
  constructor(private readonly facilities: FacilityService) {}

  @Get() @ApiOkResponse({ type: FacilityPageDto, description: 'Active facilities; any signed-in user' })
  list(@Query() query: FacilityQueryDto) {
    return this.facilities.list(query);
  }
}
