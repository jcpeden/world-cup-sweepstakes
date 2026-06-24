import { draw } from '@/data/draw';
import { groups } from '@/data/groups';
import type { Match, ParticipantStanding, ParticipantStatus, TournamentStage, GroupStats } from './types';

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
  finalResult: 'won' | 'lost' | 'none',
  groupPoints: number,
  groupPosition: 1 | 2 | 3 | 4 | undefined,
  thirdPlaceRank: number | undefined // 1-indexed (1=best), undefined if not 3rd place
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
  if (stage === 'GROUP_STAGE') {
    if (!isActive) return groupPoints / 10; // eliminated tier: 0.0–0.9
    const pts = groupPoints / 10;
    if (groupPosition === 1) return 14 + pts;
    if (groupPosition === 2) return 10 + pts;
    if (groupPosition === 3) {
      const safe = thirdPlaceRank !== undefined && thirdPlaceRank <= 8;
      return safe ? 7 + pts : 4 + pts;
    }
    // 4th place — at risk (mathematically eliminated 4th are caught by !isActive above)
    return 2 + pts;
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
  return {
    stage: 'GROUP_STAGE',
    isActive: getFinishedGroupMatches(matches, teamName).length < 3,
    finalResult: 'none',
  };
}

function getFinishedGroupMatches(matches: Match[], teamName: string): Match[] {
  return matches.filter(
    m =>
      m.stage === 'GROUP_STAGE' &&
      m.status === 'FINISHED' &&
      (m.homeTeam.name === teamName || m.awayTeam.name === teamName)
  );
}

function accumulateMatchStats(teamName: string, filteredMatches: Match[]): GroupStats {
  return filteredMatches.reduce<GroupStats>(
    (stats, m) => {
      const isHome = m.homeTeam.name === teamName;
      const gf = isHome ? (m.score.fullTime.home ?? 0) : (m.score.fullTime.away ?? 0);
      const ga = isHome ? (m.score.fullTime.away ?? 0) : (m.score.fullTime.home ?? 0);

      if (m.score.winner === 'DRAW') {
        return {
          ...stats,
          drawn: stats.drawn + 1,
          points: stats.points + 1,
          goalsFor: stats.goalsFor + gf,
          goalsAgainst: stats.goalsAgainst + ga,
          goalDifference: stats.goalDifference + (gf - ga),
        };
      }
      if (m.score.winner === null) return stats;

      const won = isHome ? m.score.winner === 'HOME_TEAM' : m.score.winner === 'AWAY_TEAM';
      return won
        ? {
            ...stats,
            won: stats.won + 1,
            points: stats.points + 3,
            goalsFor: stats.goalsFor + gf,
            goalsAgainst: stats.goalsAgainst + ga,
            goalDifference: stats.goalDifference + (gf - ga),
          }
        : {
            ...stats,
            lost: stats.lost + 1,
            goalsFor: stats.goalsFor + gf,
            goalsAgainst: stats.goalsAgainst + ga,
            goalDifference: stats.goalDifference + (gf - ga),
          };
    },
    { won: 0, drawn: 0, lost: 0, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 }
  );
}

function getGroupStats(matches: Match[], teamName: string): GroupStats {
  return accumulateMatchStats(teamName, getFinishedGroupMatches(matches, teamName));
}

export function isMathematicallyEliminated(
  fourthTeamName: string,
  thirdTeamName: string,
  matches: Match[]
): boolean {
  const fourthPts = getGroupStats(matches, fourthTeamName).points;
  const thirdPts = getGroupStats(matches, thirdTeamName).points;

  const fourthMax = fourthPts + 3; // best case: win game 3
  const thirdMin = thirdPts;      // worst case: lose game 3

  if (fourthMax < thirdMin) return true;
  if (fourthMax > thirdMin) return false;

  // Equal: tiebreaker is H2H
  const h2h = matches.find(
    m =>
      m.stage === 'GROUP_STAGE' &&
      m.status === 'FINISHED' &&
      ((m.homeTeam.name === fourthTeamName && m.awayTeam.name === thirdTeamName) ||
       (m.homeTeam.name === thirdTeamName && m.awayTeam.name === fourthTeamName))
  );

  if (!h2h) return false; // H2H not yet played

  if (h2h.score.winner === null || h2h.score.winner === 'DRAW') return false;

  const thirdWon =
    (h2h.homeTeam.name === thirdTeamName && h2h.score.winner === 'HOME_TEAM') ||
    (h2h.awayTeam.name === thirdTeamName && h2h.score.winner === 'AWAY_TEAM');

  return thirdWon;
}

function getH2HStats(teamName: string, opponents: string[], matches: Match[]): GroupStats {
  const h2hMatches = matches.filter(
    m =>
      m.stage === 'GROUP_STAGE' &&
      m.status === 'FINISHED' &&
      ((m.homeTeam.name === teamName && opponents.includes(m.awayTeam.name)) ||
       (m.awayTeam.name === teamName && opponents.includes(m.homeTeam.name)))
  );
  return accumulateMatchStats(teamName, h2hMatches);
}

function compareByStats(sa: GroupStats, sb: GroupStats): number {
  if (sb.points       !== sa.points)       return sb.points       - sa.points;
  if (sb.goalDifference !== sa.goalDifference) return sb.goalDifference - sa.goalDifference;
  if (sb.goalsFor     !== sa.goalsFor)     return sb.goalsFor     - sa.goalsFor;
  return 0;
}

export function rankGroupTeams(groupTeams: string[], matches: Match[]): string[] {
  const stats = new Map(groupTeams.map(t => [t, getGroupStats(matches, t)]));

  // Step 1: Sort by overall criteria (pts → GD → GF → alphabetical fallback)
  const sorted = [...groupTeams].sort((a, b) => {
    const cmp = compareByStats(stats.get(a)!, stats.get(b)!);
    return cmp !== 0 ? cmp : a.localeCompare(b);
  });

  // Step 2: Apply H2H tiebreaker within tied subgroups
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && compareByStats(stats.get(sorted[i])!, stats.get(sorted[j])!) === 0) j++;

    if (j - i > 1) {
      const tiedGroup = sorted.slice(i, j);
      const h2hStats = new Map(
        tiedGroup.map(t => [t, getH2HStats(t, tiedGroup.filter(o => o !== t), matches)])
      );
      tiedGroup.sort((a, b) => {
        const cmp = compareByStats(h2hStats.get(a)!, h2hStats.get(b)!);
        return cmp !== 0 ? cmp : a.localeCompare(b);
      });
      for (let k = 0; k < tiedGroup.length; k++) sorted[i + k] = tiedGroup[k];
    }
    i = j;
  }

  return sorted;
}

export function computeAllGroupPositions(
  matches: Match[]
): Map<string, { position: 1 | 2 | 3 | 4; groupName: string }> {
  const result = new Map<string, { position: 1 | 2 | 3 | 4; groupName: string }>();

  for (const group of groups) {
    const ranked = rankGroupTeams(group.teams, matches);
    ranked.forEach((teamName, index) => {
      result.set(teamName, {
        position: (index + 1) as 1 | 2 | 3 | 4,
        groupName: group.name,
      });
    });
  }

  return result;
}

export function computeThirdPlaceTable(
  allGroupPositions: Map<string, { position: 1 | 2 | 3 | 4; groupName: string }>,
  matches: Match[]
): string[] {
  const thirdPlaceTeams: string[] = [];
  for (const [teamName, { position }] of allGroupPositions) {
    if (position === 3) thirdPlaceTeams.push(teamName);
  }

  const stats = new Map(thirdPlaceTeams.map(t => [t, getGroupStats(matches, t)]));

  return [...thirdPlaceTeams].sort((a, b) => {
    const cmp = compareByStats(stats.get(a)!, stats.get(b)!);
    return cmp !== 0 ? cmp : a.localeCompare(b);
  });
}

function getEliminationDate(
  matches: Match[],
  teamName: string,
  stage: TournamentStage,
  isActive: boolean,
  finalResult: 'won' | 'lost' | 'none'
): string | undefined {
  if (isActive) return undefined;
  if (finalResult === 'won') return undefined; // champion or 3rd-place winner — not eliminated

  if (stage === 'GROUP_STAGE') {
    return getFinishedGroupMatches(matches, teamName)
      .reduce<Match | null>(
        (latest, m) =>
          !latest || new Date(m.utcDate) > new Date(latest.utcDate) ? m : latest,
        null
      )?.utcDate;
  }

  // A team plays at most one match per knockout stage — find() is deterministic here
  return matches.find(
    m =>
      m.stage === stage &&
      m.status === 'FINISHED' &&
      (m.homeTeam.name === teamName || m.awayTeam.name === teamName)
  )?.utcDate;
}

export function computeStandings(matches: Match[]): ParticipantStanding[] {
  const allGroupPositions = computeAllGroupPositions(matches);
  const thirdPlaceTable   = computeThirdPlaceTable(allGroupPositions, matches);

  const standings: ParticipantStanding[] = draw.map(participant => {
    const teamName = participant.apiName ?? participant.team;
    const { stage, isActive: baseIsActive, finalResult } = getTeamCurrentStage(matches, teamName);
    const groupStats    = getGroupStats(matches, teamName);
    const groupPoints   = groupStats.points;
    const groupPos      = allGroupPositions.get(teamName);
    const groupPosition = stage === 'GROUP_STAGE' ? groupPos?.position : undefined;

    // Override isActive for mathematically-eliminated 4th-place teams before game 3
    let isActive = baseIsActive;
    if (stage === 'GROUP_STAGE' && baseIsActive && groupPos?.position === 4) {
      const thirdTeamEntry = [...allGroupPositions.entries()].find(
        ([, p]) => p.groupName === groupPos.groupName && p.position === 3
      );
      if (thirdTeamEntry && isMathematicallyEliminated(teamName, thirdTeamEntry[0], matches)) {
        isActive = false;
      }
    }

    // Compute third-place rank (1-indexed, 1=best) for use in getRankScore
    const thirdPlaceRank =
      groupPosition === 3
        ? thirdPlaceTable.indexOf(teamName) + 1 // indexOf returns -1 if missing → +1 = 0 (safe fallback)
        : undefined;

    const rankScore = getRankScore(stage, isActive, finalResult, groupPoints, groupPosition, thirdPlaceRank);

    // Derive status
    let status: ParticipantStatus;
    if (stage !== 'GROUP_STAGE') {
      status = isActive ? 'active' : 'eliminated';
    } else if (!isActive) {
      status = 'eliminated';
    } else if (groupPosition === 4) {
      status = 'at_risk';
    } else if (groupPosition === 3) {
      status = thirdPlaceRank !== undefined && thirdPlaceRank <= 8 ? 'active' : 'at_risk';
    } else {
      status = 'active';
    }

    const eliminatedDate = getEliminationDate(matches, teamName, stage, isActive, finalResult);

    return { rank: 0, tied: false, participant, stage, status, rankScore, groupStats, groupPosition, eliminatedDate };
  });

  standings.sort((a, b) => {
    const scoreDiff = b.rankScore - a.rankScore;
    if (scoreDiff !== 0) return scoreDiff;
    return a.participant.name.localeCompare(b.participant.name);
  });

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
