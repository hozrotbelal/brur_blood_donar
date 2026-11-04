import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AreaPageDto, AreaQueryDto } from './area.dto';
import { AreaService } from './area.service';

@ApiTags('reference-data')
@ApiBearerAuth()
@Controller('areas')
export class AreaController {
  constructor(private readonly areas: AreaService) {}

  @Get() @ApiOkResponse({ type: AreaPageDto, description: 'Active areas; any signed-in user' })
  list(@Query() query: AreaQueryDto) {
    return this.areas.list(query);
  }
}
