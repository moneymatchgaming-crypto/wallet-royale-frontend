import { createConfig, http } from 'wagmi';
import { baseSepolia } from 'viem/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'Wallet Royale' }),
  ],
  transports: {
    [baseSepolia.id]: http(
      // Use public RPC to avoid rate limits and CORS issues
      'https://sepolia.base.org',
      {
        // Add retry and timeout configuration
        retryCount: 3,
        retryDelay: 1000,
        timeout: 10000,
      }
    ),
  },
});
