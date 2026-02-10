'use client';

import { formatEther, type Address } from 'viem';

interface PlayerSquareProps {
  player: Address;
  rank: number;
  isEliminated: boolean;
  squareIndex: number;
  gainPercent: number;
  balance: bigint;
}

export default function PlayerSquare({
  player,
  rank,
  isEliminated,
  squareIndex,
  gainPercent,
  balance,
}: PlayerSquareProps) {
  const isTop10 = rank <= 10;
  const gainColor = gainPercent >= 0 ? 'text-green-400' : 'text-red-400';
  const gainSign = gainPercent >= 0 ? '+' : '';

  return (
    <div
      className={`w-full h-full rounded border flex flex-col items-center justify-center text-xs p-2 cursor-pointer transition-all ${
        isEliminated
          ? 'border-white/10 bg-black/30 opacity-60'
          : 'border-[var(--neon-blue)]/25 bg-black/40 hover:border-[var(--neon-blue)]/50'
      }`}
      title={`Square #${squareIndex + 1} - Rank #${rank}`}
    >
      <div className="text-gray-400 text-[10px] mb-1">#{squareIndex + 1}</div>
      {isEliminated ? (
        <div className="text-gray-400 text-[10px]">Eliminated</div>
      ) : (
        <>
          <div className="text-white text-[11px] font-medium mb-1 truncate w-full text-center" title={player}>
            {`${player.slice(0, 6)}...${player.slice(-4)}`}
          </div>
          <div className={`font-semibold text-[12px] mb-1 ${gainColor}`}>
            {gainSign}{gainPercent.toFixed(2)}%
          </div>
          <div className="text-gray-400 text-[10px]">
            {parseFloat(formatEther(balance)).toFixed(4)}
          </div>
        </>
      )}
    </div>
  );
}
