# sweepstake-update — Design Spec

**Date:** 2026-06-15
**Status:** Approved

---

## Overview

A CLI script invoked via `npm run sweepstake-update` that reads live World Cup data from the existing app data layer, detects changes since the last run, generates a ready-to-paste Slack message (copied to clipboard), and prints an operational next-update block to the terminal.

---

## Files

```
scripts/
  sweepstake-update.ts     # Main script
  last-update.json         # State file — machine-local, gitignored
tsconfig.scripts.json      # CommonJS module override for ts-node
```

`.gitignore` — add `scripts/last-update.json`

---

## npm script

```json
"sweepstake-update": "ts-node --project tsconfig.scripts.json scripts/sweepstake-update.ts"
```

---

## tsconfig.scripts.json

Extends the root tsconfig but overrides `module` to `CommonJS` so ts-node can resolve `@/*` path aliases and `require()` calls correctly in a standalone (non-Next.js) context.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node"
  }
}
```

---

## Dependencies

`dotenv` — load `.env.local` outside Next.js context. Already present in most Next.js projects; add as devDependency if missing.

No other new runtime dependencies. `ts-node` is already present via `jest`/`ts-jest`.

---

## Data Flow

```
.env.local
  → FOOTBALL_DATA_API_KEY

scripts/last-update.json
  → lastUpdate: ISO timestamp (default: 24h ago on first run)

getMatches()                     # src/lib/footballApi.ts
  → Match[]

computeStandings(matches)        # src/lib/standings.ts
  → ParticipantStanding[]

─── Change detection (since lastUpdate) ──────────────────
  eliminations   → standings where status === 'eliminated'
                   AND eliminatedDate > lastUpdate

  derbies played → FINISHED matches where both homeTeam and
                   awayTeam are sweepstake teams
                   AND utcDate > lastUpdate

  notable results → FINISHED matches with ≥1 sweepstake team,
                    not a derby, not an elimination match,
                    wins only (avoids draw noise)
                    AND utcDate > lastUpdate

  activeCount    → standings.filter(s => s.status === 'active').length

─── Next fixture ──────────────────────────────────────────
  getNextSweepstakeMatch(matches, teamNames)
    → next upcoming fixture (SCHEDULED | TIMED | LIVE | IN_PLAY | PAUSED)
    → isDerby: boolean (both teams are sweepstake teams)
    → sweepstake participants for each side

─── Output ────────────────────────────────────────────────
  1. Print Slack message to stdout
  2. Copy Slack message to clipboard via pbcopy (macOS)
  3. Print "✓ Copied to clipboard" to stderr
  4. Print ⏰ NEXT UPDATE block to stderr (not copied)
  5. Write current timestamp to scripts/last-update.json
```

---

## Team Name Matching

football-data.org names sometimes differ from display names in `draw.ts`. Always resolve using:

```typescript
participant.apiName ?? participant.team;
```

This covers cases like `Bosnia and Herzegovina` → `"Bosnia-Herzegovina"` (apiName).

---

## Slack Message Format

```
⚽ Sweepstake update — here's what you missed...

[one line per elimination, e.g. "Stuart's Bosnia are out — [edit]"]
[derby results, e.g. "Patrick's Netherlands 2–1 Jill's Japan ⚔️ Derby result"]
[notable results, e.g. "Nelson's Argentina beat Iran 3–0"]

Still alive: X/29
Full standings 👉 https://world-cup-sweepstakes-rose.vercel.app/
```

Rules:

- One punchy line per elimination. Template provides the fact; user edits the flavour.
- Derby result lines include both participants by first name.
- Notable result lines include the participant's first name.
- Maximum 15 lines total.
- If nothing has changed since last update, message reads: `"No changes since last update — X/29 still alive."`

---

## ⏰ NEXT UPDATE Block (stderr only, not copied)

```
⏰ NEXT UPDATE
Next sweepstake fixture: [Team] vs [Team] — [date] [time] UTC
[⚔️ DERBY — [Participant] vs [Participant]] or [One participant: [Name]'s [Team]]
Suggested: run sweepstake-update after [utcDate + 105 min] (kick-off + 90 min match + 15 min buffer)
```

Printed to stderr so it does not contaminate the clipboard copy.

---

## State File

`scripts/last-update.json`:

```json
{ "lastUpdate": "2026-06-15T14:30:00.000Z" }
```

- Written on every successful run (after output is generated).
- If the file does not exist or is malformed, defaults to 24 hours ago — ensures the first run always produces output.
- Gitignored — local machine state only.

---

## Error Handling

| Scenario                         | Behaviour                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------- |
| API key missing                  | Exit with clear message: `"Error: FOOTBALL_DATA_API_KEY not set in .env.local"` |
| API request fails                | Exit with message; do not update last-update.json                               |
| Rate limit (429)                 | Exit with message; do not update last-update.json                               |
| last-update.json malformed       | Warn and default to 24h ago; continue                                           |
| pbcopy not available (non-macOS) | Print message only; skip clipboard; warn                                        |
| No sweepstake changes detected   | Generate minimal message ("No changes since last update")                       |

---

## Gitignore Addition

```
scripts/last-update.json
```

---

## Voice Guidelines (for template copy)

The generated one-liners are lightly templated — factually complete but left for the user to personalise before posting. Templates read naturally but are marked for editing where tone matters most.

Example templates:

- Elimination: `"Stuart's Bosnia are out — beaten [score] by [opponent] [edit me]"`
- Derby win: `"Patrick's Netherlands [score] Jill's Japan — Patrick's week just got better"`
- Notable win: `"Nelson's Argentina beat Iran 3–0 — Messi era ending well so far"`

Author voice for edits: casual, first-person, football-literate, privately-educated Mancunian with an engineering degree

---

## Out of Scope

- Sending to Slack directly (webhook integration) — clipboard paste is intentional for editorial control
- Windows clipboard support (`clip`) — macOS only
- AI-generated one-liners — templates + user edits preferred
