'use client';

import { useEffect, useState, useRef } from 'react';
import { useAccount, useDisconnect, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

export default function ConnectWalletClient() {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const { connect, connectors, isPending } = useConnect();
  const [mounted, setMounted] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConnectMenu, setShowConnectMenu] = useState(false);
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

  // Format address for display
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!mounted) {
    return <div className="h-10 w-32" />; // Placeholder to prevent layout shift
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3 relative" ref={dropdownRef}>
        <div 
          className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg cursor-pointer hover:border-[#3a3a3a] transition-colors"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-purple-400">
            <path d="M13.5 2.5L8 8L2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-sm text-white font-mono">{formatAddress(address)}</span>
        </div>
        
        {showDropdown && (
          <div className="absolute top-full right-0 mt-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-lg z-50 min-w-[200px]">
            <div className="p-3 border-b border-[#2a2a2a]">
              <p className="text-xs text-[#9ca3af] mb-1">Connected Wallet</p>
              <p className="text-sm text-white font-mono">{address}</p>
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowConnectMenu(!showConnectMenu)}
        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
        disabled={isPending}
      >
        {isPending ? 'Connecting...' : 'Connect Wallet'}
      </button>
      
      {showConnectMenu && (
        <div className="absolute top-full right-0 mt-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-lg z-50 min-w-[200px]">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => {
                connect({ connector });
                setShowConnectMenu(false);
              }}
              className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[#2a2a2a] transition-colors first:rounded-t-lg last:rounded-b-lg"
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
