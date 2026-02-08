'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther, formatUnits } from 'viem';
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
  const [losers, setLosers] = useState<Array<{ address: Address; gainPercent: number }>>([]);
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
        setLoadingWinnerData(false);
        setWinnerDataError('Game not finalized or missing player data');
        return;
      }
      
      setLoadingWinnerData(true);
      setWinnerDataError(null);
      
      try {
        // For known games, use their transaction hashes as fallback
        const knownTransactions: Record<number, string> = {
          1: '0xa8a58bec9356bab0ca6fdb209e4bebf09c04ce6e040da77a5153dd64cf8827ad',
          2: '0x98d8f9240fd3288cd901a8122e3cead03d07e19fd551bba26055e4115e7da43d',
        };
        
        if (knownTransactions[gameId]) {
          console.log(`🎯 Setting known transaction hash for game #${gameId}`);
          setFinalizationTxHash(knownTransactions[gameId]);
        }
        
        // Calculate prize pool: 70% of total entry fees
        // prizePool = entryFee * playerCount * 0.7
        const totalEntryFees = game.entryFee * game.playerCount;
        const calculatedPrizePool = (totalEntryFees * 70n) / 100n;
        setPrizeAmount(calculatedPrizePool);

        // Find Top 3 (alive players sorted by gain %) and all losers (eliminated players)
        const players = gamePlayers as Address[];
        console.log(`👥 Processing ${players.length} players for game #${gameId}`);
        
        if (players.length === 0) {
          console.warn('⚠️ No players found in game');
          setWinnerDataError('No players found in this game');
          setLoadingWinnerData(false);
          return;
        }
        
        const totalRounds = Number(game.totalRounds);
        const losersList: Array<{ address: Address; gainPercent: number }> = [];
        const aliveWithGain: Array<{ address: Address; gainPercent: number | null }> = [];

        for (const player of players) {
          try {
            const playerData = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: contractABI,
              functionName: 'getPlayer',
              args: [BigInt(gameId), player],
            });
            
            // Check if player is alive (index 6)
            const isAlive = (playerData as any)[6] === true;
            console.log(`  Player ${player.slice(0, 10)}... - Alive: ${isAlive}`);
            
            // Final Gain = Round 1 Start → Final/Elimination Round End (gameplay only)
            const gainPercent = await calculateGameplayGainPercent(player, isAlive, totalRounds);
            
            if (isAlive) {
              aliveWithGain.push({ address: player, gainPercent });
            } else {
              losersList.push({ 
                address: player, 
                gainPercent: gainPercent !== null ? gainPercent : 0 
              });
            }
          } catch (error) {
            console.error(`❌ Error checking player ${player}:`, error);
            losersList.push({ address: player, gainPercent: 0 });
          }
        }

        // Sort alive by gain % descending (best first), take Top 3
        aliveWithGain.sort((a, b) => {
          const ga = a.gainPercent ?? -Infinity;
          const gb = b.gainPercent ?? -Infinity;
          return gb - ga;
        });
        const pool = calculatedPrizePool;
        const firstPlace = (pool * 60n) / 100n;
        const secondPlace = (pool * 30n) / 100n;
        const thirdPlace = (pool * 10n) / 100n;
        const winnersList: WinnerData[] = [];
        if (aliveWithGain.length >= 1) winnersList.push({ address: aliveWithGain[0].address, place: 1, prize: firstPlace, gainPercent: aliveWithGain[0].gainPercent });
        if (aliveWithGain.length >= 2) winnersList.push({ address: aliveWithGain[1].address, place: 2, prize: secondPlace, gainPercent: aliveWithGain[1].gainPercent });
        if (aliveWithGain.length >= 3) winnersList.push({ address: aliveWithGain[2].address, place: 3, prize: thirdPlace, gainPercent: aliveWithGain[2].gainPercent });

        // Sort losers by gain percentage (worst first)
        losersList.sort((a, b) => a.gainPercent - b.gainPercent);

        console.log(`✅ Setting Top 3 winners: ${winnersList.length}, losers: ${losersList.length}`);
        setWinners(winnersList);
        setLosers(losersList);
        
        // Use Basescan API to find a payout tx (e.g. to 1st place)
        if (winnersList.length > 0) {
          try {
            const firstWinner = winnersList[0].address;
            console.log('📡 Querying Basescan API for internal transactions to winner:', firstWinner);
            const basescanUrl = `https://api-sepolia.basescan.org/api?module=account&action=txlistinternal&address=${CONTRACT_ADDRESS}&startblock=0&endblock=99999999&sort=desc&apikey=YourApiKeyToken`;
            const response = await fetch(basescanUrl);
            const data = await response.json();
            if (data.status === '1' && data.result && Array.isArray(data.result)) {
              const payoutTx = data.result.find((tx: any) => 
                tx.to && tx.to.toLowerCase() === firstWinner.toLowerCase() &&
                parseFloat(tx.value) > 0 &&
                tx.from && tx.from.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()
              );
              if (payoutTx) {
                setFinalizationTxHash(payoutTx.hash);
                console.log('✅ Found prize payout transaction:', payoutTx.hash);
              }
            }
          } catch (apiError) {
            console.error('❌ Basescan API query failed:', apiError);
          }
        }
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
            
            // Only consider alive players (alive is at index 6)
            if ((playerData as any)[6] === true) {
              // Get player's current adjusted ETH balance
              const adjustedBalances = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: contractABI,
                functionName: 'getAdjustedBalances',
                args: [BigInt(gameId), player],
              });
              const [currentETH] = adjustedBalances as [bigint];
              
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
            
            // getPlayer returns: [squareIndex, startValueUSDC, penaltyETH, penaltyUSDC, 
            //                     penaltyAERO, penaltyCAKE, alive, eliminationReason]
            // alive is at index 6
            const playerArray = Array.isArray(playerData) ? playerData : [
              playerData.squareIndex !== undefined ? playerData.squareIndex : playerData[0],
              playerData.startValueUSDC !== undefined ? playerData.startValueUSDC : playerData[1],
              playerData.penaltyETH !== undefined ? playerData.penaltyETH : playerData[2],
              playerData.penaltyUSDC !== undefined ? playerData.penaltyUSDC : playerData[3],
              playerData.penaltyAERO !== undefined ? playerData.penaltyAERO : playerData[4],
              playerData.penaltyCAKE !== undefined ? playerData.penaltyCAKE : playerData[5],
              playerData.alive !== undefined ? playerData.alive : playerData[6],
              playerData.eliminationReason !== undefined ? playerData.eliminationReason : playerData[7],
            ];
            
            isCurrentlyAlive = playerArray[6] === true;
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Loading game...</p>
      </div>
    );
  }

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

  // Players are now fetched via useEffect above using fetchGamePlayers

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
            <Link 
              href="/"
              className="text-gray-400 hover:text-white transition-colors mr-2"
              title="Back to games"
            >
              ←
            </Link>
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
          {registrationCountdown && !hasStarted && !isFinished && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">Registration Closes:</span>
              <span className="text-purple-400 font-semibold">{registrationCountdown}</span>
            </div>
          )}
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
        ) : hasStarted && !isFinished ? (
          <>
            <div className="flex gap-6">
              <div className="flex-1">
                <GameBoard gameId={gameId} players={players} />
              </div>
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
            
            {/* Round Snapshots Section - Detached below game board */}
            {hasStarted && (
                <div className="mt-6 bg-[#1a1a1a] border border-purple-500/30 rounded-2xl p-6">
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
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300 sticky left-0 bg-[#1a1a1a] z-10">
                              Players
                            </th>
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((roundNum) => (
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
                                ? Math.max(...Array.from(playerSnapshots.keys()))
                                : 0;
                              const currentRound = Number(game.currentRound);
                              const wasEliminated = lastRound > 0 && lastRound < currentRound;
                              
                              return (
                                <tr
                                  key={playerAddress}
                                  className={`border-b border-gray-800/50 hover:bg-gray-800/20 ${
                                    wasEliminated ? 'opacity-60' : ''
                                  }`}
                                >
                                  <td className="py-3 px-4 text-sm font-mono text-gray-300 sticky left-0 bg-[#1a1a1a] z-10">
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
                                  {Array.from({ length: 10 }, (_, i) => i + 1).flatMap((roundNum) => {
                                    const startETH = playerSnapshots.get(roundNum);
                                    // For Round 2+, use previous round's End as Start if Start doesn't exist
                                    // This handles the case where Round 2 Start = Round 1 End (same snapshot)
                                    let displayStartETH = startETH;
                                    if (!startETH && roundNum > 1) {
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
                                            : 'text-gray-600 border-l border-gray-700/30'
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
                                className="border-b border-gray-800/50 hover:bg-gray-800/20"
                              >
                                <td className="py-3 px-4 text-sm font-mono text-gray-300 sticky left-0 bg-[#1a1a1a] z-10">
                                  <span className="truncate max-w-[200px]">
                                    {playerAddress.slice(0, 6)}...{playerAddress.slice(-4)}
                                  </span>
                                </td>
                                {Array.from({ length: 10 }, (_, i) => i + 1).flatMap((roundNum) => [
                                  <td
                                    key={`${playerAddress}-${roundNum}-start`}
                                    className="py-3 px-3 text-center text-xs text-gray-600 whitespace-nowrap min-w-[120px]"
                                  >
                                    <span>—</span>
                                  </td>,
                                  <td
                                    key={`${playerAddress}-${roundNum}-end`}
                                    className="py-3 px-3 text-center text-xs text-gray-600 border-l border-gray-700/30 whitespace-nowrap min-w-[120px]"
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
                  <div className="bg-[#1a1a1a] border border-gray-700 p-6 rounded-2xl mb-6">
                    <div className="text-white">Loading game results...</div>
                  </div>
                )}
                
                {winnerDataError && !loadingWinnerData && (
                  <div className="bg-[#1a1a1a] border border-red-500/50 p-6 rounded-2xl mb-6">
                    <div className="text-red-400">Error: {winnerDataError}</div>
                  </div>
                )}
                
                {winners.length > 0 && (
                  <div className="space-y-6 mb-6">
                    {/* 1st place: full card with gold gradient */}
                    {winners[0] && (
                      <div className="flex flex-wrap items-stretch gap-4">
                        <div className="flex-1 min-w-[280px] bg-gradient-to-br from-[#1a1a1a] to-amber-950/30 border-2 border-[#fbbf24] p-6 rounded-2xl shadow-lg shadow-amber-500/10">
                          <div className="text-xs text-amber-400/90 mb-1">🥇 1st Place</div>
                          <div className="text-xl font-semibold text-amber-200 font-mono break-all mb-2">
                            {winners[0].address}
                          </div>
                          <div className="flex justify-between items-center pt-3 border-t border-amber-500/30">
                            <span className="text-sm text-amber-200/80">Prize</span>
                            <span className="text-xl font-bold text-[#fbbf24]">{formatEther(winners[0].prize)} ETH</span>
                          </div>
                          <div className="flex justify-between items-center pt-2">
                            <span className="text-sm text-amber-200/80">Final Gain</span>
                            <span className={`text-lg font-semibold ${(winners[0].gainPercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {winners[0].gainPercent !== null ? `${winners[0].gainPercent >= 0 ? '+' : ''}${winners[0].gainPercent.toFixed(2)}%` : 'N/A'}
                            </span>
                          </div>
                          {finalizationTxHash && (
                            <a
                              href={`https://sepolia.basescan.org/tx/${finalizationTxHash}#internaltx`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-amber-400 hover:text-amber-300 hover:underline mt-3 block"
                            >
                              View prize payout tx →
                            </a>
                          )}
                        </div>
                        <div className="bg-[#1a1a1a] border border-[#fbbf24] p-6 rounded-2xl min-w-[200px]">
                          <div className="text-xs text-[#9ca3af] mb-1">Prize Pool (Paid Out)</div>
                          <div className="text-2xl font-semibold text-[#10b981]">
                            {prizeAmount > 0n ? formatEther(prizeAmount) : formatEther(game.prizePool || 0n)} ETH
                          </div>
                          <div className="text-xs text-gray-500 mt-2">60% / 30% / 10% to Top 3</div>
                          {prizeAmount === 0n && game.prizePool === 0n && (
                            <div className="text-xs text-yellow-400 mt-2">
                              Calculated: {formatEther((game.entryFee * game.playerCount * 70n) / 100n)} ETH
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* 2nd and 3rd: side-by-side smaller cards */}
                    {(winners[1] || winners[2]) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {winners[1] && (
                          <div className="bg-[#1a1a1a] border border-gray-400/50 p-4 rounded-xl">
                            <div className="text-xs text-gray-400 mb-1">🥈 2nd Place</div>
                            <div className="text-sm font-mono text-gray-300 truncate mb-2" title={winners[1].address}>
                              {winners[1].address.slice(0, 6)}...{winners[1].address.slice(-4)}
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Prize</span>
                              <span className="font-semibold text-[#10b981]">{formatEther(winners[1].prize)} ETH</span>
                            </div>
                            <div className="flex justify-between text-sm mt-1">
                              <span className="text-gray-500">Gain</span>
                              <span className={winners[1].gainPercent !== null && winners[1].gainPercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                                {winners[1].gainPercent !== null ? `${winners[1].gainPercent >= 0 ? '+' : ''}${winners[1].gainPercent.toFixed(2)}%` : 'N/A'}
                              </span>
                            </div>
                          </div>
                        )}
                        {winners[2] && (
                          <div className="bg-[#1a1a1a] border border-amber-700/50 p-4 rounded-xl">
                            <div className="text-xs text-amber-600/90 mb-1">🥉 3rd Place</div>
                            <div className="text-sm font-mono text-gray-300 truncate mb-2" title={winners[2].address}>
                              {winners[2].address.slice(0, 6)}...{winners[2].address.slice(-4)}
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Prize</span>
                              <span className="font-semibold text-[#10b981]">{formatEther(winners[2].prize)} ETH</span>
                            </div>
                            <div className="flex justify-between text-sm mt-1">
                              <span className="text-gray-500">Gain</span>
                              <span className={winners[2].gainPercent !== null && winners[2].gainPercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                                {winners[2].gainPercent !== null ? `${winners[2].gainPercent >= 0 ? '+' : ''}${winners[2].gainPercent.toFixed(2)}%` : 'N/A'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {winners.length === 0 && !loadingWinnerData && gamePlayers && (gamePlayers as Address[]).length > 0 && (
                  <div className="bg-[#1a1a1a] border border-yellow-500/50 p-6 rounded-2xl mb-6">
                    <div className="text-yellow-400">No winners found. All players may have been eliminated.</div>
                  </div>
                )}

                {losers.length > 0 && (
                  <div className="bg-[#1a1a1a] border border-gray-700 p-6 rounded-2xl mb-6">
                    <div className="text-xs text-[#9ca3af] mb-4">Eliminated Players ({losers.length})</div>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {losers.map((loser, index) => (
                        <div key={loser.address} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-b-0">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-300 font-mono truncate">
                              {loser.address}
                            </div>
                            <div className="text-xs text-gray-500">#{index + 1} eliminated</div>
                          </div>
                          <div className={`text-lg font-semibold ml-4 ${loser.gainPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {loser.gainPercent >= 0 ? '+' : ''}{loser.gainPercent.toFixed(2)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Round Snapshots (Start / End ETH per round) - at bottom of finished game data */}
                {!game.cancelled && (
                  <div className="mt-6 w-full max-w-6xl mx-auto bg-[#1a1a1a] border border-purple-500/30 rounded-2xl p-6 mb-6">
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
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300 sticky left-0 bg-[#1a1a1a] z-10">Players</th>
                              {Array.from({ length: 10 }, (_, i) => i + 1).map((roundNum) => (
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
                                const winnerSet = new Set(winners.map((w) => w.address.toLowerCase()));
                                const wasEliminated = winnerSet.size > 0 && !winnerSet.has(playerAddress.toLowerCase());
                                const winnerEntry = winners.find((w) => w.address.toLowerCase() === playerAddress.toLowerCase());
                                const placeLabel = winnerEntry ? (winnerEntry.place === 1 ? '1st' : winnerEntry.place === 2 ? '2nd' : '3rd') : null;
                                return (
                                  <tr
                                    key={playerAddress}
                                    className={`border-b border-gray-800/50 hover:bg-gray-800/20 ${wasEliminated ? 'opacity-60' : ''} ${winnerEntry ? (winnerEntry.place === 1 ? 'ring-1 ring-[#fbbf24]/50' : winnerEntry.place === 2 ? 'ring-1 ring-gray-400/40' : 'ring-1 ring-amber-600/40') : ''}`}
                                  >
                                    <td className="py-3 px-4 text-sm font-mono text-gray-300 sticky left-0 bg-[#1a1a1a] z-10">
                                      <div className="flex items-center gap-2">
                                        <span className="truncate max-w-[200px]">{playerAddress.slice(0, 6)}...{playerAddress.slice(-4)}</span>
                                        {placeLabel && <span className={`text-xs font-semibold whitespace-nowrap ${winnerEntry!.place === 1 ? 'text-[#fbbf24]' : winnerEntry!.place === 2 ? 'text-gray-400' : 'text-amber-600'}`}>{placeLabel}</span>}
                                        {wasEliminated && !winnerEntry && <span className="text-xs text-red-400 font-medium whitespace-nowrap">(Eliminated)</span>}
                                      </div>
                                    </td>
                                    {Array.from({ length: 10 }, (_, i) => i + 1).flatMap((roundNum) => {
                                      const startETH = playerSnapshots.get(roundNum);
                                      let displayStartETH = startETH;
                                      if (!startETH && roundNum > 1) {
                                        const prevRoundEnd = roundEndSnapshots.get(playerAddress)?.get(roundNum - 1);
                                        if (prevRoundEnd) displayStartETH = prevRoundEnd;
                                      }
                                      const endETH = roundEndSnapshots.get(playerAddress)?.get(roundNum);
                                      const hasStart = displayStartETH !== undefined;
                                      const hasEnd = endETH !== undefined;
                                      const isEliminationRound = wasEliminated && totalRounds > 0 && roundNum === totalRounds;
                                      const startFromPrevEnd = !startETH && roundNum > 1 && displayStartETH !== undefined;
                                      return [
                                        <td
                                          key={`${playerAddress}-${roundNum}-start`}
                                          className={`py-3 px-3 text-center text-xs font-mono whitespace-nowrap min-w-[120px] ${hasStart ? (isEliminationRound ? 'text-red-300 bg-red-500/5' : 'text-purple-300 bg-purple-500/5') : 'text-gray-600'}`}
                                        >
                                          {hasStart && displayStartETH !== undefined ? <span className="font-semibold block" title={formatEther(displayStartETH) + ' ETH' + (startFromPrevEnd ? ' (from Round ' + (roundNum - 1) + ' End)' : '')}>{Number(formatEther(displayStartETH)).toFixed(6)} ETH</span> : <span className="text-gray-600">—</span>}
                                        </td>,
                                        <td
                                          key={`${playerAddress}-${roundNum}-end`}
                                          className={`py-3 px-3 text-center text-xs font-mono whitespace-nowrap min-w-[120px] ${hasEnd ? (isEliminationRound ? 'text-red-300 bg-red-500/5 border-l border-red-500/20' : 'text-green-300 bg-green-500/5 border-l border-green-500/20') : 'text-gray-600 border-l border-gray-700/30'}`}
                                        >
                                          {hasEnd && endETH !== undefined ? <span className="font-semibold block" title={formatEther(endETH) + ' ETH'}>{Number(formatEther(endETH)).toFixed(6)} ETH</span> : <span className="text-gray-600">—</span>}
                                        </td>,
                                      ];
                                    })}
                                  </tr>
                                );
                              })
                            ) : (
                              gamePlayers ? Array.from(gamePlayers as Address[]).map((playerAddress): React.ReactElement => (
                                <tr key={playerAddress} className="border-b border-gray-800/50">
                                  <td className="py-3 px-4 text-sm font-mono text-gray-300 sticky left-0 bg-[#1a1a1a] z-10"><span className="truncate max-w-[200px]">{playerAddress.slice(0, 6)}...{playerAddress.slice(-4)}</span></td>
                                  {Array.from({ length: 10 }, (_, i) => i + 1).flatMap((roundNum) => [
                                    <td key={`${playerAddress}-${roundNum}-start`} className="py-3 px-3 text-center text-xs text-gray-600 whitespace-nowrap min-w-[120px]"><span>—</span></td>,
                                    <td key={`${playerAddress}-${roundNum}-end`} className="py-3 px-3 text-center text-xs text-gray-600 border-l border-gray-700/30 whitespace-nowrap min-w-[120px]"><span>—</span></td>,
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
                    </div>
                  </div>
                )}
              </>
            )}
            {game.cancelled && (
              <div className="bg-[#1a1a1a] border border-red-500/50 p-4 inline-block">
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
  );
}
