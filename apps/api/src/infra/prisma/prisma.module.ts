import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { ReadDbService } from './read-db.service.js';

@Global()
@Module({
  providers: [PrismaService, ReadDbService],
  exports: [PrismaService, ReadDbService],
})
export class PrismaModule {}
