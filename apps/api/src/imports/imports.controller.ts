import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ImportResultDto } from '@filmrave/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator.js';
import { ImportsService, type ImportFormat } from './imports.service.js';

class ImportRatingsDto {
  // ~8MB cap; a large personal export is well under this.
  @IsString()
  @MaxLength(8_000_000)
  csv!: string;

  @IsOptional()
  @IsIn(['imdb', 'letterboxd', 'auto'])
  format?: ImportFormat;
}

@UseGuards(JwtAuthGuard)
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('ratings')
  ratings(
    @Body() dto: ImportRatingsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ImportResultDto> {
    return this.imports.importRatings(user.userId, dto.csv, dto.format ?? 'auto');
  }
}
