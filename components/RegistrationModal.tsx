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
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending && !isConfirming && !isSuccess) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-[#1a1a1a] border border-[#2a2a2a] p-6 max-w-md w-full mx-4 relative z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Join Game #{gameId}</h2>
          <button
            onClick={onClose}
            disabled={isPending || isConfirming}
            className="text-[#9ca3af] hover:text-white disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-[#1a1a1a] border border-[#fbbf24] p-3">
            <div className="text-xs text-[#9ca3af] mb-1">Entry Fee</div>
            <div className="text-2xl font-semibold text-white">{entryFeeEth} ETH</div>
            <div className="text-xs text-[#9ca3af] mt-1">≈ ${(parseFloat(entryFeeEth) * 3300).toFixed(2)} USD</div>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-3">
            <div className="text-xs text-[#9ca3af] mb-2">Fee Breakdown</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#9ca3af]">Prize Pool</span>
                <span className="text-white font-medium">{formatEther(prizePool)} ETH <span className="text-[#9ca3af]">(70%)</span></span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#2a2a2a]">
                <span className="text-[#9ca3af]">Operations Fund</span>
                <span className="text-white font-medium">{formatEther(operationsFund)} ETH <span className="text-[#9ca3af]">(20%)</span></span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#2a2a2a]">
                <span className="text-[#9ca3af]">Platform Fee</span>
                <span className="text-white font-medium">{formatEther(platformFee)} ETH <span className="text-[#9ca3af]">(10%)</span></span>
              </div>
            </div>
          </div>

        {error && (
          <div className="bg-[#1a1a1a] border border-red-500 p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {(isPending || isConfirming) && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-3 text-sm text-[#9ca3af]">
            {isPending ? 'Waiting for wallet...' : 'Confirming transaction...'}
            {hash && (
              <a 
                href={`https://sepolia.basescan.org/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:underline mt-1 block text-xs"
              >
                View on Basescan →
              </a>
            )}
          </div>
        )}

        {isSuccess ? (
          <div className="bg-[#1a1a1a] border border-[#10b981] p-3 text-sm text-[#10b981]">
            Registration successful! Closing...
          </div>
        ) : (
          <button
            onClick={handleRegister}
            disabled={isPending || isConfirming}
            className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#2a2a2a] text-white hover:border-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isPending || isConfirming ? 'Processing...' : 'Confirm & Join'}
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
