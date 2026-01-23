'use client';

import { useState, useEffect } from 'react';
import { formatEther } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACT_ADDRESS, contractABI } from '@/lib/contract';

interface StartGameButtonProps {
  gameId: number;
  reward: bigint;
  timeRemaining: number;
}

export default function StartGameButton({
  gameId,
  reward,
  timeRemaining,
}: StartGameButtonProps) {
  const [countdown, setCountdown] = useState<string>('');

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    const updateCountdown = () => {
      if (timeRemaining <= 0) {
        setCountdown('Reward expired');
        return;
      }

      const minutes = Math.floor(timeRemaining / 60);
      const seconds = timeRemaining % 60;
      setCountdown(`${minutes}m ${seconds}s`);
    };

    updateCountdown();
    const interval = setInterval(() => {
      updateCountdown();
    }, 1000);
    return () => clearInterval(interval);
  }, [timeRemaining]);

  const handleStart = () => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: 'startGame',
      args: [BigInt(gameId)],
    });
  };

  if (timeRemaining <= 0) return null;

  const rewardEth = formatEther(reward);

  return (
    <div className="space-y-2">
      <button
        onClick={handleStart}
        disabled={isPending || isConfirming || isSuccess}
        className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold animate-pulse-slow"
      >
        {isPending || isConfirming
          ? 'Starting Game...'
          : isSuccess
          ? 'Game Started!'
          : `Start Game & Earn ${rewardEth} ETH`}
      </button>
      <p className="text-xs text-center text-yellow-400">
        Reward expires in {countdown}
      </p>
      {hash && (
        <p className="text-xs text-gray-400 text-center">
          {hash.slice(0, 10)}...{hash.slice(-8)}
        </p>
      )}
    </div>
  );
}
