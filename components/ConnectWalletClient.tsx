'use client';

import { useEffect, useState, useRef } from 'react';
import { useAccount, useDisconnect, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

function WalletIcon({ className, size = 10 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      width={size}
      height={size}
      style={{ minWidth: size, minHeight: size, flexShrink: 0 }}
    >
      <path d="M21 12V7H5a2 2 0 01-2-2c0-1.1.9-2 2-2h14v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 5v14c0 1.1.9 2 2 2h16v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M18 12a2 2 0 100 4 2 2 0 000-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ChevronDownIcon({ className, size = 8 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      style={{ minWidth: size, minHeight: size, flexShrink: 0 }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
      <path d="M4 16V4a2 2 0 012-2h10"/>
    </svg>
  );
}

export default function ConnectWalletClient() {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const { connect, connectors, isPending } = useConnect();
  const [mounted, setMounted] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConnectMenu, setShowConnectMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setShowConnectMenu(false);
      }
    };
    if (showDropdown || showConnectMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown, showConnectMenu]);

  const handleDisconnect = () => {
    disconnect();
    setShowDropdown(false);
  };

  const handleCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  if (!mounted) {
    return <div className="h-11 min-w-[180px] max-w-[250px]" />;
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center relative shrink-0" ref={dropdownRef}>
        <button
          type="button"
          className="wallet-btn wallet-btn--connected"
          onClick={() => setShowDropdown(!showDropdown)}
          aria-expanded={showDropdown}
          aria-haspopup="true"
        >
          <span className="min-w-0 truncate font-mono text-[10px] tracking-wider">{formatAddress(address)}</span>
          <ChevronDownIcon className={`shrink-0 opacity-80 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} size={8} />
        </button>

        {showDropdown && (
          <div className="wallet-dropdown">
            <div className="wallet-dropdown__header">
              <p className="wallet-dropdown__label">Connected Wallet</p>
              <p className="wallet-dropdown__address">{address}</p>
            </div>
            <button
              type="button"
              className="wallet-dropdown__item flex items-center gap-2"
              onClick={handleCopyAddress}
            >
              <CopyIcon className="w-4 h-4 shrink-0" />
              {copied ? 'Copied!' : 'Copy address'}
            </button>
            <button
              type="button"
              className="wallet-dropdown__item"
              onClick={handleDisconnect}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setShowConnectMenu(!showConnectMenu)}
        disabled={isPending}
        className="wallet-btn"
        aria-expanded={showConnectMenu}
        aria-haspopup="true"
      >
        <WalletIcon className="shrink-0 text-[#00D9FF]" size={10} aria-hidden />
        <span>{isPending ? 'Connecting...' : 'Connect Wallet'}</span>
      </button>

      {showConnectMenu && (
        <div className="wallet-dropdown">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              className="wallet-dropdown__item"
              onClick={() => {
                connect({ connector });
                setShowConnectMenu(false);
              }}
              disabled={isPending}
            >
              {connector.name === 'Injected' ? 'Browser Wallet' : connector.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
