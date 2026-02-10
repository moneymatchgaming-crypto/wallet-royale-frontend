'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { parseEther, formatEther } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { CONTRACT_ADDRESS, contractABI } from '@/lib/contract';

interface CreateGameModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateGameModal({ onClose, onSuccess }: CreateGameModalProps) {
  const [totalRounds, setTotalRounds] = useState('10');
  const [roundDuration, setRoundDuration] = useState('3600'); // 1 hour in seconds
  const [entryFee, setEntryFee] = useState('0.001'); // ETH
  const [registrationPeriod, setRegistrationPeriod] = useState('86400'); // 24 hours in seconds
  const [minPlayers, setMinPlayers] = useState('10');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  /* Draggable modal: offset in pixels from initial placement */
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: dragOffset.x,
      offsetY: dragOffset.y,
    };
    setIsDragging(true);
  }, [dragOffset.x, dragOffset.y]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const { startX, startY, offsetX, offsetY } = dragStartRef.current;
      setDragOffset({
        x: offsetX + (e.clientX - startX),
        y: offsetY + (e.clientY - startY),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  // Use wagmi's writeContract for better control
  const { writeContract, data: hash, error: writeError, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Get minimum required entry fee from contract based on minPlayers
  const minPlayersNum = useMemo(() => {
    const parsed = parseInt(minPlayers);
    return isNaN(parsed) || parsed < 2 ? 2 : parsed > 100 ? 100 : parsed;
  }, [minPlayers]);

  const { data: entryFeeRequirement, error: entryFeeError, isLoading: isLoadingEntryFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'getEntryFeeRequirement',
    args: [BigInt(minPlayersNum)],
    query: {
      enabled: minPlayersNum >= 2 && minPlayersNum <= 100,
      retry: 3,
      retryDelay: 2000,
    },
  });

  // Extract minimum fee and explanation from contract response
  const minimumRequiredFee = entryFeeRequirement 
    ? (entryFeeRequirement as [bigint, string])[0] 
    : null;
  const feeExplanation = entryFeeRequirement 
    ? (entryFeeRequirement as [bigint, string])[1] 
    : null;
  
  // Fallback minimum fee based on minPlayers (if contract call fails)
  const fallbackMinimumFee = useMemo(() => {
    // These are the minimum fees from the contract logic
    if (minPlayersNum <= 2) return parseEther('0.0005'); // $5 minimum
    if (minPlayersNum <= 4) return parseEther('0.0033'); // $33 minimum
    if (minPlayersNum <= 14) return parseEther('0.01'); // $100 minimum
    if (minPlayersNum <= 19) return parseEther('0.0083'); // $83 minimum
    return parseEther('0.005'); // $50 minimum for 20+
  }, [minPlayersNum]);
  
  // Use contract value if available, otherwise use fallback
  const effectiveMinimumFee = minimumRequiredFee || fallbackMinimumFee;
  
  const isProcessing = isPending || isConfirming || isSubmitting;

  // Handle transaction success
  useEffect(() => {
    if (isSuccess) {
      setIsSubmitting(false);
      onSuccess();
    }
  }, [isSuccess, onSuccess]);

  // Handle write errors
  useEffect(() => {
    if (writeError) {
      setIsSubmitting(false);
      const errorMessage = writeError.message || '';
      
      // Handle user rejection with toast notification
      if (errorMessage.includes('User rejected') || errorMessage.includes('User denied') || errorMessage.includes('rejected the request')) {
        setError(null);
        setToast({ message: 'Transaction cancelled', type: 'info' });
      } else if (errorMessage.includes('insufficient funds')) {
        setError('Insufficient funds. Please add more ETH to your wallet.');
        setToast({ message: 'Insufficient funds', type: 'error' });
      } else {
        // Extract a shorter error message
        const shortError = errorMessage.length > 100 
          ? errorMessage.substring(0, 100) + '...' 
          : errorMessage;
        setError(shortError || 'Transaction failed. Please try again.');
        setToast({ message: 'Transaction failed', type: 'error' });
      }
    }
  }, [writeError]);

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
        setToastVisible(false);
      }, dismissDelay);
      
      return () => {
        clearTimeout(fadeOutTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [toast]);

  const handleSubmit = () => {
    setError(null);
    
    // Validate inputs
    const rounds = parseInt(totalRounds);
    const duration = parseInt(roundDuration);
    const fee = parseFloat(entryFee);
    const period = parseInt(registrationPeriod);
    const min = parseInt(minPlayers);

    if (!rounds || rounds < 1) {
      setError('Total rounds must be at least 1');
      return;
    }
    if (!duration || duration < 60) {
      setError('Round duration must be at least 60 seconds');
      return;
    }
    if (!min || min < 2 || min > 100) {
      setError('Minimum players must be between 2 and 100');
      return;
    }
    // Use fallback if contract call failed (due to RPC issues)
    const minFeeToCheck = effectiveMinimumFee;
    
    const feeInWei = parseEther(entryFee);
    if (!fee || feeInWei < minFeeToCheck) {
      const minFeeEth = formatEther(minFeeToCheck);
      const explanation = minimumRequiredFee && feeExplanation 
        ? feeExplanation 
        : `(estimated for ${min} players)`;
      setError(`Entry fee must be at least ${minFeeEth} ETH for ${min} players. ${explanation}`);
      return;
    }
    if (fee > 0.002) {
      setError('Entry fee cannot exceed 0.002 ETH');
      return;
    }
    if (!period || period < 60) {
      setError('Registration period must be at least 60 seconds');
      return;
    }

    setIsSubmitting(true);
    
    try {
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: 'createGame',
        args: [
          BigInt(rounds),
          BigInt(duration),
          feeInWei,
          BigInt(period),
          BigInt(min),
        ],
        value: feeInWei, // Send entry fee to register creator as player
      });
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err.message || 'Failed to submit transaction');
    }
  };


  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <div 
          className="fixed z-[100]"
          style={{
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            animation: toastVisible 
              ? 'fadeIn 0.3s ease-out' 
              : 'fadeOut 0.3s ease-out forwards',
            opacity: toastVisible ? 1 : 0,
            transition: 'opacity 0.3s ease-out'
          }}
        >
          <div className="px-6 py-4 rounded-2xl border border-[var(--neon-pink)]/40 bg-[var(--arena-charcoal)]/80 backdrop-blur-sm text-white shadow-[0_0_24px_rgba(255,45,149,0.15)] min-w-[250px] max-w-[500px]">
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      <div 
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isProcessing) {
            onClose();
          }
        }}
      >
      <div 
        className="create-game-modal create-game-modal-panel fixed top-20 left-1/2 z-[60] w-[28rem] max-w-[calc(100vw-4rem)] backdrop-blur-md pt-8 shadow-[0_0_40px_rgba(0,212,255,0.12)] -translate-x-1/2 flex flex-col"
        style={{ transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex justify-between items-center mb-5 flex-shrink-0 max-w-[22rem] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
          onMouseDown={handleDragStart}
          title="Drag to move"
        >
          <h2 className="text-xl font-bold text-white">Create New Game</h2>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors disabled:opacity-50 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 flex-shrink-0"
            disabled={isProcessing}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4 create-game-modal-form max-w-[22rem]">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-[var(--neon-cyan)]/90">Total Rounds</label>
            <input
              type="number"
              value={totalRounds}
              onChange={(e) => setTotalRounds(e.target.value)}
              className="create-game-modal-input w-full max-w-[22rem] rounded-lg border border-[var(--neon-blue)]/25 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--neon-blue)]/50 focus:border-[var(--neon-blue)]/50 transition-all disabled:opacity-50"
              placeholder="e.g. 10"
              min="1"
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-[var(--neon-cyan)]/90">Round Duration (seconds)</label>
            <input
              type="number"
              value={roundDuration}
              onChange={(e) => setRoundDuration(e.target.value)}
              className="create-game-modal-input w-full max-w-[22rem] rounded-lg border border-[var(--neon-blue)]/25 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--neon-blue)]/50 focus:border-[var(--neon-blue)]/50 transition-all disabled:opacity-50"
              placeholder="e.g. 3600"
              min="60"
              disabled={isProcessing}
            />
            <p className="text-xs text-white/70">Example: 3600 = 1 hour, 86400 = 24 hours</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-[var(--neon-cyan)]/90">Entry Fee (ETH)</label>
            <input
              type="number"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value)}
              className="create-game-modal-input w-full max-w-[22rem] rounded-lg border border-[var(--neon-blue)]/25 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--neon-blue)]/50 focus:border-[var(--neon-blue)]/50 transition-all disabled:opacity-50"
              placeholder="0.001"
              step="0.0001"
              min="0.00015"
              max="0.002"
              disabled={isProcessing}
            />
            <div className="space-y-0.5">
              {minimumRequiredFee ? (
                <>
                  <p className="text-xs text-white/70">Maximum: 0.002 ETH</p>
                  <p className="text-sm font-semibold text-[var(--neon-cyan)]">Minimum required: {formatEther(minimumRequiredFee)} ETH</p>
                  {feeExplanation && <p className="text-xs text-[var(--neon-cyan)]/80">{feeExplanation}</p>}
                </>
              ) : isLoadingEntryFee ? (
                <p className="text-xs text-white/70">Loading minimum fee requirement...</p>
              ) : (
                <>
                  <p className="text-xs text-white/70">Maximum: 0.002 ETH</p>
                  <p className="text-sm font-semibold text-[var(--accent-yellow)]">Estimated minimum: {formatEther(fallbackMinimumFee)} ETH</p>
                  <p className="text-xs text-white/70">(Unable to fetch from contract, using fallback)</p>
                </>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-[var(--neon-cyan)]/90">Registration Period (seconds)</label>
            <input
              type="number"
              value={registrationPeriod}
              onChange={(e) => setRegistrationPeriod(e.target.value)}
              className="create-game-modal-input w-full max-w-[22rem] rounded-lg border border-[var(--neon-blue)]/25 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--neon-blue)]/50 focus:border-[var(--neon-blue)]/50 transition-all disabled:opacity-50"
              placeholder="e.g. 86400"
              min="60"
              disabled={isProcessing}
            />
            <p className="text-xs text-white/70">Example: 3600 = 1 hour, 86400 = 24 hours</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-[var(--neon-cyan)]/90">Minimum Players</label>
            <input
              type="number"
              value={minPlayers}
              onChange={(e) => setMinPlayers(e.target.value)}
              className="create-game-modal-input w-full max-w-[22rem] rounded-lg border border-[var(--neon-blue)]/25 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--neon-blue)]/50 focus:border-[var(--neon-blue)]/50 transition-all disabled:opacity-50"
              placeholder="e.g. 10"
              min="2"
              max="100"
              disabled={isProcessing}
            />
            <p className="text-xs text-white/70">Range: 2 - 100 players. Minimum entry fee will be calculated automatically.</p>
          </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-red-300 text-sm relative">
            <button
              onClick={() => setError(null)}
              className="absolute top-3 right-3 text-red-400 hover:text-red-300 transition-colors"
              aria-label="Dismiss error"
            >
              ✕
            </button>
            <div className="pr-8">{error}</div>
          </div>
        )}

        {(isPending || isConfirming) && (
          <div className="mt-4 rounded-lg border border-[var(--neon-blue)]/30 bg-black/30 p-3 text-sm text-white/80">
            {isPending ? 'Waiting for wallet...' : 'Confirming transaction...'}
            {hash && (
              <a 
                href={`https://sepolia.basescan.org/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--neon-cyan)] hover:underline mt-2 block text-xs"
              >
                View on Basescan →
              </a>
            )}
          </div>
        )}
        </div>

        <div className="flex-shrink-0 mt-6 pt-6 pb-8 space-y-3 max-w-[22rem]">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isProcessing}
            className="create-game-modal-btn create-game-modal-btn-primary"
          >
            {isPending ? 'Waiting...' : isConfirming ? 'Confirming...' : 'Create Game'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="create-game-modal-btn"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
