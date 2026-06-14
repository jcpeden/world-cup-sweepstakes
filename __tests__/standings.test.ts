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
    it('marks a team as eliminated after 3 finished group games with no knockout match', () => {
      // Qatar (Ron) — 3 group games all finished, never appears in LAST_32
      const matches: Match[] = [
        makeMatch('Qatar', 'Ecuador', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 2 } } }),
        makeMatch('Qatar', 'Senegal', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } } }),
        makeMatch('Qatar', 'Canada', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } } }),
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
        makeMatch('Qatar', 'Canada', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } } }),
      ];

      const standings = computeStandings(matches);
      const ron = standings.find(s => s.participant.name === 'Ron')!;
      const john = standings.find(s => s.participant.name === 'John')!; // Senegal, still active

      expect(john.rankScore).toBeGreaterThan(ron.rankScore);
    });

    it('ranks group stage participants by points — more wins = higher rank', () => {
      const matches: Match[] = [
        makeMatch('Argentina', 'France', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('England', 'Germany', { score: { winner: 'DRAW', fullTime: { home: 1, away: 1 } } }),
      ];

      const standings = computeStandings(matches);
      const nelson = standings.find(s => s.participant.name === 'Nelson')!;  // Argentina 3pts
      const nick   = standings.find(s => s.participant.name === 'Nick')!;    // England 1pt
      const miles  = standings.find(s => s.participant.name === 'Miles')!;   // Germany 1pt
      const aubrie = standings.find(s => s.participant.name === 'Aubrie')!;  // Haiti 0pts

      expect(nelson.rankScore).toBeGreaterThan(nick.rankScore);
      expect(nick.rankScore).toEqual(miles.rankScore); // same points = tied
      expect(nick.rankScore).toBeGreaterThan(aubrie.rankScore);
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
    it('ranks FINAL winner 1st and runner-up 2nd, both eliminated', () => {
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
      expect(nelson.status).toBe('eliminated'); // tournament is over, team is no longer active
      expect(nick.rank).toBe(2);
      expect(nick.status).toBe('eliminated');
    });

    it('ranks THIRD_PLACE winner 3rd, eliminated', () => {
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
      expect(miles.status).toBe('eliminated');
    });
  });

  describe('games played tiebreaker in group stage', () => {
    it('ranks an unplayed team above a 0-pt team that has lost', () => {
      const matches: Match[] = [
        makeMatch('Mexico', 'South Africa', {
          score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } },
        }),
      ];

      const standings = computeStandings(matches);
      const hugo = standings.find(s => s.participant.name === 'Hugo')!;     // Mexico: 3pts, 1 game
      const steven = standings.find(s => s.participant.name === 'Steven')!; // South Africa: 0pts, 1 game
      const unplayed = standings.find(s => s.participant.name === 'Joe')!;  // Iran: 0pts, 0 games

      expect(hugo.rank).toBeLessThan(unplayed.rank);   // Mexico (3pts) above all 0-pt teams
      expect(unplayed.rank).toBeLessThan(steven.rank); // Unplayed above SA (0pts, 1 loss — less potential)
    });

    it('keeps two 0-pt teams tied when both have played the same number of games', () => {
      const matches: Match[] = [
        makeMatch('Mexico', 'South Africa', {
          score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } },
        }),
        makeMatch('South Korea', 'Czechia', {
          score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } },
        }),
      ];

      const standings = computeStandings(matches);
      const steven = standings.find(s => s.participant.name === 'Steven')!; // South Africa: 0pts, 1 game
      const nadia = standings.find(s => s.participant.name === 'Nadia')!;   // Czechia: 0pts, 1 game

      expect(steven.rank).toBe(nadia.rank);
      expect(steven.tied).toBe(true);
      expect(nadia.tied).toBe(true);
    });
  });

  describe('participant ordering: four criteria applied in sequence', () => {
    // Participants used below (name → team):
    //   Nelson → Argentina
    //   Hugo   → Mexico
    //   Joe    → Iran
    //   Nick   → England
    //   Sara   → South Korea
    // Opponents are non-draw teams (France, Brazil, Spain, Portugal) so they
    // don't affect any other participant's standing.

    describe('criterion 1: most points', () => {
      it('ranks 2 wins (6pts) above 2 draws (2pts) when same games played', () => {
        const matches: Match[] = [
          // Nelson (Argentina): 2 wins = 6 pts, 2 games
          makeMatch('Argentina', 'France', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          makeMatch('Argentina', 'Brazil', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          // Hugo (Mexico): 2 draws = 2 pts, 2 games
          makeMatch('Mexico', 'France', { score: { winner: 'DRAW', fullTime: { home: 1, away: 1 } } }),
          makeMatch('Mexico', 'Brazil', { score: { winner: 'DRAW', fullTime: { home: 1, away: 1 } } }),
        ];

        const standings = computeStandings(matches);
        const nelson = standings.find(s => s.participant.name === 'Nelson')!; // 6 pts
        const hugo   = standings.find(s => s.participant.name === 'Hugo')!;   // 2 pts

        expect(nelson.rank).toBeLessThan(hugo.rank);
      });
    });

    describe('criterion 2: most games played (tiebreaker when points equal)', () => {
      it('ranks 2 wins (6pts) above 1 win (3pts)', () => {
        const matches: Match[] = [
          // Nelson (Argentina): 2 wins = 6 pts, 2 games
          makeMatch('Argentina', 'France', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          makeMatch('Argentina', 'Brazil', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          // Hugo (Mexico): 1 win = 3 pts, 1 game
          makeMatch('Mexico', 'France', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        ];

        const standings = computeStandings(matches);
        const nelson = standings.find(s => s.participant.name === 'Nelson')!; // 6 pts, 2 games
        const hugo   = standings.find(s => s.participant.name === 'Hugo')!;   // 3 pts, 1 game

        expect(nelson.rank).toBeLessThan(hugo.rank);
      });

      it('with equal points, ranks fewer games played higher (more games remaining = more potential)', () => {
        const matches: Match[] = [
          // Hugo (Mexico): 1 win + 1 loss = 3 pts, 2 games played (1 game remaining)
          makeMatch('Mexico', 'France', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          makeMatch('Brazil', 'Mexico', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
          // Joe (Iran): 1 win = 3 pts, 1 game played (2 games remaining)
          makeMatch('Iran', 'France', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        ];

        const standings = computeStandings(matches);
        const hugo = standings.find(s => s.participant.name === 'Hugo')!; // 3 pts, 2 games played
        const joe  = standings.find(s => s.participant.name === 'Joe')!;  // 3 pts, 1 game played

        expect(joe.rank).toBeLessThan(hugo.rank); // same pts, fewer games played → ranks higher
      });
    });

    describe('criterion 3: participant name alphabetically (tiebreaker when points and games equal)', () => {
      it('with equal points and games, lists alphabetically earlier name first', () => {
        const matches: Match[] = [
          // Hugo (Mexico): 2 wins → 6 pts, 2 games
          makeMatch('Mexico',      'France',   { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          makeMatch('Mexico',      'Brazil',   { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          // Sara (South Korea): 2 wins → 6 pts, 2 games
          makeMatch('South Korea', 'Spain',    { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          makeMatch('South Korea', 'Portugal', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        ];

        const standings = computeStandings(matches);
        const hugo = standings.find(s => s.participant.name === 'Hugo')!;
        const sara = standings.find(s => s.participant.name === 'Sara')!;

        // Equal points and games → same rank, both tied
        expect(hugo.rank).toBe(sara.rank);
        expect(hugo.tied).toBe(true);
        expect(sara.tied).toBe(true);
        // 'Hugo' < 'Sara' alphabetically → Hugo appears first in the list
        expect(standings.indexOf(hugo)).toBeLessThan(standings.indexOf(sara));
      });
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
