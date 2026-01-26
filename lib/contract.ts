import { createPublicClient, http, getContract, Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import contractAbi from './contract.json';

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x02155bECBA1554C299706991C147894Ea23f20Eb') as Address;
export const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532');

// Validate ABI structure
if (!contractAbi || !contractAbi.abi || !Array.isArray(contractAbi.abi)) {
  throw new Error('Invalid contract ABI structure. Expected { abi: [...] }');
}

// Export ABI for use in components
export const contractABI = contractAbi.abi;

// Create public client for read operations
// Lazy initialization to avoid issues during module load
let _publicClient: ReturnType<typeof createPublicClient> | null = null;
let _contract: ReturnType<typeof getContract> | null = null;

export const publicClient = (() => {
  if (!_publicClient) {
    // Use public Base Sepolia RPC to avoid rate limits and CORS issues
    _publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http('https://sepolia.base.org', {
        retryCount: 3,
        retryDelay: 1000,
        timeout: 10000,
      }),
    });
  }
  return _publicClient;
})();

// Contract instance for read operations
export const contract = (() => {
  if (!_contract) {
    _contract = getContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      client: publicClient,
    });
  }
  return _contract;
})();
