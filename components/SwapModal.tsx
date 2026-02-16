'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { formatUnits, parseUnits, encodeFunctionData, maxUint256 } from 'viem';
import type { Address } from 'viem';
import {
  useAccount,
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { useSwapQuote } from '@/hooks/useSwapQuote';
import {
  TOKENS,
  Token,
  isNativeETH,
  getSwapAddress,
  calculateMinAmountOut,
  SWAP_ROUTER_ADDRESS,
  SWAP_ROUTER_ABI,
  ERC20_ABI,
  DEFAULT_FEE,
  DEFAULT_SLIPPAGE_BPS,
} from '@/lib/uniswap';
import { CONTRACT_ADDRESS, contractABI } from '@/lib/contract';

interface SwapModalProps {
  onClose: () => void;
}

type SwapStep = 'idle' | 'approving' | 'swapping' | 'success';

export default function SwapModal({ onClose }: SwapModalProps) {
  const { address, isConnected } = useAccount();

  // ── Draggable panel (matches CreateGameModal) ─────────────────────
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('input')) return;
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

  // ── Whitelist verification ───────────────────────────────────────
  const { data: isRouterApproved } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'isProtocolApproved',
    args: [SWAP_ROUTER_ADDRESS],
  });

  // ── Token & amount state ──────────────────────────────────────────
  const [tokenIn, setTokenIn] = useState<Token>(TOKENS[0]); // ETH
  const [tokenOut, setTokenOut] = useState<Token>(TOKENS[2]); // USDC
  const [amountInRaw, setAmountInRaw] = useState('');
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [showSettings, setShowSettings] = useState(false);
  const [showTokenSelector, setShowTokenSelector] = useState<'in' | 'out' | null>(null);
  const [step, setStep] = useState<SwapStep>('idle');
  const [error, setError] = useState<string | null>(null);

  // ── Parsed amount ─────────────────────────────────────────────────
  const parsedAmountIn = useMemo(() => {
    if (!amountInRaw) return undefined;
    try {
      return parseUnits(amountInRaw, tokenIn.decimals);
    } catch {
      return undefined;
    }
  }, [amountInRaw, tokenIn.decimals]);

  // ── Balances ──────────────────────────────────────────────────────
  const { data: ethBalance } = useBalance({
    address,
    query: { enabled: isConnected },
  });

  const { data: tokenInBalance } = useReadContract({
    address: isNativeETH(tokenIn) ? undefined : (tokenIn.address as Address),
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isConnected && !isNativeETH(tokenIn) && !!address },
  });

  const displayBalance = isNativeETH(tokenIn)
    ? ethBalance?.value
    : (tokenInBalance as bigint | undefined);

  const formattedBalance = displayBalance !== undefined
    ? Number(formatUnits(displayBalance, tokenIn.decimals)).toFixed(
        tokenIn.decimals > 8 ? 6 : tokenIn.decimals
      )
    : '—';

  // ── Allowance (only for ERC20 tokenIn) ────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: isNativeETH(tokenIn) ? undefined : (tokenIn.address as Address),
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, SWAP_ROUTER_ADDRESS] : undefined,
    query: { enabled: isConnected && !isNativeETH(tokenIn) && !!address },
  });

  const needsApproval =
    !isNativeETH(tokenIn) &&
    parsedAmountIn !== undefined &&
    parsedAmountIn > 0n &&
    (allowance as bigint | undefined) !== undefined &&
    (allowance as bigint) < parsedAmountIn;

  // ── Quote ─────────────────────────────────────────────────────────
  const {
    quoteAmount,
    isLoading: quoteLoading,
    error: quoteError,
  } = useSwapQuote({ tokenIn, tokenOut, amountIn: parsedAmountIn });

  const formattedQuote =
    quoteAmount !== undefined
      ? Number(formatUnits(quoteAmount, tokenOut.decimals)).toFixed(
          tokenOut.decimals > 8 ? 6 : tokenOut.decimals
        )
      : '';

  // Exchange rate string
  const rateString = useMemo(() => {
    if (!quoteAmount || !parsedAmountIn || parsedAmountIn === 0n) return null;
    const rate =
      Number(formatUnits(quoteAmount, tokenOut.decimals)) /
      Number(formatUnits(parsedAmountIn, tokenIn.decimals));
    return `1 ${tokenIn.symbol} ≈ ${rate.toFixed(tokenOut.decimals > 8 ? 6 : 4)} ${tokenOut.symbol}`;
  }, [quoteAmount, parsedAmountIn, tokenIn, tokenOut]);

  // ── Approve tx ────────────────────────────────────────────────────
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: approvePending,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract();

  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash });

  // Keep a stable ref to resetApprove
  const resetApproveRef = useRef(resetApprove);
  resetApproveRef.current = resetApprove;

  useEffect(() => {
    if (approveSuccess) {
      setStep('idle');
      refetchAllowance();
      setTimeout(() => resetApproveRef.current(), 1000);
    }
  }, [approveSuccess, refetchAllowance]);

  useEffect(() => {
    if (approveError) {
      setStep('idle');
      if (!approveError.message?.includes('User rejected')) {
        setError(approveError.message?.slice(0, 120) || 'Approval failed');
      }
      resetApproveRef.current();
    }
  }, [approveError]);

  // ── Swap tx ───────────────────────────────────────────────────────
  const {
    writeContract: writeSwap,
    data: swapHash,
    isPending: swapPending,
    error: swapError,
    reset: resetSwap,
  } = useWriteContract();

  const { isLoading: swapConfirming, isSuccess: swapSuccess } =
    useWaitForTransactionReceipt({ hash: swapHash });

  // Keep a stable ref to resetSwap so the timer doesn't get cancelled
  const resetSwapRef = useRef(resetSwap);
  resetSwapRef.current = resetSwap;

  useEffect(() => {
    if (swapSuccess) {
      setStep('success');
      // Auto-reset after 3 seconds so user can do another swap
      const timer = setTimeout(() => {
        setStep('idle');
        setAmountInRaw('');
        resetSwapRef.current();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [swapSuccess]);

  useEffect(() => {
    if (swapError) {
      setStep('idle');
      if (!swapError.message?.includes('User rejected')) {
        const msg = swapError.message || 'Swap failed';
        if (msg.includes('slippage') || msg.includes('Too little received')) {
          setError('Price moved beyond your slippage tolerance. Try increasing slippage.');
        } else {
          setError(msg.slice(0, 120));
        }
      }
      resetSwapRef.current();
    }
  }, [swapError]);

  const isProcessing = approvePending || approveConfirming || swapPending || swapConfirming;

  // ── Handlers ──────────────────────────────────────────────────────
  const handleApprove = () => {
    setError(null);
    setStep('approving');
    writeApprove({
      address: tokenIn.address as Address,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [SWAP_ROUTER_ADDRESS, maxUint256],
    });
  };

  const handleSwap = () => {
    if (!address || !parsedAmountIn || !quoteAmount) return;
    setError(null);
    setStep('swapping');

    const tokenInAddr = getSwapAddress(tokenIn);
    const tokenOutAddr = getSwapAddress(tokenOut);
    const amountOutMinimum = calculateMinAmountOut(quoteAmount, slippageBps);

    const swapParams = {
      tokenIn: tokenInAddr,
      tokenOut: tokenOutAddr,
      fee: DEFAULT_FEE,
      recipient: address,
      amountIn: parsedAmountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0n,
    } as const;

    if (isNativeETH(tokenIn)) {
      writeSwap({
        address: SWAP_ROUTER_ADDRESS,
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [swapParams],
        value: parsedAmountIn,
      });
    } else if (isNativeETH(tokenOut)) {
      const swapData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [{ ...swapParams, recipient: SWAP_ROUTER_ADDRESS }],
      });
      const unwrapData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: 'unwrapWETH9',
        args: [amountOutMinimum, address],
      });
      writeSwap({
        address: SWAP_ROUTER_ADDRESS,
        abi: SWAP_ROUTER_ABI,
        functionName: 'multicall',
        args: [[swapData, unwrapData]],
      });
    } else {
      writeSwap({
        address: SWAP_ROUTER_ADDRESS,
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [swapParams],
      });
    }
  };

  const handleFlipTokens = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountInRaw('');
  };

  const handleSelectToken = (token: Token) => {
    if (showTokenSelector === 'in') {
      if (token.symbol === tokenOut.symbol) handleFlipTokens();
      else setTokenIn(token);
    } else {
      if (token.symbol === tokenIn.symbol) handleFlipTokens();
      else setTokenOut(token);
    }
    setShowTokenSelector(null);
    setAmountInRaw('');
  };

  const handleMax = () => {
    if (displayBalance === undefined) return;
    const buffer = isNativeETH(tokenIn) ? parseUnits('0.001', 18) : 0n;
    const maxAmount = displayBalance > buffer ? displayBalance - buffer : 0n;
    setAmountInRaw(formatUnits(maxAmount, tokenIn.decimals));
  };

  // ── Button state ──────────────────────────────────────────────────
  const insufficientBalance =
    parsedAmountIn !== undefined &&
    displayBalance !== undefined &&
    parsedAmountIn > displayBalance;

  let buttonLabel = 'Enter an amount';
  let buttonDisabled = true;
  let buttonAction: (() => void) | undefined;

  if (!isConnected) {
    buttonLabel = 'Connect Wallet';
    buttonDisabled = true;
  } else if (!parsedAmountIn || parsedAmountIn === 0n) {
    buttonLabel = 'Enter an amount';
  } else if (insufficientBalance) {
    buttonLabel = `Insufficient ${tokenIn.symbol} balance`;
  } else if (quoteError) {
    buttonLabel = 'No liquidity';
  } else if (quoteLoading) {
    buttonLabel = 'Fetching quote...';
  } else if (step === 'approving' || approvePending || approveConfirming) {
    buttonLabel = 'Approving...';
  } else if (step === 'swapping' || swapPending || swapConfirming) {
    buttonLabel = 'Swapping...';
  } else if (step === 'success') {
    buttonLabel = 'Swap Successful!';
  } else if (needsApproval) {
    buttonLabel = `Approve ${tokenIn.symbol}`;
    buttonDisabled = false;
    buttonAction = handleApprove;
  } else if (quoteAmount && quoteAmount > 0n) {
    buttonLabel = 'Swap';
    buttonDisabled = false;
    buttonAction = handleSwap;
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isProcessing) onClose();
        }}
      >
        {/* Floating draggable panel — same rounded edges, background and padding as Create Game panel */}
        <div
          className="swap-modal-panel fixed top-20 left-1/2 z-[60] w-[28rem] max-w-[calc(100vw-4rem)] backdrop-blur-md flex flex-col overflow-hidden"
          style={{
            transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px)`,
            background: '#0a0c14',
            border: '2px solid rgba(0, 184, 216, 0.35)',
            borderRadius: '8px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.2), 0 0 8px rgba(0, 217, 255, 0.2)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Draggable header — 3rem horizontal padding to match Create Game panel */}
          <div
            className={`flex justify-between items-center flex-shrink-0 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
            style={{ padding: '2rem 3rem 1.25rem 3rem' }}
            onMouseDown={handleDragStart}
            title="Drag to move"
          >
            <h2 className="text-xl font-bold text-white">Swap</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-white/50 hover:text-[var(--neon-cyan)] transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
                title="Slippage settings"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="text-white/50 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
                disabled={isProcessing}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body — 3rem horizontal padding, generous bottom to match Create Game panel */}
          <div className="flex flex-col gap-5" style={{ padding: '0 3rem 2.5rem 3rem' }}>
            {/* Settings dropdown */}
            {showSettings && (
              <div className="rounded-lg border border-[var(--neon-blue)]/25 bg-black/30 p-4">
                <div className="text-xs text-[var(--neon-cyan)]/80 mb-2 font-semibold">Slippage Tolerance</div>
                <div className="flex gap-2">
                  {[10, 50, 100].map((bps) => (
                    <button
                      key={bps}
                      onClick={() => setSlippageBps(bps)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        slippageBps === bps
                          ? 'bg-[var(--neon-blue)]/20 text-[var(--neon-cyan)] border border-[var(--neon-blue)]/50 shadow-[0_0_8px_rgba(0,212,255,0.15)]'
                          : 'bg-black/30 text-white/40 hover:text-white/70 hover:bg-white/5 border border-white/10'
                      }`}
                    >
                      {bps / 100}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sell section */}
            <div className="rounded-xl border border-[var(--neon-blue)]/20 bg-black/40 p-6 w-full min-w-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold" style={{ color: '#22d3ee' }}>Sell</span>
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Balance: {formattedBalance}
                  {displayBalance !== undefined && displayBalance > 0n && (
                    <button
                      onClick={handleMax}
                      className="ml-2 font-bold hover:opacity-80 transition-opacity"
                      style={{ color: '#22d3ee' }}
                    >
                      MAX
                    </button>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-4 w-full min-w-0">
                <button
                  onClick={() => setShowTokenSelector('in')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--neon-blue)]/25 hover:border-[var(--neon-blue)]/50 transition-all flex-shrink-0"
                  style={{ background: 'rgba(255, 45, 149, 0.35)' }}
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: tokenIn.logoColor, color: '#ffffff' }}
                  >
                    {tokenIn.symbol[0]}
                  </span>
                  <span className="font-bold text-base whitespace-nowrap" style={{ color: '#00D9FF', textShadow: '0 0 8px rgba(0, 217, 255, 0.7)' }}>{tokenIn.symbol}</span>
                  <span style={{ color: '#00D9FF', opacity: 0.8 }}>&#9662;</span>
                </button>
                <div className="flex-1 min-w-0 w-0 overflow-hidden flex justify-end">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={amountInRaw}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, '');
                      if ((v.match(/\./g) || []).length > 1) return;
                      setAmountInRaw(v);
                      setError(null);
                      if (step === 'success') setStep('idle');
                    }}
                    className="w-full min-w-0 bg-transparent text-right font-semibold outline-none border-0 ring-0 shadow-none focus:outline-none focus:ring-0 focus:shadow-none truncate"
                    style={{ fontSize: '28px', color: '#ffffff', lineHeight: '1.2', width: '100%', minWidth: 0, maxWidth: '100%', boxShadow: 'none' }}
                  />
                </div>
              </div>
            </div>

            {/* Flip button */}
            <div className="flex justify-center -my-3 relative z-10">
              <button
                onClick={handleFlipTokens}
                className="w-10 h-10 rounded-xl bg-[#0a0c14] border border-[var(--neon-blue)]/25 flex items-center justify-center hover:border-[var(--neon-blue)]/50 hover:shadow-[0_0_10px_rgba(0,212,255,0.2)] transition-all"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            {/* Buy section */}
            <div className="rounded-xl border border-[var(--neon-blue)]/20 bg-black/40 p-6 w-full min-w-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold" style={{ color: '#22d3ee' }}>Buy</span>
              </div>
              <div className="flex items-center gap-4 w-full min-w-0">
                <button
                  onClick={() => setShowTokenSelector('out')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--neon-blue)]/25 hover:border-[var(--neon-blue)]/50 transition-all flex-shrink-0"
                  style={{ background: 'rgba(255, 45, 149, 0.35)' }}
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: tokenOut.logoColor, color: '#ffffff' }}
                  >
                    {tokenOut.symbol[0]}
                  </span>
                  <span className="font-bold text-base whitespace-nowrap" style={{ color: '#00D9FF', textShadow: '0 0 8px rgba(0, 217, 255, 0.7)' }}>{tokenOut.symbol}</span>
                  <span style={{ color: '#00D9FF', opacity: 0.8 }}>&#9662;</span>
                </button>
                <div className="flex-1 min-w-0 w-0 text-right font-semibold truncate" style={{ fontSize: '28px', lineHeight: '1.2' }}>
                  {quoteLoading ? (
                    <span style={{ color: 'rgba(255,255,255,0.3)' }} className="animate-pulse">...</span>
                  ) : formattedQuote ? (
                    <span style={{ color: 'rgba(255,255,255,0.8)' }}>{formattedQuote}</span>
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.15)' }}>0.0</span>
                  )}
                </div>
              </div>
            </div>

            {/* Rate info */}
            {rateString && (
              <div className="text-sm text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>{rateString}</div>
            )}

            {/* Quote error */}
            {quoteError && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
                <div className="text-red-300 text-sm">{quoteError}</div>
              </div>
            )}

            {/* General error */}
            {error && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 relative">
                <button
                  onClick={() => setError(null)}
                  className="absolute top-3 right-3 text-red-400 hover:text-red-300 transition-colors"
                >
                  ✕
                </button>
                <div className="text-red-300 text-sm pr-6">{error}</div>
              </div>
            )}

            {/* Tx status */}
            {isProcessing && (
              <div className="rounded-lg border border-[var(--neon-blue)]/30 bg-black/30 p-4 text-sm text-white/80">
                {approvePending ? 'Waiting for approval...' : approveConfirming ? 'Confirming approval...' : swapPending ? 'Waiting for wallet...' : 'Confirming swap...'}
                {(approveHash || swapHash) && (
                  <a
                    href={`https://sepolia.basescan.org/tx/${approveHash || swapHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--neon-cyan)] hover:underline mt-1 block text-xs"
                  >
                    View on Basescan →
                  </a>
                )}
              </div>
            )}

            {/* Success */}
            {step === 'success' && swapHash && (
              <div className="rounded-lg border border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10 p-4">
                <div className="text-sm text-[var(--accent-green)] font-semibold mb-1">Swap successful!</div>
                <a
                  href={`https://sepolia.basescan.org/tx/${swapHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--neon-cyan)] hover:underline"
                >
                  View on Basescan →
                </a>
              </div>
            )}

            {/* Action button — same dimensions in all states (match sidebar-deposit-btn: 12px 16px) */}
            <button
              onClick={buttonAction}
              disabled={buttonDisabled}
              className={`w-full py-3 px-4 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2 ${
                buttonDisabled
                  ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10'
                  : step === 'success'
                  ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)] border border-[var(--accent-green)]/50'
                  : 'sidebar-deposit-btn'
              }`}
            >
              {isProcessing && (
                <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2 align-text-bottom" />
              )}
              {buttonLabel}
            </button>

            {/* Whitelist verification indicator */}
            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs" style={{ color: isRouterApproved ? '#22c55e' : '#f59e0b' }}>
              <span style={{ fontSize: '10px' }}>{isRouterApproved ? '✓' : '⚠'}</span>
              <span>
                {isRouterApproved
                  ? 'Router whitelisted in game contract'
                  : 'Router not yet whitelisted — swaps may incur penalties'}
              </span>
            </div>
          </div>

          {/* Token Selector Overlay */}
          {showTokenSelector && (
            <div
              className="absolute inset-0 z-20 rounded-2xl flex flex-col overflow-auto"
              style={{ background: 'rgba(255, 45, 149, 0.18)', padding: '3rem' }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold" style={{ color: '#00D9FF', textShadow: '0 0 10px rgba(0, 217, 255, 0.6)' }}>Select Token</h3>
                <button
                  onClick={() => setShowTokenSelector(null)}
                  className="w-9 h-9 flex items-center justify-center rounded-full transition-colors"
                  style={{ color: '#00D9FF', background: 'rgba(0, 217, 255, 0.1)' }}
                >
                  ✕
                </button>
              </div>
              <div className="space-y-3">
                {TOKENS.map((token) => (
                  <button
                    key={token.symbol}
                    onClick={() => handleSelectToken(token)}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-[var(--neon-blue)]/20 transition-all text-left"
                    style={{ background: 'rgba(255, 45, 149, 0.35)' }}
                  >
                    <span
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ backgroundColor: token.logoColor, color: '#ffffff' }}
                    >
                      {token.symbol[0]}
                    </span>
                    <div>
                      <div className="font-bold text-base" style={{ color: '#00D9FF', textShadow: '0 0 8px rgba(0, 217, 255, 0.7)' }}>{token.symbol}</div>
                      <div className="text-sm" style={{ color: '#00D9FF', opacity: 0.85, textShadow: '0 0 6px rgba(0, 217, 255, 0.5)' }}>{token.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
