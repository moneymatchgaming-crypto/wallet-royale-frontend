'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useAccount, useDisconnect } from 'wagmi';

// Dynamically import ConnectWallet with SSR disabled to avoid hydration mismatch
const ConnectWallet = dynamic(
  () => import('@coinbase/onchainkit/wallet').then((mod) => mod.ConnectWallet),
  { ssr: false }
);

export default function ConnectWalletClient() {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Only show connection-dependent UI after mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const handleDisconnect = () => {
    disconnect();
    setShowDropdown(false);
  };

  // Format address for display
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="flex items-center gap-3 relative" ref={dropdownRef}>
      <div 
        className="flex items-center cursor-pointer"
        onClick={() => isConnected && setShowDropdown(!showDropdown)}
      >
        <ConnectWallet />
      </div>
      
      {mounted && isConnected && showDropdown && (
        <div className="absolute top-full right-0 mt-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-lg z-50 min-w-[200px]">
          <div className="p-3 border-b border-[#2a2a2a]">
            <p className="text-xs text-[#9ca3af] mb-1">Connected Wallet</p>
            <p className="text-sm text-white font-mono">{address && formatAddress(address)}</p>
          </div>
          <button
            onClick={handleDisconnect}
            className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[#2a2a2a] transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
