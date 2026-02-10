'use client';

import { useEffect, useState } from 'react';
import { useReadContract, useAccount } from 'wagmi';
import { contractABI, CONTRACT_ADDRESS } from '@/lib/contract';
import GameCard from './GameCard';
import CreateGameModal from './CreateGameModal';
import FilterButton from './FilterButton';
import { Address } from 'viem';

function SwordsIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M5 4l7 7-2 2 7 7M19 20l-7-7 2-2-7-7M4 5l2 2M20 19l-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

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
    // OPTIMIZATION: Reduced refresh rate from 30s to 60s for better performance
    const interval = setInterval(fetchGames, 60000);
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
      {/* Header Section - sleek futuristic */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1 font-sans tracking-tight">Join Games</h2>
          <p className="text-[var(--text-muted)] text-sm font-sans">Select a game to join or create a new one</p>
        </div>
        {mounted && isConnected && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="create-game-btn"
          >
            <SwordsIcon className="shrink-0" style={{ width: 10, height: 10, minWidth: 10, minHeight: 10 }} />
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

      {/* Status filter – HUD-style buttons */}
      <nav className="flex items-center gap-3 flex-wrap pb-6 border-b border-white/5" role="tablist" aria-label="Game status filter">
        <FilterButton variant="open" active={filter === 'open'} onClick={() => setFilter('open')}>
          Open
        </FilterButton>
        <FilterButton variant="starting" active={filter === 'starting'} onClick={() => setFilter('starting')}>
          Starting
        </FilterButton>
        <FilterButton variant="live" active={filter === 'live'} onClick={() => setFilter('live')}>
          Live
        </FilterButton>
        <FilterButton variant="finished" active={filter === 'finished'} onClick={() => setFilter('finished')}>
          Finished
        </FilterButton>
        <FilterButton variant="all" active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </FilterButton>
      </nav>

      {/* Games Grid */}
      {filteredGames.length === 0 ? (
        <div className="text-center py-16 text-[#9ca3af]">
          <p className="text-lg">No games found</p>
          <p className="text-sm mt-2">Check back later or create a new game</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
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
