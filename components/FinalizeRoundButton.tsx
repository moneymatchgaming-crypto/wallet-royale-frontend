'use client';

import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { contractABI } from '@/lib/contract';
import { CONTRACT_ADDRESS } from '@/lib/contract';

interface FinalizeRoundButtonProps {
  gameId: number;
  roundNumber: number;
  eliminatedPlayers: string[];
  onSuccess?: () => void;
}

export default function FinalizeRoundButton({
  gameId,
  roundNumber,
  eliminatedPlayers,
  onSuccess,
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
    if (!address || eliminatedPlayers.length === 0) {
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
  }, [gameId, roundNumber, address, eliminatedPlayers.length]);

  const handleFinalize = async () => {
    if (!address) {
      setError('Please connect your wallet');
      return;
    }

    if (eliminatedPlayers.length === 0) {
      setError('No players to eliminate');
      return;
    }

    setError(null);
    
    // Ensure eliminatedPlayers is an array of valid addresses
    const validEliminatedPlayers = eliminatedPlayers.filter((addr): addr is `0x${string}` => {
      return typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42;
    });
    
    if (validEliminatedPlayers.length === 0) {
      setError('No valid players to eliminate');
      return;
    }

    // Pre-validate by simulating the call
    try {
      const { createPublicClient, http } = await import('viem');
      const { baseSepolia } = await import('viem/chains');
      
      // Use public Base Sepolia RPC to avoid rate limits
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http('https://sepolia.base.org', {
          retryCount: 3,
          retryDelay: 1000,
          timeout: 10000,
        }),
      });

      // Simulate the call to check if it will succeed
      await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: 'finalizeRound',
        args: [
          BigInt(gameId),
          BigInt(roundNumber),
          validEliminatedPlayers as `0x${string}`[],
          0n, // gasCost (only used by oracle)
        ],
        account: address,
      });
      } catch (simError: any) {
      // Extract error message from simulation
      let errorMsg = 'Transaction will fail';
      
      // Handle RPC errors
      if (simError.message?.includes('429') || simError.message?.includes('rate limit')) {
        errorMsg = 'RPC rate limit exceeded. Please try again in a moment.';
      } else if (simError.message?.includes('503') || simError.message?.includes('timeout')) {
        errorMsg = 'RPC service temporarily unavailable. Please try again.';
      } else if (simError.message) {
        const match = simError.message.match(/revert\s+(.+?)(?:\s|$)/i) || 
                     simError.message.match(/execution reverted:\s*(.+?)(?:\s|$)/i);
        if (match && match[1]) {
          errorMsg = match[1];
        } else if (simError.message.includes('Round already finalized')) {
          errorMsg = 'Round already finalized';
        } else if (simError.message.includes('Round not ended')) {
          errorMsg = 'Round has not ended yet';
        } else if (simError.message.includes('Gas price too high')) {
          errorMsg = 'Gas price is too high';
        } else if (simError.message.includes('Game not active')) {
          errorMsg = 'Game is not active';
        } else {
          errorMsg = simError.message.length > 100 
            ? simError.message.substring(0, 100) + '...' 
            : simError.message;
        }
      }
      setError(errorMsg);
      console.error('Transaction simulation failed:', simError);
      return;
    }
    
    // If simulation passes, send the transaction
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: 'finalizeRound',
      args: [
        BigInt(gameId),
        BigInt(roundNumber),
        validEliminatedPlayers as `0x${string}`[],
        0n, // gasCost (only used by oracle)
      ],
    });
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

  const isDisabled = isPending || isConfirming || loadingReward || eliminatedPlayers.length === 0;

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
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2">
          <div className="text-sm text-red-300">{error}</div>
        </div>
      )}

      {writeError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2">
          <div className="text-sm text-red-300">
            {writeError.message || 'Transaction failed'}
          </div>
        </div>
      )}

      <button
        onClick={handleFinalize}
        disabled={isDisabled}
        className={`
          w-full px-4 py-3 rounded-lg font-semibold transition-all
          ${isDisabled
            ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white shadow-lg hover:shadow-xl'
          }
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
        <div className="text-xs text-gray-400 text-center">
          <a
            href={`https://sepolia.basescan.org/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300"
          >
            View on BaseScan
          </a>
        </div>
      )}
    </div>
  );
}
