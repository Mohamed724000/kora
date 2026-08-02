import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { HealthService, type ReadinessResult } from './health.service';

interface StatusResponse {
  statusCode: number;
}

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('live')
  liveness(): { status: 'live' } {
    return { status: 'live' };
  }

  @Get('ready')
  async readiness(@Res({ passthrough: true }) response: StatusResponse): Promise<ReadinessResult> {
    const result = await this.health.readiness();
    response.statusCode =
      result.status === 'ready' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return result;
  }
}
