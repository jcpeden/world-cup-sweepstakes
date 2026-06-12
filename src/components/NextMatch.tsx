import type { Match, Participant } from '@/lib/types';

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
  draw: Participant[];
}

function TeamSlot({ name, participant, align }: { name: string; participant?: Participant; align: 'left' | 'right' }) {
  const avatar = participant && (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={participant.avatar}
      alt={participant.name}
      className="w-9 h-9 rounded-full object-cover flex-shrink-0 border-2 border-white/40"
    />
  );

  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {avatar}
      <span>{name}</span>
    </div>
  );
}

export function NextMatch({ match, draw }: NextMatchProps) {
  if (!match) return null;

  const isLive =
    match.status === 'IN_PLAY' || match.status === 'LIVE' || match.status === 'PAUSED';

  const homeParticipant = draw.find(p => (p.apiName ?? p.team) === match.homeTeam.name);
  const awayParticipant = draw.find(p => (p.apiName ?? p.team) === match.awayTeam.name);

  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl p-4 mb-6">
      <div className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-80">
        {isLive ? '🔴 Live Now' : 'Next Sweepstake Match'}
      </div>
      <div className="flex items-center justify-center gap-4 text-lg font-bold">
        <TeamSlot name={match.homeTeam.shortName} participant={homeParticipant} align="left" />
        <span className="opacity-50 text-base font-normal">vs</span>
        <TeamSlot name={match.awayTeam.shortName} participant={awayParticipant} align="right" />
      </div>
      <div className="text-center text-sm mt-1 opacity-80">
        {STAGE_LABELS[match.stage] ?? match.stage} · {formatKickoff(match.utcDate)}
      </div>
    </div>
  );
}
