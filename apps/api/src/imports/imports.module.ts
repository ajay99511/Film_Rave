import { Module } from '@nestjs/common';
import { MoviesModule } from '../movies/movies.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [MoviesModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
