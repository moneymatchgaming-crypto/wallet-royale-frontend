'use client';

import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import StartGameButton from './StartGameButton';
import RegistrationModal from './RegistrationModal';

interface SidebarProps {
  gameId: number;
  currentRound: number;
  totalRounds: number;
  timeRemaining: number;
  prizePool: bigint | undefined;
  userStatus: 'not_registered' | 'registered' | 'eliminated';
  entryFee: bigint | undefined;
  canStart: boolean;
  startReward: bigint | undefined;
  rewardTimeRemaining: number;
  onRegistrationSuccess?: () => void;
}

export default function Sidebar({
  gameId,
  currentRound,
  totalRounds,
  timeRemaining,
  prizePool,
  userStatus,
  entryFee,
  canStart,
  startReward,
  rewardTimeRemaining,
  onRegistrationSuccess,
}: SidebarProps) {
  const [showRegistration, setShowRegistration] = useState(false);
  const [countdown, setCountdown] = useState<string>('');

  // Debug: Log when showRegistration changes
  useEffect(() => {
    if (showRegistration) {
      console.log('RegistrationModal should be visible', { gameId, entryFee, userStatus });
    }
  }, [showRegistration, gameId, entryFee, userStatus]);

  useEffect(() => {
    const updateCountdown = () => {
      if (timeRemaining <= 0) {
        setCountdown('Round ended');
        return;
      }

      const hours = Math.floor(timeRemaining / 3600);
      const minutes = Math.floor((timeRemaining % 3600) / 60);
      const seconds = timeRemaining % 60;

      if (hours > 0) {
        setCountdown(`${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      } else {
        setCountdown(`${minutes}:${String(seconds).padStart(2, '0')}`);
      }
    };

    updateCountdown();
    const interval = setInterval(() => {
      updateCountdown();
    }, 1000);
    return () => clearInterval(interval);
  }, [timeRemaining]);

  return (
    <div className="w-80 space-y-4">
      {/* Prize Pool - Yellow border like reference */}
      <div className="bg-[#1a1a1a] border border-[#fbbf24] p-3">
        <div className="text-xs text-[#9ca3af] mb-1">Prize Pool</div>
        <div className="text-xl font-semibold text-white">
          {prizePool !== undefined ? formatEther(prizePool) : '0'} ETH
        </div>
      </div>

      {/* Time Remaining */}
      {timeRemaining > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-3">
          <div className="text-xs text-[#9ca3af] mb-1">Time remaining</div>
          <div className="text-lg font-semibold text-white font-mono">{countdown}</div>
        </div>
      )}

      {/* Round Info */}
      {currentRound > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-3">
          <div className="text-xs text-[#9ca3af] mb-1">Round</div>
          <div className="text-lg font-semibold text-white">{currentRound} / {totalRounds}</div>
        </div>
      )}

      {/* Easy Deposit Button - Most Important */}
      {userStatus === 'not_registered' && entryFee !== undefined && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-4">
          <div className="text-xs text-[#9ca3af] mb-2">Entry Fee</div>
          <div className="text-lg font-semibold text-white mb-4">
            {formatEther(entryFee)} ETH
          </div>
          <button
            onClick={() => {
              setShowRegistration(true);
            }}
            className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#2a2a2a] text-white hover:border-[#3a3a3a] transition-colors font-medium"
          >
            Deposit & Join
          </button>
        </div>
      )}

      {/* User Status */}
      {userStatus !== 'not_registered' && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-3">
          <div className="text-xs text-[#9ca3af] mb-1">Your Status</div>
          {userStatus === 'registered' && (
            <div className="text-[#10b981] font-medium">Registered</div>
          )}
          {userStatus === 'eliminated' && (
            <div className="text-red-400 font-medium">Eliminated</div>
          )}
        </div>
      )}

      {/* Start Game Button */}
      {canStart && userStatus === 'registered' && startReward !== undefined && (
        <StartGameButton
          gameId={gameId}
          reward={startReward}
          timeRemaining={rewardTimeRemaining}
        />
      )}

      {showRegistration && (
        <>
          {entryFee !== undefined && entryFee !== null && entryFee !== 0n ? (
            <RegistrationModal
              gameId={gameId}
              entryFee={entryFee}
              onClose={() => {
                console.log('Closing RegistrationModal');
                setShowRegistration(false);
              }}
              onSuccess={() => {
                // Call parent's refresh handler
                if (onRegistrationSuccess) {
                  onRegistrationSuccess();
                }
              }}
            />
          ) : (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-md">
              <div 
                className="glass-card rounded-2xl p-6 max-w-md shadow-2xl relative z-10"
              >
                <h2 className="text-2xl font-bold mb-4">Unable to Load Entry Fee</h2>
                <p className="text-red-400 mb-2">Entry fee information is not available for this game.</p>
                <p className="text-xs text-gray-400 mb-4">Game ID: {gameId}</p>
                <p className="text-sm text-gray-300 mb-4">
                  This might happen if the game data is still loading. Please refresh the page and try again.
                </p>
                <button
                  onClick={() => setShowRegistration(false)}
                  className="w-full px-4 py-3 glass-card hover:bg-gray-700/40 rounded-xl font-semibold transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
