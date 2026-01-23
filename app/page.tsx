import GameLobby from '@/components/GameLobby';
import ConnectWalletClient from '@/components/ConnectWalletClient';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-700 bg-gray-950/80 backdrop-blur-xl px-6 py-5 sticky top-0 z-50 rounded-b-3xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <h1 className="text-2xl font-bold" style={{ background: 'linear-gradient(to right, #c4b5fd, #22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Wallet Royale
            </h1>
          </Link>
          <ConnectWalletClient />
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 sm:px-8 py-12">
        <GameLobby />
      </main>
    </div>
  );
}
