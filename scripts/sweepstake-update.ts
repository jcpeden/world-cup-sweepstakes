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
    .flatMap((m): NotableResult[] => {
      const home = teamNameMap.get(m.homeTeam.name);
      const away = teamNameMap.get(m.awayTeam.name);
      if (m.score.winner === 'HOME_TEAM' && home) {
        return [{ match: m, participant: home, side: 'home' as const }];
      }
      if (m.score.winner === 'AWAY_TEAM' && away) {
        return [{ match: m, participant: away, side: 'away' as const }];
      }
      // winner is exhaustively 'HOME_TEAM' | 'AWAY_TEAM' after the filter above
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

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatGroupRecord(stats: GroupStats): string {
  return `${stats.won}W ${stats.drawn}D ${stats.lost}L, ${stats.points} pts`;
}

function formatScore(match: Match): string {
  return `${match.score.fullTime.home}–${match.score.fullTime.away}`;
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
    lines.push(`No changes since last update — ${activeCount}/${draw.length} still alive.`);
  } else {
    for (const s of eliminations) {
      lines.push(
        `${s.participant.name}'s ${s.participant.team} ${s.participant.flag} are out — ${formatGroupRecord(s.groupStats)} [edit]`
      );
    }
    for (const d of derbies) {
      const score = formatScore(d.match);
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
      const score = formatScore(n.match);
      const opponent = n.side === 'home' ? n.match.awayTeam.name : n.match.homeTeam.name;
      lines.push(
        `${n.participant.name}'s ${n.participant.team} ${n.participant.flag} beat ${opponent} ${score} [edit]`
      );
    }
  }

  lines.push('');
  lines.push(`Still alive: ${activeCount}/${draw.length}`);
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
