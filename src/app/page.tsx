import { getMatches, getNextSweepstakeMatch } from '@/lib/footballApi';
import { computeStandings } from '@/lib/standings';
import { draw } from '@/data/draw';
import { NextMatch } from '@/components/NextMatch';
import { Leaderboard } from '@/components/Leaderboard';
import { PrizePot } from '@/components/PrizePot';
import { formatKickoff } from '@/lib/formatDate';

export const revalidate = 60;

export default async function Home() {
  const matches = await getMatches();
  const standings = computeStandings(matches);
  const allApiTeamNames = draw.map(p => p.apiName ?? p.team);
  const nextMatch = getNextSweepstakeMatch(matches, allApiTeamNames);
  const lastUpdated = formatKickoff(new Date().toISOString());

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white">World Cup 2026</h1>
        <p className="text-green-300 mt-1">Sweepstakes · Live Standings</p>
      </header>
      <PrizePot />
      <NextMatch match={nextMatch} draw={draw} />
      <Leaderboard standings={standings} />
      <p className="text-center text-xs text-slate-400 mt-6">
        Last updated {lastUpdated} · Powered by football-data.org
      </p>
    </main>
  );
}
