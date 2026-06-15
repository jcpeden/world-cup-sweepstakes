import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Participant, ParticipantStanding, Match } from '@/lib/types';
import {
  buildTeamNameMap,
  findEliminations,
  findDerbies,
  findNotableResults,
  findNextFixture,
} from '../scripts/sweepstake-update';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    name: 'Test Person',
    team: 'Test Team',
    flag: '🏳',
    avatar: 'https://example.com/avatar.jpg',
    ...overrides,
  };
}

function makeMatch(
  homeTeamName: string,
  awayTeamName: string,
  overrides: Partial<Omit<Match, 'homeTeam' | 'awayTeam'>> = {}
): Match {
  return {
    id: Math.random(),
    stage: 'GROUP_STAGE',
    status: 'FINISHED',
    utcDate: '2026-06-14T12:00:00Z',
    homeTeam: { id: 1, name: homeTeamName, shortName: homeTeamName, tla: '', crest: '' },
    awayTeam: { id: 2, name: awayTeamName, shortName: awayTeamName, tla: '', crest: '' },
    score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } },
    ...overrides,
  };
}

function makeStanding(
  participant: Participant,
  overrides: Partial<ParticipantStanding> = {}
): ParticipantStanding {
  return {
    rank: 1,
    tied: false,
    participant,
    stage: 'GROUP_STAGE',
    status: 'active',
    rankScore: 10,
    groupStats: { won: 0, drawn: 0, lost: 0, points: 0 },
    ...overrides,
  };
}

// ─── buildTeamNameMap ─────────────────────────────────────────────────────────

describe('buildTeamNameMap', () => {
  it('maps team name to participant', () => {
    const p = makeParticipant({ team: 'Netherlands' });
    const map = buildTeamNameMap([p]);
    expect(map.get('Netherlands')).toBe(p);
  });

  it('prefers apiName over team when apiName is set', () => {
    const p = makeParticipant({ team: 'Bosnia and Herzegovina', apiName: 'Bosnia-Herzegovina' });
    const map = buildTeamNameMap([p]);
    expect(map.get('Bosnia-Herzegovina')).toBe(p);
    expect(map.get('Bosnia and Herzegovina')).toBeUndefined();
  });

  it('builds map for multiple participants', () => {
    const p1 = makeParticipant({ name: 'Patrick', team: 'Netherlands' });
    const p2 = makeParticipant({ name: 'Jill', team: 'Japan' });
    const map = buildTeamNameMap([p1, p2]);
    expect(map.size).toBe(2);
    expect(map.get('Japan')).toBe(p2);
  });
});

// ─── findEliminations ─────────────────────────────────────────────────────────

describe('findEliminations', () => {
  const lastUpdate = '2026-06-13T00:00:00Z';

  it('returns empty array when no eliminations', () => {
    const p = makeParticipant();
    const standings = [makeStanding(p)];
    expect(findEliminations(standings, lastUpdate)).toEqual([]);
  });

  it('includes elimination with eliminatedDate after lastUpdate', () => {
    const p = makeParticipant();
    const s = makeStanding(p, { status: 'eliminated', eliminatedDate: '2026-06-14T12:00:00Z' });
    expect(findEliminations([s], lastUpdate)).toEqual([s]);
  });

  it('excludes elimination with eliminatedDate before or equal to lastUpdate', () => {
    const p = makeParticipant();
    const s = makeStanding(p, { status: 'eliminated', eliminatedDate: '2026-06-12T12:00:00Z' });
    expect(findEliminations([s], lastUpdate)).toEqual([]);
  });

  it('excludes active participants', () => {
    const p = makeParticipant();
    const s = makeStanding(p, { status: 'active', eliminatedDate: '2026-06-14T12:00:00Z' });
    expect(findEliminations([s], lastUpdate)).toEqual([]);
  });
});

// ─── findDerbies ──────────────────────────────────────────────────────────────

describe('findDerbies', () => {
  const lastUpdate = '2026-06-13T00:00:00Z';
  const p1 = makeParticipant({ name: 'Patrick', team: 'Netherlands' });
  const p2 = makeParticipant({ name: 'Jill', team: 'Japan' });
  const map = new Map([['Netherlands', p1], ['Japan', p2]]);

  it('returns derby when both teams are sweepstake teams, FINISHED, after lastUpdate', () => {
    const m = makeMatch('Netherlands', 'Japan', { utcDate: '2026-06-14T12:00:00Z' });
    const result = findDerbies([m], map, lastUpdate);
    expect(result).toHaveLength(1);
    expect(result[0].homeParticipant).toBe(p1);
    expect(result[0].awayParticipant).toBe(p2);
    expect(result[0].match).toBe(m);
  });

  it('excludes match where only one team is a sweepstake team', () => {
    const m = makeMatch('Netherlands', 'France', { utcDate: '2026-06-14T12:00:00Z' });
    expect(findDerbies([m], map, lastUpdate)).toHaveLength(0);
  });

  it('excludes match where neither team is a sweepstake team', () => {
    const m = makeMatch('Brazil', 'France', { utcDate: '2026-06-14T12:00:00Z' });
    expect(findDerbies([m], map, lastUpdate)).toHaveLength(0);
  });

  it('excludes FINISHED derby before or equal to lastUpdate', () => {
    const m = makeMatch('Netherlands', 'Japan', { utcDate: '2026-06-12T12:00:00Z' });
    expect(findDerbies([m], map, lastUpdate)).toHaveLength(0);
  });

  it('excludes non-FINISHED derby after lastUpdate', () => {
    const m = makeMatch('Netherlands', 'Japan', {
      utcDate: '2026-06-14T12:00:00Z',
      status: 'SCHEDULED',
    });
    expect(findDerbies([m], map, lastUpdate)).toHaveLength(0);
  });
});

// ─── findNotableResults ───────────────────────────────────────────────────────

describe('findNotableResults', () => {
  const lastUpdate = '2026-06-13T00:00:00Z';
  const patrick = makeParticipant({ name: 'Patrick', team: 'Netherlands' });
  const map = new Map([['Netherlands', patrick]]);

  it('includes win for a participant team after lastUpdate', () => {
    const m = makeMatch('Netherlands', 'France', {
      utcDate: '2026-06-14T12:00:00Z',
      score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } },
    });
    const result = findNotableResults([m], map, lastUpdate, []);
    expect(result).toHaveLength(1);
    expect(result[0].participant).toBe(patrick);
    expect(result[0].side).toBe('home');
  });

  it('includes win when participant team plays away', () => {
    const m = makeMatch('France', 'Netherlands', {
      utcDate: '2026-06-14T12:00:00Z',
      score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } },
    });
    const result = findNotableResults([m], map, lastUpdate, []);
    expect(result).toHaveLength(1);
    expect(result[0].side).toBe('away');
  });

  it('excludes draws', () => {
    const m = makeMatch('Netherlands', 'France', {
      utcDate: '2026-06-14T12:00:00Z',
      score: { winner: 'DRAW', fullTime: { home: 1, away: 1 } },
    });
    expect(findNotableResults([m], map, lastUpdate, [])).toHaveLength(0);
  });

  it('excludes losses for a participant team', () => {
    const m = makeMatch('Netherlands', 'France', {
      utcDate: '2026-06-14T12:00:00Z',
      score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 1 } },
    });
    expect(findNotableResults([m], map, lastUpdate, [])).toHaveLength(0);
  });

  it('excludes matches before or equal to lastUpdate', () => {
    const m = makeMatch('Netherlands', 'France', { utcDate: '2026-06-12T12:00:00Z' });
    expect(findNotableResults([m], map, lastUpdate, [])).toHaveLength(0);
  });

  it('excludes matches already captured as derbies', () => {
    const jill = makeParticipant({ name: 'Jill', team: 'Japan' });
    const derbyMap = new Map([['Netherlands', patrick], ['Japan', jill]]);
    const m = makeMatch('Netherlands', 'Japan', { utcDate: '2026-06-14T12:00:00Z' });
    const derby = { match: m, homeParticipant: patrick, awayParticipant: jill };
    expect(findNotableResults([m], derbyMap, lastUpdate, [derby])).toHaveLength(0);
  });
});

// ─── findNextFixture ─────────────────────────────────────────────────────────

describe('findNextFixture', () => {
  const patrick = makeParticipant({ name: 'Patrick', team: 'Netherlands' });
  const jill = makeParticipant({ name: 'Jill', team: 'Japan' });
  const map = new Map([['Netherlands', patrick], ['Japan', jill]]);

  it('returns null when no upcoming sweepstake matches', () => {
    expect(findNextFixture([], map)).toBeNull();
  });

  it('returns single-participant fixture when only one team is in the draw', () => {
    const m = makeMatch('Netherlands', 'France', { status: 'SCHEDULED', utcDate: '2026-06-20T12:00:00Z' });
    const result = findNextFixture([m], map);
    expect(result).not.toBeNull();
    expect(result!.isDerby).toBe(false);
    expect(result!.participants).toHaveLength(1);
    expect(result!.participants[0]).toBe(patrick);
  });

  it('returns derby fixture when both teams are in the draw', () => {
    const m = makeMatch('Netherlands', 'Japan', { status: 'SCHEDULED', utcDate: '2026-06-20T12:00:00Z' });
    const result = findNextFixture([m], map);
    expect(result).not.toBeNull();
    expect(result!.isDerby).toBe(true);
    expect(result!.participants).toHaveLength(2);
  });

  it('returns the earliest upcoming fixture', () => {
    const later = makeMatch('Netherlands', 'France', { status: 'SCHEDULED', utcDate: '2026-06-22T12:00:00Z' });
    const sooner = makeMatch('Japan', 'Brazil', { status: 'TIMED', utcDate: '2026-06-20T12:00:00Z' });
    const result = findNextFixture([later, sooner], map);
    expect(result!.match.utcDate).toBe('2026-06-20T12:00:00Z');
  });
});
