import type { Match } from '@/lib/types';

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: 'Group Stage',
  LAST_32: 'Round of 32',
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-Final',
  SEMI_FINALS: 'Semi-Final',
  THIRD_PLACE: '3rd Place Play-off',
  FINAL: 'Final',
};

function formatKickoff(utcDate: string): string {
  return new Date(utcDate).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

interface NextMatchProps {
  match: Match | null;
}

export function NextMatch({ match }: NextMatchProps) {
  if (!match) return null;

  const isLive =
    match.status === 'IN_PLAY' || match.status === 'LIVE' || match.status === 'PAUSED';

  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl p-4 mb-6">
      <div className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-80">
        {isLive ? '🔴 Live Now' : 'Next Sweepstake Match'}
      </div>
      <div className="flex items-center justify-center gap-4 text-lg font-bold">
        <span>{match.homeTeam.shortName}</span>
        <span className="opacity-50 text-base font-normal">vs</span>
        <span>{match.awayTeam.shortName}</span>
      </div>
      <div className="text-center text-sm mt-1 opacity-80">
        {STAGE_LABELS[match.stage] ?? match.stage} · {formatKickoff(match.utcDate)}
      </div>
    </div>
  );
}
