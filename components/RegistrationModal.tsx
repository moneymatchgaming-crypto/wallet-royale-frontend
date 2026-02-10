'use client';

import { useState, useEffect } from 'react';
import { formatEther } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACT_ADDRESS, contractABI } from '@/lib/contract';

interface RegistrationModalProps {
  gameId: number;
  entryFee: bigint;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RegistrationModal({
  gameId,
  entryFee,
  onClose,
  onSuccess,
}: RegistrationModalProps) {
  const [error, setError] = useState<string | null>(null);

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Close modal on success and trigger refresh
  useEffect(() => {
    if (isSuccess) {
      // Call onSuccess callback to refresh parent component data
      if (onSuccess) {
        onSuccess();
      }
      setTimeout(() => {
        onClose();
      }, 2000); // Close after 2 seconds to show success message
    }
  }, [isSuccess, onClose, onSuccess]);

  // Handle write errors
  useEffect(() => {
    if (writeError) {
      setError(writeError.message || 'Transaction failed');
    }
  }, [writeError]);

  const handleRegister = () => {
    setError(null);
    try {
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: 'register',
        args: [BigInt(gameId)],
        value: entryFee,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to submit transaction');
    }
  };

  const entryFeeEth = formatEther(entryFee);
  const prizePool = (entryFee * 70n) / 100n;
  const operationsFund = (entryFee * 20n) / 100n;
  const platformFee = (entryFee * 10n) / 100n;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending && !isConfirming && !isSuccess) {
          onClose();
        }
      }}
    >
      <div 
        className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-[var(--neon-blue)]/30 bg-[var(--arena-charcoal)]/55 backdrop-blur-sm p-6 shadow-[0_0_40px_rgba(0,212,255,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Join Game #{gameId}</h2>
          <button
            onClick={onClose}
            disabled={isPending || isConfirming}
            className="text-gray-400 hover:text-white disabled:opacity-50 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--accent-yellow)]/50 bg-black/30 p-3">
            <div className="text-xs text-[var(--neon-cyan)]/90 mb-1">Entry Fee</div>
            <div className="text-2xl font-semibold text-white">{entryFeeEth} ETH</div>
            <div className="text-xs text-gray-400 mt-1">≈ ${(parseFloat(entryFeeEth) * 3300).toFixed(2)} USD</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs text-[var(--neon-cyan)]/90 mb-2">Fee Breakdown</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Prize Pool</span>
                <span className="text-white font-medium">{formatEther(prizePool)} ETH <span className="text-gray-400">(70%)</span></span>
              </div>
              <div className="flex justify-between pt-2 border-t border-white/10">
                <span className="text-gray-400">Operations Fund</span>
                <span className="text-white font-medium">{formatEther(operationsFund)} ETH <span className="text-gray-400">(20%)</span></span>
              </div>
              <div className="flex justify-between pt-2 border-t border-white/10">
                <span className="text-gray-400">Platform Fee</span>
                <span className="text-white font-medium">{formatEther(platformFee)} ETH <span className="text-gray-400">(10%)</span></span>
              </div>
            </div>
          </div>

        {error && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {(isPending || isConfirming) && (
          <div className="rounded-xl border border-[var(--neon-blue)]/30 bg-black/30 p-3 text-sm text-gray-400">
            {isPending ? 'Waiting for wallet...' : 'Confirming transaction...'}
            {hash && (
              <a 
                href={`https://sepolia.basescan.org/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--neon-cyan)] hover:underline mt-1 block text-xs"
              >
                View on Basescan →
              </a>
            )}
          </div>
        )}

        {isSuccess ? (
          <div className="rounded-xl border border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10 p-3 text-sm text-[var(--accent-green)]">
            Registration successful! Closing...
          </div>
        ) : (
          <button
            onClick={handleRegister}
            disabled={isPending || isConfirming}
            className="w-full px-4 py-3 rounded-xl border border-[var(--neon-blue)]/40 bg-[var(--neon-blue)]/20 text-white font-medium hover:bg-[var(--neon-blue)]/30 hover:border-[var(--neon-blue)]/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending || isConfirming ? 'Processing...' : 'Confirm & Join'}
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
