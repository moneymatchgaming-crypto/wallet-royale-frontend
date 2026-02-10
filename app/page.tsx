import GameLobby from '@/components/GameLobby';
import ConnectWalletClient from '@/components/ConnectWalletClient';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen relative">
      {/* Arena background: full viewport, below overlays */}
      <div
        className="fixed inset-0 z-0 min-w-full min-h-full"
        style={{ backgroundImage: 'url(/arena-bg.png)', backgroundSize: 'cover', backgroundPosition: 'top center', backgroundRepeat: 'no-repeat', backgroundColor: 'var(--arena-bg)' }}
        aria-hidden
      />
      {/* Dark gradient overlay: top stays bright, bottom transitions to solid dark for buttons/cards */}
      <div className="arena-gradient-overlay" aria-hidden />

      <div className="relative" style={{ zIndex: 10 }}>
      {/* Cinematic arena header with glow frame - image more visible here */}
      <header className="relative border-b border-white/5 bg-[var(--arena-bg)]/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--neon-blue)]/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <h1
              className="text-xl font-bold tracking-tight"
              style={{
                background: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-pink))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.4))',
              }}
            >
              Wallet Royale
            </h1>
          </Link>
          <ConnectWalletClient />
        </div>
      </header>

      {/* Hero: JOIN THE ARENA - light tint so arena bg shows through */}
      <section className="relative overflow-hidden py-12 sm:py-16">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(10,10,24,0.25) 0%, rgba(12,12,28,0.4) 50%, rgba(8,8,18,0.65) 100%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(90deg, transparent 0%, var(--neon-blue) 50%, transparent 100%),
              linear-gradient(0deg, transparent 0%, var(--neon-pink) 30%, transparent 70%)
            `,
            backgroundSize: '200% 200%',
            backgroundPosition: '0% 0%',
            filter: 'blur(80px)',
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,var(--neon-blue-dim)_0%,transparent_50%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--neon-blue)]/50 to-transparent" />

        {/* Glowing frame around CTA */}
        <div className="relative max-w-4xl mx-auto px-6">
          <div
            className="relative rounded-2xl border border-[var(--neon-blue)]/30 bg-[var(--arena-charcoal)]/55 backdrop-blur-sm py-10 sm:py-14 px-8 arena-border-glow"
            style={{ boxShadow: '0 0 40px rgba(0,212,255,0.08), inset 0 0 60px rgba(0,212,255,0.03)' }}
          >
            <div className="text-center">
              <p className="text-sm uppercase tracking-[0.3em] text-[var(--neon-cyan)]/90 mb-3 font-semibold">
                Trading Arena
              </p>
              <h2
                className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white arena-hero-glow"
                style={{
                  textShadow: '0 0 20px rgba(255,255,255,0.5), 0 0 40px rgba(0,212,255,0.3)',
                  letterSpacing: '-0.02em',
                }}
              >
                JOIN THE ARENA
              </h2>
              <p className="mt-4 text-gray-400 text-sm sm:text-base max-w-md mx-auto">
                Compete in elimination rounds. Last wallet standing wins.
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="relative max-w-7xl mx-auto px-6 sm:px-8 pb-16 -mt-2">
        <GameLobby />
      </main>
      </div>
    </div>
  );
}
