'use client';

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';

interface ConnectionStatusProps {
  onStatusChange?: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
}

/**
 * ConnectionStatus: Real-time connection indicator
 * 
 * Features:
 * - Green indicator when connected
 * - Amber spinner when reconnecting
 * - Red indicator when disconnected >30s
 * - Toast: "Lost connection, reconnecting..." and "Reconnected"
 * - Does NOT block UI; always allow viewing/scrolling
 */
export default function ConnectionStatus({ onStatusChange }: ConnectionStatusProps) {
  const socket = useSocket();
  const [status, setStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const [showNotification, setShowNotification] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'info' | 'error';
  }>({ message: '', type: 'info' });
  const [disconnectedSince, setDisconnectedSince] = useState<number | null>(null);

  // Monitor socket connection
  useEffect(() => {
    if (!socket) {
      setStatus('disconnected');
      return;
    }

    // Handle connect
    const handleConnect = () => {
      setStatus('connected');
      setDisconnectedSince(null);
      setNotification({ message: 'Reconnected', type: 'info' });
      setShowNotification(true);
      onStatusChange?.('connected');

      setTimeout(() => setShowNotification(false), 3000);
    };

    // Handle reconnecting
    const handleReconnecting = () => {
      setStatus('reconnecting');
      setNotification({ message: 'Lost connection, reconnecting...', type: 'error' });
      setShowNotification(true);
      onStatusChange?.('reconnecting');
    };

    // Handle disconnect
    const handleDisconnect = () => {
      setStatus('disconnected');
      setDisconnectedSince(Date.now());
      onStatusChange?.('disconnected');
    };

    socket.on('connect', handleConnect);
    socket.on('reconnecting', handleReconnecting);
    socket.on('disconnect', handleDisconnect);

    // Set initial status
    if (socket.connected) {
      setStatus('connected');
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('reconnecting', handleReconnecting);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, onStatusChange]);

  // Check for long disconnect (>30s)
  useEffect(() => {
    if (status !== 'disconnected' || !disconnectedSince) return;

    const checkLongDisconnect = setInterval(() => {
      const timeSinceDisconnect = Date.now() - disconnectedSince;
      if (timeSinceDisconnect > 30000 && status === 'disconnected') {
        setNotification({
          message: 'Connection lost. Some data may be out of sync.',
          type: 'error',
        });
        setShowNotification(true);
      }
    }, 5000);

    return () => clearInterval(checkLongDisconnect);
  }, [status, disconnectedSince]);

  // Get icon and styling
  const getDisplay = () => {
    switch (status) {
      case 'connected':
        return {
          icon: <Wifi size={20} className="text-success" />,
          label: 'Connected',
          bgColor: 'bg-success/20',
          textColor: 'text-success',
        };
      case 'reconnecting':
        return {
          icon: <WifiOff size={20} className="text-warning animate-spin" />,
          label: 'Reconnecting...',
          bgColor: 'bg-warning/20',
          textColor: 'text-warning',
        };
      case 'disconnected':
        return {
          icon: <AlertCircle size={20} className="text-danger" />,
          label: 'Disconnected',
          bgColor: 'bg-danger/20',
          textColor: 'text-danger',
        };
    }
  };

  const display = getDisplay();

  return (
    <>
      {/* Status Indicator - Top Right */}
      <div
        className={`fixed top-4 right-4 z-40 flex items-center gap-2 rounded-lg px-3 py-2 ${display.bgColor} ${display.textColor} text-sm font-medium transition-all duration-200`}
        title={display.label}
      >
        {display.icon}
        <span className="hidden sm:inline">{display.label}</span>
      </div>

      {/* Notification Toast */}
      {showNotification && (
        <div
          className={`fixed top-20 right-4 z-40 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-300 animate-slideInDown ${
            notification.type === 'error'
              ? 'bg-danger/20 text-danger border border-danger/50'
              : 'bg-success/20 text-success border border-success/50'
          }`}
        >
          {notification.message}
        </div>
      )}
    </>
  );
}
