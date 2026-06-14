# Sweepstake Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add W/D/L records on participant cards, an elimination timeline, a prize pot header, and derby detection to the World Cup 2026 sweepstake app.

**Architecture:** Extend `ParticipantStanding` with `groupStats` (W/D/L/pts) and `eliminatedDate`; keep all new computation inside `standings.ts`; add a standalone `PrizePot` component; enrich `Leaderboard` with a W/D/L sub-line and a reverse-chronological elimination timeline; detect derbies purely in `NextMatch` using the already-available `draw` prop — no API changes needed.

**Tech Stack:** Next.js 16 (ISR, `revalidate = 60`), React 19, TypeScript, Tailwind CSS v4, Jest + ts-jest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/types.ts` | Modify | Add `GroupStats` interface; add `groupStats` + `eliminatedDate` to `ParticipantStanding` |
| `src/lib/standings.ts` | Modify | Add `getGroupStats()` and `getEliminationDate()` helpers; wire both into `computeStandings()` |
| `__tests__/standings.test.ts` | Modify | Tests for `groupStats` and `eliminatedDate` fields |
| `src/components/PrizePot.tsx` | Create | Fixed prize-amounts display — no props, pure presentational |
| `src/components/Leaderboard.tsx` | Modify | W/D/L sub-line on group stage cards; timeline section below eliminated list |
| `src/components/NextMatch.tsx` | Modify | Derby detection: change header copy + show participant names when both teams are in the draw |
| `src/app/page.tsx` | Modify | Import and render `<PrizePot />` between page header and `<NextMatch />` |

---

## Task 1: Add GroupStats and eliminatedDate to standings

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/standings.ts`
- Modify: `__tests__/standings.test.ts`

- [ ] **Step 1: Write the failing tests**

Add the following two `describe` blocks to `__tests__/standings.test.ts` inside the outer `describe('computeStandings', () => { ... })` block, just before its closing `});`:

```typescript
  describe('groupStats', () => {
    it('starts at all-zero before any matches are played', () => {
      const standings = computeStandings([]);
      const nelson = standings.find(s => s.participant.name === 'Nelson')!;
      expect(nelson.groupStats).toEqual({ won: 0, drawn: 0, lost: 0, points: 0 });
    });

    it('accumulates W/D/L and points from finished group matches', () => {
      const matches: Match[] = [
        makeMatch('Argentina', 'France', { score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } } }),
        makeMatch('Argentina', 'Brazil', { score: { winner: 'DRAW',      fullTime: { home: 1, away: 1 } } }),
        makeMatch('Spain',  'Argentina', { score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } } }),
      ];
      const standings = computeStandings(matches);
      const nelson = standings.find(s => s.participant.name === 'Nelson')!; // Argentina
      expect(nelson.groupStats).toEqual({ won: 1, drawn: 1, lost: 1, points: 4 });
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest __tests__/standings.test.ts --no-coverage
```

Expected: 4 new tests fail with `Cannot read properties of undefined (reading 'won')` or `Property 'groupStats' does not exist`. 18 existing tests still pass.

- [ ] **Step 3: Add GroupStats interface and update ParticipantStanding in types.ts**

In `src/lib/types.ts`, add the `GroupStats` interface after the `Participant` interface:

```typescript
export interface GroupStats {
  won: number;
  drawn: number;
  lost: number;
  points: number;
}
```

Update `ParticipantStanding` to add the two new fields:

```typescript
export interface ParticipantStanding {
  rank: number;
  tied: boolean;
  participant: Participant;
  stage: TournamentStage;
  status: ParticipantStatus;
  rankScore: number;
  groupStats: GroupStats;
  eliminatedDate?: string;
}
```

- [ ] **Step 4: Add getGroupStats and getEliminationDate to standings.ts**

Update the import at the top of `src/lib/standings.ts`:

```typescript
import type { Match, ParticipantStanding, ParticipantStatus, TournamentStage, GroupStats } from './types';
```

Add both helpers immediately before the `computeStandings` export:

```typescript
function getGroupStats(matches: Match[], teamName: string): GroupStats {
  const groupMatches = matches.filter(
    m =>
      m.stage === 'GROUP_STAGE' &&
      m.status === 'FINISHED' &&
      (m.homeTeam.name === teamName || m.awayTeam.name === teamName)
  );

  return groupMatches.reduce<GroupStats>(
    (stats, m) => {
      if (m.score.winner === 'DRAW') return { ...stats, drawn: stats.drawn + 1, points: stats.points + 1 };
      if (m.score.winner === null) return stats;
      const isHome = m.homeTeam.name === teamName;
      const won = isHome ? m.score.winner === 'HOME_TEAM' : m.score.winner === 'AWAY_TEAM';
      return won
        ? { ...stats, won: stats.won + 1, points: stats.points + 3 }
        : { ...stats, lost: stats.lost + 1 };
    },
    { won: 0, drawn: 0, lost: 0, points: 0 }
  );
}

function getEliminationDate(
  matches: Match[],
  teamName: string,
  stage: TournamentStage,
  isActive: boolean
): string | undefined {
  if (isActive) return undefined;

  if (stage === 'GROUP_STAGE') {
    const finished = matches
      .filter(
        m =>
          m.stage === 'GROUP_STAGE' &&
          m.status === 'FINISHED' &&
          (m.homeTeam.name === teamName || m.awayTeam.name === teamName)
      )
      .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime());
    return finished[0]?.utcDate;
  }

  return matches.find(
    m =>
      m.stage === stage &&
      m.status === 'FINISHED' &&
      (m.homeTeam.name === teamName || m.awayTeam.name === teamName)
  )?.utcDate;
}
```

- [ ] **Step 5: Wire both new fields into computeStandings**

Inside `computeStandings`, update the `draw.map(...)` block. The current mapping block is:

```typescript
const { stage, isActive, finalResult } = getTeamCurrentStage(matches, teamName);
const groupPoints = getGroupStagePoints(matches, teamName);
const gamesPlayed = getGroupStageGamesPlayed(matches, teamName);
const rankScore = getRankScore(stage, isActive, finalResult, groupPoints, gamesPlayed);
const status: ParticipantStatus = isActive ? 'active' : 'eliminated';
return { rank: 0, tied: false, participant, stage, status, rankScore };
```

Replace the last two lines with:

```typescript
const groupStats = getGroupStats(matches, teamName);
const eliminatedDate = getEliminationDate(matches, teamName, stage, isActive);
const status: ParticipantStatus = isActive ? 'active' : 'eliminated';
return { rank: 0, tied: false, participant, stage, status, rankScore, groupStats, eliminatedDate };
```

- [ ] **Step 6: Run tests — verify all pass**

```bash
npx jest __tests__/standings.test.ts --no-coverage
```

Expected: 22 tests pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/standings.ts __tests__/standings.test.ts
git commit -m "feat: add groupStats and eliminatedDate to ParticipantStanding"
```

---

## Task 2: W/D/L record on participant cards

**Files:**
- Modify: `src/components/Leaderboard.tsx`

- [ ] **Step 1: Add a W/D/L sub-line inside StandingRow**

In `src/components/Leaderboard.tsx`, locate the `StandingRow` component. The current inner content of the `div.flex-1` block is:

```tsx
<div className="flex-1 min-w-0">
  <div className="font-semibold text-gray-900 text-sm">{standing.participant.name}</div>
  <div className="text-gray-400 text-xs">{standing.participant.flag} {standing.participant.team}</div>
</div>
```

Replace it with:

```tsx
<div className="flex-1 min-w-0">
  <div className="font-semibold text-gray-900 text-sm">{standing.participant.name}</div>
  <div className="text-gray-400 text-xs">{standing.participant.flag} {standing.participant.team}</div>
  {standing.stage === 'GROUP_STAGE' && (
    <div className="text-gray-400 text-xs">
      {standing.groupStats.won}W {standing.groupStats.drawn}D {standing.groupStats.lost}L · {standing.groupStats.points}pts
    </div>
  )}
</div>
```

- [ ] **Step 2: Verify visually**

```bash
npm run dev
```

Open http://localhost:3000. Every active group-stage participant should show a third line like `0W 0D 0L · 0pts`. Participants in knockout stages should show no W/D/L line.

- [ ] **Step 3: Commit**

```bash
git add src/components/Leaderboard.tsx
git commit -m "feat: show W/D/L record on group stage participant cards"
```

---

## Task 3: Elimination timeline

**Files:**
- Modify: `src/components/Leaderboard.tsx`

- [ ] **Step 1: Add a date formatter helper near the top of Leaderboard.tsx**

Add this function directly after the `'use client';` directive and imports, before `StatusBadge`:

```typescript
function formatEliminationDate(utcDate: string): string {
  return new Date(utcDate).toLocaleDateString('en-GB', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
```

- [ ] **Step 2: Add the timeline block inside the eliminated section**

In `src/components/Leaderboard.tsx`, find the eliminated section. The current markup is:

```tsx
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
```

Replace it with:

```tsx
{eliminated.length > 0 && (
  <div>
    <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-t border-gray-100">
      Eliminated ({eliminated.length})
    </div>
    {eliminated.map(s => (
      <StandingRow key={s.participant.name} standing={s} />
    ))}
    {(() => {
      const timelineEntries = eliminated
        .filter(s => s.eliminatedDate !== undefined)
        .sort((a, b) =>
          new Date(b.eliminatedDate!).getTime() - new Date(a.eliminatedDate!).getTime()
        );
      if (timelineEntries.length === 0) return null;
      return (
        <div className="border-t border-gray-100 mt-1">
          <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Timeline
          </div>
          <ul className="overflow-y-auto max-h-60">
            {timelineEntries.map(s => (
              <li key={s.participant.name} className="px-4 py-2 text-xs text-gray-500 border-b border-gray-50 last:border-0">
                {s.participant.flag}{' '}
                <span className="font-medium text-gray-700">{s.participant.team}</span>
                {' '}eliminated —{' '}
                <span className="font-medium">{s.participant.name}</span>
                {' '}out — {STAGE_LABELS[s.stage]} · {formatEliminationDate(s.eliminatedDate!)}
              </li>
            ))}
          </ul>
        </div>
      );
    })()}
  </div>
)}
```

- [ ] **Step 3: Verify visually**

```bash
npm run dev
```

With real data: if any teams are currently eliminated, the timeline should appear below the eliminated cards, sorted newest-first. With no eliminations, nothing extra renders.

To verify locally without waiting for real eliminations, temporarily modify `page.tsx` to hard-code a match that eliminates Qatar (Ron). Add this before the `computeStandings` call and remove after verifying:

```typescript
// TEMPORARY — remove after testing
const testMatches = [
  ...matches,
  { id: 99991, stage: 'GROUP_STAGE' as const, status: 'FINISHED' as const, utcDate: '2026-06-11T16:00:00Z', homeTeam: { id: 1, name: 'Qatar', shortName: 'QAT', tla: 'QAT', crest: '' }, awayTeam: { id: 2, name: 'Ecuador', shortName: 'ECU', tla: 'ECU', crest: '' }, score: { winner: 'AWAY_TEAM' as const, fullTime: { home: 0, away: 2 } } },
  { id: 99992, stage: 'GROUP_STAGE' as const, status: 'FINISHED' as const, utcDate: '2026-06-15T13:00:00Z', homeTeam: { id: 1, name: 'Qatar', shortName: 'QAT', tla: 'QAT', crest: '' }, awayTeam: { id: 3, name: 'Senegal', shortName: 'SEN', tla: 'SEN', crest: '' }, score: { winner: 'AWAY_TEAM' as const, fullTime: { home: 0, away: 1 } } },
  { id: 99993, stage: 'GROUP_STAGE' as const, status: 'FINISHED' as const, utcDate: '2026-06-18T20:00:00Z', homeTeam: { id: 1, name: 'Qatar', shortName: 'QAT', tla: 'QAT', crest: '' }, awayTeam: { id: 4, name: 'Canada', shortName: 'CAN', tla: 'CAN', crest: '' }, score: { winner: 'AWAY_TEAM' as const, fullTime: { home: 0, away: 1 } } },
];
const standings = computeStandings(testMatches);
```

Ron should appear in the Eliminated section and the timeline should read: `🇶🇦 Qatar eliminated — Ron out — Group Stage · 18 June`

- [ ] **Step 4: Commit**

```bash
git add src/components/Leaderboard.tsx
git commit -m "feat: add scrollable elimination timeline below eliminated section"
```

---

## Task 4: Prize pot header

**Files:**
- Create: `src/components/PrizePot.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create PrizePot component**

Create `src/components/PrizePot.tsx`:

```tsx
export function PrizePot() {
  return (
    <div className="text-center text-sm text-gray-600 mb-6">
      🥇 <span className="font-semibold">$174</span>
      &nbsp;&nbsp;🥈 <span className="font-semibold">$72</span>
      &nbsp;&nbsp;🥉 <span className="font-semibold">$44</span>
      &nbsp;&nbsp;·&nbsp;&nbsp;Total pot: <span className="font-semibold">$290</span>
    </div>
  );
}
```

- [ ] **Step 2: Add PrizePot to page.tsx**

In `src/app/page.tsx`, add the import:

```typescript
import { PrizePot } from '@/components/PrizePot';
```

Add `<PrizePot />` between the `<header>` closing tag and `<NextMatch ...>`:

```tsx
      </header>
      <PrizePot />
      <NextMatch match={nextMatch} draw={draw} />
```

- [ ] **Step 3: Verify visually**

```bash
npm run dev
```

The prize line should appear centred between the "World Cup 2026" heading and the NextMatch widget: `🥇 $174  🥈 $72  🥉 $44  ·  Total pot: $290`

- [ ] **Step 4: Commit**

```bash
git add src/components/PrizePot.tsx src/app/page.tsx
git commit -m "feat: add prize pot header"
```

---

## Task 5: Derby detection in NextMatch widget

**Files:**
- Modify: `src/components/NextMatch.tsx`

- [ ] **Step 1: Add isDerby flag**

In `src/components/NextMatch.tsx`, the variables `homeParticipant` and `awayParticipant` are already resolved from the draw prop. Add `isDerby` immediately after them:

```typescript
const homeParticipant = draw.find(p => (p.apiName ?? p.team) === match.homeTeam.name);
const awayParticipant = draw.find(p => (p.apiName ?? p.team) === match.awayTeam.name);
const isDerby = homeParticipant !== undefined && awayParticipant !== undefined;
```

- [ ] **Step 2: Update the header label to show derby copy**

The current header label is:

```tsx
{isLive ? <span className="animate-pulse">🔴 Live Now</span> : 'Next Sweepstake Match'}
```

Replace with:

```tsx
{isLive
  ? <span className="animate-pulse">🔴 Live Now</span>
  : isDerby
    ? '⚔️ Sweepstake Derby'
    : 'Next Sweepstake Match'}
```

- [ ] **Step 3: Include participant names in the derby team display**

The current teams block is:

```tsx
<div className="flex items-center justify-center gap-4 text-lg font-bold">
  <TeamSlot name={match.homeTeam.shortName} participant={homeParticipant} align="left" />
  <span className="opacity-50 text-base font-normal">vs</span>
  <TeamSlot name={match.awayTeam.shortName} participant={awayParticipant} align="right" />
</div>
```

Replace with:

```tsx
<div className="flex items-center justify-center gap-4 text-lg font-bold">
  <TeamSlot
    name={isDerby
      ? `${homeParticipant!.name} ${homeParticipant!.flag} ${match.homeTeam.shortName}`
      : match.homeTeam.shortName}
    participant={homeParticipant}
    align="left"
  />
  <span className="opacity-50 text-base font-normal">vs</span>
  <TeamSlot
    name={isDerby
      ? `${awayParticipant!.name} ${awayParticipant!.flag} ${match.awayTeam.shortName}`
      : match.awayTeam.shortName}
    participant={awayParticipant}
    align="right"
  />
</div>
```

- [ ] **Step 4: Verify visually**

```bash
npm run dev
```

With live data, if the next match is between two draw teams, the header should read "⚔️ Sweepstake Derby" and each team slot should show e.g. `Flo 🇲🇦 MAR`.

To test without a live derby, temporarily add a mock match in `page.tsx` before computing `nextMatch` (remove after verifying):

```typescript
// TEMPORARY — remove after testing
const mockDerby = {
  id: 99999,
  stage: 'GROUP_STAGE' as const,
  status: 'SCHEDULED' as const,
  utcDate: new Date(Date.now() + 3_600_000).toISOString(),
  homeTeam: { id: 10, name: 'Morocco', shortName: 'MAR', tla: 'MAR', crest: '' },
  awayTeam: { id: 11, name: 'Egypt',   shortName: 'EGY', tla: 'EGY', crest: '' },
  score: { winner: null as const, fullTime: { home: null, away: null } },
};
const nextMatch = getNextSweepstakeMatch([mockDerby, ...matches], allApiTeamNames);
```

Expected: widget shows "⚔️ Sweepstake Derby" and "Flo 🇲🇦 MAR vs Brett 🇪🇬 EGY".

- [ ] **Step 5: Commit**

```bash
git add src/components/NextMatch.tsx
git commit -m "feat: detect and display sweepstake derbies in match widget"
```
