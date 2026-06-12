import { getMatches, getNextSweepstakeMatch } from '@/lib/footballApi';
import type { Match } from '@/lib/types';

const mockMatch: Match = {
  id: 1,
  stage: 'GROUP_STAGE',
  status: 'FINISHED',
  utcDate: '2026-06-12T16:00:00Z',
  homeTeam: { id: 1, name: 'England', shortName: 'ENG', tla: 'ENG', crest: '' },
  awayTeam: { id: 2, name: 'Germany', shortName: 'GER', tla: 'GER', crest: '' },
  score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } },
};

describe('getMatches', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('returns match array from API response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ matches: [mockMatch] }),
    });

    const matches = await getMatches();

    expect(matches).toHaveLength(1);
    expect(matches[0].stage).toBe('GROUP_STAGE');
    expect(matches[0].homeTeam.name).toBe('England');
  });

  it('returns empty array when API call fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const matches = await getMatches();

    expect(matches).toEqual([]);
  });

  it('returns empty array when response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 429 });

    const matches = await getMatches();

    expect(matches).toEqual([]);
  });
});

describe('getNextSweepstakeMatch', () => {
  it('returns the earliest upcoming match involving a sweepstake team', () => {
    const matches: Match[] = [
      { ...mockMatch, id: 1, status: 'FINISHED' },
      {
        ...mockMatch,
        id: 2,
        status: 'SCHEDULED',
        utcDate: '2026-06-15T16:00:00Z',
        homeTeam: { ...mockMatch.homeTeam, name: 'Argentina' },
      },
      {
        ...mockMatch,
        id: 3,
        status: 'SCHEDULED',
        utcDate: '2026-06-14T12:00:00Z',
        homeTeam: { ...mockMatch.homeTeam, name: 'France' },
        awayTeam: { ...mockMatch.awayTeam, name: 'England' },
      },
    ];

    const next = getNextSweepstakeMatch(matches, ['England', 'Argentina']);

    expect(next?.id).toBe(3); // earliest upcoming match with a sweepstake team
  });

  it('returns null when no upcoming sweepstake matches', () => {
    const next = getNextSweepstakeMatch([mockMatch], ['England']);

    expect(next).toBeNull(); // mockMatch is FINISHED
  });
});
