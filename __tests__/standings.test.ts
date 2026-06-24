import {
  computeStandings,
  isMathematicallyEliminated,
  rankGroupTeams,
  computeAllGroupPositions,
  computeThirdPlaceTable,
} from '@/lib/standings';
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

    it('marks all participants as non-eliminated in group stage', () => {
      const standings = computeStandings([]);
      // 4th-place teams are at_risk, others are active — none are eliminated
      expect(standings.every(s => s.status !== 'eliminated')).toBe(true);
      expect(standings.every(s => s.stage === 'GROUP_STAGE')).toBe(true);
    });

    it('groups participants by group-position tier, all within a tier tied with each other', () => {
      const standings = computeStandings([]);
      // 1st-place participants all share the same rank score (14+0=14) → tied with each other
      const firstPlaceStandings = standings.filter(s => s.groupPosition === 1);
      // At least one draw participant is 1st in their group with no matches
      expect(firstPlaceStandings.length).toBeGreaterThan(0);
      expect(firstPlaceStandings.every(s => s.tied)).toBe(true);
      const firstRank = firstPlaceStandings[0].rank;
      expect(firstPlaceStandings.every(s => s.rank === firstRank)).toBe(true);
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

  describe('participant ordering: two criteria applied in sequence', () => {
    // Participants used below (name → team):
    //   Nelson → Argentina (Group J)
    //   Hugo   → Mexico (Group A)
    // Opponents are non-group teams (France, Brazil) so they
    // don't affect other participant standings within those groups.

    describe('criterion 1: most points (within same group position tier)', () => {
      it('ranks 2 wins (6pts) above 2 draws (2pts) when both are 1st in their group', () => {
        const matches: Match[] = [
          // Nelson (Argentina): 2 wins = 6 pts → 1st in Group J
          makeMatch('Argentina', 'France', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          makeMatch('Argentina', 'Brazil', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          // Hugo (Mexico): 2 draws = 2 pts → 1st in Group A
          makeMatch('Mexico', 'France', { score: { winner: 'DRAW', fullTime: { home: 1, away: 1 } } }),
          makeMatch('Mexico', 'Brazil', { score: { winner: 'DRAW', fullTime: { home: 1, away: 1 } } }),
        ];

        const standings = computeStandings(matches);
        const nelson = standings.find(s => s.participant.name === 'Nelson')!; // 6 pts, 1st
        const hugo   = standings.find(s => s.participant.name === 'Hugo')!;   // 2 pts, 1st

        expect(nelson.rank).toBeLessThan(hugo.rank);
      });
    });

    describe('criterion 3: participant name alphabetically (tiebreaker when rank scores equal)', () => {
      it('with equal rank score, lists alphabetically earlier participant name first', () => {
        const matches: Match[] = [
          // Hugo (Mexico, Group A): 2 wins over non-group opponents → 6pts, 1st in Group A
          makeMatch('Mexico',    'France',    { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          makeMatch('Mexico',    'Brazil',    { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          // Nelson (Argentina, Group J): 2 wins over non-group opponents → 6pts, 1st in Group J
          makeMatch('Argentina', 'France',    { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
          makeMatch('Argentina', 'Brazil',    { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        ];

        const standings = computeStandings(matches);
        const hugo   = standings.find(s => s.participant.name === 'Hugo')!;   // Mexico, 6pts, 1st
        const nelson = standings.find(s => s.participant.name === 'Nelson')!; // Argentina, 6pts, 1st

        // Equal rank score (both 1st with 6pts) → same rank, both tied
        expect(hugo.rank).toBe(nelson.rank);
        expect(hugo.tied).toBe(true);
        expect(nelson.tied).toBe(true);
        // 'Hugo' < 'Nelson' alphabetically → Hugo appears first in the list
        expect(standings.indexOf(hugo)).toBeLessThan(standings.indexOf(nelson));
      });
    });
  });

  describe('tie handling', () => {
    it('gives tied participants the same rank number', () => {
      const standings = computeStandings([]);
      // All 1st-place teams share the same rank score → same rank number
      const firstPlaceStandings = standings.filter(s => s.groupPosition === 1);
      const sharedRank = firstPlaceStandings[0].rank;
      expect(firstPlaceStandings.every(s => s.rank === sharedRank)).toBe(true);
    });

    it('marks the rank as tied when multiple participants share it', () => {
      const standings = computeStandings([]);
      // All 1st-place teams are tied with each other
      const firstPlaceStandings = standings.filter(s => s.groupPosition === 1);
      expect(firstPlaceStandings.every(s => s.tied)).toBe(true);
    });
  });

  describe('groupStats', () => {
    it('starts at all-zero before any matches are played', () => {
      const standings = computeStandings([]);
      const nelson = standings.find(s => s.participant.name === 'Nelson')!;
      expect(nelson.groupStats).toEqual({
        won: 0,
        drawn: 0,
        lost: 0,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
      });
    });

    it('accumulates W/D/L and points from finished group matches', () => {
      const matches: Match[] = [
        makeMatch('Argentina', 'France', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('Argentina', 'Brazil', { score: { winner: 'DRAW',      fullTime: { home: 1, away: 1 } } }),
        makeMatch('Spain',  'Argentina', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      const standings = computeStandings(matches);
      const nelson = standings.find(s => s.participant.name === 'Nelson')!; // Argentina
      expect(nelson.groupStats).toEqual({
        won: 1,
        drawn: 1,
        lost: 1,
        points: 4,
        goalsFor: 3,
        goalsAgainst: 2,
        goalDifference: 1,
      });
    });
  });

  describe('eliminatedDate', () => {
    it('is undefined for all active participants', () => {
      const standings = computeStandings([]);
      expect(standings.every(s => s.eliminatedDate === undefined)).toBe(true);
    });

    it('is the date of the 3rd group game for a group-eliminated team', () => {
      const matches: Match[] = [
        makeMatch('Qatar', 'Ecuador', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 2 } }, utcDate: '2026-06-11T16:00:00Z' }),
        makeMatch('Qatar', 'Senegal', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } }, utcDate: '2026-06-15T13:00:00Z' }),
        makeMatch('Qatar', 'Canada',  { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } }, utcDate: '2026-06-18T20:00:00Z' }),
      ];
      const standings = computeStandings(matches);
      const ron = standings.find(s => s.participant.name === 'Ron')!; // Qatar
      expect(ron.status).toBe('eliminated');
      expect(ron.eliminatedDate).toBe('2026-06-18T20:00:00Z');
    });

    it('is the date of the knockout loss for a knockout-eliminated team', () => {
      const matches: Match[] = [
        makeMatch('Argentina', 'Saudi Arabia', {
          stage: 'LAST_32',
          status: 'FINISHED',
          score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } },
          utcDate: '2026-06-24T20:00:00Z',
        }),
      ];
      const standings = computeStandings(matches);
      const nelson = standings.find(s => s.participant.name === 'Nelson')!; // Argentina
      expect(nelson.status).toBe('eliminated');
      expect(nelson.eliminatedDate).toBe('2026-06-24T20:00:00Z');
    });
  });

  describe('rankGroupTeams', () => {
    it('ranks by points descending', () => {
      const matches: Match[] = [
        makeMatch('Argentina', 'Algeria',  { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('Austria',   'Jordan',   { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        makeMatch('Argentina', 'Austria',  { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        makeMatch('Algeria',   'Jordan',   { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      // Argentina: 6pts, Algeria: 3pts, Austria: 3pts, Jordan: 0pts
      const ranked = rankGroupTeams(['Argentina', 'Algeria', 'Austria', 'Jordan'], matches);
      expect(ranked[0]).toBe('Argentina');
      expect(ranked[3]).toBe('Jordan');
    });

    it('uses goal difference as secondary tiebreaker', () => {
      const matches: Match[] = [
        // Algeria: 3pts, GD +2 (won 3-1)
        makeMatch('Algeria', 'Jordan',    { score: { winner: 'HOME_TEAM', fullTime: { home: 3, away: 1 } } }),
        // Austria: 3pts, GD +1 (won 2-1)
        makeMatch('Austria', 'Argentina', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } } }),
      ];
      const ranked = rankGroupTeams(['Algeria', 'Austria', 'Argentina', 'Jordan'], matches);
      // Algeria (3pts, GD+2) above Austria (3pts, GD+1)
      expect(ranked.indexOf('Algeria')).toBeLessThan(ranked.indexOf('Austria'));
    });

    it('uses goals scored as tertiary tiebreaker', () => {
      const matches: Match[] = [
        // Algeria: 3pts, GD +1 (won 2-1)
        makeMatch('Algeria', 'Jordan',    { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } } }),
        // Austria: 3pts, GD +1 (won 3-2) — same GD, more goals
        makeMatch('Austria', 'Argentina', { score: { winner: 'HOME_TEAM', fullTime: { home: 3, away: 2 } } }),
      ];
      const ranked = rankGroupTeams(['Algeria', 'Austria', 'Argentina', 'Jordan'], matches);
      // Austria (3pts, GD+1, GF=3) above Algeria (3pts, GD+1, GF=2)
      expect(ranked.indexOf('Austria')).toBeLessThan(ranked.indexOf('Algeria'));
    });

    it('uses H2H points as quaternary tiebreaker', () => {
      // Algeria and Austria both: 3pts, GD+1, GF=2 from non-H2H matches
      // But Algeria beat Austria H2H → Algeria wins tiebreaker
      const matches: Match[] = [
        makeMatch('Algeria', 'Jordan',    { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } } }),
        makeMatch('Austria', 'Argentina', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } } }),
        makeMatch('Algeria', 'Austria',   { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      const ranked = rankGroupTeams(['Algeria', 'Austria', 'Argentina', 'Jordan'], matches);
      expect(ranked.indexOf('Algeria')).toBeLessThan(ranked.indexOf('Austria'));
    });

    it('falls back to alphabetical when all tiebreakers exhausted', () => {
      // All 4 teams with 0 pts and no matches
      const ranked = rankGroupTeams(['Jordan', 'Austria', 'Algeria', 'Argentina'], []);
      expect(ranked).toEqual(['Algeria', 'Argentina', 'Austria', 'Jordan']);
    });
  });

  describe('isMathematicallyEliminated', () => {
    // Haiti/Scotland scenario: 4th has 0pts, 3rd has 3pts, gap is larger than 3 → eliminated on points gap alone
    it('returns true when 4th cannot catch 3rd on points alone', () => {
      const matches: Match[] = [
        // Scotland (3rd) beat Haiti (4th) — H2H settled
        makeMatch('Scotland', 'Haiti', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        // Scotland also beat someone else → 6pts total
        makeMatch('Scotland', 'Brazil', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      // Haiti: 0pts. Scotland: 6pts. fourthMax=3, thirdMin=6 → 3 < 6 → eliminated
      expect(isMathematicallyEliminated('Haiti', 'Scotland', matches)).toBe(true);
    });

    it('returns true when equal on best-case points and 3rd won H2H', () => {
      const matches: Match[] = [
        // Scotland (3rd) has 3pts, Haiti (4th) has 0pts
        // fourthMax = 0+3 = 3, thirdMin = 3+0 = 3 → equal → check H2H
        makeMatch('Scotland', 'Brazil', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        makeMatch('Scotland', 'Haiti', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      expect(isMathematicallyEliminated('Haiti', 'Scotland', matches)).toBe(true);
    });

    it('returns false when H2H between 3rd and 4th has not been played', () => {
      const matches: Match[] = [
        // Scotland (3rd) has 3pts from a different match, H2H not played yet
        makeMatch('Scotland', 'Brazil', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      // fourthMax=3, thirdMin=3 → equal, but H2H not found → not eliminated
      expect(isMathematicallyEliminated('Haiti', 'Scotland', matches)).toBe(false);
    });

    it('returns false when 4th can overtake 3rd on points alone', () => {
      const matches: Match[] = [
        // Scotland (3rd) has 1pt (drew), Haiti (4th) has 0pts
        // fourthMax = 3, thirdMin = 1 → 3 > 1 → can overtake
        makeMatch('Scotland', 'Brazil', { score: { winner: 'DRAW', fullTime: { home: 1, away: 1 } } }),
      ];
      expect(isMathematicallyEliminated('Haiti', 'Scotland', matches)).toBe(false);
    });

    it('returns false when 4th won the H2H against 3rd', () => {
      const matches: Match[] = [
        // Scotland (3rd, 3pts from other match), Haiti beat Scotland H2H (so Haiti has 3pts too)
        makeMatch('Scotland', 'Brazil', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        makeMatch('Haiti', 'Scotland', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      // fourthMax = 3+3 = 6, thirdMin = 3+0 = 3 → 6 > 3 → can overtake on points
      expect(isMathematicallyEliminated('Haiti', 'Scotland', matches)).toBe(false);
    });
  });

  describe('computeAllGroupPositions', () => {
    it('returns position 1 for a team with most points in their group', () => {
      const matches: Match[] = [
        // Argentina beats Algeria and Austria — 6pts, top of Group J
        makeMatch('Argentina', 'Algeria', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('Argentina', 'Austria', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      const positions = computeAllGroupPositions(matches);
      expect(positions.get('Argentina')?.position).toBe(1);
      expect(positions.get('Argentina')?.groupName).toBe('Group J');
    });

    it('returns position 4 for the team with fewest points in their group', () => {
      const matches: Match[] = [
        makeMatch('Argentina', 'Jordan', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('Algeria',   'Jordan', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        makeMatch('Austria',   'Jordan', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      const positions = computeAllGroupPositions(matches);
      expect(positions.get('Jordan')?.position).toBe(4);
    });

    it('contains an entry for all 48 teams', () => {
      const positions = computeAllGroupPositions([]);
      expect(positions.size).toBe(48);
    });
  });

  describe('computeThirdPlaceTable', () => {
    it('returns 12 teams — one per group', () => {
      const positions = computeAllGroupPositions([]);
      const table = computeThirdPlaceTable(positions, []);
      expect(table).toHaveLength(12);
    });

    it('ranks third-place teams by points descending', () => {
      // Set up matches so England is the 3rd-place team in Group L with 6pts
      // and Algeria is the 3rd-place team in Group J with 3pts
      const matches: Match[] = [
        // Group L: Croatia 1st, Ghana 2nd, England 3rd (6pts from beating Panama twice)
        makeMatch('Croatia',  'Panama',  { score: { winner: 'HOME_TEAM', fullTime: { home: 3, away: 0 } } }),
        makeMatch('Croatia',  'Ghana',   { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('Ghana',    'England', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        makeMatch('England',  'Panama',  { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('England',  'Ghana',   { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 3 } } }),
        // Group J: Argentina 1st, Austria 2nd, Algeria 3rd (3pts)
        makeMatch('Argentina', 'Jordan',  { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('Argentina', 'Algeria', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('Austria',   'Jordan',  { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        makeMatch('Algeria',   'Austria', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } } }),
        makeMatch('Algeria',   'Jordan',  { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      const positions = computeAllGroupPositions(matches);
      const table = computeThirdPlaceTable(positions, matches);
      const englandIndex = table.indexOf('England');
      const algeriaIndex = table.indexOf('Algeria');
      // England (6pts as 3rd) should rank above Algeria (3pts as 3rd)
      expect(englandIndex).toBeLessThan(algeriaIndex);
    });
  });

  describe('group position tiers and at_risk status', () => {
    it('marks a 4th-place team as at_risk (not yet eliminated)', () => {
      // Jordan (TC's team) is 4th in Group J — no H2H loss yet, so not eliminated
      const matches: Match[] = [
        makeMatch('Argentina', 'Jordan', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('Algeria',   'Jordan', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        // No Jordan vs Austria H2H yet
      ];
      const standings = computeStandings(matches);
      const tc = standings.find(s => s.participant.name === 'TC')!; // TC has Jordan
      expect(tc.status).toBe('at_risk');
      expect(tc.groupPosition).toBe(4);
    });

    it('marks a mathematically-eliminated 4th-place team as eliminated', () => {
      // Group C: Brazil, Morocco, Haiti, Scotland
      // Brazil (6pts) beats Scotland and Haiti; Morocco (6pts) beats Scotland and Haiti;
      // Scotland (3pts) beats Haiti → Haiti is 4th (0pts) and Scotland is 3rd (3pts).
      // fourthMax=3, thirdMin=3, H2H: Scotland beat Haiti → Haiti mathematically eliminated.
      const matches: Match[] = [
        makeMatch('Brazil',   'Scotland', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('Brazil',   'Haiti',    { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        makeMatch('Morocco',  'Scotland', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        makeMatch('Morocco',  'Haiti',    { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        makeMatch('Scotland', 'Haiti',    { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      const standings = computeStandings(matches);
      const aubrie = standings.find(s => s.participant.name === 'Aubrie')!; // Aubrie has Haiti
      expect(aubrie.status).toBe('eliminated');
      expect(aubrie.groupPosition).toBe(4);
    });

    it('ranks 1st-place teams above 2nd-place teams with equal points', () => {
      const matches: Match[] = [
        // Nelson (Argentina, Group J) 1st with 3pts
        makeMatch('Argentina', 'Algeria', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        // Nick (England, Group L) 2nd with 3pts — Croatia has more pts
        makeMatch('Croatia',  'Panama',  { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('Croatia',  'Ghana',   { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
        makeMatch('England',  'Panama',  { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      const standings = computeStandings(matches);
      const nelson = standings.find(s => s.participant.name === 'Nelson')!; // Argentina 1st
      const nick   = standings.find(s => s.participant.name === 'Nick')!;   // England 2nd
      expect(nelson.groupPosition).toBe(1);
      expect(nick.groupPosition).toBe(2);
      expect(nelson.rankScore).toBeGreaterThan(nick.rankScore);
    });

    it('marks a team with all 3 group games finished and not in LAST_32 as eliminated', () => {
      // Qatar (Ron's team) — loses all 3 group games, no LAST_32 fixture
      const matches: Match[] = [
        makeMatch('Qatar', 'Canada',    { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } } }),
        makeMatch('Qatar', 'Switzerland', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } } }),
        makeMatch('Qatar', 'Bosnia-Herzegovina', { score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } } }),
      ];
      const standings = computeStandings(matches);
      const ron = standings.find(s => s.participant.name === 'Ron')!;
      expect(ron.status).toBe('eliminated');
      expect(ron.stage).toBe('GROUP_STAGE');
    });
  });
});
