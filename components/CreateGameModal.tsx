'use client';

import { useState, useEffect } from 'react';
import { parseEther } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
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

  // Use wagmi's writeContract for better control
  const { writeContract, data: hash, error: writeError, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Calculate required min players based on entry fee
  const entryFeeFloat = parseFloat(entryFee) || 0;
  let requiredMinPlayers = 10;
  if (entryFeeFloat < 0.0003) {
    requiredMinPlayers = 20;
  } else if (entryFeeFloat < 0.001) {
    requiredMinPlayers = 15;
  }
  
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
      setError(writeError.message || 'Transaction failed');
    }
  }, [writeError]);

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
    if (!fee || fee < 0.00015 || fee > 0.002) {
      setError('Entry fee must be between 0.00015 and 0.002 ETH');
      return;
    }
    if (!period || period < 60) {
      setError('Registration period must be at least 60 seconds');
      return;
    }
    if (!min || min < requiredMinPlayers || min > 100) {
      setError(`Minimum players must be between ${requiredMinPlayers} and 100`);
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
          parseEther(entryFee),
          BigInt(period),
          BigInt(min),
        ],
      });
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err.message || 'Failed to submit transaction');
    }
  };


  return (
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
              <p className="text-xs text-gray-500 font-sans" style={{ lineHeight: '1.2', marginTop: '0', marginBottom: '0' }}>
                Range: 0.00015 - 0.002 ETH
              </p>
              {entryFeeFloat > 0 && (
                <p className="text-sm text-purple-400 font-semibold font-sans -mt-0.5" style={{ lineHeight: '1.2', marginTop: '0', marginBottom: '0' }}>
                  Required min players: {requiredMinPlayers}
                </p>
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
              min={requiredMinPlayers}
              max="100"
              disabled={isProcessing}
            />
            <p className="w-3/4 text-xs text-gray-500 -mt-2 font-sans" style={{ paddingLeft: '1.75rem', lineHeight: '1.2', marginTop: '0', marginBottom: '0' }}>
              Must be at least {requiredMinPlayers} for this entry fee
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-gray-800/50 backdrop-blur-sm border border-red-500/50 p-4 text-red-400 text-sm font-sans" style={{ borderRadius: '1.5rem' }}>
            {error}
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
  );
}
