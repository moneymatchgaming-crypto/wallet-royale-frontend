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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl"
        onClick={onClose}
      >
        <div 
          className="rounded-2xl border border-[var(--neon-blue)]/30 bg-[var(--arena-charcoal)]/55 backdrop-blur-sm p-6 max-w-md w-full mx-4 shadow-[0_0_40px_rgba(0,212,255,0.08)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Prize Pool Breakdown</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl"
      onClick={onClose}
    >
      <div 
        className="rounded-2xl border border-[var(--neon-blue)]/30 bg-[var(--arena-charcoal)]/55 backdrop-blur-sm p-6 max-w-md w-full mx-4 shadow-[0_0_40px_rgba(0,212,255,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Prize Pool Breakdown</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="text-sm text-[var(--neon-cyan)]/90 mb-1">Total Entry Fees Collected</div>
            <div className="text-2xl font-bold text-white">{formatEther(totalEntryFees)} ETH</div>
            <div className="text-xs text-white/75 mt-1">
              {totalPlayers} players × {formatEther(entryFee)} ETH
            </div>
          </div>

          <div className="rounded-xl border border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10 p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-sm text-[var(--neon-cyan)]/90 mb-1">Prize Pool</div>
                <div className="text-xl font-bold text-[var(--accent-green)]">{formatEther(prizePoolAmount)} ETH</div>
              </div>
              <div className="text-sm text-[var(--accent-green)] font-semibold">70%</div>
            </div>
            <div className="text-xs text-white/75 mb-3">
              Paid to Top 3 by performance (60% / 30% / 10%) when game ends
            </div>
            <div className="space-y-2 pt-2 border-t border-[var(--accent-green)]/30">
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--accent-yellow)]">🥇 1st (60%)</span>
                <span className="font-mono text-white">{formatEther((prizePoolAmount * 60n) / 100n)} ETH</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-300">🥈 2nd (30%)</span>
                <span className="font-mono text-white">{formatEther((prizePoolAmount * 30n) / 100n)} ETH</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-amber-400/90">🥉 3rd (10%)</span>
                <span className="font-mono text-white">{formatEther((prizePoolAmount * 10n) / 100n)} ETH</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--neon-blue)]/40 bg-[var(--neon-blue)]/10 p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-sm text-[var(--neon-cyan)]/90 mb-1">Operations Fund</div>
                <div className="text-xl font-bold text-[var(--neon-cyan)]">{formatEther(operationsFund)} ETH</div>
              </div>
              <div className="text-sm text-[var(--neon-cyan)] font-semibold">20%</div>
            </div>
            <div className="text-xs text-white/75">
              Used for gas reimbursements and start game rewards
            </div>
          </div>

          <div className="rounded-xl border border-[var(--neon-pink)]/40 bg-[var(--neon-pink)]/10 p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-sm text-[var(--neon-cyan)]/90 mb-1">Platform Fee</div>
                <div className="text-xl font-bold text-[var(--neon-pink)]">{formatEther(platformFee)} ETH</div>
              </div>
              <div className="text-sm text-[var(--neon-pink)] font-semibold">10%</div>
            </div>
            <div className="text-xs text-white/75">
              Platform revenue
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
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
