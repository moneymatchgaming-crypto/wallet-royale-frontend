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
      className={`w-full h-full bg-[#1a1a1a] border ${
        isEliminated
          ? 'border-[#2a2a2a] opacity-30'
          : 'border-[#2a2a2a]'
      } flex flex-col items-center justify-center text-xs p-2 cursor-pointer hover:border-[#3a3a3a] transition-all`}
      title={`Square #${squareIndex + 1} - Rank #${rank}`}
    >
      <div className="text-[#9ca3af] text-[10px] mb-1">#{squareIndex + 1}</div>
      {isEliminated ? (
        <div className="text-[#9ca3af] text-[10px]">Eliminated</div>
      ) : (
        <>
          <div className="text-white text-[11px] font-medium mb-1 truncate w-full text-center" title={player}>
            {`${player.slice(0, 6)}...${player.slice(-4)}`}
          </div>
          <div className={`font-semibold text-[12px] mb-1 ${gainColor}`}>
            {gainSign}{gainPercent.toFixed(2)}%
          </div>
          <div className="text-[#9ca3af] text-[10px]">
            {parseFloat(formatEther(balance)).toFixed(4)}
          </div>
        </>
      )}
    </div>
  );
}
