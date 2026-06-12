import { computeStandings } from '@/lib/standings';
import type { Match } from '@/lib/types';

function makeMatch(
  homeTeamName: string,
  awayTeamName: string,
  overrides: Partial<Omit<Match, 'homeTeam' | 'awayTeam'>> = {}
): Match {
  return {
    id: Math.random(),
    stage: 'GROUP_STAGE',
    status: 'FINISHED',
    utcDate: '2026-06-12T16:00:00Z',
    homeTeam: { id: 1, name: homeTeamName, shortName: homeTeamName, tla: '', crest: '' },
    awayTeam: { id: 2, name: awayTeamName, shortName: awayTeamName, tla: '', crest: '' },
    score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } },
    ...overrides,
  };
}

describe('computeStandings', () => {
  describe('with no match data', () => {
    it('returns all 29 participants', () => {
      const standings = computeStandings([]);
      expect(standings).toHaveLength(29);
    });

    it('marks all participants as active in group stage', () => {
      const standings = computeStandings([]);
      expect(standings.every(s => s.status === 'active')).toBe(true);
      expect(standings.every(s => s.stage === 'GROUP_STAGE')).toBe(true);
    });

    it('marks all participants as tied at rank 1', () => {
      const standings = computeStandings([]);
      expect(standings.every(s => s.tied)).toBe(true);
      expect(standings.every(s => s.rank === 1)).toBe(true);
    });
  });

  describe('group stage elimination', () => {
    it('marks a team as eliminated after 2 finished group games with no knockout match', () => {
      // Qatar (Ron) — 2 group games all finished, never appears in LAST_32
      const matches: Match[] = [
        makeMatch('Qatar', 'Ecuador', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 2 } } }),
        makeMatch('Qatar', 'Senegal', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } } }),
      ];

      const standings = computeStandings(matches);
      const ron = standings.find(s => s.participant.name === 'Ron')!;

      expect(ron.status).toBe('eliminated');
      expect(ron.stage).toBe('GROUP_STAGE');
    });

    it('ranks group-eliminated participants below active ones', () => {
      const matches: Match[] = [
        makeMatch('Qatar', 'Ecuador', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 2 } } }),
        makeMatch('Qatar', 'Senegal', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } } }),
      ];

      const standings = computeStandings(matches);
      const ron = standings.find(s => s.participant.name === 'Ron')!;
      const john = standings.find(s => s.participant.name === 'John Peden')!; // Senegal, still active

      expect(john.rankScore).toBeGreaterThan(ron.rankScore);
    });
  });

  describe('knockout rounds', () => {
    it('ranks a LAST_32 participant above group stage active participants', () => {
      const matches: Match[] = [
        makeMatch('Argentina', 'Saudi Arabia', { stage: 'LAST_32', status: 'SCHEDULED', score: { winner: null, fullTime: { home: null, away: null } } }),
      ];

      const standings = computeStandings(matches);
      const nelson = standings.find(s => s.participant.name === 'Nelson')!; // Argentina
      const sara = standings.find(s => s.participant.name === 'Sara')!;     // South Korea (group stage)

      expect(nelson.stage).toBe('LAST_32');
      expect(nelson.status).toBe('active');
      expect(nelson.rankScore).toBeGreaterThan(sara.rankScore);
    });

    it('marks a LAST_32 loser as eliminated at LAST_32', () => {
      const matches: Match[] = [
        makeMatch('Argentina', 'Saudi Arabia', {
          stage: 'LAST_32',
          status: 'FINISHED',
          score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } },
        }),
      ];

      const standings = computeStandings(matches);
      const nelson = standings.find(s => s.participant.name === 'Nelson')!;

      expect(nelson.status).toBe('eliminated');
      expect(nelson.stage).toBe('LAST_32');
    });
  });

  describe('final results', () => {
    it('marks the FINAL winner as champion ranked 1st', () => {
      const matches: Match[] = [
        makeMatch('Argentina', 'England', {
          stage: 'FINAL',
          status: 'FINISHED',
          score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } },
        }),
      ];

      const standings = computeStandings(matches);
      const nelson = standings.find(s => s.participant.name === 'Nelson')!; // Argentina
      const nick = standings.find(s => s.participant.name === 'Nick')!;     // England

      expect(nelson.rank).toBe(1);
      expect(nelson.status).toBe('winner');
      expect(nick.rank).toBe(2);
      expect(nick.status).toBe('runner-up');
    });

    it('marks the THIRD_PLACE winner as 3rd', () => {
      const matches: Match[] = [
        makeMatch('Argentina', 'England', {
          stage: 'FINAL',
          status: 'FINISHED',
          score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } },
        }),
        makeMatch('Germany', 'Morocco', {
          stage: 'THIRD_PLACE',
          status: 'FINISHED',
          score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } },
        }),
      ];

      const standings = computeStandings(matches);
      const miles = standings.find(s => s.participant.name === 'Miles')!; // Germany

      expect(miles.rank).toBe(3);
      expect(miles.status).toBe('third');
    });
  });

  describe('tie handling', () => {
    it('gives tied participants the same rank number', () => {
      const standings = computeStandings([]); // all tied
      expect(standings.every(s => s.rank === 1)).toBe(true);
    });

    it('marks the rank as tied when multiple participants share it', () => {
      const standings = computeStandings([]);
      expect(standings.every(s => s.tied)).toBe(true);
    });
  });
});
