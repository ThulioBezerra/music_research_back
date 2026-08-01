import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CreateSessionDto } from '../dto/create-session.dto';
import { CompleteSessionDto } from '../dto/complete-session.dto';
import { SessionService } from '../services/session.service';

@Controller('api/session')
export class SessionController {
  constructor(private readonly svc: SessionService) {}

  @Post('start')
  async start(@Body() body: CreateSessionDto) {
    return this.svc.startSession(body);
  }

  @Get(':id/stimuli')
  async getStimuli(
    @Param('id') id: string,
    @Headers('x-anon-token') anonToken?: string,
  ) {
    try {
      return await this.svc.getSessionStimuli(id, anonToken as any);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        err?.message ?? 'Internal',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('complete')
  async complete(@Body() body: CompleteSessionDto) {
    try {
      return await this.svc.completeSession(
        body.session_id,
        body.exit_ts,
        body.demographics,
      );
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        err?.message ?? 'Internal',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
