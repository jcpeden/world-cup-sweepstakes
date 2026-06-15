'use client';

import type { ParticipantStanding } from '@/lib/types';
import { STAGE_LABELS } from '@/lib/stageLabels';

function formatEliminationDate(utcDate: string): string {
  return new Date(utcDate).toLocaleDateString('en-GB', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function StatusBadge({ standing }: { standing: ParticipantStanding }) {
  if (standing.rank === 1 && !standing.tied) {
    return (
      <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full">
        🥇 1st
      </span>
    );
  }
  if (standing.rank === 2 && !standing.tied) {
    return (
      <span className="bg-gray-300 text-gray-800 text-xs font-bold px-2 py-0.5 rounded-full">
        🥈 2nd
      </span>
    );
  }
  if (standing.rank === 3 && !standing.tied) {
    return (
      <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
        🥉 3rd
      </span>
    );
  }
  if (standing.status === 'active') {
    return (
      <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">
        Active
      </span>
    );
  }
  const stageLabel = standing.stage === 'GROUP_STAGE' ? '' : ` · ${STAGE_LABELS[standing.stage]}`;
  return (
    <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
      Out{stageLabel}
    </span>
  );
}

function StandingRow({ standing }: { standing: ParticipantStanding }) {
  const isEliminated = standing.status === 'eliminated';

  return (
    <div
      className={`flex items-center gap-3 py-3 px-4 border-b border-gray-100 last:border-0 ${
        isEliminated ? 'opacity-50' : ''
      }`}
    >
      <span className="text-gray-400 font-mono text-sm w-8 text-right flex-shrink-0">
        {standing.rank}{standing.tied ? '=' : ''}
      </span>
      <img
        src={standing.participant.avatar}
        alt={standing.participant.name}
        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
        onError={e => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 text-sm">{standing.participant.name}</div>
        <div className="text-gray-400 text-xs">{standing.participant.flag} {standing.participant.team}</div>
        {standing.stage === 'GROUP_STAGE' && (
          <div className="text-gray-400 text-xs">
            {standing.groupStats.won}W {standing.groupStats.drawn}D {standing.groupStats.lost}L · {standing.groupStats.points}pts
          </div>
        )}
      </div>
      <StatusBadge standing={standing} />
    </div>
  );
}

interface LeaderboardProps {
  standings: ParticipantStanding[];
}

export function Leaderboard({ standings }: LeaderboardProps) {
  const active = standings.filter(s => s.status !== 'eliminated');
  const eliminated = standings.filter(s => s.status === 'eliminated');

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {active.length > 0 && (
        <div>
          <div className="bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 uppercase tracking-wider">
            Still In ({active.length})
          </div>
          {active.map(s => (
            <StandingRow key={s.participant.name} standing={s} />
          ))}
        </div>
      )}
      {eliminated.length > 0 && (
        <div>
          <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-t border-gray-100">
            Eliminated ({eliminated.length})
          </div>
          {eliminated.map(s => (
            <StandingRow key={s.participant.name} standing={s} />
          ))}
          {(() => {
            const timelineEntries = eliminated
              .filter(s => s.eliminatedDate !== undefined)
              .sort((a, b) =>
                new Date(b.eliminatedDate!).getTime() - new Date(a.eliminatedDate!).getTime()
              );
            if (timelineEntries.length === 0) return null;
            return (
              <div className="border-t border-gray-100 mt-1">
                <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Timeline
                </div>
                <ul className="overflow-y-auto max-h-60">
                  {timelineEntries.map(s => (
                    <li key={s.participant.name} className="px-4 py-2 text-xs text-gray-500 border-b border-gray-50 last:border-0">
                      {s.participant.flag}{' '}
                      <span className="font-medium text-gray-700">{s.participant.team}</span>
                      {' '}eliminated —{' '}
                      <span className="font-medium">{s.participant.name}</span>
                      {' '}out — {STAGE_LABELS[s.stage] ?? s.stage} · {formatEliminationDate(s.eliminatedDate!)}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
