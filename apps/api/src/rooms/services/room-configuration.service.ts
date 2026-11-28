import { Injectable, BadRequestException } from '@nestjs/common';
import type { RoomSettingsConfigDto } from '@uth/contracts';

/**
 * Validates and manages room configuration.
 * Configuration is immutable once room status becomes LIVE.
 */
@Injectable()
export class RoomConfigurationService {
  /**
   * Validate room configuration before creation
   */
  validateConfiguration(config: RoomSettingsConfigDto): void {
    // Validate team count: 2-16
    if (config.teamCount < 2 || config.teamCount > 16) {
      throw new BadRequestException('Team count must be between 2 and 16');
    }

    // Validate purse > 0
    if (config.teamPurseMinor <= 0n) {
      throw new BadRequestException('Team purse must be greater than 0');
    }

    // Validate countdown duration if format is LIVE_COUNTDOWN
    if (config.format === 'LIVE_COUNTDOWN') {
      if (config.countdownDurationSeconds < 10 || config.countdownDurationSeconds > 300) {
        throw new BadRequestException('Countdown duration must be between 10 and 300 seconds');
      }
    }

    // Validate turn duration if format is TURN_BASED
    if (config.format === 'TURN_BASED') {
      if (config.turnDurationSeconds < 10 || config.turnDurationSeconds > 600) {
        throw new BadRequestException('Turn duration must be between 10 and 600 seconds');
      }
    }

    // Validate break settings
    if (config.breakAfterBidCount < 0) {
      throw new BadRequestException('Break after bid count cannot be negative');
    }

    if (config.breakDurationSeconds < 0) {
      throw new BadRequestException('Break duration cannot be negative');
    }

    if (config.maxBreakAdjustments < 0) {
      throw new BadRequestException('Max break adjustments cannot be negative');
    }

    // Validate squad size
    if (config.squadSizeMin < 11 || config.squadSizeMax > 50 || config.squadSizeMin > config.squadSizeMax) {
      throw new BadRequestException('Squad size limits must be valid (min >= 11, max <= 50, min <= max)');
    }

    // Validate bid increment brackets are non-empty
    if (!config.bidIncrementBrackets || config.bidIncrementBrackets.length === 0) {
      throw new BadRequestException('At least one bid increment bracket is required');
    }

    // Validate each bracket
    for (const bracket of config.bidIncrementBrackets) {
      if (bracket.fromMinor < 0n || bracket.toMinor < bracket.fromMinor || bracket.incrementMinor <= 0n) {
        throw new BadRequestException('Bid increment brackets must have valid ranges and positive increments');
      }
    }
  }

  /**
   * Create a snapshot of configuration for use during auction.
   * This snapshot is immutable and used to replay/restore auction state.
   */
  createConfigSnapshot(config: RoomSettingsConfigDto): RoomSettingsConfigDto {
    // Deep clone config to ensure immutability
    return JSON.parse(JSON.stringify(config));
  }

  /**
   * Check if configuration can be modified (only before LIVE status)
   */
  canModifyConfiguration(roomStatus: string): boolean {
    return !['LIVE', 'COMPLETED', 'CANCELLED'].includes(roomStatus);
  }
}
