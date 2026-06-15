# sweepstake-update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an `npm run sweepstake-update` CLI script that reads live WC 2026 data, detects changes since the last run, generates a Slack-ready message copied to clipboard, and prints an operational next-update block to terminal.

**Architecture:** A single TypeScript script at `scripts/sweepstake-update.ts` exports pure helper functions (testable in isolation) and a `main()` orchestrator guarded by `require.main === module`. The script reuses `src/lib/footballApi.ts`, `src/lib/standings.ts`, and `src/data/draw.ts` via relative imports to avoid ts-node path alias resolution issues.

**Tech Stack:** ts-node (CommonJS mode), dotenv, Node.js `fs`/`child_process`, Jest + ts-jest for tests.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `scripts/sweepstake-update.ts` | All helper functions + main orchestrator |
| Create | `tsconfig.scripts.json` | CommonJS override for ts-node |
| Create | `__tests__/sweepstake-update.test.ts` | Unit tests for all exported functions |
| Modify | `package.json` | Add `sweepstake-update` script + ts-node/dotenv deps |
| Modify | `.gitignore` | Ignore `scripts/last-update.json` |

---

## Task 1: Scaffolding

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `tsconfig.scripts.json`

- [ ] **Step 1: Install ts-node and dotenv**

```bash
npm install --save-dev ts-node dotenv @types/dotenv
```

Note: `@types/dotenv` may not be needed (dotenv ships its own types from v16+), but install it to be safe. If npm warns it doesn't exist, skip it — dotenv 16+ includes types.

Expected output: `added N packages` with no errors.

- [ ] **Step 2: Add npm script to package.json**

In `package.json`, add to the `"scripts"` object:

```json
"sweepstake-update": "ts-node --project tsconfig.scripts.json scripts/sweepstake-update.ts"
```

Full scripts block after edit:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "sweepstake-update": "ts-node --project tsconfig.scripts.json scripts/sweepstake-update.ts"
}
```

- [ ] **Step 3: Create tsconfig.scripts.json**

Create `tsconfig.scripts.json` at the project root:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node"
  }
}
```

This overrides the root's `"module": "esnext"` and `"moduleResolution": "bundler"` — both are Next.js-specific and incompatible with ts-node. `"paths"` from the root tsconfig is inherited but the script uses relative imports instead.

- [ ] **Step 4: Add state file to .gitignore**

Add to `.gitignore` (after the existing `*.tsbuildinfo` line):

```
# sweepstake-update local state
scripts/last-update.json
```

- [ ] **Step 5: Create the scripts directory**

```bash
mkdir -p scripts
```

- [ ] **Step 6: Commit scaffolding**

```bash
git add tsconfig.scripts.json .gitignore package.json package-lock.json
git commit -m "chore: scaffold sweepstake-update script — add ts-node, dotenv, tsconfig.scripts.json"
```

---

## Task 2: Core Helper Functions (TDD)

**Files:**
- Create: `scripts/sweepstake-update.ts` (initial structure + core helpers)
- Create: `__tests__/sweepstake-update.test.ts`

- [ ] **Step 1: Create the test file with helpers and first failing tests**

Create `__tests__/sweepstake-update.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test file to confirm it fails with "cannot find module"**

```bash
npx jest __tests__/sweepstake-update.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../scripts/sweepstake-update'`

- [ ] **Step 3: Create scripts/sweepstake-update.ts with core helpers**

Create `scripts/sweepstake-update.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';

import { getMatches, getNextSweepstakeMatch } from '../src/lib/footballApi';
import { computeStandings } from '../src/lib/standings';
import { draw } from '../src/data/draw';
import type { Participant, ParticipantStanding, Match, GroupStats } from '../src/lib/types';

const APP_URL = 'https://world-cup-sweepstakes-rose.vercel.app/';
const LAST_UPDATE_PATH = path.join(__dirname, 'last-update.json');

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DerbyResult {
  match: Match;
  homeParticipant: Participant;
  awayParticipant: Participant;
}

export interface NotableResult {
  match: Match;
  participant: Participant;
  side: 'home' | 'away';
}

export interface NextFixture {
  match: Match;
  isDerby: boolean;
  participants: Participant[];
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

export function buildTeamNameMap(participants: Participant[]): Map<string, Participant> {
  const map = new Map<string, Participant>();
  for (const p of participants) {
    map.set(p.apiName ?? p.team, p);
  }
  return map;
}

export function findEliminations(
  standings: ParticipantStanding[],
  lastUpdate: string
): ParticipantStanding[] {
  return standings.filter(
    s => s.status === 'eliminated' && s.eliminatedDate != null && s.eliminatedDate > lastUpdate
  );
}

export function findDerbies(
  matches: Match[],
  teamNameMap: Map<string, Participant>,
  lastUpdate: string
): DerbyResult[] {
  return matches
    .filter(m => m.status === 'FINISHED' && m.utcDate > lastUpdate)
    .flatMap(m => {
      const home = teamNameMap.get(m.homeTeam.name);
      const away = teamNameMap.get(m.awayTeam.name);
      if (home && away) {
        return [{ match: m, homeParticipant: home, awayParticipant: away }];
      }
      return [];
    });
}

export function findNotableResults(
  matches: Match[],
  teamNameMap: Map<string, Participant>,
  lastUpdate: string,
  derbies: DerbyResult[]
): NotableResult[] {
  const derbyMatchIds = new Set(derbies.map(d => d.match.id));
  return matches
    .filter(
      m =>
        m.status === 'FINISHED' &&
        m.utcDate > lastUpdate &&
        !derbyMatchIds.has(m.id) &&
        m.score.winner !== 'DRAW' &&
        m.score.winner !== null
    )
    .flatMap(m => {
      const home = teamNameMap.get(m.homeTeam.name);
      const away = teamNameMap.get(m.awayTeam.name);
      if (m.score.winner === 'HOME_TEAM' && home) {
        return [{ match: m, participant: home, side: 'home' as const }];
      }
      if (m.score.winner === 'AWAY_TEAM' && away) {
        return [{ match: m, participant: away, side: 'away' as const }];
      }
      return [];
    });
}

export function findNextFixture(
  matches: Match[],
  teamNameMap: Map<string, Participant>
): NextFixture | null {
  const teamNames = Array.from(teamNameMap.keys());
  const match = getNextSweepstakeMatch(matches, teamNames);
  if (!match) return null;
  const home = teamNameMap.get(match.homeTeam.name);
  const away = teamNameMap.get(match.awayTeam.name);
  const participants = [home, away].filter((p): p is Participant => p != null);
  const isDerby = home != null && away != null;
  return { match, isDerby, participants };
}
```

(Leave the rest of the file for Task 3 and 4 — add it incrementally.)

- [ ] **Step 4: Run tests — verify core helpers pass**

```bash
npx jest __tests__/sweepstake-update.test.ts --no-coverage
```

Expected: All `buildTeamNameMap`, `findEliminations`, `findDerbies`, `findNotableResults`, `findNextFixture` tests PASS. Count: 17 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/sweepstake-update.ts __tests__/sweepstake-update.test.ts
git commit -m "feat: add core helper functions for sweepstake-update with tests"
```

---

## Task 3: Message Formatters (TDD)

**Files:**
- Modify: `scripts/sweepstake-update.ts` (append formatter functions)
- Modify: `__tests__/sweepstake-update.test.ts` (append formatter tests)

- [ ] **Step 1: Add formatter tests to the test file**

Append to `__tests__/sweepstake-update.test.ts` (after the `findNextFixture` describe block):

```typescript
import {
  buildTeamNameMap,
  findEliminations,
  findDerbies,
  findNotableResults,
  findNextFixture,
  formatSlackMessage,
  formatNextUpdateBlock,
} from '../scripts/sweepstake-update';
```

Replace the existing import at the top of the file with the above (adds `formatSlackMessage` and `formatNextUpdateBlock`).

Then append these describe blocks:

```typescript
// ─── formatSlackMessage ───────────────────────────────────────────────────────

describe('formatSlackMessage', () => {
  it('produces a "no changes" message when all arrays are empty', () => {
    const msg = formatSlackMessage([], [], [], 29);
    expect(msg).toContain('No changes since last update');
    expect(msg).toContain('29/29 still alive');
  });

  it('always includes the still-alive count and app URL', () => {
    const msg = formatSlackMessage([], [], [], 27);
    expect(msg).toContain('Still alive: 27/29');
    expect(msg).toContain('https://world-cup-sweepstakes-rose.vercel.app/');
  });

  it('includes an elimination line per eliminated participant', () => {
    const p = makeParticipant({ name: 'Stuart', team: 'Bosnia and Herzegovina', flag: '🇧🇦' });
    const s = makeStanding(p, {
      status: 'eliminated',
      eliminatedDate: '2026-06-14T12:00:00Z',
      groupStats: { won: 0, drawn: 1, lost: 2, points: 1 },
    });
    const msg = formatSlackMessage([s], [], [], 28);
    expect(msg).toContain("Stuart's");
    expect(msg).toContain('Bosnia and Herzegovina');
    expect(msg).toContain('🇧🇦');
  });

  it('includes a derby line with ⚔️', () => {
    const p1 = makeParticipant({ name: 'Patrick', team: 'Netherlands' });
    const p2 = makeParticipant({ name: 'Jill', team: 'Japan' });
    const m = makeMatch('Netherlands', 'Japan', {
      score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } },
    });
    const derby = { match: m, homeParticipant: p1, awayParticipant: p2 };
    const msg = formatSlackMessage([], [derby], [], 29);
    expect(msg).toContain('⚔️');
    expect(msg).toContain('Patrick');
    expect(msg).toContain('Jill');
    expect(msg).toContain('2–1');
    expect(msg).toContain('Patrick takes the bragging rights');
  });

  it('includes a notable result line with participant name and score', () => {
    const p = makeParticipant({ name: 'Nelson', team: 'Argentina', flag: '🇦🇷' });
    const m = makeMatch('Argentina', 'Iran', {
      score: { winner: 'HOME_TEAM', fullTime: { home: 3, away: 0 } },
    });
    const notable = { match: m, participant: p, side: 'home' as const };
    const msg = formatSlackMessage([], [], [notable], 29);
    expect(msg).toContain('Nelson');
    expect(msg).toContain('Argentina');
    expect(msg).toContain('3–0');
  });

  it('shows draw result as honours even in derby', () => {
    const p1 = makeParticipant({ name: 'Patrick', team: 'Netherlands' });
    const p2 = makeParticipant({ name: 'Jill', team: 'Japan' });
    const m = makeMatch('Netherlands', 'Japan', {
      score: { winner: 'DRAW', fullTime: { home: 1, away: 1 } },
    });
    const derby = { match: m, homeParticipant: p1, awayParticipant: p2 };
    const msg = formatSlackMessage([], [derby], [], 29);
    expect(msg).toContain('honours even');
  });
});

// ─── formatNextUpdateBlock ────────────────────────────────────────────────────

describe('formatNextUpdateBlock', () => {
  it('returns "no upcoming fixtures" message when fixture is null', () => {
    const block = formatNextUpdateBlock(null);
    expect(block).toContain('⏰ NEXT UPDATE');
    expect(block).toContain('No upcoming sweepstake fixtures found');
  });

  it('shows fixture teams and kick-off time', () => {
    const p = makeParticipant({ name: 'Patrick', team: 'Netherlands', flag: '🇳🇱' });
    const m = makeMatch('Netherlands', 'France', {
      status: 'SCHEDULED',
      utcDate: '2026-06-20T15:00:00Z',
    });
    const fixture = { match: m, isDerby: false, participants: [p] };
    const block = formatNextUpdateBlock(fixture);
    expect(block).toContain('Netherlands vs France');
    expect(block).toContain('2026-06-20 15:00:00 UTC');
  });

  it('shows DERBY flag when both teams are sweepstake teams', () => {
    const p1 = makeParticipant({ name: 'Patrick', team: 'Netherlands' });
    const p2 = makeParticipant({ name: 'Jill', team: 'Japan' });
    const m = makeMatch('Netherlands', 'Japan', { status: 'SCHEDULED', utcDate: '2026-06-20T15:00:00Z' });
    const fixture = { match: m, isDerby: true, participants: [p1, p2] };
    const block = formatNextUpdateBlock(fixture);
    expect(block).toContain('⚔️ DERBY');
    expect(block).toContain('Patrick');
    expect(block).toContain('Jill');
  });

  it('shows suggested run time as kick-off + 105 minutes', () => {
    const p = makeParticipant({ name: 'Patrick', team: 'Netherlands' });
    const m = makeMatch('Netherlands', 'France', {
      status: 'SCHEDULED',
      utcDate: '2026-06-20T15:00:00Z',
    });
    // kick-off 15:00 + 105 min = 16:45
    const fixture = { match: m, isDerby: false, participants: [p] };
    const block = formatNextUpdateBlock(fixture);
    expect(block).toContain('16:45:00 UTC');
  });
});
```

- [ ] **Step 2: Run tests to confirm formatter tests fail**

```bash
npx jest __tests__/sweepstake-update.test.ts --no-coverage
```

Expected: Previous tests PASS, new formatter tests FAIL with `formatSlackMessage is not a function`.

- [ ] **Step 3: Add formatter functions to scripts/sweepstake-update.ts**

Append after the `findNextFixture` function:

```typescript
// ─── Formatters ───────────────────────────────────────────────────────────────

function formatGroupRecord(stats: GroupStats): string {
  return `${stats.won}W ${stats.drawn}D ${stats.lost}L, ${stats.points} pts`;
}

export function formatSlackMessage(
  eliminations: ParticipantStanding[],
  derbies: DerbyResult[],
  notableResults: NotableResult[],
  activeCount: number
): string {
  const lines: string[] = [];
  lines.push("⚽ Sweepstake update — here's what you missed...\n");

  if (eliminations.length === 0 && derbies.length === 0 && notableResults.length === 0) {
    lines.push(`No changes since last update — ${activeCount}/29 still alive.`);
  } else {
    for (const s of eliminations) {
      lines.push(
        `${s.participant.name}'s ${s.participant.team} ${s.participant.flag} are out — ${formatGroupRecord(s.groupStats)} [edit]`
      );
    }
    for (const d of derbies) {
      const h = d.match.score.fullTime.home;
      const a = d.match.score.fullTime.away;
      const score = `${h}–${a}`;
      const winnerLine =
        d.match.score.winner === 'HOME_TEAM'
          ? ` — ${d.homeParticipant.name} takes the bragging rights`
          : d.match.score.winner === 'AWAY_TEAM'
            ? ` — ${d.awayParticipant.name} takes the bragging rights`
            : ' — honours even';
      lines.push(
        `⚔️ Derby: ${d.homeParticipant.name}'s ${d.match.homeTeam.name} ${score} ${d.awayParticipant.name}'s ${d.match.awayTeam.name}${winnerLine}`
      );
    }
    for (const n of notableResults) {
      const h = n.match.score.fullTime.home;
      const a = n.match.score.fullTime.away;
      const score = `${h}–${a}`;
      const opponent = n.side === 'home' ? n.match.awayTeam.name : n.match.homeTeam.name;
      lines.push(
        `${n.participant.name}'s ${n.participant.team} ${n.participant.flag} beat ${opponent} ${score} [edit]`
      );
    }
  }

  lines.push('');
  lines.push(`Still alive: ${activeCount}/29`);
  lines.push(`Full standings 👉 ${APP_URL}`);
  return lines.join('\n');
}

export function formatNextUpdateBlock(fixture: NextFixture | null): string {
  if (!fixture) {
    return '⏰ NEXT UPDATE\nNo upcoming sweepstake fixtures found.';
  }

  const kickoff = new Date(fixture.match.utcDate);
  const kickoffStr = kickoff.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const suggested = new Date(kickoff.getTime() + 105 * 60 * 1000);
  const suggestedStr = suggested.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const lines: string[] = [];
  lines.push('⏰ NEXT UPDATE');
  lines.push(
    `Next sweepstake fixture: ${fixture.match.homeTeam.name} vs ${fixture.match.awayTeam.name} — ${kickoffStr}`
  );
  if (fixture.isDerby) {
    const [p1, p2] = fixture.participants;
    lines.push(
      `⚔️ DERBY — ${p1.name}'s ${fixture.match.homeTeam.name} vs ${p2.name}'s ${fixture.match.awayTeam.name}`
    );
  } else {
    const p = fixture.participants[0];
    lines.push(`One sweepstake team: ${p.name}'s ${p.team} ${p.flag}`);
  }
  lines.push(
    `Suggested: run sweepstake-update after ${suggestedStr} (kick-off + 90 min match + 15 min buffer)`
  );
  return lines.join('\n');
}
```

- [ ] **Step 4: Run all tests — verify everything passes**

```bash
npx jest __tests__/sweepstake-update.test.ts --no-coverage
```

Expected: All tests PASS. Count should be ~28.

- [ ] **Step 5: Commit**

```bash
git add scripts/sweepstake-update.ts __tests__/sweepstake-update.test.ts
git commit -m "feat: add message formatter functions with tests"
```

---

## Task 4: I/O Functions + Main Orchestrator

**Files:**
- Modify: `scripts/sweepstake-update.ts` (append I/O + main)
- Modify: `__tests__/sweepstake-update.test.ts` (append I/O tests)

- [ ] **Step 1: Add I/O tests to the test file**

Update the import at the top of `__tests__/sweepstake-update.test.ts` to include `loadLastUpdate` and `saveLastUpdate`:

```typescript
import {
  buildTeamNameMap,
  findEliminations,
  findDerbies,
  findNotableResults,
  findNextFixture,
  formatSlackMessage,
  formatNextUpdateBlock,
  loadLastUpdate,
  saveLastUpdate,
} from '../scripts/sweepstake-update';
```

Add `import os from 'os';` at the top of the file if not already present.

Append these describe blocks:

```typescript
// ─── loadLastUpdate ───────────────────────────────────────────────────────────

describe('loadLastUpdate', () => {
  const tmpFile = path.join(os.tmpdir(), `sweepstake-test-load-${Date.now()}.json`);

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('returns the stored timestamp when file exists and is valid', () => {
    const ts = '2026-06-14T10:00:00.000Z';
    fs.writeFileSync(tmpFile, JSON.stringify({ lastUpdate: ts }));
    expect(loadLastUpdate(tmpFile)).toBe(ts);
  });

  it('returns a timestamp ~24h ago when file does not exist', () => {
    const before = Date.now();
    const result = loadLastUpdate('/nonexistent/path/last-update.json');
    const parsed = new Date(result).getTime();
    const expectedApprox = before - 24 * 60 * 60 * 1000;
    expect(parsed).toBeGreaterThanOrEqual(expectedApprox - 1000);
    expect(parsed).toBeLessThanOrEqual(before);
  });

  it('returns a timestamp ~24h ago when file is malformed JSON', () => {
    fs.writeFileSync(tmpFile, 'not valid json');
    const before = Date.now();
    const result = loadLastUpdate(tmpFile);
    const parsed = new Date(result).getTime();
    const expectedApprox = before - 24 * 60 * 60 * 1000;
    expect(parsed).toBeGreaterThanOrEqual(expectedApprox - 1000);
  });

  it('returns a timestamp ~24h ago when file has wrong shape', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ notLastUpdate: 'value' }));
    const result = loadLastUpdate(tmpFile);
    expect(new Date(result).getTime()).toBeLessThan(Date.now());
  });
});

// ─── saveLastUpdate ───────────────────────────────────────────────────────────

describe('saveLastUpdate', () => {
  const tmpFile = path.join(os.tmpdir(), `sweepstake-test-save-${Date.now()}.json`);

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('writes a JSON file with the correct timestamp', () => {
    const ts = '2026-06-15T09:00:00.000Z';
    saveLastUpdate(tmpFile, ts);
    const raw = fs.readFileSync(tmpFile, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.lastUpdate).toBe(ts);
  });

  it('overwrites an existing file', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ lastUpdate: '2026-01-01T00:00:00Z' }));
    const newTs = '2026-06-15T09:00:00.000Z';
    saveLastUpdate(tmpFile, newTs);
    const parsed = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    expect(parsed.lastUpdate).toBe(newTs);
  });
});
```

- [ ] **Step 2: Run tests to confirm I/O tests fail**

```bash
npx jest __tests__/sweepstake-update.test.ts --no-coverage
```

Expected: Previous tests PASS, new I/O tests FAIL with `loadLastUpdate is not a function`.

- [ ] **Step 3: Append I/O functions and main() to scripts/sweepstake-update.ts**

Append after the `formatNextUpdateBlock` function:

```typescript
// ─── I/O ─────────────────────────────────────────────────────────────────────

export function loadLastUpdate(filePath: string): string {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as { lastUpdate?: unknown };
    if (typeof parsed.lastUpdate === 'string') {
      return parsed.lastUpdate;
    }
  } catch {
    // File missing or malformed — fall through to default
  }
  console.error('⚠️  last-update.json not found or malformed — defaulting to 24h ago');
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export function saveLastUpdate(filePath: string, timestamp: string): void {
  fs.writeFileSync(filePath, JSON.stringify({ lastUpdate: timestamp }, null, 2) + '\n');
}

export function copyToClipboard(text: string): void {
  const result = spawnSync('pbcopy', [], { input: text, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error('⚠️  pbcopy not available — skipping clipboard copy');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  dotenv.config({ path: path.join(process.cwd(), '.env.local') });

  if (!process.env.FOOTBALL_DATA_API_KEY) {
    console.error('Error: FOOTBALL_DATA_API_KEY not set in .env.local');
    process.exit(1);
  }

  const lastUpdate = loadLastUpdate(LAST_UPDATE_PATH);

  const matches = await getMatches();
  if (!matches.length) {
    console.error('Error: Failed to fetch matches from football-data.org');
    process.exit(1);
  }

  const standings = computeStandings(matches);
  const teamNameMap = buildTeamNameMap(draw);

  const eliminations = findEliminations(standings, lastUpdate);
  const derbies = findDerbies(matches, teamNameMap, lastUpdate);
  const notableResults = findNotableResults(matches, teamNameMap, lastUpdate, derbies);
  const activeCount = standings.filter(s => s.status === 'active').length;
  const nextFixture = findNextFixture(matches, teamNameMap);

  const slackMessage = formatSlackMessage(eliminations, derbies, notableResults, activeCount);
  const nextUpdateBlock = formatNextUpdateBlock(nextFixture);

  console.log(slackMessage);
  console.log('');
  copyToClipboard(slackMessage);
  process.stderr.write('✓ Copied to clipboard\n\n');
  process.stderr.write(nextUpdateBlock + '\n');

  saveLastUpdate(LAST_UPDATE_PATH, new Date().toISOString());
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run all tests — verify everything passes**

```bash
npx jest __tests__/sweepstake-update.test.ts --no-coverage
```

Expected: All tests PASS. Final count: ~36 tests.

- [ ] **Step 5: Run the script end-to-end against live data**

```bash
npm run sweepstake-update
```

Expected output (stdout, copied to clipboard):
```
⚽ Sweepstake update — here's what you missed...

[eliminations / derby results / notable results if any]

Still alive: X/29
Full standings 👉 https://world-cup-sweepstakes-rose.vercel.app/
```

Expected stderr (not copied):
```
✓ Copied to clipboard

⏰ NEXT UPDATE
Next sweepstake fixture: ...
```

Verify `scripts/last-update.json` was created with today's timestamp.

- [ ] **Step 6: Commit**

```bash
git add scripts/sweepstake-update.ts __tests__/sweepstake-update.test.ts
git commit -m "feat: add I/O functions and main orchestrator for sweepstake-update"
```

---

## Self-review

**Spec coverage check:**
- ✅ Reads from existing data layer (getMatches, computeStandings, draw)
- ✅ Compares against last-update.json timestamp
- ✅ Detects eliminations since last update
- ✅ Detects derbies played since last update
- ✅ Detects notable results (participant wins) since last update
- ✅ Active count X/29
- ✅ Next upcoming sweepstake fixture with derby detection
- ✅ Slack message generated and printed to stdout
- ✅ ⏰ NEXT UPDATE block printed to stderr (not copied)
- ✅ Copies to clipboard via pbcopy
- ✅ Writes timestamp to last-update.json on success
- ✅ App URL included in message
- ✅ apiName resolution via buildTeamNameMap
- ✅ Error handling: missing API key, failed fetch, missing state file, pbcopy unavailable
- ✅ Gitignore entry for scripts/last-update.json
