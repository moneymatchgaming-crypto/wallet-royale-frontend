'use client';

import { useEffect, useState, useRef } from 'react';

interface GameUpdate {
  type: 'scoresUpdate' | 'playerEliminated' | 'roundFinalized' | 'gameStarted';
  gameId: number;
  data: any;
}

interface Scores {
  [playerAddress: string]: {
    rank: number;
    gainPercent: number;
    balance: bigint;
    isEliminated: boolean;
  };
}

interface UseGameUpdatesReturn {
  scores: Scores;
  isConnected: boolean;
  lastUpdate: Date | null;
  error: string | null;
}

export function useGameUpdates(gameId: number | null): UseGameUpdatesReturn {
  const [scores, setScores] = useState<Scores>({});
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!gameId) {
      return;
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000; // 3 seconds

    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected');
          setIsConnected(true);
          setError(null);
          reconnectAttempts = 0;

          // Subscribe to game updates
          ws.send(JSON.stringify({
            type: 'subscribe',
            gameId,
          }));
        };

        ws.onmessage = (event) => {
          try {
            const update: GameUpdate = JSON.parse(event.data);

            if (update.gameId !== gameId) {
              return; // Ignore updates for other games
            }

            switch (update.type) {
              case 'scoresUpdate':
                setScores(update.data.scores || {});
                setLastUpdate(new Date());
                break;

              case 'playerEliminated':
                setScores((prev) => ({
                  ...prev,
                  [update.data.player]: {
                    ...prev[update.data.player],
                    isEliminated: true,
                  },
                }));
                setLastUpdate(new Date());
                break;

              case 'roundFinalized':
                setScores(update.data.scores || {});
                setLastUpdate(new Date());
                break;

              case 'gameStarted':
                setScores(update.data.scores || {});
                setLastUpdate(new Date());
                break;

              default:
                console.warn('Unknown update type:', update.type);
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
            setError('Failed to parse update');
          }
        };

        ws.onerror = (err) => {
          // Silently handle errors - WebSocket server may not be running
          console.log('WebSocket server not available (this is OK if server is not running)');
          setIsConnected(false);
        };

        ws.onclose = () => {
          setIsConnected(false);

          // Silently attempt to reconnect (don't show errors to user)
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, reconnectDelay * reconnectAttempts);
          }
          // Don't set error - app works fine without WebSocket
        };

        wsRef.current = ws;
      } catch (err) {
        // Silently handle - WebSocket is optional
        console.log('WebSocket not available (this is OK)');
        setIsConnected(false);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [gameId]);

  return {
    scores,
    isConnected,
    lastUpdate,
    error,
  };
}
