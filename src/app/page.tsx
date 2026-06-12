import { getMatches, getNextSweepstakeMatch } from '@/lib/footballApi';
import { computeStandings } from '@/lib/standings';
import { draw } from '@/data/draw';
import { NextMatch } from '@/components/NextMatch';
import { Leaderboard } from '@/components/Leaderboard';

export const revalidate = 60;

export default async function Home() {
  const matches = await getMatches();
  const standings = computeStandings(matches);
  const allApiTeamNames = draw.map(p => p.apiName ?? p.team);
  const nextMatch = getNextSweepstakeMatch(matches, allApiTeamNames);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">World Cup 2026</h1>
        <p className="text-gray-500 mt-1">Sweepstakes · Live Standings</p>
      </header>
      <NextMatch match={nextMatch} />
      <Leaderboard standings={standings} />
      <p className="text-center text-xs text-gray-400 mt-6">
        Updates every 60 seconds · Powered by football-data.org
      </p>
    </main>
  );
}
