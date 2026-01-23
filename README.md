# Wallet Royale Frontend

React frontend for Wallet Royale built with Next.js, OnchainKit, and Tailwind CSS.

## Features

- 🎮 Game lobby with filtering (All/Open/Live/Finished)
- 🎯 10×10 game board visualization
- 💰 Real-time prize pool and player stats
- 🔔 Start game reward countdown
- 📱 Responsive design
- 🔗 Wallet connection via OnchainKit

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local`:
```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0xF2D5b37362466B2efAabbDfBD831CBC0d7ff254F
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_ALCHEMY_KEY=your_alchemy_key
NEXT_PUBLIC_CHAIN_ID=84532
```

3. Run development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
wallet-royale-frontend/
├── app/
│   ├── api/game/[gameId]/    # API route for game data
│   ├── game/[gameId]/        # Game detail page
│   ├── layout.tsx            # Root layout with OnchainKit provider
│   ├── page.tsx              # Home page (game lobby)
│   └── globals.css           # Global styles
├── components/
│   ├── GameLobby.tsx         # Main game listing
│   ├── GameCard.tsx          # Individual game card
│   ├── GameBoard.tsx         # 10×10 game board
│   ├── PlayerSquare.tsx      # Individual player square
│   ├── Sidebar.tsx           # Game sidebar with info
│   ├── RegistrationModal.tsx # Join game modal
│   └── StartGameButton.tsx   # Start game with reward
├── lib/
│   ├── contract.ts           # Contract connection
│   ├── chains.ts             # Chain configuration
│   └── wagmi.ts              # Wagmi config
└── hooks/
    └── useGameUpdates.ts     # WebSocket hook (TODO)

```

## Components

### GameLobby
Displays all games with filtering tabs. Shows create game button for owners.

### GameCard
Individual game card showing:
- Entry fee (ETH and USD)
- Player count and minimum
- Registration deadline countdown
- Prize pool
- Status badge

### GameBoard
10×10 grid showing all players:
- Player addresses
- Gain/loss percentage
- Balance
- Rank badges for top 10
- Eliminated state (grayed out)

### Sidebar
Game information sidebar:
- Round info and countdown
- Prize pool
- User status
- Start game button (if eligible)
- Leaderboard button

## Contract Integration

The frontend connects to the WalletRoyaleRestricted contract on Base Sepolia:
- Contract: `0xF2D5b37362466B2efAabbDfBD831CBC0d7ff254F`
- Network: Base Sepolia (Chain ID: 84532)

## Styling

- Dark theme (gray-900 background)
- Status colors:
  - REGISTRATION_OPEN: yellow-500
  - READY_TO_START: green-500
  - LIVE: blue-500
  - FINALIZED: gray-500
  - CANCELLED: red-500
- Animations: fade-in, pulse for start button
- Responsive: Desktop (10×10), Tablet (scrollable), Mobile (5×5 visible)

## Next Steps

- [ ] Add WebSocket hook for real-time updates
- [ ] Implement leaderboard view
- [ ] Add game creation modal
- [ ] Connect to monitoring service WebSocket
- [ ] Add player ranking calculations
- [ ] Add transaction history
