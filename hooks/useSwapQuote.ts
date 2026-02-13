'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/contract';
import {
  QUOTER_V2_ADDRESS,
  QUOTER_V2_ABI,
  DEFAULT_FEE,
  Token,
  getSwapAddress,
} from '@/lib/uniswap';

interface UseSwapQuoteParams {
  tokenIn: Token;
  tokenOut: Token;
  amountIn: bigint | undefined;
  fee?: number;
}

interface UseSwapQuoteResult {
  quoteAmount: bigint | undefined;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches a Uniswap V3 swap quote using the QuoterV2 contract.
 * Debounces input by 500ms to avoid excessive RPC calls while typing.
 */
export function useSwapQuote({
  tokenIn,
  tokenOut,
  amountIn,
  fee = DEFAULT_FEE,
}: UseSwapQuoteParams): UseSwapQuoteResult {
  // Debounce: only update the "committed" amount after user stops typing
  const [debouncedAmountIn, setDebouncedAmountIn] = useState<bigint | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedAmountIn(amountIn);
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [amountIn]);

  const tokenInAddress = getSwapAddress(tokenIn);
  const tokenOutAddress = getSwapAddress(tokenOut);

  const enabled =
    !!debouncedAmountIn &&
    debouncedAmountIn > 0n &&
    tokenInAddress.toLowerCase() !== tokenOutAddress.toLowerCase();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['swapQuote', tokenInAddress, tokenOutAddress, debouncedAmountIn?.toString(), fee],
    queryFn: async () => {
      if (!debouncedAmountIn) throw new Error('No amount');

      const result = await publicClient.simulateContract({
        address: QUOTER_V2_ADDRESS,
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [
          {
            tokenIn: tokenInAddress,
            tokenOut: tokenOutAddress,
            amountIn: debouncedAmountIn,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      // result.result is [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate]
      const [amountOut] = result.result as readonly [bigint, bigint, number, bigint];
      return amountOut;
    },
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  // Translate error to a user-friendly string
  let errorMessage: string | null = null;
  if (error) {
    const msg = (error as Error).message || '';
    if (msg.includes('revert') || msg.includes('execution reverted')) {
      errorMessage = 'No liquidity available for this pair';
    } else if (msg.includes('fetch') || msg.includes('network')) {
      errorMessage = 'Failed to fetch quote — check your connection';
    } else {
      errorMessage = 'Failed to fetch quote';
    }
  }

  return {
    quoteAmount: data,
    isLoading: isLoading && enabled,
    error: errorMessage,
    refetch,
  };
}
