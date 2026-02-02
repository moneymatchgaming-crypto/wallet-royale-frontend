'use client';

import { useEffect, useState } from 'react';
import { createPublicClient, http, formatEther } from 'viem';
import { baseSepolia } from 'viem/chains';
import { CONTRACT_ADDRESS, contractABI } from '@/lib/contract';

export default function DebugPage() {
  const [gameState, setGameState] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    diagnoseGame();
  }, []);

  async function diagnoseGame() {
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http('https://sepolia.base.org'),
    });

    try {
      const gameId = 3; // Game #3

      // Get game
      const game = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: 'games',
        args: [BigInt(gameId)],
      }) as any;

      // Get Round 1
      const round1 = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: 'rounds',
        args: [BigInt(gameId), BigInt(1)],
      }) as any;

      // Get all players
      const players = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: 'getGamePlayers',
        args: [BigInt(gameId)],
      }) as string[];

      // Check each player
      const playerDetails = [];
      for (const playerAddr of players) {
        const player = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: contractABI,
          functionName: 'players',
          args: [BigInt(gameId), playerAddr],
        }) as any;

        playerDetails.push({
          address: playerAddr,
          alive: player.alive,
          registered: player.registered,
          eliminationReason: player.eliminationReason,
        });
      }

      // Get financials
      const financials = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: contractABI,
        functionName: 'getGameFinancials',
        args: [BigInt(gameId)],
      }) as any;

      setGameState({
        game: {
          active: game.active,
          started: game.startTime > 0n,
          finalized: game.finalized,
          cancelled: game.cancelled,
          currentRound: Number(game.currentRound),
          totalRounds: Number(game.totalRounds),
          playerCount: Number(game.playerCount),
          entryFee: formatEther(game.entryFee),
          startTime: game.startTime ? new Date(Number(game.startTime) * 1000).toLocaleString() : 'Not started',
        },
        round1: {
          roundNumber: Number(round1.roundNumber),
          startTime: new Date(Number(round1.startTime) * 1000).toLocaleString(),
          endTime: new Date(Number(round1.endTime) * 1000).toLocaleString(),
          alivePlayers: Number(round1.alivePlayers),
          cutoffRank: Number(round1.cutoffRank),
          finalized: round1.finalized,
          timeElapsedSinceEnd: Math.floor((Date.now() / 1000) - Number(round1.endTime)),
        },
        players: playerDetails,
        financials: {
          prizePool: formatEther(financials[0]),
          operationsFund: formatEther(financials[1]),
          platformFee: formatEther(financials[2]),
          totalGasReimbursed: formatEther(financials[3]),
        },
      });

    } catch (error) {
      console.error('Diagnostic error:', error);
      setGameState({ error: String(error) });
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-8">Loading diagnostics...</div>;
  if (!gameState) return <div className="p-8">No data</div>;
  if (gameState.error) return <div className="p-8 text-red-500">Error: {gameState.error}</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Game #3 Diagnostics</h1>

      <div className="space-y-6">
        {/* Game State */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">Game State</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Active: {gameState.game.active ? '✅ Yes' : '❌ No'}</div>
            <div>Started: {gameState.game.started ? '✅ Yes' : '❌ No'}</div>
            <div>Finalized: {gameState.game.finalized ? '✅ Yes' : '❌ No'}</div>
            <div>Cancelled: {gameState.game.cancelled ? '✅ Yes' : '❌ No'}</div>
            <div>Current Round: {gameState.game.currentRound}</div>
            <div>Total Rounds: {gameState.game.totalRounds}</div>
            <div>Player Count: {gameState.game.playerCount}</div>
            <div>Entry Fee: {gameState.game.entryFee} ETH</div>
            <div className="col-span-2">Start Time: {gameState.game.startTime}</div>
          </div>
        </div>

        {/* Round 1 State */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">Round 1 State</h2>
          <div className="space-y-2 text-sm">
            <div>Start Time: {gameState.round1.startTime}</div>
            <div>End Time: {gameState.round1.endTime}</div>
            <div>Time Since End: {gameState.round1.timeElapsedSinceEnd} seconds ({Math.floor(gameState.round1.timeElapsedSinceEnd / 60)} minutes)</div>
            <div>Alive Players: {gameState.round1.alivePlayers}</div>
            <div>Cutoff Rank: {gameState.round1.cutoffRank} (top {gameState.round1.cutoffRank} survive)</div>
            <div className="text-lg font-bold mt-2">
              Finalized: {gameState.round1.finalized ? '✅ YES' : '❌ NO'}
            </div>
          </div>
        </div>

        {/* Players */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">Players ({gameState.players.length})</h2>
          <div className="space-y-2">
            {gameState.players.map((p: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-sm border-b border-gray-700 pb-2">
                <div className="font-mono">{p.address.slice(0, 10)}...{p.address.slice(-8)}</div>
                <div className="flex gap-4">
                  <span className={p.alive ? 'text-green-500' : 'text-red-500'}>
                    {p.alive ? '✓ Alive' : '✗ Eliminated'}
                  </span>
                  {p.eliminationReason && (
                    <span className="text-gray-400 text-xs">({p.eliminationReason})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financials */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">Financials</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Prize Pool: {gameState.financials.prizePool} ETH</div>
            <div>Operations Fund: {gameState.financials.operationsFund} ETH</div>
            <div>Platform Fee: {gameState.financials.platformFee} ETH</div>
            <div>Gas Reimbursed: {gameState.financials.totalGasReimbursed} ETH</div>
          </div>
        </div>

        {/* Diagnosis */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">Diagnosis</h2>
          <div className="space-y-2 text-sm">
            {gameState.round1.finalized ? (
              <div className="text-green-500">✓ Round 1 is finalized. Game should have advanced to Round 2.</div>
            ) : (
              <div className="text-yellow-500">⚠️ Round 1 is NOT finalized even though {gameState.round1.timeElapsedSinceEnd} seconds have passed.</div>
            )}
            
            {gameState.round1.alivePlayers === 0 && !gameState.round1.finalized && (
              <div className="text-red-500">
                ❌ PROBLEM: Round shows 0 alive players but is not finalized. This is a stuck state.
              </div>
            )}

            {gameState.round1.alivePlayers > 0 && !gameState.round1.finalized && (
              <div className="text-blue-500">
                ℹ️ Round needs finalization. {gameState.round1.alivePlayers} players should be processed.
              </div>
            )}

            {gameState.game.started && gameState.game.currentRound === 1 && !gameState.round1.finalized && (
              <div className="text-orange-500">
                🔧 ACTION NEEDED: Try calling finalizeRound() to advance the game.
              </div>
            )}
          </div>
        </div>
      </div>

      <button 
        onClick={diagnoseGame}
        className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
      >
        Refresh Diagnostics
      </button>
    </div>
  );
}
