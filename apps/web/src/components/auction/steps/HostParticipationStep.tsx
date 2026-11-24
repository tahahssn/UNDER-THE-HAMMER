'use client';

import React from 'react';
import Card from '../../Card';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function HostParticipationStep({ formData, onUpdateFormData }: StepProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Should the host participate in the auction as a team owner?
      </p>

      {/* Host Participation Toggle */}
      <Card className={`border-2 p-6 transition-all duration-200 ${
        formData.hostParticipates
          ? 'border-accent/50 bg-accent/5'
          : 'border-border hover:border-accent/50'
      }`}>
        <label className="flex cursor-pointer items-center gap-4">
          <div className="relative">
            <input
              type="checkbox"
              checked={formData.hostParticipates || false}
              onChange={(e) => onUpdateFormData({ hostParticipates: e.target.checked })}
              className="sr-only"
            />
            <div className={`h-6 w-11 rounded-full transition-colors duration-200 ${
              formData.hostParticipates ? 'bg-accent' : 'bg-surface-raised'
            }`} />
            <div className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
              formData.hostParticipates ? 'translate-x-5' : ''
            }`} />
          </div>
          <div className="flex-1">
            <strong className="block mb-1">Host Can Participate</strong>
            <p className="text-sm text-text-muted">
              {formData.hostParticipates
                ? 'The host can own a team and bid on players'
                : 'The host only manages the auction, does not own a team'}
            </p>
          </div>
        </label>
      </Card>

      {/* Information */}
      <Card className="border-info/20 bg-info/5 p-4 space-y-3">
        <h4 className="text-sm font-semibold">How This Affects Your Auction</h4>
        <div className="space-y-2 text-xs text-text-muted">
          <p>
            <strong>If Enabled:</strong> You'll be assigned a team when participants join. You can bid on players like any other participant.
          </p>
          <p>
            <strong>If Disabled:</strong> You remain neutral. You manage the auction without participating. This is recommended for fair, transparent auctions.
          </p>
          <p className="text-info">
            <strong>Note:</strong> Your team allocation method ({formData.teamAllocation || 'USER_SELECTED'}) will apply to your team selection as well.
          </p>
        </div>
      </Card>

      {/* Summary */}
      <Card className="border-success/20 bg-success/5 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-5 w-5 rounded-full bg-success/20 flex items-center justify-center">
            <span className="text-xs font-semibold text-success">✓</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-success mb-1">Your configuration is valid</p>
            <p className="text-xs text-text-muted">
              Host participation is optional. You can proceed to the next step.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
