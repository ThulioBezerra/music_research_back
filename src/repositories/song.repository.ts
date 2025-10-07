// src/donation/donation.controller.ts
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

@Controller('musics')
export class MusicController {
  constructor() {}

  @Post(':')
  @HttpCode(HttpStatus.CREATED)
  async createMusic(
    @Param('') cnpj: string,
    @Body() musicData: MusicCreateRequestDto,
    @Req() req: Request,
  ) {
    const userId = req.user.id; // Supondo que seu guard de autenticação anexe 'user' ao request
    return this.musicService.create(cnpj, musicData, userId);
  }

  @Get() // Rota: GET /donations
  async getAllMusicsByUserId(@Req() req: Request) {
    const userId = req.user.id;
    return this.musicService.findAllMusicsByUserId(userId);
  }
}
