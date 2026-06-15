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
