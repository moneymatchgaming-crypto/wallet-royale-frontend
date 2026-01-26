'use client';

import { useEffect, useState } from 'react';
import { useReadContract, useAccount } from 'wagmi';
import { contractABI, CONTRACT_ADDRESS } from '@/lib/contract';
import GameCard from './GameCard';
import CreateGameModal from './CreateGameModal';
import { Address } from 'viem';

type GameStatus = 'REGISTRATION_OPEN' | 'READY_TO_START' | 'LIVE' | 'FINALIZED' | 'CANCELLED';

interface Game {
  gameId: string | bigint;
  startTime: string | bigint;
  endTime: string | bigint;
  currentRound: string | bigint;
  totalRounds: string | bigint;
  roundDuration: string | bigint;
  playerCount: string | bigint;
  prizePool: string | bigint;
  active: boolean;
  finalized: boolean;
  cancelled: boolean;
  entryFee: string | bigint;
  registrationDeadline: string | bigint;
  minPlayers: string | bigint;
  operationsFund: string | bigint;
  platformFee: string | bigint;
  totalGasReimbursed: string | bigint;
}

export default function GameLobby() {
  const { address, isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [currentGameId, setCurrentGameId] = useState<bigint>(0n);
  const [games, setGames] = useState<Game[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'starting' | 'live' | 'finished'>('open');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Only show connection-dependent UI after mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Get current game ID
  const { data: gameId } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'currentGameId',
  });

  // Anyone can create a game now (no owner check needed)

  useEffect(() => {
    if (gameId) {
      setCurrentGameId(gameId as bigint);
    }
  }, [gameId]);

  // Fetch games based on filter - only fetch what we need
  useEffect(() => {
    const fetchGames = async () => {
      if (!currentGameId || currentGameId === 0n) return;

      // For "open" and "live" filters, only fetch recent games (last 20)
      // For "finished", fetch more (last 50)
      // For "all", fetch recent (last 30)
      const maxGames = filter === 'finished' ? 50 : filter === 'all' ? 30 : 20;
      const startId = Math.max(1, Number(currentGameId) - maxGames + 1);
      
      const gamePromises: Promise<Game>[] = [];
      for (let i = startId; i <= Number(currentGameId); i++) {
        gamePromises.push(
          fetch(`/api/game/${i}`).then(res => res.json()).catch(() => null)
        );
      }

      const results = await Promise.all(gamePromises);
      setGames(results.filter(Boolean) as Game[]);
    };

    fetchGames();
    // Only refresh every 30s for better performance (was 10s)
    const interval = setInterval(fetchGames, 30000);
    return () => clearInterval(interval);
  }, [currentGameId, filter]);

  const filteredGames = games.filter(game => {
    const startTime = BigInt(game.startTime?.toString() || '0');
    const deadline = Number(game.registrationDeadline?.toString() || '0');
    const now = Math.floor(Date.now() / 1000);
    const deadlinePassed = deadline > 0 && deadline < now;
    const playerCount = Number(game.playerCount?.toString() || '0');
    const minPlayers = Number(game.minPlayers?.toString() || '0');
    const canStart = playerCount >= minPlayers; // Game can actually start
    
    if (filter === 'open') {
      // Show games that are not finalized, not cancelled, not started, deadline hasn't passed
      // Underfilled games past deadline should NOT appear here - they go to "All" or "Finished" only
      return !game.finalized && !game.cancelled && startTime === 0n && !deadlinePassed;
    }
    if (filter === 'starting') {
      // Show games where deadline passed, game hasn't started yet, AND has enough players to start
      // Underfilled games past deadline should NOT appear here - they go to "All" or "Finished" only
      return !game.finalized && !game.cancelled && startTime === 0n && deadlinePassed && canStart;
    }
    if (filter === 'live') return game.active && !game.finalized && startTime > 0n;
    if (filter === 'finished') return game.finalized || game.cancelled;
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 font-sans">Join Games</h2>
          <p className="text-gray-500 text-sm font-sans">Select a game to join or create a new one</p>
        </div>
            {mounted && isConnected && (
              <button 
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:from-purple-500 hover:to-cyan-400 transition-all font-bold rounded-2xl shadow-lg shadow-purple-500/50 font-sans"
              >
                Create Game
              </button>
            )}
      </div>

      {/* Create Game Modal */}
      {showCreateModal && (
        <CreateGameModal 
          onClose={() => setShowCreateModal(false)} 
          onSuccess={() => {
            setShowCreateModal(false);
            // Refresh games list after creating a new game
            if (currentGameId) {
              const fetchGames = async () => {
                const maxGames = filter === 'finished' ? 50 : filter === 'all' ? 30 : 20;
                const startId = Math.max(1, Number(currentGameId) - maxGames + 1);
                const gamePromises: Promise<Game>[] = [];
                for (let i = startId; i <= Number(currentGameId); i++) {
                  gamePromises.push(
                    fetch(`/api/game/${i}`).then(res => res.json()).catch(() => null)
                  );
                }
                const results = await Promise.all(gamePromises);
                setGames(results.filter(Boolean) as Game[]);
              };
              fetchGames();
            }
          }}
        />
      )}

      {/* Filter Tabs - Split Layout */}
      <div className="flex items-center justify-between pb-4">
        {/* Primary Filters (Left) */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 mr-2 font-sans">Active:</span>
          <button
            onClick={() => setFilter('open')}
            className={`px-5 py-2.5 text-sm font-semibold rounded-2xl transition-all font-sans ${
              filter === 'open'
                ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow-lg shadow-purple-500/50'
                : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-purple-500/50'
            }`}
          >
            Open
          </button>
          <button
            onClick={() => setFilter('starting')}
            className={`px-5 py-2.5 text-sm font-semibold rounded-2xl transition-all font-sans ${
              filter === 'starting'
                ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg shadow-yellow-500/50'
                : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-yellow-500/50'
            }`}
          >
            Starting
          </button>
          <button
            onClick={() => setFilter('live')}
            className={`px-5 py-2.5 text-sm font-semibold rounded-2xl transition-all font-sans ${
              filter === 'live'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/50'
                : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-cyan-500/50'
            }`}
          >
            Live
          </button>
        </div>

        {/* Secondary Filters (Right) */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('finished')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              filter === 'finished'
                ? 'text-white'
                : 'text-[#6b7280] hover:text-[#9ca3af]'
            }`}
          >
            Finished
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              filter === 'all'
                ? 'text-white'
                : 'text-[#6b7280] hover:text-[#9ca3af]'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Games Grid */}
      {filteredGames.length === 0 ? (
        <div className="text-center py-16 text-[#9ca3af]">
          <p className="text-lg">No games found</p>
          <p className="text-sm mt-2">Check back later or create a new game</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((game) => {
            const startTime = BigInt(game.startTime?.toString() || '0');
            const entryFee = BigInt(game.entryFee?.toString() || '0');
            const prizePool = BigInt(game.prizePool?.toString() || '0');
            const deadline = Number(game.registrationDeadline?.toString() || '0');
            const now = Math.floor(Date.now() / 1000);
            const deadlinePassed = deadline > 0 && deadline < now;
            
            // Determine status
            let status: GameStatus;
            if (game.finalized) {
              status = 'FINALIZED';
            } else if (game.cancelled) {
              status = 'CANCELLED';
            } else if (startTime > 0n) {
              status = 'LIVE';
            } else if (deadlinePassed) {
              status = 'READY_TO_START'; // Deadline passed but game hasn't started yet
            } else {
              status = 'REGISTRATION_OPEN';
            }
            
            return (
              <GameCard
                key={Number(game.gameId)}
                gameId={Number(game.gameId)}
                entryFee={entryFee}
                playerCount={Number(game.playerCount)}
                minPlayers={Number(game.minPlayers)}
                deadline={deadline}
                status={status}
                prizePool={prizePool}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
