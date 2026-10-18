import { Global, Module } from '@nestjs/common';
import { AbilityFactory } from './ability.factory.js';

/**
 * Toàn cục: AbilityFactory phải resolve được từ MỌI module có route theo server
 * (AbilityGuard là class được @UseGuards tham chiếu, không phải provider cố định
 * của từng module).
 */
@Global()
@Module({
  providers: [AbilityFactory],
  exports: [AbilityFactory],
})
export class AbilityModule {}
