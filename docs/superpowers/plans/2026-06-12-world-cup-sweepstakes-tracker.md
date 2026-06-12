# World Cup 2026 Sweepstakes Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Next.js 15 web app showing live World Cup 2026 sweepstakes standings for 29 participants, pulling match data from football-data.org with 60s ISR caching on Vercel.

**Architecture:** Hardcoded draw data in `src/data/draw.ts` combined with live football-data.org API data, composed server-side in `src/lib/standings.ts` to rank 29 participants. Single ISR page with 60s revalidation — Vercel handles caching, no database needed.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Jest, football-data.org v4 API, Vercel

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/lib/types.ts` | Shared TypeScript types |
| `src/data/draw.ts` | Hardcoded participant → team mapping with avatars |
| `src/lib/footballApi.ts` | Fetches matches from football-data.org |
| `src/lib/standings.ts` | `computeStandings()` — ranks participants from match data |
| `src/components/NextMatch.tsx` | Banner showing next match involving a sweepstake team |
| `src/components/Leaderboard.tsx` | Ranked participant list, split active/eliminated (`'use client'`) |
| `src/app/layout.tsx` | Root layout with metadata |
| `src/app/page.tsx` | ISR page composing all components |
| `__tests__/footballApi.test.ts` | Unit tests for API client |
| `__tests__/standings.test.ts` | Unit tests for `computeStandings()` |

---

### Task 1: Scaffold the project

**Files:**
- Create: full project via `create-next-app`
- Create: `jest.config.ts`
- Create: `.env.local`

- [ ] **Step 1: Scaffold Next.js project**

Run from `/Users/john.peden/Development/world-cup`:

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --eslint
```

If prompted: TypeScript ✓, ESLint ✓, Tailwind ✓, `src/` dir ✓, App Router ✓, import alias `@/*` ✓

- [ ] **Step 2: Install Jest dependencies**

```bash
npm install --save-dev jest jest-environment-node @types/jest ts-jest
```

- [ ] **Step 3: Create `jest.config.ts`**

```typescript
import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
};

export default createJestConfig(config);
```

- [ ] **Step 4: Create `.env.local`**

```bash
echo "FOOTBALL_DATA_API_KEY=your_key_here" > .env.local
```

Get a free API key at https://www.football-data.org/client/register

- [ ] **Step 5: Create `__tests__` directory**

```bash
mkdir __tests__
```

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: Next.js dev server running at http://localhost:3000

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 project with Jest"
```

---

### Task 2: Define shared types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Create `src/lib/types.ts`**

```typescript
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
  avatar: string;
}

export type ParticipantStatus =
  | 'winner'
  | 'runner-up'
  | 'third'
  | 'active'
  | 'eliminated';

export interface ParticipantStanding {
  rank: number;
  tied: boolean;
  participant: Participant;
  stage: TournamentStage;
  status: ParticipantStatus;
  rankScore: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 3: Draw data

**Files:**
- Create: `src/data/draw.ts`

- [ ] **Step 1: Create `src/data/draw.ts`**

```typescript
import type { Participant } from '@/lib/types';

export const draw: Participant[] = [
  { name: 'Sara', team: 'South Korea', apiName: 'Korea Republic', avatar: 'https://avatars.slack-edge.com/2025-03-30/8701535238336_3b4bf759ccfa50cec51e_192.jpg' },
  { name: 'Stuart', team: 'Bosnia and Herzegovina', avatar: 'https://avatars.slack-edge.com/2026-01-21/10321868246167_4f2fd1a5c1a93f3ff7d2_192.jpg' },
  { name: 'Hugo', team: 'Mexico', avatar: 'https://avatars.slack-edge.com/2025-12-03/10048692234388_f83f36f33289ed670835_192.jpg' },
  { name: 'John Peden', team: 'Senegal', avatar: 'https://avatars.slack-edge.com/2026-01-20/10328963602133_d06d5555b0ffbb0ce1fc_192.jpg' },
  { name: 'Patrick', team: 'Netherlands', avatar: 'https://avatars.slack-edge.com/2025-08-05/9294115487959_8d587e94f50c0b8ecc20_192.png' },
  { name: 'TC', team: 'Jordan', avatar: 'https://avatars.slack-edge.com/2021-10-11/2590560350803_f8ae440d4e8243ebde09_192.jpg' },
  { name: 'Joe', team: 'Iran', avatar: 'https://avatars.slack-edge.com/2025-01-06/8237410353383_13c09303a9ad617a5298_192.jpg' },
  { name: 'Flo', team: 'Morocco', avatar: 'https://avatars.slack-edge.com/2025-10-31/9797788987607_a416e9452406e9638df4_192.jpg' },
  { name: 'Uri', team: 'Croatia', avatar: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRoG4JtPgwW0Kw-JfhN_TGt-0tYXOqna3x_EA&s' },
  { name: 'Brett', team: 'Egypt', avatar: 'https://avatars.slack-edge.com/2024-05-21/7149075294085_23f696274841225e96f6_192.jpg' },
  { name: 'Nelson', team: 'Argentina', avatar: 'https://avatars.slack-edge.com/2025-06-23/9077224048711_6ce8830c41c0c79a3e9c_192.jpg' },
  { name: 'Charlie Chrisman', team: 'Norway', avatar: 'https://avatars.slack-edge.com/2025-10-06/9647994990132_67844cfcbb4b8ac75a76_192.jpg' },
  { name: 'Miles', team: 'Germany', avatar: 'https://avatars.slack-edge.com/2021-10-04/2549341469831_c4bcfbfaaa5d5b2bd703_192.jpg' },
  { name: 'Mariano', team: 'Ghana', avatar: 'https://avatars.slack-edge.com/2024-12-02/8134598053280_e5551f17120f75458250_192.jpg' },
  { name: 'Nick', team: 'England', avatar: 'https://avatars.slack-edge.com/2022-08-17/3951325299989_e4f5918de5c3a0b7c2af_192.jpg' },
  { name: 'Matthew', team: 'Panama', avatar: 'https://ca.slack-edge.com/T02917R46-U0A1G5W1YNS-aa46a0cb74ae-512' },
  { name: 'Jill', team: 'Japan', avatar: 'https://avatars.slack-edge.com/2026-03-16/10739437561280_93df339dc6dde5d479c4_192.png' },
  { name: 'Sean', team: 'Sweden', avatar: 'https://avatars.slack-edge.com/2025-08-06/9314111761765_600bffcc995db8849b1d_192.jpg' },
  { name: 'Ron', team: 'Qatar', avatar: 'https://ca.slack-edge.com/T02917R46-U0A6QTXAF2S-9a8bda57b37c-512' },
  { name: 'Aubrie', team: 'Haiti', avatar: 'https://avatars.slack-edge.com/2021-09-20/2508538625013_93cd1c949218b2f59915_192.jpg' },
  { name: 'Amie', team: 'Iraq', avatar: 'https://avatars.slack-edge.com/2021-03-01/1831972940464_fc756527a66293df4f63_192.png' },
  { name: 'Neha', team: 'Saudi Arabia', avatar: 'https://avatars.slack-edge.com/2022-09-21/4118793000740_d8aae37f7c8c53c7915b_192.png' },
  { name: 'Tobi', team: 'Austria', avatar: 'https://avatars.slack-edge.com/2026-01-06/10224457227639_10e4877c93c70e7539d6_192.jpg' },
  { name: 'Nadia', team: 'Czechia', apiName: 'Czech Republic', avatar: 'https://avatars.slack-edge.com/2024-09-04/7676551397378_43271337e04cbe525efa_192.png' },
  { name: 'Lauren', team: 'Canada', avatar: 'https://avatars.slack-edge.com/2026-02-11/10484317293331_4b09801d7bbe9e8c3e86_192.png' },
  { name: 'Zoe', team: 'Türkiye', avatar: 'https://cdn.theorg.com/899daa80-eca2-436e-b434-cfc77f096fe2_medium.jpg' },
  { name: 'Maarten', team: 'Uruguay', avatar: 'https://avatars.slack-edge.com/2023-04-26/5195156399328_126598cd825fe37c6329_192.jpg' },
  { name: 'Charlie Bell', team: 'Ecuador', avatar: 'https://avatars.slack-edge.com/2023-03-13/4963475625344_a2aa617d37e414071998_192.png' },
  { name: 'Steven', team: 'South Africa', avatar: 'https://avatars.slack-edge.com/2025-02-12/8425856187575_b17eca5f8c1e624f806b_192.jpg' },
];
```

> **Important:** `apiName` is used where football-data.org uses a different team name. After getting your API key, verify all names match by running:
> ```bash
> curl -H "X-Auth-Token: $FOOTBALL_DATA_API_KEY" \
>   "https://api.football-data.org/v4/competitions/WC/teams" | jq '.teams[].name'
> ```
> Update `apiName` for any mismatches before deploying.

- [ ] **Step 2: Commit**

```bash
git add src/data/draw.ts
git commit -m "feat: add hardcoded draw data with participant avatars"
```

---

### Task 4: Football API client

**Files:**
- Create: `src/lib/footballApi.ts`
- Create: `__tests__/footballApi.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/footballApi.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/footballApi.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/footballApi'`

- [ ] **Step 3: Create `src/lib/footballApi.ts`**

```typescript
import type { Match } from './types';

const BASE_URL = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';

async function fetchWithAuth(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY ?? '',
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`football-data.org error: ${res.status}`);
  }

  return res.json();
}

export async function getMatches(): Promise<Match[]> {
  try {
    const data = await fetchWithAuth(`/competitions/${COMPETITION}/matches`) as { matches: Match[] };
    return data.matches;
  } catch {
    return [];
  }
}

export function getNextSweepstakeMatch(matches: Match[], teamNames: string[]): Match | null {
  const upcoming = matches.filter(
    m =>
      (m.status === 'SCHEDULED' || m.status === 'TIMED' || m.status === 'LIVE' || m.status === 'IN_PLAY') &&
      (teamNames.includes(m.homeTeam.name) || teamNames.includes(m.awayTeam.name))
  );

  if (upcoming.length === 0) return null;

  return upcoming.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())[0];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/footballApi.test.ts --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/footballApi.ts __tests__/footballApi.test.ts
git commit -m "feat: add football-data.org API client"
```

---

### Task 5: Standings computation (TDD)

**Files:**
- Create: `__tests__/standings.test.ts`
- Create: `src/lib/standings.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/standings.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx jest __tests__/standings.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/standings'`

- [ ] **Step 3: Create `src/lib/standings.ts`**

```typescript
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
  if (!match || match.score.winner === null) return 'none';
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/standings.test.ts --no-coverage
```

Expected: PASS (all 10 tests)

- [ ] **Step 5: Run all tests**

```bash
npx jest --no-coverage
```

Expected: PASS (all tests across both test files)

- [ ] **Step 6: Commit**

```bash
git add src/lib/standings.ts __tests__/standings.test.ts
git commit -m "feat: add computeStandings() with full test coverage"
```

---

### Task 6: NextMatch component

**Files:**
- Create: `src/components/NextMatch.tsx`

- [ ] **Step 1: Create `src/components/NextMatch.tsx`**

```tsx
import type { Match } from '@/lib/types';

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: 'Group Stage',
  LAST_32: 'Round of 32',
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-Final',
  SEMI_FINALS: 'Semi-Final',
  THIRD_PLACE: '3rd Place Play-off',
  FINAL: 'Final',
};

function formatKickoff(utcDate: string): string {
  return new Date(utcDate).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

interface NextMatchProps {
  match: Match | null;
}

export function NextMatch({ match }: NextMatchProps) {
  if (!match) return null;

  const isLive =
    match.status === 'IN_PLAY' || match.status === 'LIVE' || match.status === 'PAUSED';

  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl p-4 mb-6">
      <div className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-80">
        {isLive ? '🔴 Live Now' : 'Next Sweepstake Match'}
      </div>
      <div className="flex items-center justify-center gap-4 text-lg font-bold">
        <span>{match.homeTeam.shortName}</span>
        <span className="opacity-50 text-base font-normal">vs</span>
        <span>{match.awayTeam.shortName}</span>
      </div>
      <div className="text-center text-sm mt-1 opacity-80">
        {STAGE_LABELS[match.stage] ?? match.stage} · {formatKickoff(match.utcDate)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/NextMatch.tsx
git commit -m "feat: add NextMatch banner component"
```

---

### Task 7: Leaderboard component

**Files:**
- Create: `src/components/Leaderboard.tsx`

- [ ] **Step 1: Create `src/components/Leaderboard.tsx`**

```tsx
'use client';

import type { ParticipantStanding } from '@/lib/types';

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: 'Group Stage',
  LAST_32: 'Round of 32',
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-Final',
  SEMI_FINALS: 'Semi-Final',
  THIRD_PLACE: '3rd Place Play-off',
  FINAL: 'Final',
};

function StatusBadge({ standing }: { standing: ParticipantStanding }) {
  if (standing.status === 'winner') {
    return (
      <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full">
        🏆 Champion
      </span>
    );
  }
  if (standing.status === 'runner-up') {
    return (
      <span className="bg-gray-300 text-gray-800 text-xs font-bold px-2 py-0.5 rounded-full">
        🥈 Runner-up
      </span>
    );
  }
  if (standing.status === 'third') {
    return (
      <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
        🥉 3rd Place
      </span>
    );
  }
  if (standing.status === 'active') {
    return (
      <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">
        Active · {STAGE_LABELS[standing.stage]}
      </span>
    );
  }
  return (
    <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
      Out · {STAGE_LABELS[standing.stage]}
    </span>
  );
}

function StandingRow({ standing }: { standing: ParticipantStanding }) {
  const isEliminated = standing.status === 'eliminated';

  return (
    <div
      className={`flex items-center gap-3 py-3 px-4 border-b border-gray-100 last:border-0 ${
        isEliminated ? 'opacity-50' : ''
      }`}
    >
      <span className="text-gray-400 font-mono text-sm w-8 text-right flex-shrink-0">
        {standing.rank}{standing.tied ? '=' : ''}
      </span>
      <img
        src={standing.participant.avatar}
        alt={standing.participant.name}
        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
        onError={e => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 text-sm">{standing.participant.name}</div>
        <div className="text-gray-400 text-xs">{standing.participant.team}</div>
      </div>
      <StatusBadge standing={standing} />
    </div>
  );
}

interface LeaderboardProps {
  standings: ParticipantStanding[];
}

export function Leaderboard({ standings }: LeaderboardProps) {
  const active = standings.filter(s => s.status !== 'eliminated');
  const eliminated = standings.filter(s => s.status === 'eliminated');

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {active.length > 0 && (
        <div>
          <div className="bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 uppercase tracking-wider">
            Still In ({active.length})
          </div>
          {active.map(s => (
            <StandingRow key={s.participant.name} standing={s} />
          ))}
        </div>
      )}
      {eliminated.length > 0 && (
        <div>
          <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-t border-gray-100">
            Eliminated ({eliminated.length})
          </div>
          {eliminated.map(s => (
            <StandingRow key={s.participant.name} standing={s} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Leaderboard.tsx
git commit -m "feat: add Leaderboard component with active/eliminated split"
```

---

### Task 8: Main page and layout

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'World Cup 2026 Sweepstakes',
  description: 'Live sweepstakes standings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-100">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Replace `src/app/page.tsx`**

```tsx
import { getMatches, getNextSweepstakeMatch } from '@/lib/footballApi';
import { computeStandings } from '@/lib/standings';
import { draw } from '@/data/draw';
import { NextMatch } from '@/components/NextMatch';
import { Leaderboard } from '@/components/Leaderboard';

export const revalidate = 60;

export default async function Home() {
  const matches = await getMatches();
  const standings = computeStandings(matches);
  const allApiTeamNames = draw.map(p => p.apiName ?? p.team);
  const nextMatch = getNextSweepstakeMatch(matches, allApiTeamNames);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">World Cup 2026</h1>
        <p className="text-gray-500 mt-1">Sweepstakes · Live Standings</p>
      </header>
      <NextMatch match={nextMatch} />
      <Leaderboard standings={standings} />
      <p className="text-center text-xs text-gray-400 mt-6">
        Updates every 60 seconds · Powered by football-data.org
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Run dev server and verify the page renders**

```bash
npm run dev
```

Open http://localhost:3000. Expected: page renders with leaderboard showing all 29 participants tied at rank 1= in Group Stage. No console errors.

> **Note:** If you have a valid `FOOTBALL_DATA_API_KEY` in `.env.local`, live standings will display. Without a key, the API returns an empty array and everyone shows as active in Group Stage — that is the correct fallback behaviour.

- [ ] **Step 4: Run all tests**

```bash
npx jest --no-coverage
```

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx
git commit -m "feat: add ISR main page composing NextMatch and Leaderboard"
```

---

### Task 9: Deploy to Vercel

**Files:** No code changes.

- [ ] **Step 1: Push to GitHub**

Create a new repo at https://github.com/new, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/world-cup-sweepstakes.git
git push -u origin main
```

- [ ] **Step 2: Create Vercel project**

Go to https://vercel.com/new → import the GitHub repo → accept all defaults → Deploy.

- [ ] **Step 3: Add environment variable**

In the Vercel dashboard → Settings → Environment Variables:

| Name | Value | Environments |
|------|-------|--------------|
| `FOOTBALL_DATA_API_KEY` | (your key from football-data.org) | Production, Preview |

- [ ] **Step 4: Redeploy**

In the Vercel dashboard → Deployments → click the three dots on the latest deployment → Redeploy.

- [ ] **Step 5: Verify team name mapping against live API**

Once the deployment is live, check the standings look sensible. If teams are stuck as "active" when they should be eliminated, their names don't match. Diagnose with:

```bash
curl -H "X-Auth-Token: YOUR_KEY" \
  "https://api.football-data.org/v4/competitions/WC/teams" | jq '.teams[].name'
```

Update `apiName` in `src/data/draw.ts` for any mismatches, commit, and push to redeploy.

- [ ] **Step 6: Share the URL**

Copy the Vercel deployment URL (e.g. `https://world-cup-sweepstakes.vercel.app`) and share with the team.
