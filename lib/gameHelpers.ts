import { publicClient, CONTRACT_ADDRESS, contractABI } from './contract';
import { Address, formatEther } from 'viem';

export interface PlayerData {
  wallet: Address;
  squareIndex: number;
  rank: number;
  isEliminated: boolean;
  gainPercent: number;
  balance: bigint;
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
 * Fetch a single player's data (no penalty/adjusted balances; raw ETH only)
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

    // getPlayer returns: [squareIndex, startETH, alive, eliminationReason]
    const [squareIndex, startETH, alive, eliminationReason] = playerData as [
      number,
      bigint,
      boolean,
      string,
    ];

    const balance = await publicClient.getBalance({ address: playerAddress });
    const gainPercent = startETH > 0n
      ? Number((balance - startETH) * 10000n / startETH) / 100
      : 0;

    return {
      wallet: playerAddress,
      squareIndex,
      rank: 0, // Will be calculated from leaderboard
      isEliminated: !alive,
      gainPercent: alive ? gainPercent : -100,
      balance,
    };
  } catch (error) {
    console.error('Error fetching player data:', error);
    return null;
  }
}

/**
 * Calculate player rankings based on raw ETH gain % (startETH vs current balance)
 */
export async function calculateRankings(
  gameId: bigint,
  playerAddresses: Address[]
): Promise<Map<Address, number>> {
  const rankings = new Map<Address, number>();
  const gainPromises = playerAddresses.map(async (address) => {
    const player = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: 'getPlayer',
      args: [gameId, address],
    });
    const [, startETH, alive] = player as [number, bigint, boolean];
    const balance = await publicClient.getBalance({ address });
    const gainPct = startETH > 0n
      ? Number((balance - startETH) * 10000n / startETH)
      : 0;
    return { address, gainPct: alive ? gainPct : -1e9 };
  });
  const results = await Promise.all(gainPromises);
  results.sort((a, b) => b.gainPct - a.gainPct);
  results.forEach((item, index) => rankings.set(item.address, index + 1));
  return rankings;
}
