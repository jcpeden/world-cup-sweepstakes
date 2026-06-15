import type { Match } from './types';

const BASE_URL = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';

async function fetchWithAuth(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY ?? '',
    },
    // next.revalidate is a Next.js fetch extension; cast to RequestInit for ts-node compatibility
    next: { revalidate: 60 },
  } as RequestInit);

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
      (m.status === 'SCHEDULED' || m.status === 'TIMED' || m.status === 'LIVE' || m.status === 'IN_PLAY' || m.status === 'PAUSED') &&
      (teamNames.includes(m.homeTeam.name) || teamNames.includes(m.awayTeam.name))
  );

  if (upcoming.length === 0) return null;

  return upcoming.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())[0];
}
