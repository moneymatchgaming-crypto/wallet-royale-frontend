'use client';

import React, { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { contractABI } from '@/lib/contract';
import { CONTRACT_ADDRESS } from '@/lib/contract';

interface FinalizeRoundButtonProps {
  gameId: number;
  roundNumber: number;
  onSuccess?: () => void;
  /** When 'prominent', uses larger button, green gradient, and pulse when ready */
  variant?: 'default' | 'prominent';
}

/**
 * Fetch and rank players to determine who should be eliminated
 */
async function getEliminatedPlayers(gameId: number, roundNumber: number) {
  const { createPublicClient, http } = await import('viem');
  const { baseSepolia } = await import('viem/chains');
  
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http('https://sepolia.base.org', {
      retryCount: 3,
      retryDelay: 1000,
      timeout: 10000,
    }),
  });

  // Get game info first
  const game = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'games',
    args: [BigInt(gameId)],
  }) as any;

  console.log('Game state:', {
    active: game.active,
    startTime: game.startTime > 0n ? new Date(Number(game.startTime) * 1000) : 'Not started',
    finalized: game.finalized,
    cancelled: game.cancelled,
    currentRound: Number(game.currentRound),
    playerCount: Number(game.playerCount)
  });

  // Get round info
  const round = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'rounds',
    args: [BigInt(gameId), BigInt(roundNumber)],
  }) as any;

  // Round data structure: [roundNumber, startTime, endTime, alivePlayers, cutoffRank, finalized]
  const roundArray = Array.isArray(round) ? round : [
    round.roundNumber || round[0],
    round.startTime || round[1],
    round.endTime || round[2],
    round.alivePlayers || round[3],
    round.cutoffRank || round[4],
    round.finalized !== undefined ? round.finalized : round[5]
  ];
  
  const roundFinalized = roundArray[5] === true;
  const roundAlivePlayers = Number(roundArray[3] || 0n);

  console.log('Round state:', {
    roundNumber: Number(roundArray[0]),
    startTime: new Date(Number(roundArray[1]) * 1000),
    endTime: new Date(Number(roundArray[2]) * 1000),
    alivePlayers: roundAlivePlayers,
    cutoffRank: Number(roundArray[4]),
    finalized: roundFinalized
  });

  // Get all players
  const allPlayers = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'getGamePlayers',
    args: [BigInt(gameId)],
  }) as `0x${string}`[];

  console.log(`Total registered players: ${allPlayers.length}`);

  // Check each player's status
  const playerData: Array<{
    address: `0x${string}`;
    startETH: bigint;
    currentETH: bigint;
    gainPct: number;
    alive: boolean;
  }> = [];

  let aliveCount = 0;
  let eliminatedCount = 0;

  for (const playerAddr of allPlayers) {
    let isAlive = false;
    let isRegistered = false;
    
    try {
      // Try using getPlayer function first (more reliable, returns specific fields)
      try {
        const playerData = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: contractABI,
          functionName: 'getPlayer',
          args: [BigInt(gameId), playerAddr],
        }) as any;
        
        // getPlayer returns: [squareIndex, startValueUSDC, penaltyETH, penaltyUSDC, penaltyAERO, penaltyCAKE, alive, eliminationReason]
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

        isAlive = playerArray[6] === true;
        // For getPlayer, we assume registered if we got data back
        isRegistered = true;
      } catch (getPlayerError) {
        // Fallback to players mapping if getPlayer fails
        const player = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: contractABI,
          functionName: 'players',
          args: [BigInt(gameId), playerAddr],
        }) as any;

        // Player struct: [wallet(0), squareIndex(1), startETH(2), startUSDC(3), startAERO(4), startCAKE(5),
        //   startValueUSDC(6), penaltyETH(7), penaltyUSDC(8), penaltyAERO(9), penaltyCAKE(10),
        //   alive(11), registered(12), markedForElimination(13), eliminationReason(14), registrationTime(15), eliminationRound(16)]
        const pArr = Array.isArray(player) ? player : Object.values(player);

        isAlive = pArr[11] === true;
        isRegistered = pArr[12] === true;
      }
    } catch (rpcError: any) {
      // Handle RPC rate limits and errors
      if (rpcError.message?.includes('429') || rpcError.message?.includes('rate limit')) {
        throw new Error('RPC rate limit exceeded. Please wait a moment and try again.');
      }
      console.error(`Error reading player ${playerAddr}:`, rpcError);
      continue; // Skip this player and continue
    }

    console.log(`Player ${playerAddr.slice(0, 10)}... - Alive: ${isAlive}, Registered: ${isRegistered}`);

    if (isAlive && isRegistered) {
      aliveCount++;
      
      // Get round start balance
      const startETH = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: 'getRoundStartETH',
        args: [BigInt(gameId), BigInt(roundNumber), playerAddr],
      }) as bigint;

      // Get current balance
      const currentETH = await publicClient.getBalance({
        address: playerAddr,
      });

      // Calculate gain percentage
      const gainPct = startETH > 0n 
        ? Number((currentETH - startETH) * 10000n / startETH) / 100
        : 0;
      
      // Log detailed calculation for debugging
      if (startETH === 0n) {
        console.warn(`⚠️ Player ${playerAddr.slice(0, 10)}... has zero roundStartETH for round ${roundNumber} - gain will be 0%`);
      } else {
        console.log(`📊 Player ${playerAddr.slice(0, 10)}...: startETH=${formatEther(startETH)} ETH, currentETH=${formatEther(currentETH)} ETH, gain=${gainPct.toFixed(2)}%`);
      }

      // Get square index for tie-breaking (earlier registration = lower square index = better rank)
      let squareIndex = 0;
      try {
        const playerInfo = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: contractABI,
          functionName: 'getPlayer',
          args: [BigInt(gameId), playerAddr],
        }) as any;
        const playerArray = Array.isArray(playerInfo) ? playerInfo : [
          playerInfo.squareIndex !== undefined ? playerInfo.squareIndex : playerInfo[0],
        ];
        squareIndex = Number(playerArray[0] || 0);
      } catch {
        // If we can't get square index, use 0 (will be sorted last in ties)
        squareIndex = 0;
      }

      playerData.push({
        address: playerAddr,
        startETH,
        currentETH,
        gainPct,
        alive: true,
        squareIndex, // Add square index for tie-breaking
      });
    } else {
      eliminatedCount++;
    }
  }

  console.log(`Alive: ${aliveCount}, Eliminated: ${eliminatedCount}, Total checked: ${allPlayers.length}`);

  // First check: If round is already finalized, don't try to finalize it
  if (roundFinalized) {
    throw new Error('Round is already finalized. Please refresh the page to see the updated state.');
  }

  // If round says players are alive but we can't find them, there's a mismatch
  // But be more lenient - if we found some players but not all, still proceed
  if (playerData.length === 0 && roundAlivePlayers > 0) {
    // Log detailed debug info
    console.warn('⚠️ Player data mismatch:', {
      roundAlivePlayers,
      playerDataLength: playerData.length,
      totalPlayers: allPlayers.length,
      aliveCount,
      eliminatedCount
    });
    
    // If we checked all players and none are alive, but contract says there are alive players,
    // this might be a timing issue or RPC problem. Try to proceed anyway with empty array
    // The contract will handle the validation
    if (allPlayers.length > 0 && aliveCount === 0) {
      console.warn('⚠️ No alive players found but contract reports alive players. This might be a state sync issue.');
      console.warn('⚠️ Attempting to finalize with empty array - contract will validate.');
      // Return empty array and let the contract handle it
      return [];
    }
    
    // Even if we couldn't find players, don't block finalization
    // Return empty array and let contract validate - it knows the true state
    console.warn(`⚠️ Contract reports ${roundAlivePlayers} alive players but none found after checking ${allPlayers.length} players.`);
    console.warn('⚠️ This might be a state mismatch or RPC issue. Returning empty array - contract will validate.');
    return []; // Don't throw - let contract handle it
  }

  // Determine if there's legitimately only 1 player remaining
  // We need to check BOTH:
  // 1. The contract's round.alivePlayers (source of truth)
  // 2. The actual count of alive players we found (cross-verification)
  
  console.log(`Player count check: contract reports ${roundAlivePlayers} alive, frontend found ${playerData.length} alive`);
  
  // If contract says 0 alive, game should end (no players left)
  if (roundAlivePlayers === 0) {
    console.log('⚠️ Contract reports 0 alive players - game should end');
    return []; // Return empty array - contract will finalize the game
  }
  
  // If contract says 1 alive, verify by checking actual players
  // This could happen if only 1 player registered or previous round eliminations left only 1
  if (roundAlivePlayers === 1) {
    // Cross-verify: Check if we actually found 1 alive player
    if (playerData.length === 1) {
      console.log('✅ Verified: Only 1 player remaining (contract and frontend agree) - game should end');
      console.log(`   Remaining player: ${playerData[0].address}`);
      return []; // No eliminations, game will finalize
    } else if (playerData.length === 0) {
      console.warn('⚠️ Contract reports 1 alive player but frontend found 0 - possible RPC sync issue');
      console.warn('⚠️ Returning empty array - contract will handle validation');
      return []; // Let contract handle it
    } else {
      // Mismatch: contract says 1 but we found more
      // This could be a timing issue - players might have been eliminated between our check and now
      // Or RPC sync issue. Trust the contract's count and proceed.
      console.warn(`⚠️ Mismatch: Contract says 1 alive but frontend found ${playerData.length} alive players`);
      console.warn('⚠️ This might be a timing/RPC sync issue. Trusting contract count and proceeding...');
      console.warn('⚠️ Returning empty array - contract will handle validation');
      return []; // Let contract handle it - don't throw error, just proceed
    }
  }
  
  // If contract says 2+ alive but we found fewer, there might be a sync issue
  // But don't block finalization - use what we found and let contract validate
  if (roundAlivePlayers > 1 && playerData.length < roundAlivePlayers) {
    console.warn(`⚠️ Mismatch: Contract reports ${roundAlivePlayers} alive but frontend found ${playerData.length}`);
    console.warn('⚠️ Player count mismatch may be due to RPC sync issue.');
    console.warn('⚠️ Proceeding with available data - contract will validate...');
    // Continue - we'll use the players we found
  }
  
  // If we found 0 players but contract says there are alive players
  // This is unusual but don't block - let contract handle it
  if (playerData.length === 0 && roundAlivePlayers > 0) {
    console.warn(`⚠️ WARNING: Contract reports ${roundAlivePlayers} alive players but frontend found 0!`);
    console.warn('⚠️ This might be an RPC issue or state sync problem.');
    console.warn('⚠️ Returning empty array - contract will validate and handle appropriately');
    // Don't throw - return empty array and let contract decide
    return [];
  }
  
  // If we found only 1 player but contract says more
  // This could be RPC issue, but proceed with what we found
  if (playerData.length === 1 && roundAlivePlayers > 1) {
    console.warn(`⚠️ WARNING: Contract reports ${roundAlivePlayers} alive but frontend only found 1!`);
    console.warn('⚠️ This might be an RPC issue. Some players may not have been fetched.');
    console.warn('⚠️ Proceeding with 1 player - if this is wrong, contract will handle it');
    // Don't throw - proceed with 1 player (game will end, which might be correct)
    // But we should still try to eliminate based on what we found
    // Actually, if contract says more than 1, we should try to get more data
    // But for now, let's proceed and let contract validate
  }

  console.log('Player rankings:', playerData.map(p => ({
    address: p.address.slice(0, 10) + '...',
    gainPct: p.gainPct.toFixed(2) + '%',
    squareIndex: (p as any).squareIndex
  })));

  // Sort by gain percentage (highest first), then by square index (lower = earlier registration = better rank in ties)
  // This ensures deterministic elimination when players have the same gain percentage
  playerData.sort((a, b) => {
    // First sort by gain percentage (descending)
    if (b.gainPct !== a.gainPct) {
      return b.gainPct - a.gainPct;
    }
    // Tie-breaker: Lower square index = earlier registration = better rank
    const aSquare = (a as any).squareIndex || 999;
    const bSquare = (b as any).squareIndex || 999;
    return aSquare - bSquare;
  });

  // Determine cutoff
  const cutoffRank = Number(roundArray[4]);
  
  console.log(`Cutoff rank: ${cutoffRank} (top ${cutoffRank} survive)`);
  console.log(`Total alive players: ${playerData.length}`);
  
  // Safety check: cutoffRank should never be >= playerData.length (would eliminate everyone)
  if (cutoffRank >= playerData.length) {
    console.error(`⚠️ ERROR: cutoffRank (${cutoffRank}) >= alive players (${playerData.length}). This would eliminate everyone!`);
    console.error(`⚠️ Adjusting to eliminate only ${Math.max(1, playerData.length - 2)} players to ensure at least 2 survive.`);
    // Ensure at least 2 players survive (or 1 if only 2 players total)
    const maxEliminations = Math.max(1, playerData.length - 2);
    const adjustedCutoff = playerData.length - maxEliminations;
    console.log(`⚠️ Using adjusted cutoff: ${adjustedCutoff} (will eliminate ${maxEliminations} players)`);
    
    // Eliminate bottom players
    const eliminated = playerData
      .slice(adjustedCutoff)
      .map(p => p.address);
    
    console.log(`⚠️ Eliminating ${eliminated.length} players (adjusted):`, eliminated.map(a => a.slice(0, 10) + '...'));
    return eliminated;
  }
  
  // Safety check: Ensure we don't eliminate everyone
  if (cutoffRank === 0) {
    console.error(`⚠️ ERROR: cutoffRank is 0, which would eliminate everyone!`);
    console.error(`⚠️ This should never happen. Setting cutoffRank to 1 to ensure at least 1 survives.`);
    // If cutoffRank is 0, eliminate all but 1 (game will end)
    const eliminated = playerData
      .slice(1)
      .map(p => p.address);
    console.log(`⚠️ Eliminating ${eliminated.length} players (safety fallback):`, eliminated.map(a => a.slice(0, 10) + '...'));
    return eliminated;
  }
  
  // Special case: If all players are tied (same gain %), NO ONE should be eliminated
  // All players advance to the next round
  const uniqueGains = new Set(playerData.map(p => p.gainPct.toFixed(4))); // Use 4 decimal places for comparison
  if (uniqueGains.size === 1) {
    console.log('✅ All players tied at ' + playerData[0].gainPct.toFixed(2) + '% - NO ELIMINATIONS (all advance)');
    console.log('✅ This ensures fair play when all players have the same performance');
    return []; // Return empty array - no eliminations, all players advance
  }
  
  // Normal case: Eliminate players below cutoff rank
  const eliminated = playerData
    .slice(cutoffRank)
    .map(p => p.address);

  // Final safety check: Never eliminate everyone
  if (eliminated.length >= playerData.length) {
    console.error(`⚠️ ERROR: Would eliminate all ${playerData.length} players! This should never happen.`);
    console.error(`⚠️ Adjusting to eliminate only ${Math.max(1, playerData.length - 2)} players.`);
    return playerData
      .slice(Math.max(1, playerData.length - 2))
      .map(p => p.address);
  }

  console.log(`Eliminating ${eliminated.length} players (${playerData.length - eliminated.length} will survive):`, eliminated.map(a => a.slice(0, 10) + '...'));

  return eliminated;
}

export default function FinalizeRoundButton({
  gameId,
  roundNumber,
  onSuccess,
  variant = 'default',
}: FinalizeRoundButtonProps) {
  const { address } = useAccount();
  const [estimatedReward, setEstimatedReward] = useState<bigint | null>(null);
  const [loadingReward, setLoadingReward] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Fetch estimated reward
  useEffect(() => {
    if (!address) {
      setEstimatedReward(null);
      return;
    }

    const fetchReward = async () => {
      setLoadingReward(true);
      setError(null);
      try {
        // Call getFinalizationReward view function
        // Use public Base Sepolia RPC to avoid rate limits
        const { createPublicClient, http } = await import('viem');
        const { baseSepolia } = await import('viem/chains');
        
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http('https://sepolia.base.org', {
            retryCount: 3,
            retryDelay: 1000,
            timeout: 10000,
          }),
        });

        const reward = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: contractABI,
          functionName: 'getFinalizationReward',
          args: [BigInt(gameId), BigInt(roundNumber)],
        });

        setEstimatedReward(reward as bigint);
      } catch (err: any) {
        console.error('Error fetching finalization reward:', err);
        setError(err.message || 'Failed to fetch reward');
        setEstimatedReward(null);
      } finally {
        setLoadingReward(false);
      }
    };

    fetchReward();
  }, [gameId, roundNumber, address]);

  const handleFinalize = async (e?: React.MouseEvent) => {
    // Prevent any default form submission behavior
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!address) {
      setError('Please connect your wallet');
      return;
    }

    setError(null);
    setLoadingReward(true);
    
    try {
      // Eliminations are computed on-chain; we only pass gameId and roundNumber (no gasCost)
      console.log('Simulating finalization (on-chain elimination)...');
      const { createPublicClient, http } = await import('viem');
      const { baseSepolia } = await import('viem/chains');
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http('https://sepolia.base.org', { retryCount: 3, retryDelay: 1000, timeout: 10000 }),
      });
      await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: 'finalizeRound',
        args: [BigInt(gameId), BigInt(roundNumber), 0n],
        account: address,
      });
      console.log('✓ Simulation passed, sending transaction...');
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: 'finalizeRound',
        args: [BigInt(gameId), BigInt(roundNumber), 0n],
        gas: 2000000n,
      });
      
    } catch (simError: any) {
      console.error('Finalization error:', simError);
      
      let errorMsg = 'Transaction will fail';
      let shouldRefresh = false;
      let refreshDelay = 10000; // 10 seconds instead of 2
      
      if (simError.message?.includes('No alive players')) {
        errorMsg = 'Round already finalized. Page will refresh in 10 seconds...';
        shouldRefresh = true;
      } else if (simError.message?.includes('already finalized')) {
        errorMsg = 'Round already finalized by another transaction. Page will refresh in 10 seconds...';
        shouldRefresh = true;
      } else if (simError.message?.includes('429') || simError.message?.includes('rate limit')) {
        errorMsg = 'RPC rate limit exceeded. Please try again in a moment.';
      } else if (simError.message?.includes('Round not ended')) {
        errorMsg = 'Round has not ended yet';
      } else if (simError.message?.includes('Gas price too high')) {
        errorMsg = 'Gas price is too high. Please try again later';
      } else if (simError.message?.includes('Game not active')) {
        errorMsg = 'Game is not active';
      } else if (simError.message) {
        // Extract more readable error message
        const fullMessage = simError.message;
        if (fullMessage.includes('execution reverted')) {
          const match = fullMessage.match(/execution reverted:\s*(.+?)(?:\s|$)/i);
          errorMsg = match && match[1] ? match[1] : 'Transaction would revert';
        } else {
          errorMsg = fullMessage.length > 200 
            ? fullMessage.substring(0, 200) + '...' 
            : fullMessage;
        }
      }
      
      setError(errorMsg);
      
      // Only refresh if explicitly needed, and give user time to see the error
      if (shouldRefresh) {
        setTimeout(() => {
          window.location.reload();
        }, refreshDelay);
      }
    } finally {
      setLoadingReward(false);
    }
  };

  // Handle transaction success
  useEffect(() => {
    if (isSuccess && onSuccess) {
      onSuccess();
    }
  }, [isSuccess, onSuccess]);

  // Handle write errors with better error messages
  useEffect(() => {
    if (writeError) {
      const errorMessage = writeError.message || '';
      let displayError = 'Transaction failed';
      
      // Extract revert reason from error message
      if (errorMessage.includes('Round already finalized')) {
        displayError = 'Round already finalized by another transaction';
      } else if (errorMessage.includes('Round not ended')) {
        displayError = 'Round has not ended yet';
      } else if (errorMessage.includes('Gas price too high')) {
        displayError = 'Gas price is too high. Please try again later';
      } else if (errorMessage.includes('Game not active')) {
        displayError = 'Game is not active';
      } else if (errorMessage.includes('User rejected') || errorMessage.includes('User denied')) {
        displayError = 'Transaction cancelled';
        setError(null); // Don't show error for user cancellation
        return;
      } else if (errorMessage.length > 0) {
        // Try to extract a meaningful error message
        const match = errorMessage.match(/revert\s+(.+?)(?:\s|$)/i) || 
                     errorMessage.match(/execution reverted:\s*(.+?)(?:\s|$)/i);
        if (match && match[1]) {
          displayError = match[1];
        } else {
          displayError = errorMessage.length > 100 
            ? errorMessage.substring(0, 100) + '...' 
            : errorMessage;
        }
      }
      
      setError(displayError);
    }
  }, [writeError]);

  if (!address) {
    return null;
  }

  const isDisabled = isPending || isConfirming || loadingReward;

  return (
    <div className="space-y-2">
      {estimatedReward !== null && estimatedReward > 0n && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
          <div className="text-sm text-purple-300">
            <span className="font-semibold">Estimated Reward:</span>{' '}
            <span className="text-purple-200">{formatEther(estimatedReward)} ETH</span>
          </div>
          <div className="text-xs text-purple-400 mt-1">
            You'll earn ~1.5× your gas cost for finalizing this round
          </div>
        </div>
      )}

      {estimatedReward === 0n && !loadingReward && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <div className="text-sm text-yellow-300">
            Insufficient operations fund for reward
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="text-sm font-semibold text-red-300 mb-1">Error</div>
          <div className="text-sm text-red-200 whitespace-pre-wrap break-words">{error}</div>
        </div>
      )}

      {writeError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="text-sm font-semibold text-red-300 mb-1">Transaction Error</div>
          <div className="text-sm text-red-200 whitespace-pre-wrap break-words">
            {writeError.message || 'Transaction failed'}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={(e) => handleFinalize(e)}
        disabled={isDisabled}
        className={`
          w-full rounded-lg font-semibold transition-all
          ${variant === 'prominent' ? 'py-4 px-6 text-lg' : 'px-4 py-3'}
          ${isDisabled
            ? 'bg-gray-700/50 text-white/60 cursor-not-allowed'
            : variant === 'prominent'
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white shadow-lg hover:shadow-xl'
              : 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white shadow-lg hover:shadow-xl'
          }
          ${variant === 'prominent' && !isDisabled ? 'animate-pulse' : ''}
        `}
      >
        {isPending || isConfirming
          ? 'Finalizing...'
          : loadingReward
          ? 'Loading...'
          : `Finalize Round ${roundNumber}${estimatedReward && estimatedReward > 0n ? ` (Earn ~${formatEther(estimatedReward)} ETH)` : ''}`
        }
      </button>

      {hash && (
        <div className="text-xs text-white/85 text-center">
          <a
            href={`https://sepolia.basescan.org/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--neon-cyan)] hover:text-[var(--neon-cyan)]/80"
          >
            View on BaseScan
          </a>
        </div>
      )}
    </div>
  );
}
