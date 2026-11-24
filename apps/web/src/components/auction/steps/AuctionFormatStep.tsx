'use client';

import React from 'react';
import { Clock, Layers } from 'lucide-react';
import Card from '../../Card';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function AuctionFormatStep({ formData, onUpdateFormData }: StepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">What format should the auction use?</p>

      {/* Live Countdown */}
      <Card
        className={`cursor-pointer border-2 p-6 transition-all duration-200 ${
          formData.auctionFormat === 'LIVE_COUNTDOWN'
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50'
        }`}
        onClick={() => onUpdateFormData({ auctionFormat: 'LIVE_COUNTDOWN' })}
      >
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="radio"
            name="auctionFormat"
            value="LIVE_COUNTDOWN"
            checked={formData.auctionFormat === 'LIVE_COUNTDOWN'}
            onChange={() => onUpdateFormData({ auctionFormat: 'LIVE_COUNTDOWN' })}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Clock size={18} className="text-accent" />
              <strong>Live Countdown</strong>
            </div>
            <p className="text-sm text-text-muted">
              Real-time bidding with a countdown timer. Faster-paced action.
            </p>
          </div>
        </label>
      </Card>

      {/* Turn-Based */}
      <Card
        className={`cursor-pointer border-2 p-6 transition-all duration-200 ${
          formData.auctionFormat === 'TURN_BASED'
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50'
        }`}
        onClick={() => onUpdateFormData({ auctionFormat: 'TURN_BASED' })}
      >
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="radio"
            name="auctionFormat"
            value="TURN_BASED"
            checked={formData.auctionFormat === 'TURN_BASED'}
            onChange={() => onUpdateFormData({ auctionFormat: 'TURN_BASED' })}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Layers size={18} className="text-accent" />
              <strong>Turn-Based</strong>
            </div>
            <p className="text-sm text-text-muted">
              Participants bid one at a time. More strategic and thoughtful.
            </p>
          </div>
        </label>
      </Card>
    </div>
  );
}
