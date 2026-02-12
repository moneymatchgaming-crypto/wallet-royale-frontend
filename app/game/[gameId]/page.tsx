'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther, formatUnits, parseAbiItem, parseEventLogs } from 'viem';
import { CONTRACT_ADDRESS, contractABI, publicClient } from '@/lib/contract';
import GameBoard from '@/components/GameBoard';
import Sidebar from '@/components/Sidebar';
import { Address } from 'viem';
import { fetchGamePlayers, PlayerData } from '@/lib/gameHelpers';

export interface WinnerData {
  address: Address;
  place: 1 | 2 | 3;
  prize: bigint;
  gainPercent: number | null;
}

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
  totalGasSpent: bigint;
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
      totalGasSpent: gameArray[17] || 0n,
    };
  }, [gameArray]);

  const status = gameStatus as string | undefined;
  const [reward, rewardTimeRemaining] = (startRewardData as [bigint, bigint] | undefined) || [0n, 0n];
  const [canStart, reason] = (canStartData as [boolean, string] | undefined) || [false, ''];

  // Calculate values needed for the hook (must be before conditional return)
  const currentRoundNum = game ? Number(game.currentRound) : 0;
  const hasStarted = game ? game.startTime > 0n : false;
  const isFinished = game ? (game.finalized || game.cancelled) : false;

  // Get current round data to fetch active players count (only if game has started)
  // Hook must be called before any conditional returns
  const { data: currentRoundData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'rounds',
    args: [BigInt(gameId), BigInt(currentRoundNum)],
    query: { enabled: !!game && hasStarted && !isFinished && currentRoundNum > 0 },
  });

  // Get all players to find the winner (only if game is finalized)
  const { data: gamePlayers } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'getGamePlayers',
    args: [BigInt(gameId)],
    query: { enabled: !!game && game.finalized && !game.cancelled },
  });

  // Top 3 winners (alive players sorted by gain %) - MUST be before conditional return
  const [winners, setWinners] = useState<WinnerData[]>([]);
  const [prizeAmount, setPrizeAmount] = useState<bigint>(0n);
  /** Prize amounts for 1st / 2nd / 3rd (60% / 30% / 10%) so we always show them even when fewer than 3 winners */
  const [prize1st, setPrize1st] = useState<bigint>(0n);
  const [prize2nd, setPrize2nd] = useState<bigint>(0n);
  const [prize3rd, setPrize3rd] = useState<bigint>(0n);
  const [losers, setLosers] = useState<Array<{ address: Address; gainPercent: number; eliminationRound: number }>>([]);
  const [finalizationTxHash, setFinalizationTxHash] = useState<string | null>(null);
  const [eliminatedPlayers, setEliminatedPlayers] = useState<string[]>([]);
  const [registrationCountdown, setRegistrationCountdown] = useState<string>('');
  const [loadingWinnerData, setLoadingWinnerData] = useState<boolean>(false);
  const [winnerDataError, setWinnerDataError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Map<string, Map<number, bigint>>>(new Map());
  const [roundEndSnapshots, setRoundEndSnapshots] = useState<Map<string, Map<number, bigint>>>(new Map());
  const [loadingSnapshots, setLoadingSnapshots] = useState<boolean>(false);
  const [eliminationData, setEliminationData] = useState<Map<string, { round: number; startETH: bigint; endETH: bigint; gainPercent: number }>>(new Map());
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState<boolean>(false);

  // Extract active players and round timing from round data
  // rounds() returns: [roundNumber, startTime, endTime, alivePlayers, cutoffRank, finalized]
  const activePlayers = currentRoundData && Array.isArray(currentRoundData) 
    ? Number((currentRoundData as any[])[3] || 0n)
    : undefined;
  
  // Get the actual round end time from the round data (more accurate than calculating from game start)
  const roundEndTimeFromData = currentRoundData && Array.isArray(currentRoundData)
    ? Number((currentRoundData as any[])[2] || 0n) // endTime is at index 2
    : null;
  
  // Check if current round is finalized
  const roundFinalized = currentRoundData && Array.isArray(currentRoundData)
    ? (currentRoundData as any[])[5] === true // finalized is at index 5
    : false;

  // Debug: Log game data to see what we're getting
  useEffect(() => {
    if (game) {
      console.log('Game data:', {
        gameId,
        entryFee: game.entryFee?.toString(),
        playerCount: game.playerCount?.toString(),
        hasStarted: game.startTime > 0n,
        currentRound: game.currentRound?.toString(),
        roundDuration: game.roundDuration?.toString(),
      });
      if (currentRoundData) {
        console.log('Current round data:', currentRoundData);
      }
    }
  }, [game, gameId, currentRoundData]);

  // Find winner and losers - MUST be before conditional return
  useEffect(() => {
    console.log('🎮 useEffect for findWinnerAndLosers triggered', { 
      gameId, 
      hasGame: !!game, 
      finalized: game?.finalized, 
      cancelled: game?.cancelled, 
      hasPlayers: !!gamePlayers 
    });
    
    // Helper: Final Gain from Round 1 Start to Final/Elimination Round End (pure gameplay, no registration/outside movements)
    const calculateGameplayGainPercent = async (
      playerAddress: Address,
      isWinner: boolean,
      totalRounds: number
    ): Promise<number | null> => {
      try {
        const round1Start = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: contractABI,
          functionName: 'getRoundStartETH',
          args: [BigInt(gameId), 1n, playerAddress],
        }) as bigint;

        if (round1Start === 0n) {
          console.warn(`⚠️ Player ${playerAddress.slice(0, 10)}... has zero Round 1 Start ETH`);
          return null;
        }

        let endETH: bigint;

        if (isWinner) {
          // Winner: find their last round with an end snapshot (working backwards from totalRounds)
          let finalRoundEnd = 0n;
          for (let round = totalRounds; round >= 1; round--) {
            const roundEnd = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: contractABI,
              functionName: 'getRoundEndETH',
              args: [BigInt(gameId), BigInt(round), playerAddress],
            }) as bigint;
            if (roundEnd > 0n) {
              finalRoundEnd = roundEnd;
              break;
            }
          }
          endETH = finalRoundEnd;
        } else {
          // Eliminated: find last round where they have an end snapshot (their elimination round)
          let eliminationRoundEnd = 0n;
          for (let round = totalRounds; round >= 1; round--) {
            const roundEnd = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: contractABI,
              functionName: 'getRoundEndETH',
              args: [BigInt(gameId), BigInt(round), playerAddress],
            }) as bigint;
            if (roundEnd > 0n) {
              eliminationRoundEnd = roundEnd;
              break;
            }
          }
          endETH = eliminationRoundEnd;
        }

        const finalGain = ((endETH - round1Start) * 10000n) / round1Start;
        const finalGainPercent = Number(finalGain) / 100;
        console.log(`📊 Player ${playerAddress.slice(0, 10)}... gameplay gain: ${finalGainPercent.toFixed(2)}% (Round 1 Start: ${formatEther(round1Start)} ETH, End: ${formatEther(endETH)} ETH)`);
        return finalGainPercent;
      } catch (error) {
        console.error(`❌ Error calculating gameplay gain for ${playerAddress}:`, error);
        return null;
      }
    };

    const findWinnerAndLosers = async () => {
      console.log('🔍 findWinnerAndLosers called', { 
        hasGame: !!game, 
        finalized: game?.finalized, 
        cancelled: game?.cancelled, 
        hasPlayers: !!gamePlayers 
      });
      
      if (!game || !game.finalized || game.cancelled || !gamePlayers) {
        console.log('❌ Skipping - game not finalized or missing data', {
          hasGame: !!game,
          finalized: game?.finalized,
          cancelled: game?.cancelled,
          hasPlayers: !!gamePlayers
        });
        setPrize1st(0n);
        setPrize2nd(0n);
        setPrize3rd(0n);
        setLoadingWinnerData(false);
        setWinnerDataError('Game not finalized or missing player data');
        return;
      }
      
      setLoadingWinnerData(true);
      setWinnerDataError(null);
      
      try {
        let finalizeTxHash: string | null = null;

        // Get finalize transaction: RoundFinalized for final round (game.currentRound) is the tx that emits PrizePaid.
        try {
          const blockNumber = await publicClient.getBlockNumber();
          const fetchRoundLogs = async (from: bigint) =>
            publicClient.getContractEvents({
              address: CONTRACT_ADDRESS,
              abi: contractABI,
              eventName: 'RoundFinalized',
              args: { gameId: BigInt(gameId) },
              fromBlock: from,
              toBlock: blockNumber,
            });
          let roundLogs: Awaited<ReturnType<typeof fetchRoundLogs>>;
          try {
            roundLogs = await fetchRoundLogs(0n);
          } catch {
            roundLogs = blockNumber > 100_000n ? await fetchRoundLogs(blockNumber - 100_000n) : [];
          }
          type RoundFinalizedLog = { args: { roundNumber: bigint }; transactionHash: string; blockNumber: bigint };
          const roundEvents = roundLogs as unknown as RoundFinalizedLog[];
          const finalRoundEvent = roundEvents.find((e) => e.args.roundNumber === game.currentRound);
          if (finalRoundEvent) {
            finalizeTxHash = finalRoundEvent.transactionHash;
            console.log('🎯 Finalize tx from RoundFinalized(round=%s):', String(game.currentRound), finalizeTxHash);
          } else if (roundEvents.length > 0) {
            const sorted = [...roundEvents].sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
            finalizeTxHash = sorted[0].transactionHash;
            console.log('🎯 Finalize tx from latest RoundFinalized:', finalizeTxHash);
          }
        } catch (logError) {
          console.warn('Could not fetch RoundFinalized logs for finalize tx:', logError);
        }

        // Optional env fallback: set e.g. NEXT_PUBLIC_FINALIZE_TX_GAME_1=0x... for the current contract's tx
        if (!finalizeTxHash && typeof process.env[`NEXT_PUBLIC_FINALIZE_TX_GAME_${gameId}`] === 'string') {
          finalizeTxHash = process.env[`NEXT_PUBLIC_FINALIZE_TX_GAME_${gameId}`]!.trim();
          if (finalizeTxHash.startsWith('0x')) console.log(`🎯 Using finalize tx from env for game #${gameId}`);
        }

        // Prize pool: use contract value when > 0 (pre-finalize), else 70% of total entry fees (post-finalize contract zeroes it)
        const totalEntryFees = game.entryFee * game.playerCount;
        const calculatedPrizePool = (totalEntryFees * 70n) / 100n;
        const poolForDisplay = (game.prizePool != null && game.prizePool > 0n) ? game.prizePool : calculatedPrizePool;
        setPrizeAmount(poolForDisplay);

        // Placements: when game is finalized, use on-chain PrizePaid events (source of truth)
        const players = gamePlayers as Address[];
        console.log(`👥 Processing ${players.length} players for game #${gameId}`);
        
        if (players.length === 0) {
          console.warn('⚠️ No players found in game');
          setPrize1st(0n);
          setPrize2nd(0n);
          setPrize3rd(0n);
          setWinnerDataError('No players found in this game');
          setLoadingWinnerData(false);
          return;
        }
        
        const totalRounds = Number(game.totalRounds);
        const pool = poolForDisplay;
        const firstPlace = (pool * 60n) / 100n;
        const secondPlace = (pool * 30n) / 100n;
        const thirdPlace = (pool * 10n) / 100n;

        if (game.finalized) {
          // Source of truth: PrizePaid events. Prefer finalization tx receipt (exact logs); else getContractEvents.
          type PrizePaidArgs = { place: number | bigint; winner: Address; amount: bigint };
          type Placement = { place: 1 | 2 | 3; winner: Address; amount: bigint };

          const applyPlacements = async (placementsFromEvents: Placement[]) => {
            if (placementsFromEvents.length === 0) return false;
            const top3Set = new Set(placementsFromEvents.map((p) => p.winner.toLowerCase()));
            const winnersList: WinnerData[] = [];
            for (const p of placementsFromEvents) {
              const gainPercent = await calculateGameplayGainPercent(p.winner, p.place === 1, totalRounds);
              winnersList.push({ address: p.winner, place: p.place, prize: p.amount, gainPercent });
            }
            if (placementsFromEvents.some((p) => p.place === 1)) setPrize1st(placementsFromEvents.find((p) => p.place === 1)!.amount);
            if (placementsFromEvents.some((p) => p.place === 2)) setPrize2nd(placementsFromEvents.find((p) => p.place === 2)!.amount);
            if (placementsFromEvents.some((p) => p.place === 3)) setPrize3rd(placementsFromEvents.find((p) => p.place === 3)!.amount);
            const losersList: Array<{ address: Address; gainPercent: number; eliminationRound: number }> = [];
            for (const player of players) {
              if (top3Set.has(player.toLowerCase())) continue;
              // Fetch eliminationRound from the players mapping (index 10)
              let elimRound = 0;
              try {
                const playerStruct = await publicClient.readContract({
                  address: CONTRACT_ADDRESS,
                  abi: contractABI,
                  functionName: 'players',
                  args: [BigInt(gameId), player],
                });
                elimRound = Number((playerStruct as any[])[10] || 0n);
              } catch (e) {
                console.warn(`Could not fetch eliminationRound for ${player}:`, e);
              }
              const gainPercent = await calculateGameplayGainPercent(player, false, totalRounds);
              losersList.push({ address: player, gainPercent: gainPercent !== null ? gainPercent : 0, eliminationRound: elimRound });
            }
            // Sort by elimination round descending (later round = better placement), then gain% as tiebreaker
            losersList.sort((a, b) => b.eliminationRound - a.eliminationRound || b.gainPercent - a.gainPercent);
            setWinners(winnersList);
            setLosers(losersList);
            if (finalizeTxHash) setFinalizationTxHash(finalizeTxHash);
            setLoadingWinnerData(false);
            return true;
          };

          try {
            let placementsFromEvents: Placement[] = [];

            // 1) Prefer finalization tx receipt (same tx that emitted PrizePaid — no block range issues)
            if (finalizeTxHash) {
              const receipt = await publicClient.getTransactionReceipt({ hash: finalizeTxHash as `0x${string}` });
              if (receipt?.logs?.length) {
                const contractLogs = receipt.logs.filter((l) => l.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase());
                const parsed = parseEventLogs({
                  abi: contractABI,
                  logs: contractLogs,
                  eventName: 'PrizePaid',
                  args: { gameId: BigInt(gameId) },
                });
                placementsFromEvents = parsed
                  .map((e) => {
                    const args = (e as unknown as { args: PrizePaidArgs }).args;
                    return { place: Number(args.place) as 1 | 2 | 3, winner: args.winner, amount: args.amount };
                  })
                  .sort((a, b) => a.place - b.place);
                if (placementsFromEvents.length > 0) {
                  console.log('✅ Placements from finalization tx receipt:', placementsFromEvents.length, 'PrizePaid events');
                }
              }
            }

            // 2) Fallback: getContractEvents for PrizePaid (can hit RPC block range limits)
            if (placementsFromEvents.length === 0) {
              const blockNumber = await publicClient.getBlockNumber();
              const fetchPrizeLogs = async (from: bigint) =>
                publicClient.getContractEvents({
                  address: CONTRACT_ADDRESS,
                  abi: contractABI,
                  eventName: 'PrizePaid',
                  args: { gameId: BigInt(gameId) },
                  fromBlock: from,
                  toBlock: blockNumber,
                });
              let prizeLogs: Awaited<ReturnType<typeof fetchPrizeLogs>>;
              try {
                prizeLogs = await fetchPrizeLogs(0n);
              } catch {
                prizeLogs = blockNumber > 100_000n ? await fetchPrizeLogs(blockNumber - 100_000n) : [];
              }
              placementsFromEvents = prizeLogs
                .map((log) => {
                  const args = (log as unknown as { args: PrizePaidArgs }).args;
                  return { place: Number(args.place) as 1 | 2 | 3, winner: args.winner, amount: args.amount };
                })
                .sort((a, b) => a.place - b.place);
            }

            if (await applyPlacements(placementsFromEvents)) return;
          } catch (prizeError) {
            console.warn('Could not fetch PrizePaid events, falling back to computed placements:', prizeError);
          }
        }

        // Fallback: infer placements from alive status + eliminationRound (matches contract logic)
        // 1st = last alive player, 2nd = eliminated in final round, 3rd = eliminated in penultimate round
        const finalRound = Number(game.currentRound);
        const losersList: Array<{ address: Address; gainPercent: number; eliminationRound: number }> = [];
        let firstPlayer: { address: Address; gainPercent: number | null } | null = null;
        let secondPlayer: { address: Address; gainPercent: number | null } | null = null;
        let thirdPlayer: { address: Address; gainPercent: number | null } | null = null;

        for (const player of players) {
          try {
            // Use players mapping to get eliminationRound (index 10) and alive (index 6)
            const playerStruct = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: contractABI,
              functionName: 'players',
              args: [BigInt(gameId), player],
            });
            const isAlive = (playerStruct as any[])[6] === true;
            const elimRound = Number((playerStruct as any[])[10] || 0n);
            const gainPercent = await calculateGameplayGainPercent(player, isAlive, totalRounds);

            if (isAlive) {
              // Last alive = 1st place
              firstPlayer = { address: player, gainPercent };
            } else if (elimRound === finalRound && !secondPlayer) {
              // First player eliminated in final round = 2nd place (matches contract _findPlayerEliminatedInRound)
              secondPlayer = { address: player, gainPercent };
            } else if (elimRound === finalRound - 1 && !thirdPlayer && finalRound > 1) {
              // First player eliminated in penultimate round = 3rd place
              thirdPlayer = { address: player, gainPercent };
            } else {
              losersList.push({ address: player, gainPercent: gainPercent !== null ? gainPercent : 0, eliminationRound: elimRound });
            }
          } catch (error) {
            console.error(`❌ Error checking player ${player}:`, error);
            losersList.push({ address: player, gainPercent: 0, eliminationRound: 0 });
          }
        }

        setPrize1st(firstPlace);
        setPrize2nd(secondPlayer ? secondPlace : 0n);
        setPrize3rd(thirdPlayer ? thirdPlace : 0n);
        const winnersList: WinnerData[] = [];
        if (firstPlayer) winnersList.push({ address: firstPlayer.address, place: 1, prize: firstPlace + (secondPlayer ? 0n : secondPlace) + (thirdPlayer ? 0n : thirdPlace), gainPercent: firstPlayer.gainPercent });
        if (secondPlayer) winnersList.push({ address: secondPlayer.address, place: 2, prize: secondPlace, gainPercent: secondPlayer.gainPercent });
        if (thirdPlayer) winnersList.push({ address: thirdPlayer.address, place: 3, prize: thirdPlace, gainPercent: thirdPlayer.gainPercent });
        // Sort losers by elimination round descending (later round = better placement), then gain% as tiebreaker
        losersList.sort((a, b) => b.eliminationRound - a.eliminationRound || b.gainPercent - a.gainPercent);
        console.log(`✅ Setting Top 3 (computed): ${winnersList.length}, losers: ${losersList.length}`);
        setWinners(winnersList);
        setLosers(losersList);

        // Only set the link when we have a tx from the current contract (getLogs above)
        if (finalizeTxHash) setFinalizationTxHash(finalizeTxHash);
      } catch (error) {
        console.error('❌ Error in findWinnerAndLosers:', error);
        setWinnerDataError(error instanceof Error ? error.message : 'Failed to load winner data');
      } finally {
        setLoadingWinnerData(false);
      }
    };

    findWinnerAndLosers();
  }, [game, gamePlayers, gameId]);

  // Debug: Log when finalizationTxHash changes
  useEffect(() => {
    console.log('🔗 finalizationTxHash state changed:', finalizationTxHash);
  }, [finalizationTxHash]);

  // Calculate registration deadline countdown - MUST be before conditional return
  const registrationDeadline = game ? Number(game.registrationDeadline) : 0;
  
  useEffect(() => {
    if (!game) {
      setRegistrationCountdown('');
      return;
    }

    const updateRegistrationCountdown = () => {
      const hasStarted = game.startTime > 0n;
      const isFinished = game.finalized || game.cancelled;
      
      if (hasStarted || isFinished || registrationDeadline === 0) {
        setRegistrationCountdown('');
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const remaining = registrationDeadline - now;

      if (remaining <= 0) {
        setRegistrationCountdown('Registration closed');
        return;
      }

      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;

      if (hours > 0) {
        setRegistrationCountdown(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setRegistrationCountdown(`${minutes}m ${seconds}s`);
      } else {
        setRegistrationCountdown(`${seconds}s`);
      }
    };

    updateRegistrationCountdown();
    const interval = setInterval(updateRegistrationCountdown, 1000);
    return () => clearInterval(interval);
  }, [game, registrationDeadline]);

  // Fetch players for the game board
  useEffect(() => {
    if (!game || !gameId || gameId === 0) {
      setPlayers([]);
      return;
    }

    const loadPlayers = async () => {
      setLoadingPlayers(true);
      try {
        const fetchedPlayers = await fetchGamePlayers(BigInt(gameId));
        setPlayers(fetchedPlayers);
        console.log(`✅ Loaded ${fetchedPlayers.length} players for game ${gameId}`);
      } catch (error) {
        console.error('Error fetching players:', error);
        setPlayers([]);
      } finally {
        setLoadingPlayers(false);
      }
    };

    // Only fetch if game has at least one player
    if (game.playerCount > 0n) {
      loadPlayers();
    } else {
      setPlayers([]);
    }
  }, [game, gameId, game?.playerCount]);

  // Compute values needed for hooks (before conditional return)
  // Use safe defaults when game is undefined
  const now = Math.floor(Date.now() / 1000);
  const roundEndTime = roundEndTimeFromData !== null 
    ? roundEndTimeFromData 
    : (game ? Number(game.startTime) + Number(game.roundDuration) : 0);
  const timeRemaining = roundEndTime > now ? roundEndTime - now : 0;
  const roundShouldHaveEnded = game ? (timeRemaining <= 0 && currentRoundNum > 0 && !isFinished && !roundFinalized) : false;
  const cutoffRank = currentRoundData && Array.isArray(currentRoundData)
    ? Number((currentRoundData as any[])[4] || 1n)
    : 1;
  
  // Get all players to calculate rankings (only if round should have ended)
  // This hook MUST be before conditional return
  const { data: allPlayersForRanking } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'getGamePlayers',
    args: [BigInt(gameId)],
    query: { enabled: !!game && hasStarted && !isFinished && roundShouldHaveEnded && currentRoundNum > 0 },
  });

  // Calculate player rankings and determine eliminated players
  // This useEffect MUST be before conditional return
  useEffect(() => {
    // Re-check conditions inside useEffect to ensure game exists
    if (!game || !roundShouldHaveEnded || !allPlayersForRanking) {
      setEliminatedPlayers([]);
      return;
    }
    
    const calculateEliminatedPlayers = async () => {
      try {
        const players = allPlayersForRanking as Address[];
        const playerScores: Array<{ address: Address; score: number }> = [];
        
        for (const player of players) {
          try {
            const playerData = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: contractABI,
              functionName: 'getPlayer',
              args: [BigInt(gameId), player],
            });
            
            // getPlayer returns [squareIndex, startETH, alive, eliminationReason] — alive at index 2
            if ((playerData as any)[2] === true) {
              // Use raw ETH balance (no getAdjustedBalances after Phase 1)
              const currentETH = await publicClient.getBalance({ address: player });
              
              // Get round-start ETH balance
              let roundStartETH = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: contractABI,
                functionName: 'getRoundStartETH',
                args: [BigInt(gameId), BigInt(currentRoundNum), player],
              }) as bigint;
              
              // Fallback: If roundStartETH is 0, use game-start ETH
              if (roundStartETH === 0n) {
                const playerStruct = await publicClient.readContract({
                  address: CONTRACT_ADDRESS,
                  abi: contractABI,
                  functionName: 'players',
                  args: [BigInt(gameId), player],
                });
                roundStartETH = (playerStruct as any)[2]; // startETH is at index 2
              }
              
              // Calculate percentage gain/loss
              let percentageGain = 0;
              if (roundStartETH > 0n) {
                const gain = currentETH - roundStartETH;
                percentageGain = Number((gain * 10000n) / roundStartETH) / 100;
              } else {
                if (currentETH > 0n) {
                  percentageGain = 999999;
                } else {
                  percentageGain = -100;
                }
              }
              
              playerScores.push({
                address: player,
                score: percentageGain,
              });
            }
          } catch (error) {
            console.error(`Error getting player data for ${player}:`, error);
          }
        }
        
        // Sort by score (highest percentage gain first)
        playerScores.sort((a, b) => b.score - a.score);
        
        // Get players below cutoff rank (these should be eliminated)
        const eliminated = playerScores
          .slice(cutoffRank) // Take all players after the cutoff rank
          .map(p => p.address);
        
        setEliminatedPlayers(eliminated);
      } catch (error) {
        console.error('Error calculating eliminated players:', error);
        setEliminatedPlayers([]);
      }
    };
    
    calculateEliminatedPlayers();
  }, [roundShouldHaveEnded, allPlayersForRanking, game, gameId, currentRoundNum, cutoffRank, timeRemaining, isFinished, roundFinalized]);

  // Fetch snapshots for all rounds (when game has started or is finalized, so Game Progression has data)
  useEffect(() => {
    if (!game || (!hasStarted && !game.finalized) || game.cancelled) return;

    const fetchSnapshots = async () => {
      setLoadingSnapshots(true);
      try {
        const snapshotMap = new Map<string, Map<number, bigint>>();
        const roundEndMap = new Map<string, Map<number, bigint>>();
        const elimDataMap = new Map<string, { round: number; startETH: bigint; endETH: bigint; gainPercent: number }>();
        
        // Get players list - use gamePlayers if available, otherwise fetch it
        let players: Address[] = [];
        if (gamePlayers) {
          players = gamePlayers as Address[];
        } else {
          try {
            players = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: contractABI,
              functionName: 'getGamePlayers',
              args: [BigInt(gameId)],
            }) as Address[];
          } catch (error) {
            console.error('Error fetching players for snapshots:', error);
            setLoadingSnapshots(false);
            return;
          }
        }
        const totalRounds = Number(game.totalRounds);
        const currentRound = Number(game.currentRound);
        const maxRound = game.finalized ? totalRounds : Math.max(currentRound, 1);

        // First, check which rounds are finalized (do this once for all players)
        const finalizedRounds = new Set<number>();
        console.log(`🔍 Checking finalized rounds (1 to ${maxRound})...`);
        for (let round = 1; round <= maxRound; round++) {
          try {
            const roundData = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: contractABI,
              functionName: 'rounds',
              args: [BigInt(gameId), BigInt(round)],
            }) as any[];
            const isFinalized = roundData[5] === true; // finalized is at index 5
            if (isFinalized) {
              finalizedRounds.add(round);
              console.log(`  ✓ Round ${round} is finalized`);
            } else {
              console.log(`  ⏳ Round ${round} is not finalized yet`);
            }
          } catch (error) {
            console.warn(`Could not check if round ${round} is finalized:`, error);
          }
        }
        console.log(`📋 Finalized rounds: ${Array.from(finalizedRounds).join(', ') || 'none'}`);

        // Fetch snapshots for all rounds up to current round
        for (const player of players) {
          const playerSnapshots = new Map<number, bigint>();
          const playerRoundEnds = new Map<number, bigint>();
          
          // Get player data to check alive status
          // Use getPlayer() instead of players() to avoid bigint overflow issues with registrationTime
          let playerData: any = null;
          let isCurrentlyAlive = false;
          try {
            playerData = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: contractABI,
              functionName: 'getPlayer',
              args: [BigInt(gameId), player],
            });
            
            // getPlayer returns: [squareIndex, startETH, alive, eliminationReason] (no penalties)
            const playerArray = Array.isArray(playerData) ? playerData : [
              playerData.squareIndex !== undefined ? playerData.squareIndex : playerData[0],
              playerData.startETH !== undefined ? playerData.startETH : playerData[1],
              playerData.alive !== undefined ? playerData.alive : playerData[2],
              playerData.eliminationReason !== undefined ? playerData.eliminationReason : playerData[3],
            ];
            
            isCurrentlyAlive = playerArray[2] === true;
          } catch (error) {
            console.warn(`Failed to fetch player data for ${player}:`, error);
            continue;
          }
          
          // Fetch Round End snapshots for all rounds 1..maxRound so we don't miss any round
          // (e.g. round 3 end can be missing if we only queried finalizedRounds and that round was mis-detected)
          for (let round = 1; round <= maxRound; round++) {
            try {
              const endETH = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: contractABI,
                functionName: 'getRoundEndETH',
                args: [BigInt(gameId), BigInt(round), player],
              }) as bigint;
              // Store if we have a value: non-zero means snapshot exists; 0 only stored when round is finalized
              // (contract returns 0 for unset mapping, so we treat 0 as "no data" unless round is finalized)
              if (endETH > 0n || finalizedRounds.has(round)) {
                playerRoundEnds.set(round, endETH);
                if (endETH > 0n) {
                  console.log(`✓ Round ${round} End ETH for ${player.slice(0, 8)}...: ${formatEther(endETH)} ETH`);
                }
              }
            } catch (endError) {
              console.debug(`No Round ${round} End snapshot for ${player.slice(0, 8)}... (player may have been eliminated during round):`, endError);
            }
          }
          
          // Now fetch Round Start snapshots
          for (let round = 1; round <= maxRound; round++) {
            try {
              // Fetch round start ETH
              const snapshotETH = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: contractABI,
                functionName: 'getRoundStartETH',
                args: [BigInt(gameId), BigInt(round), player],
              }) as bigint;
              
              // Only add snapshot if it exists (player was alive when round started)
              // If snapshot is 0, it means player was eliminated before this round
              if (snapshotETH > 0n) {
                playerSnapshots.set(round, snapshotETH);
              } else {
                // If we find a missing snapshot after round 1, player was eliminated
                // Stop checking further rounds for start snapshots
                break;
              }
            } catch (error) {
              // If we can't fetch a snapshot, player was likely eliminated before this round
              console.debug(`No Round ${round} Start snapshot for player ${player} (likely eliminated):`, error);
              break;
            }
          }
          
          // Add to maps if we have any snapshots (start or end)
          // This ensures players with only end snapshots are still displayed
          if (playerSnapshots.size > 0 || playerRoundEnds.size > 0) {
            snapshotMap.set(player, playerSnapshots);
            
            // Always store round end snapshots map (even if empty)
            roundEndMap.set(player, playerRoundEnds);
            
            console.log(`Player ${player.slice(0, 8)}... - Start snapshots: ${playerSnapshots.size}, End snapshots: ${playerRoundEnds.size}`);
            
            // Calculate elimination data for eliminated players
            if (!isCurrentlyAlive && playerSnapshots.size > 0) {
              const lastRound = Math.max(...Array.from(playerSnapshots.keys()));
              const startETH = playerSnapshots.get(lastRound)!;
              const endETH = playerRoundEnds.get(lastRound) || 0n;
              
              if (endETH > 0n) {
                const gain = endETH - startETH;
                const gainPercent = startETH > 0n 
                  ? Number((gain * 10000n) / startETH) / 100
                  : 0;
                
                // Store elimination data showing the comparison that was made
                elimDataMap.set(player, {
                  round: lastRound,
                  startETH,
                  endETH: endETH,
                  gainPercent
                });
              }
            }
          }
        }
        
        console.log(`📊 Snapshot fetch complete:`);
        console.log(`  - Players with snapshots: ${snapshotMap.size}`);
        console.log(`  - Players with end snapshots: ${roundEndMap.size}`);
        console.log(`  - Total rounds checked: ${Math.max(Number(game.currentRound), 1)}`);
        console.log(`  - Finalized rounds: ${Array.from(finalizedRounds).join(', ') || 'none'}`);
        
        setSnapshots(snapshotMap);
        setRoundEndSnapshots(roundEndMap);
        setEliminationData(elimDataMap);
      } catch (error) {
        console.error('❌ Error fetching snapshots:', error);
      } finally {
        setLoadingSnapshots(false);
      }
    };

    fetchSnapshots();
  }, [game, hasStarted, isFinished, game?.finalized, gamePlayers, gameId, game?.currentRound, game?.totalRounds]);

  // Conditional return - MUST be after all hooks
  if (!game) {
    return (
      <div className="min-h-screen relative flex items-center justify-center bg-[var(--arena-bg)]">
        <div className="arena-gradient-overlay" aria-hidden />
        <p className="relative z-10 text-gray-400">Loading game...</p>
      </div>
    );
  }

  // getPlayer returns: [squareIndex, startETH, alive, eliminationReason] (Index 0 = squareIndex, Index 2 = alive)
  const userStatus = !address
    ? 'not_registered'
    : !userPlayerData
    ? 'not_registered'
    : (userPlayerData as any)[0] === 0 && (userPlayerData as any)[2] === false // squareIndex = 0 and alive = false = not registered
    ? 'not_registered'
    : (userPlayerData as any)[2] === false // alive = false but squareIndex > 0 = eliminated
    ? 'eliminated'
    : 'registered';

  // Players are now fetched via useEffect above using fetchGamePlayers

  const statusLabels: Record<string, string> = {
    'REGISTRATION_OPEN': 'Registration Open',
    'READY_TO_START': 'Ready to Start',
    'LIVE': 'Live',
    'FINALIZED': 'Finished',
    'CANCELLED': 'Cancelled',
  };

  // When game is finalized, only show rounds that actually happened (1..currentRound). No Round N+1 row.
  const maxRoundToShow = game
    ? (game.finalized ? Math.max(1, Number(game.currentRound)) : Math.min(10, Math.max(1, Number(game.currentRound)), Number(game.totalRounds || 10)))
    : 1;

  return (
    <div className="min-h-screen relative">
      {/* Arena background + overlay (same as home) */}
      <div
        className="fixed inset-0 z-0 min-w-full min-h-full"
        style={{ backgroundImage: 'url(/arena-bg.png)', backgroundSize: 'cover', backgroundPosition: 'top center', backgroundRepeat: 'no-repeat', backgroundColor: 'var(--arena-bg)' }}
        aria-hidden
      />
      <div className="arena-gradient-overlay" aria-hidden />

      <div className="relative z-10">
      <header className="border-b border-white/5 bg-[var(--arena-bg)]/50 backdrop-blur-xl px-4 sm:px-6 py-4 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link 
              href="/"
              className="text-gray-400 hover:text-white transition-colors mr-2"
              title="Back to games"
            >
              ←
            </Link>
            <h1 className="text-lg font-semibold text-white tracking-wide [font-family:var(--font-orbitron)] mr-6">Game #{gameId}</h1>
            <span className={`game-status-badge ${
              status === 'LIVE' ? '!bg-[var(--neon-blue)]/30 !border-[var(--neon-blue)]/50 text-[var(--neon-cyan)]' :
              status === 'REGISTRATION_OPEN' ? '!bg-[var(--accent-yellow)]/20 !border-[var(--accent-yellow)]/50 text-[var(--accent-yellow)]' :
              status === 'READY_TO_START' ? '!bg-[var(--accent-green)]/20 !border-[var(--accent-green)]/50 text-[var(--accent-green)]' :
              status === 'FINALIZED' ? '!bg-white/10 !border-white/20 text-white/80' :
              '!bg-[var(--neon-pink)]/20 !border-[var(--neon-pink)]/50 text-[var(--neon-pink)]'
            }`}>
              {statusLabels[status || ''] || status}
            </span>
          </div>
          {registrationCountdown && !hasStarted && !isFinished && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Registration Closes:</span>
              <span className="text-[var(--neon-cyan)] font-semibold">{registrationCountdown}</span>
            </div>
          )}
        </div>
      </header>

      <main className="px-6 py-6">
        {!hasStarted && !isFinished ? (
          <div className="flex items-start">
            <div className="flex-1 min-w-0 mr-10">
              <GameBoard gameId={gameId} players={players} />
            </div>
            <div className="shrink-0 ml-10">
              <Sidebar
                gameId={gameId}
                currentRound={0}
              totalRounds={Number(game.totalRounds)}
              roundDuration={Number(game.roundDuration)}
              timeRemaining={0}
              prizePool={game.prizePool}
              totalPlayers={Number(game.playerCount)}
              activePlayers={undefined}
              userStatus={userStatus as 'not_registered' | 'registered' | 'eliminated'}
              entryFee={game.entryFee}
              canStart={canStart}
              startReward={reward}
              rewardTimeRemaining={Number(rewardTimeRemaining)}
              gameStatus={status as 'REGISTRATION_OPEN' | 'READY_TO_START' | 'LIVE' | 'FINALIZED' | 'CANCELLED' | 'UNDERFILLED'}
              registrationDeadline={Number(game.registrationDeadline)}
              minPlayers={Number(game.minPlayers)}
              onRegistrationSuccess={() => {
                refetchPlayer();
                refetchGame();
              }}
              />
            </div>
          </div>
        ) : hasStarted && !isFinished ? (
          <>
            <div className="flex items-start">
              <div className="flex-1 min-w-0 mr-10">
                <GameBoard gameId={gameId} players={players} />
              </div>
              <div className="shrink-0 ml-10">
                <Sidebar
                  gameId={gameId}
                  currentRound={Number(game.currentRound)}
                totalRounds={Number(game.totalRounds)}
                roundDuration={Number(game.roundDuration)}
                timeRemaining={timeRemaining}
                prizePool={game.prizePool}
                totalPlayers={Number(game.playerCount)}
                activePlayers={activePlayers}
                userStatus={userStatus as 'not_registered' | 'registered' | 'eliminated'}
                entryFee={game.entryFee}
                canStart={false}
                startReward={0n}
                rewardTimeRemaining={0}
                roundShouldHaveEnded={roundShouldHaveEnded}
                onRegistrationSuccess={() => {
                  refetchPlayer();
                  refetchGame();
                }}
              />
            </div>
          </div>

            {/* Round Snapshots Section - Detached below game board */}
            {hasStarted && (
                <div className="arena-panel mt-6 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <span>📸</span>
                    <span>Round Snapshots</span>
                    {snapshots.size > 0 && (
                      <span className="text-xs text-gray-400 ml-2">
                        ({snapshots.size} players, {roundEndSnapshots.size} with end snapshots)
                      </span>
                    )}
                  </h3>
                  {loadingSnapshots ? (
                    <div className="text-gray-400 text-sm">Loading snapshots...</div>
                  ) : snapshots.size === 0 ? (
                    <div className="text-gray-400 text-sm">
                      No snapshots available yet. Snapshots will appear after rounds are finalized.
                      {game && Number(game.currentRound) > 0 && (
                        <div className="text-xs text-gray-500 mt-2">
                          Current round: {game.currentRound} | Game started: {hasStarted ? 'Yes' : 'No'}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg overflow-hidden">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300 sticky left-0 z-10 bg-black/40">
                              Players
                            </th>
                            {Array.from({ length: maxRoundToShow }, (_, i) => i + 1).map((roundNum) => (
                              <th
                                key={roundNum}
                                colSpan={2}
                                className="text-center py-3 px-2 text-xs font-semibold text-gray-400"
                              >
                                <div className="flex flex-col gap-1">
                                  <span>Round {roundNum}</span>
                                  <div className="flex gap-1">
                                    <span className="flex-1 text-[10px] font-normal text-gray-500 min-w-[100px]">Start</span>
                                    <span className="flex-1 text-[10px] font-normal text-gray-500 min-w-[100px]">End</span>
                                  </div>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {snapshots.size > 0 ? (
                            Array.from(snapshots.entries()).map(([playerAddress, playerSnapshots]): React.ReactElement => {
                              const lastRound = playerSnapshots.size > 0 
                                ? Math.max(...Array.from(playerSnapshots.keys()).filter((r) => r <= maxRoundToShow))
                                : 0;
                              const currentRound = Number(game.currentRound);
                              const wasEliminated = lastRound > 0 && lastRound < currentRound;
                              
                              return (
                                <tr
                                  key={playerAddress}
                                  className={`border-b border-white/5 hover:bg-white/5 ${
                                    wasEliminated ? 'opacity-60' : ''
                                  }`}
                                >
                                  <td className="py-3 px-4 text-sm font-mono text-gray-300 sticky left-0 z-10 bg-black/40">
                                    <div className="flex items-center gap-2">
                                      <span className="truncate max-w-[200px]">
                                        {playerAddress.slice(0, 6)}...{playerAddress.slice(-4)}
                                      </span>
                                      {wasEliminated && (
                                        <span className="text-xs text-red-400 font-medium whitespace-nowrap">
                                          (Eliminated)
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  {Array.from({ length: maxRoundToShow }, (_, i) => i + 1).flatMap((roundNum) => {
                                    const startETH = playerSnapshots.get(roundNum);
                                    // For Round 2+, use previous round's End as Start only if that round actually happened (don't infer Round N+1 Start from Round N End when game ended in Round N)
                                    let displayStartETH = startETH;
                                    if (!startETH && roundNum > 1 && roundNum <= maxRoundToShow) {
                                      const prevRoundEnd = roundEndSnapshots.get(playerAddress)?.get(roundNum - 1);
                                      if (prevRoundEnd) {
                                        displayStartETH = prevRoundEnd;
                                      }
                                    }
                                    
                                    const endETH = roundEndSnapshots.get(playerAddress)?.get(roundNum);
                                    const hasStart = displayStartETH !== undefined;
                                    const hasEnd = endETH !== undefined;
                                    const isEliminationRound = wasEliminated && roundNum === lastRound;
                                    // Check if this Start value came from previous round's End
                                    const startFromPrevEnd = !startETH && roundNum > 1 && displayStartETH !== undefined;
                                    
                                    return [
                                      // Round Start Column
                                      <td
                                        key={`${playerAddress}-${roundNum}-start`}
                                        className={`py-3 px-3 text-center text-xs font-mono whitespace-nowrap min-w-[120px] ${
                                          hasStart
                                            ? isEliminationRound
                                              ? 'text-red-300 bg-red-500/5'
                                              : 'text-purple-300 bg-purple-500/5'
                                            : 'text-gray-600'
                                        }`}
                                      >
                                        {hasStart && displayStartETH !== undefined ? (
                                          <span 
                                            className="font-semibold block" 
                                            title={formatEther(displayStartETH) + ' ETH' + (startFromPrevEnd ? ' (from Round ' + (roundNum - 1) + ' End)' : '')}
                                          >
                                            {Number(formatEther(displayStartETH)).toFixed(6)} ETH
                                          </span>
                                        ) : (
                                          <span className="text-gray-600">—</span>
                                        )}
                                      </td>,
                                      // Round End Column
                                      <td
                                        key={`${playerAddress}-${roundNum}-end`}
                                        className={`py-3 px-3 text-center text-xs font-mono whitespace-nowrap min-w-[120px] ${
                                          hasEnd
                                            ? isEliminationRound
                                              ? 'text-red-300 bg-red-500/5 border-l border-red-500/20'
                                              : 'text-green-300 bg-green-500/5 border-l border-green-500/20'
                                            : 'text-gray-500 border-l border-white/10'
                                        }`}
                                      >
                                        {hasEnd && endETH !== undefined ? (
                                          <span className="font-semibold block" title={formatEther(endETH) + ' ETH'}>
                                            {Number(formatEther(endETH)).toFixed(6)} ETH
                                          </span>
                                        ) : (
                                          <span className="text-gray-600">—</span>
                                        )}
                                      </td>
                                    ];
                                  })}
                                </tr>
                              );
                            })
                          ) : (
                            // Show placeholder rows for all players when snapshots haven't loaded yet
                            gamePlayers ? Array.from(gamePlayers as Address[]).map((playerAddress): React.ReactElement => (
                              <tr
                                key={playerAddress}
                                className="border-b border-white/5 hover:bg-white/5"
                                >
                                <td className="py-3 px-4 text-sm font-mono text-gray-300 sticky left-0 z-10 bg-black/40">
                                  <span className="truncate max-w-[200px]">
                                    {playerAddress.slice(0, 6)}...{playerAddress.slice(-4)}
                                  </span>
                                </td>
                                {Array.from({ length: maxRoundToShow }, (_, i) => i + 1).flatMap((roundNum) => [
                                  <td
                                    key={`${playerAddress}-${roundNum}-start`}
                                    className="py-3 px-3 text-center text-xs text-gray-600 whitespace-nowrap min-w-[120px]"
                                  >
                                    <span>—</span>
                                  </td>,
                                  <td
                                    key={`${playerAddress}-${roundNum}-end`}
                                    className="py-3 px-3 text-center text-xs text-gray-500 border-l border-white/10 whitespace-nowrap min-w-[120px]"
                                  >
                                    <span>—</span>
                                  </td>
                                ])}
                              </tr>
                            )) : null
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="mt-4 text-xs text-gray-500">
                    Snapshots are taken at the start of each round to calculate percentage gains.
                  </div>
                </div>
              )}
          </>
        ) : (
          <div className="max-w-2xl mx-auto text-center py-20">
            <h2 className="text-2xl font-semibold text-white mb-4">
              {game.cancelled ? 'Game Cancelled' : 'Game Finished'}
            </h2>
            {!game.cancelled && (
              <>
                {loadingWinnerData && (
                  <div className="rounded-2xl border border-[var(--neon-blue)]/30 bg-[var(--arena-charcoal)]/55 backdrop-blur-sm p-6 mb-6">
                    <div className="text-white">Loading game results...</div>
                  </div>
                )}
                
                {winnerDataError && !loadingWinnerData && (
                  <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-6 mb-6">
                    <div className="text-red-400">Error: {winnerDataError}</div>
                  </div>
                )}
                
                {winners.length === 0 && !loadingWinnerData && gamePlayers && (gamePlayers as Address[]).length > 0 && (
                  <div className="rounded-2xl border border-[var(--accent-yellow)]/50 bg-[var(--arena-charcoal)]/55 backdrop-blur-sm p-6 mb-6">
                    <div className="text-yellow-400">No winners found. All players may have been eliminated.</div>
                  </div>
                )}

                {/* Placements table: 1st (winner) then 2nd, 3rd, 4th... from losers (losers sorted best-first) */}
                {(winners.length > 0 || losers.length > 0) && (
                  <div className="rounded-2xl border border-[var(--neon-blue)]/25 bg-[var(--arena-charcoal)]/55 backdrop-blur-sm p-6 mb-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div className="text-sm font-semibold text-white/90">Placements</div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="text-white/70">
                          Prize pool (paid out): <span className="text-[#10b981] font-semibold tabular-nums">
                            {prizeAmount > 0n ? formatEther(prizeAmount) : formatEther(game.prizePool || 0n)} ETH
                          </span>
                          {prizeAmount === 0n && game.prizePool === 0n && game.entryFee && game.playerCount && (
                            <span className="text-white/50"> (calc. {formatEther((game.entryFee * game.playerCount * 70n) / 100n)} ETH)</span>
                          )}
                          <span className="text-white/50 ml-1">· 60% / 30% / 10% to Top 3</span>
                        </span>
                      </div>
                    </div>
                    {/* Explicit empty row of space between header and table */}
                    <div className="min-h-[3rem] shrink-0" aria-hidden="true" />
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 text-left">
                            <th className="py-2 pr-4 text-xs text-white/60 font-medium">Place</th>
                            <th className="py-2 pr-4 text-xs text-white/60 font-medium">Wallet</th>
                            <th className="py-2 pr-4 text-xs text-white/60 font-medium text-right">Eliminated</th>
                            <th className="py-2 text-xs text-white/60 font-medium text-right">Prize</th>
                            <th className="py-2 pl-4 text-xs text-white/60 font-medium text-right">Gain</th>
                          </tr>
                        </thead>
                        <tbody>
                          {winners[0] && (
                            <tr className="border-b border-gray-800/80 hover:bg-white/5">
                              <td className="py-3 pr-4 text-amber-400/90 font-medium">1st</td>
                              <td className="py-3 pr-4 font-mono text-sm text-gray-300 truncate max-w-[200px]" title={winners[0].address}>{winners[0].address}</td>
                              <td className="py-3 pr-4 text-sm text-emerald-400 text-right">Survivor</td>
                              <td className="py-3 text-sm text-[#fbbf24] tabular-nums text-right">{formatEther(prize1st || winners[0].prize)} ETH</td>
                              <td className={`py-3 pl-4 font-semibold text-right ${(winners[0].gainPercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {winners[0].gainPercent != null ? `${winners[0].gainPercent >= 0 ? '+' : ''}${Number(winners[0].gainPercent).toFixed(2)}%` : 'N/A'}
                              </td>
                            </tr>
                          )}
                          {winners[1] && (
                            <tr className="border-b border-gray-800/80 hover:bg-white/5">
                              <td className="py-3 pr-4 text-white/80 font-medium">2nd</td>
                              <td className="py-3 pr-4 font-mono text-sm text-gray-300 truncate max-w-[200px]" title={winners[1].address}>{winners[1].address}</td>
                              <td className="py-3 pr-4 text-sm text-red-400/80 text-right">Round {Number(game.currentRound)}</td>
                              <td className="py-3 text-sm text-right">
                                {(prize2nd || winners[1].prize) > 0n ? <span className="text-[#10b981] tabular-nums">{formatEther(prize2nd || winners[1].prize)} ETH</span> : '—'}
                              </td>
                              <td className={`py-3 pl-4 font-semibold text-right ${(winners[1].gainPercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {winners[1].gainPercent != null ? `${winners[1].gainPercent >= 0 ? '+' : ''}${Number(winners[1].gainPercent).toFixed(2)}%` : 'N/A'}
                              </td>
                            </tr>
                          )}
                          {winners[2] && (
                            <tr className="border-b border-gray-800/80 hover:bg-white/5">
                              <td className="py-3 pr-4 text-white/80 font-medium">3rd</td>
                              <td className="py-3 pr-4 font-mono text-sm text-gray-300 truncate max-w-[200px]" title={winners[2].address}>{winners[2].address}</td>
                              <td className="py-3 pr-4 text-sm text-red-400/80 text-right">Round {Math.max(1, Number(game.currentRound) - 1)}</td>
                              <td className="py-3 text-sm text-right">
                                {(prize3rd || winners[2].prize) > 0n ? <span className="text-[#10b981] tabular-nums">{formatEther(prize3rd || winners[2].prize)} ETH</span> : '—'}
                              </td>
                              <td className={`py-3 pl-4 font-semibold text-right ${(winners[2].gainPercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {winners[2].gainPercent != null ? `${winners[2].gainPercent >= 0 ? '+' : ''}${Number(winners[2].gainPercent).toFixed(2)}%` : 'N/A'}
                              </td>
                            </tr>
                          )}
                          {losers.map((loser, index) => {
                            const place = winners.length + 1 + index;
                            const placeLabel = place === 2 ? '2nd' : place === 3 ? '3rd' : place === 4 ? '4th' : place === 5 ? '5th' : `${place}th`;
                            return (
                              <tr key={loser.address} className="border-b border-gray-800/80 hover:bg-white/5">
                                <td className="py-3 pr-4 text-white/80 font-medium">{placeLabel}</td>
                                <td className="py-3 pr-4 font-mono text-sm text-gray-300 truncate max-w-[200px]" title={loser.address}>{loser.address}</td>
                                <td className="py-3 pr-4 text-sm text-red-400/80 text-right">
                                  {loser.eliminationRound > 0 ? `Round ${loser.eliminationRound}` : '—'}
                                </td>
                                <td className="py-3 text-sm text-right">—</td>
                                <td className={`py-3 pl-4 font-semibold text-right ${loser.gainPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {loser.gainPercent >= 0 ? '+' : ''}{Number(loser.gainPercent).toFixed(2)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-6 pt-6 border-t border-white/10 px-2 py-4">
                      {finalizationTxHash ? (
                        <>
                          <a
                            href={`https://sepolia-explorer.base.org/tx/${finalizationTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-[var(--neon-blue)] hover:underline"
                          >
                            View finalize transaction →
                          </a>
                          <p className="text-xs text-white/50 mt-1.5">Prize payouts appear as internal transfers in the transaction.</p>
                        </>
                      ) : (
                        <a
                          href={`https://sepolia-explorer.base.org/address/${CONTRACT_ADDRESS}#events`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[var(--neon-blue)] hover:underline"
                        >
                          View contract (events / transactions) on explorer →
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Round Snapshots (Start / End ETH per round) - at bottom of finished game data */}
                {!game.cancelled && (
                  <div className="arena-panel mt-6 w-full max-w-6xl mx-auto rounded-lg p-6 mb-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <span>📸</span>
                      <span>Round Snapshots</span>
                      {snapshots.size > 0 && (
                        <span className="text-xs text-gray-400 ml-2">
                          ({snapshots.size} players, {roundEndSnapshots.size} with end snapshots)
                        </span>
                      )}
                    </h3>
                    {loadingSnapshots ? (
                      <div className="text-gray-400 text-sm">Loading snapshots...</div>
                    ) : snapshots.size === 0 && roundEndSnapshots.size === 0 ? (
                      <div className="text-gray-400 text-sm">No snapshot data available for this game.</div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg overflow-hidden">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300 sticky left-0 z-10 bg-black/40">Players</th>
                              {Array.from({ length: maxRoundToShow }, (_, i) => i + 1).map((roundNum) => (
                                <th key={roundNum} colSpan={2} className="text-center py-3 px-2 text-xs font-semibold text-gray-400">
                                  <div className="flex flex-col gap-1">
                                    <span>Round {roundNum}</span>
                                    <div className="flex gap-1">
                                      <span className="flex-1 text-[10px] font-normal text-gray-500 min-w-[100px]">Start</span>
                                      <span className="flex-1 text-[10px] font-normal text-gray-500 min-w-[100px]">End</span>
                                    </div>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {snapshots.size > 0 ? (
                              Array.from(snapshots.entries()).map(([playerAddress, playerSnapshots]): React.ReactElement => {
                                const totalRounds = Number(game?.totalRounds ?? 0);
                                const finalRound = game?.finalized ? Math.max(1, Number(game.currentRound)) : totalRounds;
                                const winnerSet = new Set(winners.map((w) => w.address.toLowerCase()));
                                const wasEliminated = winnerSet.size > 0 && !winnerSet.has(playerAddress.toLowerCase());
                                const winnerEntry = winners.find((w) => w.address.toLowerCase() === playerAddress.toLowerCase());
                                const placeLabel = winnerEntry ? (winnerEntry.place === 1 ? '1st' : winnerEntry.place === 2 ? '2nd' : '3rd') : null;
                                return (
                                  <tr
                                    key={playerAddress}
                                    className={`border-b border-white/5 hover:bg-white/5 ${wasEliminated ? 'opacity-60' : ''} ${winnerEntry ? (winnerEntry.place === 1 ? 'ring-1 ring-[#fbbf24]/50' : winnerEntry.place === 2 ? 'ring-1 ring-gray-400/40' : 'ring-1 ring-amber-600/40') : ''}`}
                                  >
                                    <td className="py-3 px-4 text-sm font-mono text-gray-300 sticky left-0 z-10 bg-black/40">
                                      <div className="flex items-center gap-2">
                                        <span className="truncate max-w-[200px]">{playerAddress.slice(0, 6)}...{playerAddress.slice(-4)}</span>
                                        {placeLabel && <span className={`text-xs font-semibold whitespace-nowrap ${winnerEntry!.place === 1 ? 'text-[#fbbf24]' : winnerEntry!.place === 2 ? 'text-gray-400' : 'text-amber-600'}`}>{placeLabel}</span>}
                                        {wasEliminated && !winnerEntry && <span className="text-xs text-red-400 font-medium whitespace-nowrap">(Eliminated)</span>}
                                      </div>
                                    </td>
                                    {Array.from({ length: maxRoundToShow }, (_, i) => i + 1).flatMap((roundNum) => {
                                      const startETH = playerSnapshots.get(roundNum);
                                      let displayStartETH = startETH;
                                      if (!startETH && roundNum > 1 && roundNum <= maxRoundToShow) {
                                        const prevRoundEnd = roundEndSnapshots.get(playerAddress)?.get(roundNum - 1);
                                        if (prevRoundEnd) displayStartETH = prevRoundEnd;
                                      }
                                      const endETH = roundEndSnapshots.get(playerAddress)?.get(roundNum);
                                      const hasStart = displayStartETH !== undefined;
                                      const hasEnd = endETH !== undefined;
                                      const isEliminationRound = wasEliminated && finalRound > 0 && roundNum === finalRound;
                                      const startFromPrevEnd = !startETH && roundNum > 1 && displayStartETH !== undefined;
                                      return [
                                        <td
                                          key={`${playerAddress}-${roundNum}-start`}
                                          className={`py-3 px-3 text-center text-xs font-mono whitespace-nowrap min-w-[120px] ${hasStart ? (isEliminationRound ? 'text-red-300 bg-red-500/5' : 'text-purple-300 bg-purple-500/5') : 'text-gray-500'}`}
                                        >
                                          {hasStart && displayStartETH !== undefined ? <span className="font-semibold block" title={formatEther(displayStartETH) + ' ETH' + (startFromPrevEnd ? ' (from Round ' + (roundNum - 1) + ' End)' : '')}>{Number(formatEther(displayStartETH)).toFixed(6)} ETH</span> : <span className="text-gray-500">—</span>}
                                        </td>,
                                        <td
                                          key={`${playerAddress}-${roundNum}-end`}
                                          className={`py-3 px-3 text-center text-xs font-mono whitespace-nowrap min-w-[120px] ${hasEnd ? (isEliminationRound ? 'text-red-300 bg-red-500/5 border-l border-red-500/20' : 'text-green-300 bg-green-500/5 border-l border-green-500/20') : 'text-gray-500 border-l border-white/10'}`}
                                        >
                                          {hasEnd && endETH !== undefined ? <span className="font-semibold block" title={formatEther(endETH) + ' ETH'}>{Number(formatEther(endETH)).toFixed(6)} ETH</span> : <span className="text-gray-500">—</span>}
                                        </td>,
                                      ];
                                    })}
                                  </tr>
                                );
                              })
                            ) : (
                              gamePlayers ? Array.from(gamePlayers as Address[]).map((playerAddress): React.ReactElement => (
                                <tr key={playerAddress} className="border-b border-white/5">
                                  <td className="py-3 px-4 text-sm font-mono text-gray-300 sticky left-0 z-10 bg-black/40"><span className="truncate max-w-[200px]">{playerAddress.slice(0, 6)}...{playerAddress.slice(-4)}</span></td>
                                  {Array.from({ length: maxRoundToShow }, (_, i) => i + 1).flatMap((roundNum) => [
                                    <td key={`${playerAddress}-${roundNum}-start`} className="py-3 px-3 text-center text-xs text-gray-500 whitespace-nowrap min-w-[120px]"><span>—</span></td>,
                                    <td key={`${playerAddress}-${roundNum}-end`} className="py-3 px-3 text-center text-xs text-gray-500 border-l border-white/10 whitespace-nowrap min-w-[120px]"><span>—</span></td>,
                                  ])}
                                </tr>
                              )) : null
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="mt-4 text-xs text-gray-500">
                      Snapshots are taken at the start and end of each round to calculate percentage gains.
                      {game?.finalized && (
                        <span className="block mt-1 text-gray-400">
                          Only rounds that were played are shown. Final payouts (finalization reward, prizes) are sent after the final round and are not included in round snapshots.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            {game.cancelled && (
              <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-4 inline-block">
                <div className="text-xs text-[#9ca3af] mb-1">Refunded Amount</div>
                <div className="text-2xl font-semibold text-red-400">
                  {formatEther((game.entryFee * game.playerCount) || 0n)} ETH
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
