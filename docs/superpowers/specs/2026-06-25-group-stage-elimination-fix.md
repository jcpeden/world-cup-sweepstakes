# Spec: Fix Premature Group-Stage Elimination

**Date:** 2026-06-25
**Status:** Draft
**Area:** `src/lib/standings.ts`

---

## Problem

Teams are being shown as `eliminated` on the leaderboard after completing all 3 group-stage games, even when they have clearly qualified — e.g. Morocco (2nd, 7pts), Canada (2nd, 4pts), South Africa (2nd, 4pts), Bosnia (3rd, top of third-place table).

## Root Cause

`getTeamCurrentStage()` uses this as its group-stage fallback:

```ts
return {
  stage: 'GROUP_STAGE',
  isActive: getFinishedGroupMatches(matches, teamName).length < 3,
};
```

The intent (per the code comment) was: *"active until 3 games are finished and team didn't appear in LAST_32."* But the second condition — "appeared in LAST_32" — never fires because the API doesn't populate LAST_32 match entries until the bracket is built, which happens *after* the group stage concludes. There is a gap between:

1. All 3 group games finished → `isActive` becomes `false`
2. LAST_32 bracket assigned → team would correctly be detected in the knockout path

During that gap, `isActive: false` + `stage === 'GROUP_STAGE'` hits the status derivation branch:

```ts
} else if (!isActive) {
  status = 'eliminated'; // ← incorrectly fires for qualified teams
```

### Affected teams

| Condition | Actual status | Bug status |
|---|---|---|
| 1st or 2nd place, 3 games done, no LAST_32 assignment yet | Should be `active` | `eliminated` |
| 3rd place in top-8 third-place ranking, no LAST_32 assignment yet | Should be `active` | `eliminated` |
| 4th place, 3 games done | `eliminated` | `eliminated` ✓ |
| 3rd place outside top-8 | `eliminated` | `eliminated` ✓ |

---

## Fix

Add an override in `computeStandings()`, after `thirdPlaceRank` is computed, that restores `isActive = true` for teams that have qualified but not yet been assigned to LAST_32.

### Location

`src/lib/standings.ts` — inside the `draw.map(participant => { ... })` block in `computeStandings()`, between the existing 4th-place override (line ~321) and the `getRankScore` call.

### Logic

```ts
// Restore isActive for qualified group-stage teams awaiting LAST_32 assignment.
// The base value goes false once 3 games are played, but these teams genuinely advanced.
if (stage === 'GROUP_STAGE' && !isActive && groupPos !== undefined) {
  const pos = groupPos.position;
  if (pos === 1 || pos === 2) {
    isActive = true;
  } else if (pos === 3 && thirdPlaceRank !== undefined && thirdPlaceRank <= 8) {
    isActive = true;
  }
}
```

This follows the existing override pattern (the 4th-place math-elimination override immediately above it). No changes to function signatures or other files needed.

### Why this placement works

- Reads `groupPos.position` (available from `allGroupPositions`, computed before the map)
- Reads `thirdPlaceRank` (computed on the line immediately before the insertion point)
- The restored `isActive = true` flows correctly into:
  - `getRankScore` — positions 1/2 land in the `10 + pts` band; 3rd in top-8 lands in the `7 + pts` band
  - `status` derivation — position 1/2 → `active`; position 3 → `active` (since `thirdPlaceRank <= 8`)
  - `getEliminationDate` — returns `undefined` for `isActive: true` ✓

### What stays the same

- 4th-place teams with 3 games done: `isActive` is already `false` from base, new override doesn't match `pos === 4` → correctly stays `eliminated`
- 3rd-place teams outside top-8: `thirdPlaceRank > 8` → new override does not fire → stays `eliminated`
- Teams still playing (< 3 games finished): `baseIsActive` is already `true` → new override only fires for `!isActive` → no change

---

## Edge cases

### Third-place uncertainty mid-tournament

`thirdPlaceRank` is computed from the live third-place table, which changes as groups complete their 3rd matchday. A team currently ranked 5th in the third-place table might drop to 9th once later groups finish.

This is intentionally preserved behaviour — the existing `at_risk` pathway handles this uncertainty — and is **out of scope** for this fix. The fix only corrects the hard `eliminated` misclassification; the `at_risk` / `active` nuance for borderline 3rd-place teams is already handled correctly in the status derivation once `isActive` is true.

### Groups completing at different times

Because 12 groups complete their matchdays at different times, the third-place table is a rolling snapshot. The fix introduces no new sensitivity here; `computeThirdPlaceTable` already operates on whatever the current state is.

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/standings.ts` | Add ~6-line override block inside `computeStandings` |

No other files need to change.

---

## Testing

After the fix, verify:

1. Morocco, Canada, South Africa (2nd in group, 3 games done) → `active` on leaderboard
2. Bosnia and Herzegovina (3rd, top of third-place table, 3 games done) → `active`
3. Qatar (3rd, low pts, out of top-8) → `eliminated`
4. Panama, Jordan, Turkey (4th, 0pts, 3 games done) → `eliminated`
5. Ron (Qatar, 1pt, 3rd) → re-check position; if outside top-8 → `eliminated` ✓
6. Once LAST_32 bracket is assigned, already-active teams should transition cleanly to the knockout path in `getTeamCurrentStage`
