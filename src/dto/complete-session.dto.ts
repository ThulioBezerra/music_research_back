import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';

export class CompleteSessionDto {
  @IsString()
  session_id!: string;

  @IsOptional()
  @IsNumber()
  exit_ts?: number; // epoch ms

  @IsOptional()
  @IsObject()
  demographics?: Record<string, unknown>;
}
