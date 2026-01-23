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

const statusColors = {
  REGISTRATION_OPEN: 'bg-yellow-500',
  READY_TO_START: 'bg-green-500',
  LIVE: 'bg-blue-500',
  FINALIZED: 'bg-gray-500',
  CANCELLED: 'bg-red-500',
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

      if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeRemaining(`${minutes}m ${seconds}s`);
      } else {
        setTimeRemaining(`${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [deadline, status]);

  // Handle BigInt or string values, with fallback to 0
  const entryFeeValue = entryFee 
    ? (typeof entryFee === 'bigint' ? entryFee : BigInt(String(entryFee) || '0'))
    : 0n;
  const prizePoolValue = prizePool
    ? (typeof prizePool === 'bigint' ? prizePool : BigInt(String(prizePool) || '0'))
    : 0n;
  
  const entryFeeEth = formatEther(entryFeeValue);
  const entryFeeUsd = (parseFloat(entryFeeEth) * 3300).toFixed(2); // Approximate ETH price
  const prizePoolEth = formatEther(prizePoolValue);

  const statusLabels = {
    REGISTRATION_OPEN: 'Registration Open',
    READY_TO_START: 'Ready to Start',
    LIVE: 'Live',
    FINALIZED: 'Finished',
    CANCELLED: 'Cancelled',
  };

  return (
    <Link href={`/game/${gameId}`}>
      <div 
        className="p-6 rounded-3xl transition-all cursor-pointer group font-sans border"
        style={{ 
          backgroundColor: 'rgba(31, 41, 55, 0.5)', 
          backdropFilter: 'blur(24px)', 
          WebkitBackdropFilter: 'blur(24px)',
          borderColor: 'rgb(55, 65, 79)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(196, 181, 253, 0.5)';
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(196, 181, 253, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgb(55, 65, 79)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white font-sans">
            Game #{gameId}
          </h3>
          <span className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${statusColors[status]} font-sans`}>
            {statusLabels[status]}
          </span>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-500 text-sm font-sans">Entry Fee</span>
            <div className="text-right">
              <span className="text-white font-semibold text-lg font-sans">{entryFeeEth} ETH</span>
              <span className="text-gray-500 text-xs block font-sans">≈ ${entryFeeUsd}</span>
            </div>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-500 text-sm font-sans">Players</span>
            <span className="text-white font-semibold font-sans">{playerCount} / {minPlayers} min</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-500 text-sm font-sans">Prize Pool</span>
            <span className="text-cyan-400 font-bold text-lg font-sans">{prizePoolEth} ETH</span>
          </div>
          {timeRemaining && (
            <div className="pt-4 mt-4 border-t border-gray-700">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm font-sans">Registration Closes</span>
                <span className="text-purple-400 font-semibold font-sans">{timeRemaining}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
