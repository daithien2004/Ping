import { Module } from '@nestjs/common';
import { ActivityStatsService } from './activity-stats.service.js';

@Module({ providers: [ActivityStatsService], exports: [ActivityStatsService] })
export class StatsModule {}
