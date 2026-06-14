export type TournamentStage =
  | 'GROUP_STAGE'
  | 'LAST_32'
  | 'LAST_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL';

export type MatchStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'LIVE'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'SUSPENDED'
  | 'POSTPONED'
  | 'CANCELLED';

export interface ApiTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

export interface Match {
  id: number;
  stage: TournamentStage;
  status: MatchStatus;
  utcDate: string;
  homeTeam: ApiTeam;
  awayTeam: ApiTeam;
  score: {
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
    fullTime: { home: number | null; away: number | null };
  };
}

export interface Participant {
  name: string;
  team: string;      // display name shown in UI
  apiName?: string;  // football-data.org team name if it differs from display name
  flag: string;
  avatar: string;
}

export interface GroupStats {
  won: number;
  drawn: number;
  lost: number;
  points: number;
}

export type ParticipantStatus = 'active' | 'eliminated';

export interface ParticipantStanding {
  rank: number;
  tied: boolean;
  participant: Participant;
  stage: TournamentStage;
  status: ParticipantStatus;
  rankScore: number;
  groupStats: GroupStats;
  eliminatedDate?: string;
}
