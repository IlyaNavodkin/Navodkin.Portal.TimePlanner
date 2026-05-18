import { migrationService } from "../services/MigrationService.js";

export class MigrationUseCase {
  async up(target: string): Promise<{ applied: string[] }> {
    const applied = await migrationService.up(target);
    return { applied };
  }

  async down(target: string): Promise<{ reverted: string[] }> {
    const reverted = await migrationService.down(target);
    return { reverted };
  }

  async status() {
    return migrationService.getStatus();
  }
}

export const migrationUseCase = new MigrationUseCase();
