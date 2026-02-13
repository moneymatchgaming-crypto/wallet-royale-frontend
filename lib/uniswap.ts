import { Address } from 'viem';

// ============ Uniswap V3 Contract Addresses (Base Sepolia) ============

export const SWAP_ROUTER_ADDRESS: Address = '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4';
export const QUOTER_V2_ADDRESS: Address = '0xC5290058841028F1614F3A6F0F5816cAd0df5E27';
export const WETH_ADDRESS: Address = '0x4200000000000000000000000000000000000006';

// ============ Token Definitions ============

export interface Token {
  address: Address | 'native';
  symbol: string;
  name: string;
  decimals: number;
  logoColor: string;
}

export const TOKENS: Token[] = [
  {
    address: 'native',
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    logoColor: '#627EEA',
  },
  {
    address: WETH_ADDRESS,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    logoColor: '#627EEA',
  },
  {
    address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoColor: '#2775CA',
  },
];

// ============ Helpers ============

export function isNativeETH(token: Token): boolean {
  return token.address === 'native';
}

/** Returns the on-chain address to use for swaps (WETH for native ETH). */
export function getSwapAddress(token: Token): Address {
  return isNativeETH(token) ? WETH_ADDRESS : (token.address as Address);
}

/** Apply slippage tolerance: amountOut * (10000 - slippageBps) / 10000 */
export function calculateMinAmountOut(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * BigInt(10000 - slippageBps)) / 10000n;
}

// ============ ABIs (minimal — only functions we call) ============

export const QUOTER_V2_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'data', type: 'bytes[]' }],
    name: 'multicall',
    outputs: [{ name: 'results', type: 'bytes[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountMinimum', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    name: 'unwrapWETH9',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

export const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/** Default fee tier for Uniswap V3 pools (0.3%) */
export const DEFAULT_FEE = 3000;

/** Default slippage tolerance in basis points (0.5% = 50 bps) */
export const DEFAULT_SLIPPAGE_BPS = 50;
