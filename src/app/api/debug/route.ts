import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY ?? '';
  const hasKey = apiKey.length > 0;

  let matchData: unknown = null;
  let error: string | null = null;

  try {
    const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': apiKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      error = `HTTP ${res.status}: ${await res.text()}`;
    } else {
      const json = await res.json() as { matches: Array<{ id: number; stage: string; status: string; homeTeam: { name: string }; awayTeam: { name: string }; score: { winner: string | null } }> };
      const matches = json.matches ?? [];
      const finished = matches.filter(m => m.status === 'FINISHED');
      matchData = {
        totalMatches: matches.length,
        finishedMatches: finished.length,
        stages: [...new Set(matches.map(m => m.stage))],
        statuses: [...new Set(matches.map(m => m.status))],
        finishedSample: finished.slice(0, 10).map(m => ({
          stage: m.stage,
          status: m.status,
          home: m.homeTeam.name,
          away: m.awayTeam.name,
          winner: m.score.winner,
        })),
      };
    }
  } catch (e) {
    error = String(e);
  }

  return NextResponse.json({ hasKey, error, matchData });
}
