import { draw } from '@/data/draw';
import type { Match, ParticipantStanding, ParticipantStatus, TournamentStage } from './types';

// Higher number = better rank
const STAGE_RANK: Record<TournamentStage, number> = {
  GROUP_STAGE: 10,
  LAST_32: 20,
  LAST_16: 30,
  QUARTER_FINALS: 40,
  SEMI_FINALS: 50,
  THIRD_PLACE: 60,
  FINAL: 70,
};

function getRankScore(
  stage: TournamentStage,
  isActive: boolean,
  finalResult: 'won' | 'lost' | 'none'
): number {
  if (stage === 'FINAL') {
    if (finalResult === 'won') return 1000;
    if (finalResult === 'lost') return 900;
    return STAGE_RANK.FINAL + 5;
  }
  if (stage === 'THIRD_PLACE') {
    if (finalResult === 'won') return 800;
    if (finalResult === 'lost') return 700;
    return STAGE_RANK.THIRD_PLACE + 5;
  }
  return isActive ? STAGE_RANK[stage] + 5 : STAGE_RANK[stage];
}

function getKnockoutResult(
  matches: Match[],
  teamName: string,
  stage: TournamentStage
): 'won' | 'lost' | 'none' {
  const match = matches.find(
    m =>
      m.stage === stage &&
      m.status === 'FINISHED' &&
      (m.homeTeam.name === teamName || m.awayTeam.name === teamName)
  );
  if (!match || match.score.winner === null || match.score.winner === 'DRAW') return 'none';
  if (match.homeTeam.name === teamName) {
    return match.score.winner === 'HOME_TEAM' ? 'won' : 'lost';
  }
  return match.score.winner === 'AWAY_TEAM' ? 'won' : 'lost';
}

function getTeamCurrentStage(
  matches: Match[],
  teamName: string
): { stage: TournamentStage; isActive: boolean; finalResult: 'won' | 'lost' | 'none' } {
  const knockoutOrder: TournamentStage[] = [
    'FINAL',
    'THIRD_PLACE',
    'SEMI_FINALS',
    'QUARTER_FINALS',
    'LAST_16',
    'LAST_32',
  ];

  for (const stage of knockoutOrder) {
    const inStage = matches.some(
      m => m.stage === stage && (m.homeTeam.name === teamName || m.awayTeam.name === teamName)
    );
    if (!inStage) continue;

    const result = getKnockoutResult(matches, teamName, stage);

    if (stage === 'FINAL' || stage === 'THIRD_PLACE') {
      return { stage, isActive: result === 'none', finalResult: result };
    }

    // For all other knockout rounds: lost = eliminated, won or unplayed = still active
    if (result === 'lost') {
      return { stage, isActive: false, finalResult: 'none' };
    }
    return { stage, isActive: true, finalResult: 'none' };
  }

  // Still in group stage: active until 3 games are finished and team didn't appear in LAST_32
  const finishedGroupMatches = matches.filter(
    m =>
      m.stage === 'GROUP_STAGE' &&
      m.status === 'FINISHED' &&
      (m.homeTeam.name === teamName || m.awayTeam.name === teamName)
  );

  return {
    stage: 'GROUP_STAGE',
    isActive: finishedGroupMatches.length < 3,
    finalResult: 'none',
  };
}

export function computeStandings(matches: Match[]): ParticipantStanding[] {
  const standings: ParticipantStanding[] = draw.map(participant => {
    const teamName = participant.apiName ?? participant.team;
    const { stage, isActive, finalResult } = getTeamCurrentStage(matches, teamName);
    const rankScore = getRankScore(stage, isActive, finalResult);

    let status: ParticipantStatus;
    if (stage === 'FINAL' && finalResult === 'won') status = 'winner';
    else if (stage === 'FINAL' && finalResult === 'lost') status = 'runner-up';
    else if (stage === 'THIRD_PLACE' && finalResult === 'won') status = 'third';
    else if (isActive) status = 'active';
    else status = 'eliminated';

    return { rank: 0, tied: false, participant, stage, status, rankScore };
  });

  standings.sort((a, b) => b.rankScore - a.rankScore);

  for (let i = 0; i < standings.length; i++) {
    standings[i].rank =
      i === 0 || standings[i].rankScore !== standings[i - 1].rankScore
        ? i + 1
        : standings[i - 1].rank;
  }

  for (const s of standings) {
    s.tied = standings.filter(other => other.rank === s.rank).length > 1;
  }

  return standings;
}
