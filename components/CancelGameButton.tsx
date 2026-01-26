'use client';

import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACT_ADDRESS, contractABI } from '@/lib/contract';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

interface CancelGameButtonProps {
  gameId: number;
  onCancelSuccess: () => void;
}

export default function CancelGameButton({
  gameId,
  onCancelSuccess,
}: CancelGameButtonProps) {
  const { address } = useAccount();
  const [cancelReward, setCancelReward] = useState<bigint | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  const [loadingReward, setLoadingReward] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const { writeContract, data: hash, error: writeError, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Fetch cancel reward and eligibility
  useEffect(() => {
    const fetchCancelInfo = async () => {
      if (!address) {
        setCancelReward(null);
        setCanCancel(false);
        return;
      }

      setLoadingReward(true);
      setError(null);
      try {
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http(),
        });

        const [reward, canCancelGame] = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: contractABI,
          functionName: 'getCancelReward',
          args: [BigInt(gameId)],
        }) as [bigint, boolean];

        setCancelReward(reward);
        setCanCancel(canCancelGame);
      } catch (err: any) {
        // Silently handle errors - game might not be eligible for cancellation
        // This is expected for games that are active, already started, or don't exist
        console.debug('Game not eligible for cancellation:', err.message);
        setCancelReward(null);
        setCanCancel(false);
        setError(null); // Don't show error to user, just hide the button
      } finally {
        setLoadingReward(false);
      }
    };

    fetchCancelInfo();
    // Refetch every 30 seconds to update eligibility
    const interval = setInterval(fetchCancelInfo, 30000);
    return () => clearInterval(interval);
  }, [gameId, address]);

  const handleCancel = () => {
    if (!address) {
      setError('Please connect your wallet');
      return;
    }

    if (!canCancel) {
      setError('Game cannot be cancelled');
      return;
    }

    setError(null);
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: 'cancelGame',
      args: [BigInt(gameId)],
      value: 0n, // Cancellation is free, reward is paid by contract
    });
  };

  // Handle transaction success
  useEffect(() => {
    if (isSuccess) {
      setToast({ message: 'Game cancelled successfully!', type: 'info' });
      onCancelSuccess();
    }
  }, [isSuccess, onCancelSuccess]);

  // Handle write errors
  useEffect(() => {
    if (writeError) {
      const errorMessage = writeError.message || '';

      if (errorMessage.includes('User rejected') || errorMessage.includes('User denied') || errorMessage.includes('rejected the request')) {
        setError(null);
        setToast({ message: 'Transaction cancelled', type: 'info' });
      } else if (errorMessage.includes('Game already cancelled')) {
        setError(null);
        setToast({ message: 'Game already cancelled by another transaction.', type: 'info' });
        onCancelSuccess(); // Trigger refresh even if already cancelled
      } else {
        const shortError = errorMessage.length > 100
          ? errorMessage.substring(0, 100) + '...'
          : errorMessage;
        setError(shortError || 'Transaction failed. Please try again.');
        setToast({ message: 'Transaction failed', type: 'error' });
      }
    }
  }, [writeError, onCancelSuccess]);

  // Auto-dismiss toast after a few seconds with fade-out
  useEffect(() => {
    if (toast) {
      setToastVisible(true);
      const dismissDelay = toast.type === 'info' ? 3000 : 4000;
      const fadeOutDelay = dismissDelay - 300; // Start fading 300ms before removal

      const fadeOutTimer = setTimeout(() => {
        setToastVisible(false);
      }, fadeOutDelay);

      const removeTimer = setTimeout(() => {
        setToast(null);
      }, dismissDelay);

      return () => {
        clearTimeout(fadeOutTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [toast]);

  const isProcessing = isPending || isConfirming || loadingReward;

  if (!canCancel && !loadingReward) {
    return null; // Don't show button if game can't be cancelled
  }

  return (
    <div className="flex flex-col items-center p-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-lg relative">
      <h3 className="text-lg font-bold text-white mb-3">Cancel Game</h3>
      {loadingReward ? (
        <p className="text-sm text-gray-400">Checking eligibility...</p>
      ) : cancelReward !== null && cancelReward > 0n ? (
        <p className="text-sm text-green-400 mb-4">
          Reward: {formatEther(cancelReward)} ETH
        </p>
      ) : (
        <p className="text-sm text-gray-400 mb-4">No reward available</p>
      )}

      <button
        onClick={handleCancel}
        className="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isProcessing || !canCancel}
      >
        {isPending ? 'Confirming...' : isConfirming ? 'Cancelling...' : 'Cancel Game'}
      </button>

      {error && (
        <p className="text-red-500 text-xs mt-3 text-center">{error}</p>
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-xl shadow-lg transition-all duration-300 ease-out
            ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}
            ${toastVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
          style={{
            zIndex: 1000,
            minWidth: '250px',
            maxWidth: '500px'
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-white">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
