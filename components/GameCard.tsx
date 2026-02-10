'use client';

import { formatEther } from 'viem';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface GameCardProps {
  gameId: number;
  entryFee: bigint | string | undefined;
  playerCount: number;
  minPlayers: number;
  deadline: number;
  status: 'REGISTRATION_OPEN' | 'READY_TO_START' | 'LIVE' | 'FINALIZED' | 'CANCELLED';
  prizePool: bigint | string | undefined;
}

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
  REGISTRATION_OPEN: { bg: 'rgba(251, 191, 36, 0.15)', border: 'var(--accent-yellow)', text: '#fbbf24' },
  READY_TO_START: { bg: 'rgba(16, 185, 129, 0.15)', border: 'var(--accent-green)', text: '#10b981' },
  LIVE: { bg: 'rgba(0, 212, 255, 0.15)', border: 'var(--neon-blue)', text: 'var(--neon-cyan)' },
  FINALIZED: { bg: 'rgba(107, 114, 128, 0.2)', border: '#6b7280', text: '#9ca3af' },
  CANCELLED: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#f87171' },
};

export default function GameCard({
  gameId,
  entryFee,
  playerCount,
  minPlayers,
  deadline,
  status,
  prizePool,
}: GameCardProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const isTeamBlue = gameId % 2 === 0;
  const teamColor = isTeamBlue ? 'var(--neon-blue)' : 'var(--neon-pink)';
  const teamGlow = isTeamBlue
    ? '0 0 20px rgba(0, 212, 255, 0.25), 0 0 40px rgba(0, 212, 255, 0.08)'
    : '0 0 20px rgba(255, 45, 149, 0.25), 0 0 40px rgba(255, 45, 149, 0.08)';

  useEffect(() => {
    const updateCountdown = () => {
      if (status !== 'REGISTRATION_OPEN' && status !== 'READY_TO_START') {
        setTimeRemaining('');
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const remaining = deadline - now;
      if (remaining <= 0) {
        setTimeRemaining('Deadline passed');
        return;
      }
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      if (hours > 0) setTimeRemaining(`${hours}h ${minutes}m`);
      else if (minutes > 0) setTimeRemaining(`${minutes}m ${seconds}s`);
      else setTimeRemaining(`${seconds}s`);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [deadline, status]);

  const entryFeeValue = entryFee
    ? (typeof entryFee === 'bigint' ? entryFee : BigInt(String(entryFee) || '0'))
    : 0n;
  const prizePoolValue = prizePool
    ? (typeof prizePool === 'bigint' ? prizePool : BigInt(String(prizePool) || '0'))
    : 0n;
  const entryFeeEth = formatEther(entryFeeValue);
  const entryFeeUsd = (parseFloat(entryFeeEth) * 3300).toFixed(2);
  const prizePoolEth = formatEther(prizePoolValue);

  const statusLabels: Record<string, string> = {
    REGISTRATION_OPEN: 'Registration Open',
    READY_TO_START: 'Ready to Start',
    LIVE: 'Live',
    FINALIZED: 'Finished',
    CANCELLED: 'Cancelled',
  };
  const sc = statusColors[status] ?? statusColors.FINALIZED;

  return (
    <Link href={`/game/${gameId}`} className="block group w-full max-w-sm mx-auto">
      <div
        className="relative p-8 transition-all duration-300 cursor-pointer font-sans overflow-hidden border-2"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderColor: `${teamColor}`,
          borderRadius: '20px',
          boxShadow: `${teamGlow}, inset 0 0 0 1px rgba(255,255,255,0.06)`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
          e.currentTarget.style.boxShadow = isTeamBlue
            ? '0 0 24px rgba(0, 212, 255, 0.4), 0 0 48px rgba(0, 212, 255, 0.15), inset 0 0 0 1px rgba(255,255,255,0.08), 0 8px 24px -8px rgba(0,0,0,0.5)'
            : '0 0 24px rgba(255, 45, 149, 0.4), 0 0 48px rgba(255, 45, 149, 0.15), inset 0 0 0 1px rgba(255,255,255,0.08), 0 8px 24px -8px rgba(0,0,0,0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.borderColor = teamColor;
          e.currentTarget.style.boxShadow = `${teamGlow}, inset 0 0 0 1px rgba(255,255,255,0.06)`;
        }}
      >
        {/* Team color indicator bar (blue vs pink) - follows card top radius */}
        <div
          className="absolute top-0 left-0 right-0 h-1 rounded-t-[18px]"
          style={{
            background: `linear-gradient(90deg, ${teamColor}, ${isTeamBlue ? 'var(--neon-pink)' : 'var(--neon-blue)'}40)`,
            boxShadow: `0 0 10px ${teamColor}`,
          }}
        />

        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white font-sans">Game #{gameId}</h3>
          <span
            className="px-3 py-1 text-xs font-semibold rounded-lg font-sans"
            style={{ backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}60` }}
          >
            {statusLabels[status]}
          </span>
        </div>

        {/* Entry fee as prize-pool style */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span className="text-[var(--text-muted)] text-xs font-sans uppercase tracking-wider">Entry Fee</span>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span
              className="text-xl font-bold text-white font-sans"
              style={{ textShadow: `0 0 12px ${teamColor}80` }}
            >
              {entryFeeEth} ETH
            </span>
            <span className="text-sm text-[var(--text-muted)] font-sans">≈ ${entryFeeUsd}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[var(--text-muted)] text-sm font-sans">Players</span>
            <span className="text-white font-semibold font-sans">{playerCount} / {minPlayers} min</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (playerCount / Math.max(minPlayers, 1)) * 100)}%`,
                background: `linear-gradient(90deg, ${teamColor}, ${isTeamBlue ? 'var(--neon-pink)' : 'var(--neon-blue)'})`,
              }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[var(--text-muted)] text-sm font-sans">Prize Pool</span>
            <span
              className="font-bold font-sans"
              style={{ color: 'var(--neon-cyan)', textShadow: '0 0 8px rgba(34,211,238,0.4)' }}
            >
              {prizePoolEth} ETH
            </span>
          </div>
        </div>

        {timeRemaining && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)] text-sm font-sans">Registration closes</span>
              <span className="font-semibold font-sans" style={{ color: 'var(--neon-magenta)' }}>
                {timeRemaining}
              </span>
            </div>
          </div>
        )}

        {/* Join - transparent plastic rectangle */}
        <div className="mt-5 flex justify-end">
          <span className="inline-flex items-center justify-center min-w-[80px] px-4 py-2 rounded-md text-sm font-bold text-white plastic-rect plastic-tint-blue">
            Join
          </span>
        </div>
      </div>
    </Link>
  );
}
