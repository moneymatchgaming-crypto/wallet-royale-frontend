import { publicClient, CONTRACT_ADDRESS, contractABI } from './contract';
import { Address, formatEther } from 'viem';

export interface PlayerData {
  wallet: Address;
  squareIndex: number;
  rank: number;
  isEliminated: boolean;
  gainPercent: number;
  balance: bigint;
  startValueUSDC: bigint;
}

/**
 * Fetch all players for a game
 */
export async function fetchGamePlayers(gameId: bigint): Promise<PlayerData[]> {
  try {
    // Get all player addresses from contract
    const playerAddresses = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: 'getGamePlayers',
      args: [gameId],
    }) as Address[];

    // Fetch data for each player
    const playerPromises = playerAddresses.map((address) =>
      fetchPlayerData(gameId, address)
    );

    const players = await Promise.all(playerPromises);
    const validPlayers = players.filter((p): p is PlayerData => p !== null);

    // Calculate rankings
    const rankings = await calculateRankings(gameId, playerAddresses);

    // Update players with rankings
    return validPlayers.map((player) => ({
      ...player,
      rank: rankings.get(player.wallet) || 999,
    }));
  } catch (error) {
    console.error('Error fetching game players:', error);
    return [];
  }
}

/**
 * Fetch a single player's data
 */
export async function fetchPlayerData(
  gameId: bigint,
  playerAddress: Address
): Promise<PlayerData | null> {
  try {
    const playerData = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: 'getPlayer',
      args: [gameId, playerAddress],
    });

    const [
      squareIndex,
      startValueUSDC,
      penaltyETH,
      penaltyUSDC,
      penaltyAERO,
      penaltyCAKE,
      alive,
      eliminationReason,
    ] = playerData as [
      number,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      boolean,
      string,
    ];

    // Get adjusted balances
    const balances = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: 'getAdjustedBalances',
      args: [gameId, playerAddress],
    });

    const [adjETH, adjUSDC, adjAERO, adjCAKE] = balances as [
      bigint,
      bigint,
      bigint,
      bigint,
    ];

    // Calculate total balance in ETH (simplified - convert USDC to ETH equivalent)
    const totalBalance = adjETH + (adjUSDC * 1000000000000n) / 3300000000000000000n; // Approximate conversion

    // Calculate gain percentage (simplified)
    const startValueETH = (startValueUSDC * 1000000000000n) / 3300000000000000000n;
    const gain = totalBalance > startValueETH 
      ? totalBalance - startValueETH 
      : startValueETH - totalBalance;
    const gainPercent = startValueETH > 0n
      ? Number((gain * 10000n) / startValueETH) / 100
      : 0;

    return {
      wallet: playerAddress,
      squareIndex,
      rank: 0, // Will be calculated from leaderboard
      isEliminated: !alive,
      gainPercent: alive ? gainPercent : -100,
      balance: totalBalance,
      startValueUSDC,
    };
  } catch (error) {
    console.error('Error fetching player data:', error);
    return null;
  }
}

/**
 * Calculate player rankings based on adjusted balances
 */
export async function calculateRankings(
  gameId: bigint,
  playerAddresses: Address[]
): Promise<Map<Address, number>> {
  const rankings = new Map<Address, number>();
  
  // Fetch all player balances
  const balancePromises = playerAddresses.map(async (address) => {
    const balances = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: 'getAdjustedBalances',
      args: [gameId, address],
    });
    
    const [adjETH, adjUSDC] = balances as [bigint, bigint];
    const totalValue = adjETH + (adjUSDC * 1000000000000n) / 3300000000000000000n;
    
    return { address, totalValue };
  });

  const balances = await Promise.all(balancePromises);
  
  // Sort by total value (descending)
  balances.sort((a, b) => {
    if (a.totalValue > b.totalValue) return -1;
    if (a.totalValue < b.totalValue) return 1;
    return 0;
  });

  // Assign ranks
  balances.forEach((item, index) => {
    rankings.set(item.address, index + 1);
  });

  return rankings;
}
