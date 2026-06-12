# World Cup 2026 Sweepstakes Tracker — Design Spec

**Date:** 2026-06-12
**Status:** Approved

---

## Overview

A simple, read-only web app deployed to Vercel that lets 29 participants track their World Cup 2026 sweepstakes standings in real time. The draw is complete and fixed. Match data is fetched live from football-data.org. No database, no auth, no admin UI.

---

## The Draw

Each participant has been assigned one team. The mapping is static and hardcoded in `src/data/draw.ts`.

| # | Name | Team | Avatar |
|---|------|------|--------|
| 1 | Sara | South Korea | https://avatars.slack-edge.com/2025-03-30/8701535238336_3b4bf759ccfa50cec51e_192.jpg |
| 2 | Stuart | Bosnia and Herzegovina | https://avatars.slack-edge.com/2026-01-21/10321868246167_4f2fd1a5c1a93f3ff7d2_192.jpg |
| 3 | Hugo | Mexico | https://avatars.slack-edge.com/2025-12-03/10048692234388_f83f36f33289ed670835_192.jpg |
| 4 | John Peden | Senegal | https://avatars.slack-edge.com/2026-01-20/10328963602133_d06d5555b0ffbb0ce1fc_192.jpg |
| 5 | Patrick | Netherlands | https://avatars.slack-edge.com/2025-08-05/9294115487959_8d587e94f50c0b8ecc20_192.png |
| 6 | TC | Jordan | https://avatars.slack-edge.com/2021-10-11/2590560350803_f8ae440d4e8243ebde09_192.jpg |
| 7 | Joe | Iran | https://avatars.slack-edge.com/2025-01-06/8237410353383_13c09303a9ad617a5298_192.jpg |
| 8 | Flo | Morocco | https://avatars.slack-edge.com/2025-10-31/9797788987607_a416e9452406e9638df4_192.jpg |
| 9 | Uri | Croatia | https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRoG4JtPgwW0Kw-JfhN_TGt-0tYXOqna3x_EA&s |
| 10 | Brett | Egypt | https://avatars.slack-edge.com/2024-05-21/7149075294085_23f696274841225e96f6_192.jpg |
| 11 | Nelson | Argentina | https://avatars.slack-edge.com/2025-06-23/9077224048711_6ce8830c41c0c79a3e9c_192.jpg |
| 12 | Charlie Chrisman | Norway | https://avatars.slack-edge.com/2025-10-06/9647994990132_67844cfcbb4b8ac75a76_192.jpg |
| 13 | Miles | Germany | https://avatars.slack-edge.com/2021-10-04/2549341469831_c4bcfbfaaa5d5b2bd703_192.jpg |
| 14 | Mariano | Ghana | https://avatars.slack-edge.com/2024-12-02/8134598053280_e5551f17120f75458250_192.jpg |
| 15 | Nick | England | https://avatars.slack-edge.com/2022-08-17/3951325299989_e4f5918de5c3a0b7c2af_192.jpg |
| 16 | Matthew | Panama | https://ca.slack-edge.com/T02917R46-U0A1G5W1YNS-aa46a0cb74ae-512 |
| 17 | Jill | Japan | https://avatars.slack-edge.com/2026-03-16/10739437561280_93df339dc6dde5d479c4_192.png |
| 18 | Sean | Sweden | https://avatars.slack-edge.com/2025-08-06/9314111761765_600bffcc995db8849b1d_192.jpg |
| 19 | Ron | Qatar | https://ca.slack-edge.com/T02917R46-U0A6QTXAF2S-9a8bda57b37c-512 |
| 20 | Aubrie | Haiti | https://avatars.slack-edge.com/2021-09-20/2508538625013_93cd1c949218b2f59915_192.jpg |
| 21 | Amie | Iraq | https://avatars.slack-edge.com/2021-03-01/1831972940464_fc756527a66293df4f63_192.png |
| 22 | Neha | Saudi Arabia | https://avatars.slack-edge.com/2022-09-21/4118793000740_d8aae37f7c8c53c7915b_192.png |
| 23 | Tobi | Austria | https://avatars.slack-edge.com/2026-01-06/10224457227639_10e4877c93c70e7539d6_192.jpg |
| 24 | Nadia | Czechia | https://avatars.slack-edge.com/2024-09-04/7676551397378_43271337e04cbe525efa_192.png |
| 25 | Lauren | Canada | https://avatars.slack-edge.com/2026-02-11/10484317293331_4b09801d7bbe9e8c3e86_192.png |
| 26 | Zoe | Türkiye | https://cdn.theorg.com/899daa80-eca2-436e-b434-cfc77f096fe2_medium.jpg |
| 27 | Maarten | Uruguay | https://avatars.slack-edge.com/2023-04-26/5195156399328_126598cd825fe37c6329_192.jpg |
| 28 | Charlie Bell | Ecuador | https://avatars.slack-edge.com/2023-03-13/4963475625344_a2aa617d37e414071998_192.png |
| 29 | Steven | South Africa | https://avatars.slack-edge.com/2025-02-12/8425856187575_b17eca5f8c1e624f806b_192.jpg |

---

## Scoring Model

Rankings are determined solely by how far a participant's team progresses in the tournament. There is no points-per-match system.

| Tournament outcome | Sweepstakes position |
|---|---|
| Win the final | 1st |
| Lose the final | 2nd |
| Win 3rd place playoff | 3rd |
| Lose 3rd place playoff | 4th (tied with SF loser) |
| QF eliminated | 5th–8th (tied) |
| R16 eliminated | 9th–16th (tied) |
| R32 eliminated | 17th–32nd (tied) |
| Group stage eliminated | 33rd+ (tied) |
| Still active | Tied at current round |

Ties are expected and intentional. Early in the tournament most participants will share a rank. The standings become decisive as the knockout rounds progress.

---

## Architecture

```
src/data/draw.ts         — static participant → team mapping (never changes)
src/lib/footballApi.ts   — fetches match + standings data from football-data.org
src/lib/standings.ts     — computeStandings(): derives rank for each participant
src/app/page.tsx         — ISR page (revalidate: 60s), renders three UI sections
```

Single Next.js 15 App Router project. No client components required for core functionality. Deployed to Vercel via standard Git integration.

### Data flow

```
draw.ts (static)  +  football-data.org API
        ↓
  computeStandings()
        ↓
  /app/page.tsx (ISR, revalidate: 60s)
        ↓
  Next Match banner + Leaderboard + Active/Eliminated split
```

---

## Football API

**Provider:** football-data.org
**Tier:** Free (10 requests/min — sufficient for ISR with 60s revalidation)
**Auth:** API key in environment variable `FOOTBALL_DATA_API_KEY`
**Endpoints used:**
- `GET /v4/competitions/WC/matches` — all tournament matches with scores and status
- `GET /v4/competitions/WC/standings` — group stage tables (used to determine group elimination order)

### `computeStandings()` logic

1. Build a map of team name → furthest round reached and elimination status from match data
2. For each entry in the draw, look up their team in the map
3. Assign a numeric rank score based on round reached (see scoring table)
4. Sort participants by rank score descending; ties remain tied
5. Return ranked list with: participant name, team name, team flag, round reached, active/eliminated status

---

## UI — Single Page

### Next Match Banner
Shows the next scheduled match involving any sweepstake participant's team. Displays: home team flag + name vs away team flag + name, kickoff datetime (local time). Hidden if no upcoming matches remain.

### Leaderboard
Full ranked list of all 29 participants. Each row shows:
- Rank (or tied rank, e.g. "5th=")
- Participant name
- Team flag + name
- Status badge: `Active` (with current round) or `Eliminated` (with round eliminated)

Rows are visually separated into two sections: **Still In** and **Eliminated**.

### Styling
Matches the aesthetic of the existing draw page: dark gradient header, white card container, flag emojis, clean table layout. Built with Tailwind CSS. Participant avatar photos are shown alongside names in the leaderboard, sourced directly from the draw data.

---

## Error Handling

If the football-data.org API is unavailable or rate-limited, Vercel serves the last cached ISR version silently. No error state is shown to users. If no cached version exists (first deploy, API down), a fallback state shows "Tournament data loading…" rather than an error page.

---

## Deployment

- **Platform:** Vercel
- **Environment variable:** `FOOTBALL_DATA_API_KEY`
- **Revalidation:** 60 seconds (can be reduced to 30s during live matches if desired)
- **URL:** Shared internally — no auth required, public read access

---

## Out of Scope

- Admin UI or manual result entry
- Database or persistent storage
- User accounts or personalisation
- Push notifications or live score alerts
- Prize pool tracking
- Team odds display
- Team factoids (both available in draw HTML for future use)
