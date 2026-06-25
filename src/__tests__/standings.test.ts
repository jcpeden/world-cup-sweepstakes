import { computeStandings } from '@/lib/standings';
import type { Match } from '@/lib/types';

// Builds a finished GROUP_STAGE match between two real API team names
function finishedMatch(id: number, home: string, away: string, homeGoals: number, awayGoals: number): Match {
  const winner =
    homeGoals > awayGoals ? 'HOME_TEAM' : awayGoals > homeGoals ? 'AWAY_TEAM' : 'DRAW';
  return {
    id,
    stage: 'GROUP_STAGE',
    status: 'FINISHED',
    utcDate: '2026-06-20T18:00:00Z',
    homeTeam: { id: id * 10, name: home, shortName: home, tla: home.slice(0, 3).toUpperCase(), crest: '' },
    awayTeam: { id: id * 10 + 1, name: away, shortName: away, tla: away.slice(0, 3).toUpperCase(), crest: '' },
    score: { winner, fullTime: { home: homeGoals, away: awayGoals } },
  };
}

// Group A (from src/data/groups.ts): Mexico, South Africa, South Korea, Czechia
// Results below produce: Mexico 1st (9pts), South Africa 2nd (4pts),
//                        South Korea 3rd (3pts), Czechia 4th (1pt)
const groupAMatches: Match[] = [
  finishedMatch(1, 'Mexico', 'South Africa', 2, 1),   // Mexico wins
  finishedMatch(2, 'Mexico', 'South Korea', 2, 0),    // Mexico wins
  finishedMatch(3, 'Mexico', 'Czechia', 2, 0),        // Mexico wins
  finishedMatch(4, 'South Africa', 'South Korea', 2, 0), // South Africa wins
  finishedMatch(5, 'South Africa', 'Czechia', 1, 1),  // Draw
  finishedMatch(6, 'South Korea', 'Czechia', 1, 0),   // South Korea wins
];

describe('computeStandings – group-stage elimination', () => {
  describe('when a team finishes 2nd in their group with all 3 games played', () => {
    it('marks them as active, not eliminated', () => {
      const standings = computeStandings(groupAMatches);
      // Steven drew South Africa, who finish 2nd in Group A
      const steven = standings.find(s => s.participant.name === 'Steven');
      expect(steven).toBeDefined();
      expect(steven!.status).toBe('active');
    });
  });

  describe('when a team finishes 4th in their group with all 3 games played', () => {
    it('marks them as eliminated', () => {
      const standings = computeStandings(groupAMatches);
      // Nadia drew Czechia, who finish 4th in Group A
      const nadia = standings.find(s => s.participant.name === 'Nadia');
      expect(nadia).toBeDefined();
      expect(nadia!.status).toBe('eliminated');
    });
  });

  describe('when a team finishes 3rd but is leading the third-place table', () => {
    it('marks them as active, not eliminated', () => {
      const standings = computeStandings(groupAMatches);
      // Sara drew South Korea, who finish 3rd in Group A with 3pts —
      // the highest-ranked third-place team since no other groups have played
      const sara = standings.find(s => s.participant.name === 'Sara');
      expect(sara).toBeDefined();
      expect(sara!.status).toBe('active');
    });
  });
});
