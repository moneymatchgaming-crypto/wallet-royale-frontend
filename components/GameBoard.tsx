'use client';

import { useEffect, useState } from 'react';
import PlayerSquare from './PlayerSquare';
import { useGameUpdates } from '@/hooks/useGameUpdates';
import { Address } from 'viem';

interface Player {
  wallet: Address;
  squareIndex: number;
  rank: number;
  isEliminated: boolean;
  gainPercent: number;
  balance: bigint;
}

interface GameBoardProps {
  gameId: number;
  players: Player[];
}

export default function GameBoard({ gameId, players }: GameBoardProps) {
  const [squares, setSquares] = useState<(Player | null)[]>(new Array(100).fill(null));
  const { scores } = useGameUpdates(gameId);

  useEffect(() => {
    const newSquares = new Array(100).fill(null) as (Player | null)[];
    
    // Merge players with real-time scores from WebSocket
    players.forEach((player) => {
      if (player.squareIndex >= 0 && player.squareIndex < 100) {
        const updatedPlayer = { ...player };
        
        // Update with WebSocket data if available
        if (scores[player.wallet]) {
          updatedPlayer.rank = scores[player.wallet].rank;
          updatedPlayer.gainPercent = scores[player.wallet].gainPercent;
          updatedPlayer.balance = scores[player.wallet].balance;
          updatedPlayer.isEliminated = scores[player.wallet].isEliminated;
        }
        
        newSquares[player.squareIndex] = updatedPlayer;
      }
    });
    
    setSquares(newSquares);
  }, [players, scores]);

  return (
    <div className="w-full">
      <div className="grid grid-cols-10 gap-1">
        {squares.map((player, index) => (
          <div key={index} className="aspect-square">
            {player ? (
              <PlayerSquare
                player={player.wallet}
                rank={player.rank}
                isEliminated={player.isEliminated}
                squareIndex={index}
                gainPercent={player.gainPercent}
                balance={player.balance}
              />
            ) : (
              <div className="w-full h-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-[#9ca3af] text-[10px] hover:border-[#3a3a3a] transition-colors">
                #{index + 1}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
