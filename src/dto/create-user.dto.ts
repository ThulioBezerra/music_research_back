// src/user/dto/create-user.dto.ts
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateUserDto {
  @IsDateString()
  @IsNotEmpty()
  age: Date; // Receberemos como uma string no formato ISO 8601, ex: "1990-10-25"

  @IsString()
  @IsNotEmpty()
  institution: string;

  @IsString()
  @IsNotEmpty()
  locate: string;
}
