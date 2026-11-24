'use client';

import React from 'react';
import { User, Zap } from 'lucide-react';
import Card from '../../Card';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function AuctionControlStep({ formData, onUpdateFormData }: StepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">Who controls the auction progression?</p>

      {/* Host Controlled */}
      <Card
        className={`cursor-pointer border-2 p-6 transition-all duration-200 ${
          formData.auctionControl === 'HOST_CONTROLLED'
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50'
        }`}
        onClick={() => onUpdateFormData({ auctionControl: 'HOST_CONTROLLED' })}
      >
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="radio"
            name="auctionControl"
            value="HOST_CONTROLLED"
            checked={formData.auctionControl === 'HOST_CONTROLLED'}
            onChange={() => onUpdateFormData({ auctionControl: 'HOST_CONTROLLED' })}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <User size={18} className="text-accent" />
              <strong>Host Controlled</strong>
            </div>
            <p className="text-sm text-text-muted">
              You manually control bidding, timer, and player progression.
            </p>
          </div>
        </label>
      </Card>

      {/* System Automatic */}
      <Card
        className={`cursor-pointer border-2 p-6 transition-all duration-200 ${
          formData.auctionControl === 'SYSTEM_AUTOMATIC'
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50'
        }`}
        onClick={() => onUpdateFormData({ auctionControl: 'SYSTEM_AUTOMATIC' })}
      >
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="radio"
            name="auctionControl"
            value="SYSTEM_AUTOMATIC"
            checked={formData.auctionControl === 'SYSTEM_AUTOMATIC'}
            onChange={() => onUpdateFormData({ auctionControl: 'SYSTEM_AUTOMATIC' })}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Zap size={18} className="text-accent" />
              <strong>System Automatic</strong>
            </div>
            <p className="text-sm text-text-muted">
              The system automatically manages bidding, timers, and player progression.
            </p>
          </div>
        </label>
      </Card>
    </div>
  );
}
