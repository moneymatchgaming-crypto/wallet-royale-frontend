import { createPublicClient, http, getContract, Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import contractAbi from './contract.json';

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x28c639eb0a3EDc08Bf434bAC6ceA967995796228') as Address;
export const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532');

// Validate ABI structure
if (!contractAbi || !contractAbi.abi || !Array.isArray(contractAbi.abi)) {
  throw new Error('Invalid contract ABI structure. Expected { abi: [...] }');
}

// Export ABI for use in components
export const contractABI = contractAbi.abi;

// Create public client for read operations
// Use public Base Sepolia RPC to avoid rate limits and CORS issues
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org', {
    retryCount: 3,
    retryDelay: 1000,
    timeout: 10000,
  }),
});

// Contract instance for read operations
export const contract = getContract({
  address: CONTRACT_ADDRESS,
  abi: contractABI,
  client: publicClient,
});
