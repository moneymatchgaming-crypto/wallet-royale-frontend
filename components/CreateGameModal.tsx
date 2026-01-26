'use client';

import { useState, useEffect, useMemo } from 'react';
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
          <div 
            className="px-6 py-4 shadow-lg border font-sans text-white"
            style={{
              backgroundColor: '#991b1b', // red-800 solid
              borderColor: '#ef4444', // red-500
              borderWidth: '1px',
              borderRadius: '1.5rem', // rounded-2xl
              minWidth: '250px',
              maxWidth: '500px'
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          </div>
        </div>
      )}

      <div 
        className="fixed inset-0 bg-gray-950/50 backdrop-blur-sm z-50"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isProcessing) {
            onClose();
          }
        }}
      >
      <div 
        className="create-game-modal bg-transparent backdrop-blur-xl border border-gray-700 fixed top-24 right-8 z-[60] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          backgroundColor: 'rgba(31, 41, 55, 0.8)', 
          backdropFilter: 'blur(24px)', 
          WebkitBackdropFilter: 'blur(24px)',
          position: 'fixed',
          top: '6rem',
          right: '2rem',
          width: '420px',
          maxWidth: 'calc(100vw - 4rem)',
          borderRadius: '2rem',
          padding: '2rem'
        }}
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-white font-sans">Create New Game</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700/50"
            disabled={isProcessing}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="space-y-2">
            <label className="block w-3/4 text-sm font-semibold text-purple-400 mb-6 font-sans" style={{ boxSizing: 'border-box' }}>
              Total Rounds
            </label>
            <input
              type="number"
              value={totalRounds}
              onChange={(e) => setTotalRounds(e.target.value)}
              className="w-3/4 bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:shadow-md focus:shadow-purple-500/50 transition-all disabled:opacity-50 font-sans"
              style={{ 
                borderRadius: '1.5rem', 
                padding: '0.9375rem 1.75rem',
                boxSizing: 'border-box',
                width: '75%'
              }}
              placeholder="Enter total rounds"
              min="1"
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-2">
            <label className="block w-3/4 text-sm font-semibold text-purple-400 mb-6 font-sans" style={{ boxSizing: 'border-box' }}>
              Round Duration (seconds)
            </label>
            <input
              type="number"
              value={roundDuration}
              onChange={(e) => setRoundDuration(e.target.value)}
              className="w-3/4 bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:shadow-md focus:shadow-purple-500/50 transition-all disabled:opacity-50 font-sans"
              style={{ 
                borderRadius: '1.5rem', 
                padding: '0.9375rem 1.75rem',
                boxSizing: 'border-box',
                width: '75%'
              }}
              placeholder="Enter duration in seconds"
              min="60"
              disabled={isProcessing}
            />
            <p className="w-3/4 text-xs text-gray-500 -mt-2 font-sans" style={{ paddingLeft: '1.75rem', lineHeight: '1.2', marginTop: '0', marginBottom: '0' }}>
              Example: 3600 = 1 hour, 86400 = 24 hours
            </p>
          </div>

          <div className="space-y-2">
            <label className="block w-3/4 text-sm font-semibold text-purple-400 mb-6 font-sans" style={{ boxSizing: 'border-box' }}>
              Entry Fee (ETH)
            </label>
            <input
              type="number"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value)}
              className="w-3/4 bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:shadow-md focus:shadow-purple-500/50 transition-all disabled:opacity-50 font-sans"
              style={{ 
                borderRadius: '1.5rem', 
                padding: '0.9375rem 1.75rem',
                boxSizing: 'border-box',
                width: '75%'
              }}
              placeholder="0.001"
              step="0.0001"
              min="0.00015"
              max="0.002"
              disabled={isProcessing}
            />
            <div className="w-3/4 -mt-2" style={{ paddingLeft: '1.75rem' }}>
              {minimumRequiredFee ? (
                <>
                  <p className="text-xs text-gray-500 font-sans" style={{ lineHeight: '1.2', marginTop: '0', marginBottom: '0' }}>
                    Maximum: 0.002 ETH
                  </p>
                  <p className="text-sm text-purple-400 font-semibold font-sans -mt-0.5" style={{ lineHeight: '1.2', marginTop: '0.25rem', marginBottom: '0' }}>
                    Minimum required: {formatEther(minimumRequiredFee)} ETH
                  </p>
                  {feeExplanation && (
                    <p className="text-xs text-cyan-400 font-sans -mt-0.5" style={{ lineHeight: '1.2', marginTop: '0.25rem', marginBottom: '0' }}>
                      {feeExplanation}
                    </p>
                  )}
                </>
              ) : isLoadingEntryFee ? (
                <p className="text-xs text-gray-500 font-sans" style={{ lineHeight: '1.2', marginTop: '0', marginBottom: '0' }}>
                  Loading minimum fee requirement...
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-500 font-sans" style={{ lineHeight: '1.2', marginTop: '0', marginBottom: '0' }}>
                    Maximum: 0.002 ETH
                  </p>
                  <p className="text-sm text-yellow-400 font-semibold font-sans -mt-0.5" style={{ lineHeight: '1.2', marginTop: '0.25rem', marginBottom: '0' }}>
                    Estimated minimum: {formatEther(fallbackMinimumFee)} ETH
                  </p>
                  <p className="text-xs text-gray-500 font-sans -mt-0.5" style={{ lineHeight: '1.2', marginTop: '0.25rem', marginBottom: '0' }}>
                    (Unable to fetch from contract, using fallback)
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block w-3/4 text-sm font-semibold text-purple-400 mb-6 font-sans" style={{ boxSizing: 'border-box' }}>
              Registration Period (seconds)
            </label>
            <input
              type="number"
              value={registrationPeriod}
              onChange={(e) => setRegistrationPeriod(e.target.value)}
              className="w-3/4 bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:shadow-md focus:shadow-purple-500/50 transition-all disabled:opacity-50 font-sans"
              style={{ 
                borderRadius: '1.5rem', 
                padding: '0.9375rem 1.75rem',
                boxSizing: 'border-box',
                width: '75%'
              }}
              placeholder="Enter registration period"
              min="60"
              disabled={isProcessing}
            />
            <p className="w-3/4 text-xs text-gray-500 -mt-2 font-sans" style={{ paddingLeft: '1.75rem', lineHeight: '1.2', marginTop: '0', marginBottom: '0' }}>
              Example: 3600 = 1 hour, 86400 = 24 hours
            </p>
          </div>

          <div className="space-y-2">
            <label className="block w-3/4 text-sm font-semibold text-purple-400 mb-6 font-sans" style={{ boxSizing: 'border-box' }}>
              Minimum Players
            </label>
            <input
              type="number"
              value={minPlayers}
              onChange={(e) => setMinPlayers(e.target.value)}
              className="w-3/4 bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:shadow-md focus:shadow-purple-500/50 transition-all disabled:opacity-50 font-sans"
              style={{ 
                borderRadius: '1.5rem', 
                padding: '0.9375rem 1.75rem',
                boxSizing: 'border-box',
                width: '75%'
              }}
              placeholder="Enter minimum players"
              min="2"
              max="100"
              disabled={isProcessing}
            />
            <p className="w-3/4 text-xs text-gray-500 -mt-2 font-sans" style={{ paddingLeft: '1.75rem', lineHeight: '1.2', marginTop: '0', marginBottom: '0' }}>
              Range: 2 - 100 players. Minimum entry fee will be calculated automatically.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-gray-800/50 backdrop-blur-sm border border-red-500/50 p-4 text-red-400 text-sm font-sans relative" style={{ borderRadius: '1.5rem' }}>
            <button
              onClick={() => setError(null)}
              className="absolute top-2 right-2 text-red-400 hover:text-red-300 transition-colors"
              aria-label="Dismiss error"
            >
              ✕
            </button>
            <div className="pr-6">{error}</div>
          </div>
        )}

        {(isPending || isConfirming) && (
          <div className="mt-6 bg-gray-800/50 backdrop-blur-sm border border-gray-700 p-4 text-sm text-gray-400 font-sans" style={{ borderRadius: '1.5rem' }}>
            {isPending ? 'Waiting for wallet...' : 'Confirming transaction...'}
            {hash && (
              <a 
                href={`https://sepolia.basescan.org/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 hover:underline mt-2 block text-xs"
              >
                View on Basescan →
              </a>
            )}
          </div>
        )}

        <div className="space-y-3" style={{ marginTop: '10px' }}>
          <button
            onClick={handleSubmit}
            disabled={isProcessing}
            className="w-3/4 px-6 bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-bold hover:from-purple-500 hover:to-cyan-400 transition-all shadow-lg shadow-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed font-sans"
            style={{ borderRadius: '1.5rem', paddingTop: '0.9375rem', paddingBottom: '0.9375rem' }}
          >
            {isPending ? 'Waiting...' : isConfirming ? 'Confirming...' : 'Create Game'}
          </button>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-3/4 px-6 bg-gray-800 border border-gray-700 text-white hover:bg-gray-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed font-sans"
            style={{ borderRadius: '1.5rem', paddingTop: '0.9375rem', paddingBottom: '0.9375rem' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
