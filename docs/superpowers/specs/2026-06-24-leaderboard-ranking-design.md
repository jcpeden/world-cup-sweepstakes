# Leaderboard Ranking — Group Stage Design Spec

**Date:** 2026-06-24
**Status:** Approved

---

## Overview

Update `computeStandings` to rank sweepstake participants by their team's current group position during the group stage, using FIFA tiebreakers within each group. Teams that are mathematically eliminated before their final group game are flagged as `eliminated`. Teams still in danger are flagged `at_risk`. The system transitions automatically to knockout-stage ranking as fixtures are scheduled — no date gate required.

---

## Motivation

The current ranking formula (`STAGE_RANK.GROUP_STAGE + groupPoints + (3 - gamesPlayed) / 10`) lumps all 29 group-stage participants into a single flat bucket ranked by raw points. This has two problems:

1. It treats a team with 3pts in 1st place the same as a team with 3pts in 3rd place — they're in very different situations.
2. It cannot express `at_risk` status (bottom-4 of the 3rd-place table) or mathematical elimination before the final group game.

The previous feature branch (`feature/updated-ranking`) tried to solve this with manual `eliminatedEarly`/`atRisk` flags in `draw.ts`. This was rejected because it pollutes static participant data with dynamic tournament state and requires manual updates every round.

---

## New Data File: `src/data/groups.ts`

A static file encoding the 12-group structure of World Cup 2026. Team names must use the API names as returned by football-data.org (matching `m.homeTeam.name` / `m.awayTeam.name`).

```ts
export interface Group {
  name: string;
  teams: string[]; // API names, 4 teams per group
}

export const groups: Group[] = [
  { name: 'Group A', teams: ['Mexico', 'South Africa', 'South Korea', 'Czech Republic'] },
  { name: 'Group B', teams: ['Canada', 'Bosnia-Herzegovina', 'Qatar', 'Switzerland'] },
  { name: 'Group C', teams: ['Brazil', 'Morocco', 'Haiti', 'Scotland'] },
  { name: 'Group D', teams: ['USA', 'Paraguay', 'Australia', 'Turkey'] },
  { name: 'Group E', teams: ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'] },
  { name: 'Group F', teams: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'] },
  { name: 'Group G', teams: ['Belgium', 'Egypt', 'Iran', 'New Zealand'] },
  { name: 'Group H', teams: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'] },
  { name: 'Group I', teams: ['France', 'Senegal', 'Iraq', 'Norway'] },
  { name: 'Group J', teams: ['Argentina', 'Algeria', 'Austria', 'Jordan'] },
  { name: 'Group K', teams: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'] },
  { name: 'Group L', teams: ['England', 'Croatia', 'Ghana', 'Panama'] },
];
```

**Note:** Verify API names for any team with a discrepancy between `draw.ts` display name and football-data.org name. Known cases: Bosnia-Herzegovina (already has `apiName`), Turkey (already has `apiName`), Czech Republic (draw has `team: "Czechia"` — add `apiName: "Czech Republic"` if the API uses that name; verify against live match data).

This file is stable — teams do not change groups during the tournament.

---

## Extended Group Stats

`GroupStats` gains three new fields, derived from `match.score.fullTime`:

```ts
export interface GroupStats {
  won: number;
  drawn: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number; // goalsFor - goalsAgainst
}
```

`getGroupStats` (renamed internally to `getExtendedGroupStats` or updated in-place) accumulates these from finished group-stage matches. `fullTime.home` / `fullTime.away` are `number | null` — treat null as 0 to avoid NaN propagation.

---

## Group Position Computation

### `rankGroupTeams(groupTeams: string[], matches: Match[]): string[]`

Returns the 4 teams in descending order (index 0 = 1st place) using the FIFA group stage tiebreaker chain:

1. Points
2. Goal difference
3. Goals scored (goals for)
4. Head-to-head points between the tied subset
5. Head-to-head goal difference between the tied subset
6. Head-to-head goals scored between the tied subset

Steps 4–6 apply only when multiple teams remain tied after the overall criteria. H2H is computed from the subset of finished GROUP_STAGE matches between the tied teams only.

Steps beyond 6 (fair play, drawing of lots) are omitted — we don't have card data and lots are not deterministic.

When all tiebreakers are exhausted, retain stable sort order (alphabetical by team name).

### `computeAllGroupPositions(matches: Match[]): Map<string, { position: 1 | 2 | 3 | 4; groupName: string }>`

Iterates all 12 groups, calls `rankGroupTeams` for each, returns a map keyed by API team name.

### `computeThirdPlaceTable(allGroupPositions: Map<...>, matches: Match[]): string[]`

Collects the third-place team from each of the 12 groups. Ranks them using the same FIFA criteria **excluding H2H** (third-place teams from different groups haven't played each other). Returns an ordered list of 12 API team names — index 0 is best, index 11 is worst.

Top 8 (indices 0–7) advance to Last 32. Bottom 4 (indices 8–11) are at risk.

---

## Mathematical Elimination Detection

### `isMathematicallyEliminated(fourthTeamName: string, thirdTeamName: string, matches: Match[]): boolean`

Runs only for 4th-place teams before all 3 group games are complete. Algorithm:

```
fourthPts = current points of 4th-place team
thirdPts  = current points of 3rd-place team

fourthMax = fourthPts + 3   // best case: 4th wins game 3
thirdMin  = thirdPts  + 0   // worst case: 3rd loses game 3

if fourthMax < thirdMin  → return true   (cannot reach 3rd even in best/worst case)
if fourthMax > thirdMin  → return false  (can overtake on points alone)
if fourthMax === thirdMin:
  find finished GROUP_STAGE match between fourthTeam and thirdTeam
  if no match found      → return false  (H2H not yet played; can't call it)
  if 3rd won H2H         → return true   (level on points, 3rd wins tiebreaker)
  if 4th won H2H         → return false  (4th wins tiebreaker)
  if draw                → return false  (GD tiebreaker too uncertain to call programmatically)
```

**Known eliminations as of 2026-06-24:** Jordan (Group J), Turkey (Group D), Haiti (Group C), Panama (Group L), Tunisia (Group F). The algorithm should detect all five automatically from live match data.

---

## Status Tiers and Rank Score

### `ParticipantStatus`

```ts
export type ParticipantStatus = 'active' | 'at_risk' | 'eliminated';
```

### Rank score tiers (GROUP_STAGE only)

All group stage scores occupy the range 0–18.9, staying below LAST_32 = 20.

| Tier | Status | Base | Fractional | Range |
|---|---|---|---|---|
| Eliminated | `eliminated` | 0 | pts / 10 | 0.0 – 0.9 |
| At risk, 4th place | `at_risk` | 2 | pts / 10 | 2.0 – 2.9 |
| At risk, 3rd place (bottom 4) | `at_risk` | 4 | pts / 10 | 4.0 – 4.9 |
| Active, 3rd place (top 8) | `active` | 7 | pts / 10 | 7.0 – 7.9 |
| Active, 2nd place | `active` | 10 | pts / 10 | 10.0 – 10.9 |
| Active, 1st place | `active` | 14 | pts / 10 | 14.0 – 14.9 |

Minimum gap between adjacent tiers = 1.1 (> max fractional of 0.9). No tier bleeding is possible.

The old `(3 - gamesPlayed) / 10` component is removed. Points is the sole within-tier tiebreaker.

### Status assignment logic (GROUP_STAGE)

```
groupPosition = computeAllGroupPositions(matches).get(teamApiName)
thirdPlaceRank = rank within computeThirdPlaceTable (1–12), undefined if team is not 3rd

if not isActive (3 games played, not in LAST_32):
  status = 'eliminated'

else if groupPosition === 4:
  thirdTeam = group's current 3rd-place team
  if isMathematicallyEliminated(team, thirdTeam, matches):
    status = 'eliminated'
  else:
    status = 'at_risk'

else if groupPosition === 3:
  if thirdPlaceRank > 8:
    status = 'at_risk'
  else:
    status = 'active'

else: // 1st or 2nd
  status = 'active'
```

---

## `ParticipantStanding` Update

Add `groupPosition` field:

```ts
export interface ParticipantStanding {
  rank: number;
  tied: boolean;
  participant: Participant;
  stage: TournamentStage;
  status: ParticipantStatus;
  rankScore: number;
  groupStats: GroupStats;    // now includes goalsFor/goalsAgainst/goalDifference
  groupPosition?: 1 | 2 | 3 | 4;  // defined during GROUP_STAGE, undefined in knockout rounds
  eliminatedDate?: string;
}
```

---

## UI Impact

**`Leaderboard.tsx`**

- The `s.status !== 'eliminated'` filter already routes `at_risk` teams to "Still In" — no structural change.
- The eliminated timeline (`eliminatedDate`) continues to work as-is.
- Add an amber `at_risk` case to `StatusBadge`:

```tsx
if (standing.status === 'at_risk') {
  return (
    <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
      ⚠️ At Risk
    </span>
  );
}
```

No other UI changes required. The rank and `tied` flag continue to drive position numbers.

---

## Automatic Knockout Transition

No date gate is needed. Once LAST_32 fixtures appear in the API response (even as `SCHEDULED`), `getTeamCurrentStage` detects the team in LAST_32 and returns `stage: 'LAST_32'`. The GROUP_STAGE rank score branch is bypassed entirely; the existing STAGE_RANK values (20–1000) take over. Group-eliminated teams remain on `GROUP_STAGE` with `isActive: false` indefinitely.

---

## Test Plan

**`__tests__/standings.test.ts` — changes to existing tests**

- Update all `groupStats` assertions to include the new `goalsFor`, `goalsAgainst`, `goalDifference` fields.
- Remove or replace the "games played tiebreaker" test suite — these tests (`ranks an unplayed team above a 0-pt team`, `with equal points, ranks fewer games played higher`) test the old `(3-gamesPlayed)/10` behaviour that is being deliberately removed.

**New test suites**

`rankGroupTeams`:
- Points tiebreaker: higher points → earlier position
- GD tiebreaker: equal points, better GD → earlier position
- GF tiebreaker: equal points and GD, more goals scored → earlier position
- H2H tiebreaker: equal overall stats, H2H result separates tied pair
- All equal: stable alphabetical fallback

`computeThirdPlaceTable`:
- 12 third-place teams ranked by points → GD → GF
- Top-8 threshold is index 7 (0-indexed)

`isMathematicallyEliminated`:
- 4th has 0 pts, 3rd has 3 pts, 3rd beat 4th H2H → `true` (Haiti/Scotland scenario)
- 4th has 0 pts, 3rd has 3 pts, H2H not yet played → `false`
- 4th has 1 pt, 3rd has 3 pts → `false` (fourthMax=4 > thirdMin=3; 4th can overtake on points, H2H never checked)
- 4th has 0 pts, 3rd has 1 pt → `false` (4th can overtake on points)

`computeStandings` integration:
- Jordan, Turkey, Haiti, Panama, Tunisia all return `status: 'eliminated'` given a match data snapshot reflecting current results
- A 3rd-place team in provisional bottom-4 returns `status: 'at_risk'`
- A 4th-place team whose H2H hasn't been played returns `status: 'at_risk'`
- Knockout-stage transition: once a team appears in LAST_32, group position logic is bypassed

---

## Exports

`computeStandings` remains the sole public API of `standings.ts` for page-level consumption. The new helper functions (`rankGroupTeams`, `computeAllGroupPositions`, `computeThirdPlaceTable`, `isMathematicallyEliminated`) are also exported so they can be unit-tested directly in addition to being exercised through integration tests.

---

## Files Changed

| File | Change |
|---|---|
| `src/data/groups.ts` | New — 12-group structure |
| `src/data/draw.ts` | Add `apiName: "Czech Republic"` to Nadia's entry if API name differs (verify first) |
| `src/lib/types.ts` | Extend `GroupStats`; add `'at_risk'` to `ParticipantStatus`; add `groupPosition` to `ParticipantStanding` |
| `src/lib/standings.ts` | New functions: `rankGroupTeams`, `computeAllGroupPositions`, `computeThirdPlaceTable`, `isMathematicallyEliminated`; update `getRankScore` GROUP_STAGE branch; update `computeStandings` to derive status from group position |
| `src/components/Leaderboard.tsx` | Add amber `at_risk` badge case to `StatusBadge` |
| `__tests__/standings.test.ts` | Update `groupStats` assertions; remove games-played tiebreaker tests; add new test suites |
