import { NextRequest, NextResponse } from 'next/server';
import { publicClient, CONTRACT_ADDRESS, contractABI } from '@/lib/contract';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId: gameIdStr } = await params;
    const gameId = BigInt(gameIdStr);

    const game = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: 'games',
      args: [gameId],
    });

    // Game is returned as a tuple, convert to object with proper field names
    // Structure: [gameId, startTime, endTime, currentRound, totalRounds, roundDuration, 
    //            playerCount, prizePool, active, finalized, cancelled, entryFee, 
    //            registrationDeadline, minPlayers, operationsFund, platformFee, totalGasReimbursed]
    const gameArray = game as any[];
    
    const serializedGame = {
      gameId: gameArray[0]?.toString() || '0',
      startTime: gameArray[1]?.toString() || '0',
      endTime: gameArray[2]?.toString() || '0',
      currentRound: gameArray[3]?.toString() || '0',
      totalRounds: gameArray[4]?.toString() || '0',
      roundDuration: gameArray[5]?.toString() || '0',
      playerCount: gameArray[6]?.toString() || '0',
      prizePool: gameArray[7]?.toString() || '0',
      active: gameArray[8] || false,
      finalized: gameArray[9] || false,
      cancelled: gameArray[10] || false,
      entryFee: gameArray[11]?.toString() || '0',
      registrationDeadline: gameArray[12]?.toString() || '0',
      minPlayers: gameArray[13]?.toString() || '0',
      operationsFund: gameArray[14]?.toString() || '0',
      platformFee: gameArray[15]?.toString() || '0',
      totalGasReimbursed: gameArray[16]?.toString() || '0',
    };

    return NextResponse.json(serializedGame);
  } catch (error) {
    console.error('Error fetching game:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game' },
      { status: 500 }
    );
  }
}
