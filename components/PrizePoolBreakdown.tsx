'use client';

import { formatEther } from 'viem';

interface PrizePoolBreakdownProps {
  prizePool: bigint | undefined;
  entryFee: bigint | undefined;
  totalPlayers: number;
  onClose: () => void;
}

export default function PrizePoolBreakdown({
  prizePool,
  entryFee,
  totalPlayers,
  onClose,
}: PrizePoolBreakdownProps) {
  if (!prizePool || !entryFee || totalPlayers === 0) {
    return (
      <div 
        className="fixed inset-0 bg-gray-950/50 backdrop-blur-sm z-50 flex items-center justify-center"
        onClick={onClose}
      >
        <div 
          className="bg-[#1a1a1a] border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Prize Pool Breakdown</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-gray-400">No prize pool data available yet.</p>
        </div>
      </div>
    );
  }

  // Calculate breakdown
  const totalEntryFees = entryFee * BigInt(totalPlayers);
  const prizePoolAmount = prizePool;
  const operationsFund = (totalEntryFees * 20n) / 100n; // 20%
  const platformFee = (totalEntryFees * 10n) / 100n; // 10%
  const calculatedPrizePool = (totalEntryFees * 70n) / 100n; // 70%

  return (
    <div 
      className="fixed inset-0 bg-gray-950/50 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-[#1a1a1a] border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Prize Pool Breakdown</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Total Entry Fees */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Total Entry Fees Collected</div>
            <div className="text-2xl font-bold text-white">{formatEther(totalEntryFees)} ETH</div>
            <div className="text-xs text-gray-500 mt-1">
              {totalPlayers} players × {formatEther(entryFee)} ETH
            </div>
          </div>

          {/* Prize Pool (70%) */}
          <div className="bg-green-900/20 border border-green-500/50 rounded-xl p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-sm text-gray-400 mb-1">Prize Pool</div>
                <div className="text-xl font-bold text-green-400">{formatEther(prizePoolAmount)} ETH</div>
              </div>
              <div className="text-sm text-green-400 font-semibold">70%</div>
            </div>
            <div className="text-xs text-gray-500">
              Paid to the winner when game ends
            </div>
          </div>

          {/* Operations Fund (20%) */}
          <div className="bg-blue-900/20 border border-blue-500/50 rounded-xl p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-sm text-gray-400 mb-1">Operations Fund</div>
                <div className="text-xl font-bold text-blue-400">{formatEther(operationsFund)} ETH</div>
              </div>
              <div className="text-sm text-blue-400 font-semibold">20%</div>
            </div>
            <div className="text-xs text-gray-500">
              Used for gas reimbursements and start game rewards
            </div>
          </div>

          {/* Platform Fee (10%) */}
          <div className="bg-purple-900/20 border border-purple-500/50 rounded-xl p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-sm text-gray-400 mb-1">Platform Fee</div>
                <div className="text-xl font-bold text-purple-400">{formatEther(platformFee)} ETH</div>
              </div>
              <div className="text-sm text-purple-400 font-semibold">10%</div>
            </div>
            <div className="text-xs text-gray-500">
              Platform revenue
            </div>
          </div>

          {/* Summary */}
          <div className="pt-4 border-t border-gray-800">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Total Distribution:</span>
              <span className="text-white font-semibold">
                {formatEther(prizePoolAmount + operationsFund + platformFee)} ETH
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
