import { createPublicClient, http, getContract, Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import contractAbi from './contract.json';

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address;
export const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532');

if (!CONTRACT_ADDRESS) {
  throw new Error('NEXT_PUBLIC_CONTRACT_ADDRESS is not set');
}

// Create public client for read operations
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// Contract instance for read operations
export const contract = getContract({
  address: CONTRACT_ADDRESS,
  abi: contractAbi.abi,
  client: publicClient,
});

// Export ABI for use in components
export const contractABI = contractAbi.abi;
