import { createConfig, http } from 'wagmi';
import { baseSepolia } from 'viem/chains';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected(),
    // Temporarily removed coinbaseWallet due to getChainId error
    // Can be re-added once connector compatibility is resolved
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
