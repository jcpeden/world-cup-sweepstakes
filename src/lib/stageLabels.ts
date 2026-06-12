import type { TournamentStage } from './types';

export const STAGE_LABELS: Record<TournamentStage, string> = {
  GROUP_STAGE: 'Group Stage',
  LAST_32: 'Round of 32',
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-Final',
  SEMI_FINALS: 'Semi-Final',
  THIRD_PLACE: '3rd Place Play-off',
  FINAL: 'Final',
};
