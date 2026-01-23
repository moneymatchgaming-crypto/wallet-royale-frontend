'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACT_ADDRESS, contractABI } from '@/lib/contract';
import GameBoard from '@/components/GameBoard';
import Sidebar from '@/components/Sidebar';
import { Address } from 'viem';

interface GameData {
  gameId: bigint;
  startTime: bigint;
  endTime: bigint;
  currentRound: bigint;
  totalRounds: bigint;
  roundDuration: bigint;
  playerCount: bigint;
  prizePool: bigint;
  active: boolean;
  finalized: boolean;
  cancelled: boolean;
  entryFee: bigint;
  registrationDeadline: bigint;
  minPlayers: bigint;
  operationsFund: bigint;
  platformFee: bigint;
  totalGasReimbursed: bigint;
}

export default function GamePage() {
  const params = useParams();
  const gameId = params?.gameId ? parseInt(params.gameId as string) : 0;
  const { address } = useAccount();

  const { data: gameData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'games',
    args: [BigInt(gameId)],
  });

  const { data: gameStatus } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'getGameStatus',
    args: [BigInt(gameId)],
  });

  const { data: startRewardData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'getStartReward',
    args: [BigInt(gameId)],
  });

  const { data: canStartData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'canGameStart',
    args: [BigInt(gameId)],
  });

  // Get user's player status - MUST be called before any conditional returns
  const { data: userPlayerData, refetch: refetchPlayer } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'getPlayer',
    args: [BigInt(gameId), address || ('0x0000000000000000000000000000000000000000' as Address)],
    query: { enabled: !!address && !!gameId && gameId > 0 },
  });

  // Refetch game data after successful registration
  const { refetch: refetchGame } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'games',
    args: [BigInt(gameId)],
  });

  // games() returns a tuple: [gameId, startTime, endTime, currentRound, totalRounds, roundDuration,
  //                            playerCount, prizePool, active, finalized, cancelled, entryFee,
  //                            registrationDeadline, minPlayers, operationsFund, platformFee, totalGasReimbursed]
  const gameArray = gameData as any[] | undefined;
  
  // Convert tuple to object for easier access - use useMemo to prevent recreation on every render
  const game: GameData | undefined = useMemo(() => {
    if (!gameArray) return undefined;
    return {
      gameId: gameArray[0] || 0n,
      startTime: gameArray[1] || 0n,
      endTime: gameArray[2] || 0n,
      currentRound: gameArray[3] || 0n,
      totalRounds: gameArray[4] || 0n,
      roundDuration: gameArray[5] || 0n,
      playerCount: gameArray[6] || 0n,
      prizePool: gameArray[7] || 0n,
      active: gameArray[8] || false,
      finalized: gameArray[9] || false,
      cancelled: gameArray[10] || false,
      entryFee: gameArray[11] || 0n,
      registrationDeadline: gameArray[12] || 0n,
      minPlayers: gameArray[13] || 0n,
      operationsFund: gameArray[14] || 0n,
      platformFee: gameArray[15] || 0n,
      totalGasReimbursed: gameArray[16] || 0n,
    };
  }, [gameArray]);

  const status = gameStatus as string | undefined;
  const [reward, rewardTimeRemaining] = (startRewardData as [bigint, bigint] | undefined) || [0n, 0n];
  const [canStart, reason] = (canStartData as [boolean, string] | undefined) || [false, ''];

  // Debug: Log game data to see what we're getting
  useEffect(() => {
    if (game) {
      console.log('Game data:', {
        gameId,
        entryFee: game.entryFee?.toString(),
        playerCount: game.playerCount?.toString(),
        hasStarted: game.startTime > 0n,
      });
    }
  }, [game, gameId]);

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Loading game...</p>
      </div>
    );
  }

  const hasStarted = game.startTime > 0n;
  const isFinished = game.finalized || game.cancelled;
  const now = Math.floor(Date.now() / 1000);
  const roundEndTime = Number(game.startTime) + Number(game.roundDuration);
  const timeRemaining = roundEndTime > now ? roundEndTime - now : 0;

  // getPlayer returns: [squareIndex, startValueUSDC, penaltyETH, penaltyUSDC, penaltyAERO, penaltyCAKE, alive, eliminationReason]
  // Index 0 = squareIndex, Index 6 = alive
  // If player is not registered, the mapping returns default values (squareIndex = 0, alive = false)
  // If player is registered but eliminated, alive = false but squareIndex > 0
  const userStatus = !address
    ? 'not_registered'
    : !userPlayerData
    ? 'not_registered'
    : (userPlayerData as any)[0] === 0 && (userPlayerData as any)[6] === false // squareIndex = 0 and alive = false = not registered
    ? 'not_registered'
    : (userPlayerData as any)[6] === false // alive = false but squareIndex > 0 = eliminated
    ? 'eliminated'
    : 'registered';

  // TODO: Fetch actual players from events or backend
  // For now, using empty array - will be populated via WebSocket or API
  const players: any[] = [];

  const statusLabels: Record<string, string> = {
    'REGISTRATION_OPEN': 'Registration Open',
    'READY_TO_START': 'Ready to Start',
    'LIVE': 'Live',
    'FINALIZED': 'Finished',
    'CANCELLED': 'Cancelled',
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <header className="border-b border-[#2a2a2a] bg-[#0f0f0f] px-4 sm:px-6 py-4 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-white">Game #{gameId}</h1>
            <span className={`px-2 py-1 text-xs font-medium ${
              status === 'LIVE' ? 'bg-blue-500 text-white' :
              status === 'REGISTRATION_OPEN' ? 'bg-[#fbbf24] text-black' :
              status === 'READY_TO_START' ? 'bg-[#10b981] text-white' :
              status === 'FINALIZED' ? 'bg-[#2a2a2a] text-[#9ca3af]' :
              'bg-red-500 text-white'
            }`}>
              {statusLabels[status || ''] || status}
            </span>
          </div>
        </div>
      </header>

      <main className="px-6 py-6">
        {!hasStarted && !isFinished ? (
          <div className="flex gap-6">
            <div className="flex-1">
              <GameBoard gameId={gameId} players={players} />
            </div>
            <Sidebar
              gameId={gameId}
              currentRound={0}
              totalRounds={Number(game.totalRounds)}
              timeRemaining={0}
              prizePool={game.prizePool}
              userStatus={userStatus as 'not_registered' | 'registered' | 'eliminated'}
              entryFee={game.entryFee}
              canStart={canStart}
              startReward={reward}
              rewardTimeRemaining={Number(rewardTimeRemaining)}
              onRegistrationSuccess={() => {
                refetchPlayer();
                refetchGame();
              }}
            />
          </div>
        ) : hasStarted && !isFinished ? (
          <div className="flex gap-6">
            <div className="flex-1">
              <GameBoard gameId={gameId} players={players} />
            </div>
            <Sidebar
              gameId={gameId}
              currentRound={Number(game.currentRound)}
              totalRounds={Number(game.totalRounds)}
              timeRemaining={timeRemaining}
              prizePool={game.prizePool}
              userStatus={userStatus as 'not_registered' | 'registered' | 'eliminated'}
              entryFee={game.entryFee}
              canStart={false}
              startReward={0n}
              rewardTimeRemaining={0}
              onRegistrationSuccess={() => {
                refetchPlayer();
                refetchGame();
              }}
            />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto text-center py-20">
            <h2 className="text-2xl font-semibold text-white mb-4">
              {game.cancelled ? 'Game Cancelled' : 'Game Finished'}
            </h2>
            <div className="bg-[#1a1a1a] border border-[#fbbf24] p-4 inline-block">
              <div className="text-xs text-[#9ca3af] mb-1">Final Prize Pool</div>
              <div className="text-2xl font-semibold text-[#10b981]">{formatEther(game.prizePool)} ETH</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
