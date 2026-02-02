'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther, formatUnits } from 'viem';
import { CONTRACT_ADDRESS, contractABI, publicClient } from '@/lib/contract';
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

  // Find the winner (alive player) if game is finalized - MUST be before conditional return
  const [winner, setWinner] = useState<Address | null>(null);
  const [prizeAmount, setPrizeAmount] = useState<bigint>(0n);
  const [winnerGainPercent, setWinnerGainPercent] = useState<number | null>(null);
  const [losers, setLosers] = useState<Array<{ address: Address; gainPercent: number }>>([]);
  const [finalizationTxHash, setFinalizationTxHash] = useState<string | null>(null);
  const [eliminatedPlayers, setEliminatedPlayers] = useState<string[]>([]);
  const [registrationCountdown, setRegistrationCountdown] = useState<string>('');
  const [loadingWinnerData, setLoadingWinnerData] = useState<boolean>(false);
  const [winnerDataError, setWinnerDataError] = useState<string | null>(null);

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
    
    // Helper function to calculate gain percentage for a player
    const calculateGainPercent = async (playerAddress: Address): Promise<number | null> => {
      try {
        const playerData = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: contractABI,
          functionName: 'getPlayer',
          args: [BigInt(gameId), playerAddress],
        });
        
        // Get player's starting value (index 1 = startValueUSDC)
        const startValueUSDC = (playerData as any)[1] as bigint;
        if (startValueUSDC === 0n) {
          console.warn(`⚠️ Player ${playerAddress} has zero startValueUSDC`);
          return null;
        }
        
        // Get player's current adjusted balances
        const adjustedBalances = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: contractABI,
          functionName: 'getAdjustedBalances',
          args: [BigInt(gameId), playerAddress],
        });
        
        // Calculate total current value in USDC
        // adjustedBalances returns: (ETH, USDC, AERO, CAKE)
        const [ethBalance, usdcBalance, aeroBalance, cakeBalance] = adjustedBalances as [bigint, bigint, bigint, bigint];
        
        // Convert to USDC value (simplified pricing - should match monitoring service)
        const ETH_PRICE_USDC = 3300; // $3300 per ETH
        const AERO_PRICE_USDC = 1; // Placeholder
        const CAKE_PRICE_USDC = 1; // Placeholder
        
        // ETH: 18 decimals, USDC: 6 decimals, AERO/CAKE: 18 decimals
        const ethValueUSDC = (Number(formatEther(ethBalance)) * ETH_PRICE_USDC * 1e6);
        const usdcValueUSDC = Number(formatUnits(usdcBalance, 6));
        const aeroValueUSDC = (Number(formatEther(aeroBalance)) * AERO_PRICE_USDC * 1e6);
        const cakeValueUSDC = (Number(formatEther(cakeBalance)) * CAKE_PRICE_USDC * 1e6);
        
        const totalValueUSDC = BigInt(Math.floor(ethValueUSDC + usdcValueUSDC + aeroValueUSDC + cakeValueUSDC));
        
        // Calculate percentage gain
        const gain = totalValueUSDC - startValueUSDC;
        const gainPercent = (Number(gain) / Number(startValueUSDC)) * 100;
        console.log(`📊 Player ${playerAddress.slice(0, 10)}... gain: ${gainPercent.toFixed(2)}%`);
        return gainPercent;
      } catch (error) {
        console.error(`❌ Error calculating gain for ${playerAddress}:`, error);
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

        // Find the winner (alive player) and all losers (eliminated players)
        const players = gamePlayers as Address[];
        console.log(`👥 Processing ${players.length} players for game #${gameId}`);
        
        if (players.length === 0) {
          console.warn('⚠️ No players found in game');
          setWinnerDataError('No players found in this game');
          setLoadingWinnerData(false);
          return;
        }
        
        const losersList: Array<{ address: Address; gainPercent: number }> = [];
        let winnerAddress: Address | null = null;
        let winnerGain: number | null = null;

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
            
            // Calculate gain percentage for this player (even if null, we'll still show the address)
            const gainPercent = await calculateGainPercent(player);
            
            if (isAlive) {
              // This is the winner
              winnerAddress = player;
              winnerGain = gainPercent;
              console.log(`🏆 Winner found: ${player}, gain: ${winnerGain !== null ? winnerGain.toFixed(2) + '%' : 'N/A'}`);
            } else {
              // This is a loser (eliminated player) - add even if gainPercent is null
              losersList.push({ 
                address: player, 
                gainPercent: gainPercent !== null ? gainPercent : 0 
              });
            }
          } catch (error) {
            console.error(`❌ Error checking player ${player}:`, error);
            // Still add to losers list even if we can't get full data
            losersList.push({ address: player, gainPercent: 0 });
          }
        }

        // Sort losers by gain percentage (worst first)
        losersList.sort((a, b) => a.gainPercent - b.gainPercent);

        console.log(`✅ Setting winner: ${winnerAddress}, losers: ${losersList.length}`);
        setWinner(winnerAddress);
        setWinnerGainPercent(winnerGain);
        setLosers(losersList);
        
        // Use Basescan API to find the internal transaction that paid the winner
        if (winnerAddress) {
          try {
            console.log('📡 Querying Basescan API for internal transactions to winner:', winnerAddress);
            const basescanUrl = `https://api-sepolia.basescan.org/api?module=account&action=txlistinternal&address=${CONTRACT_ADDRESS}&startblock=0&endblock=99999999&sort=desc&apikey=YourApiKeyToken`;
            
            const response = await fetch(basescanUrl);
            const data = await response.json();
            
            console.log('📥 Basescan API response:', { 
              status: data.status, 
              message: data.message, 
              resultCount: data.result?.length || 0 
            });
            
            if (data.status === '1' && data.result && Array.isArray(data.result)) {
              const payoutTx = data.result.find((tx: any) => 
                tx.to && tx.to.toLowerCase() === winnerAddress!.toLowerCase() &&
                parseFloat(tx.value) > 0 &&
                tx.from && tx.from.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()
              );
              
              if (payoutTx) {
                setFinalizationTxHash(payoutTx.hash);
                console.log('✅ Found prize payout transaction:', payoutTx.hash);
              } else {
                console.warn('⚠️ No matching payout transaction found');
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
                
                {winner && (
                  <div className="bg-[#1a1a1a] border border-purple-500/50 p-6 rounded-2xl mb-6">
                    <div className="text-xs text-[#9ca3af] mb-2">Winner</div>
                    <div className="text-xl font-semibold text-purple-400 font-mono break-all mb-3">
                      {winner}
                    </div>
                    {winnerGainPercent !== null && (
                      <div className="flex justify-between items-center pt-3 border-t border-gray-700">
                        <span className="text-sm text-[#9ca3af]">Final Gain:</span>
                        <span className={`text-xl font-semibold ${winnerGainPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {winnerGainPercent >= 0 ? '+' : ''}{winnerGainPercent.toFixed(2)}%
                        </span>
                      </div>
                    )}
                    {winnerGainPercent === null && (
                      <div className="text-xs text-yellow-400 mt-3">Gain percentage unavailable</div>
                    )}
                    {finalizationTxHash ? (
                      <a
                        href={`https://sepolia.basescan.org/tx/${finalizationTxHash}#internaltx`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-400 hover:text-purple-300 hover:underline mt-3 block"
                      >
                        View Prize Payout Internal Transaction ({formatEther(prizeAmount > 0n ? prizeAmount : game.prizePool || 0n)} ETH sent to {winner.slice(0, 6)}...{winner.slice(-4)}) →
                      </a>
                    ) : winner && (
                      <a
                        href={`https://sepolia.basescan.org/address/${CONTRACT_ADDRESS}#internaltx`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-400 hover:text-purple-300 hover:underline mt-3 block"
                      >
                        View Contract Internal Transactions (search for {winner.slice(0, 6)}...{winner.slice(-4)}) →
                      </a>
                    )}
                  </div>
                )}
                
                {!winner && !loadingWinnerData && gamePlayers && (gamePlayers as Address[]).length > 0 && (
                  <div className="bg-[#1a1a1a] border border-yellow-500/50 p-6 rounded-2xl mb-6">
                    <div className="text-yellow-400">No winner found. All players may have been eliminated.</div>
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
                
                <div className="bg-[#1a1a1a] border border-[#fbbf24] p-4 inline-block">
                  <div className="text-xs text-[#9ca3af] mb-1">Prize Pool (Paid Out)</div>
                  <div className="text-2xl font-semibold text-[#10b981]">
                    {prizeAmount > 0n ? formatEther(prizeAmount) : formatEther(game.prizePool || 0n)} ETH
                  </div>
                  {prizeAmount === 0n && game.prizePool === 0n && (
                    <div className="text-xs text-yellow-400 mt-2">
                      Calculated: {formatEther((game.entryFee * game.playerCount * 70n) / 100n)} ETH
                    </div>
                  )}
                  {finalizationTxHash && winner && (
                    <a
                      href={`https://sepolia.basescan.org/tx/${finalizationTxHash}#internaltx`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-400 hover:text-purple-300 hover:underline mt-2 block"
                    >
                      View Prize Payout Internal Transaction ({formatEther(prizeAmount > 0n ? prizeAmount : game.prizePool || 0n)} ETH sent to {winner.slice(0, 6)}...{winner.slice(-4)}) →
                    </a>
                  )}
                </div>
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
