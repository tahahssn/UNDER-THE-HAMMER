'use client';

import React from 'react';
import { Hand, Dice5 } from 'lucide-react';
import Card from '../../Card';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function PlayerSelectionStep({ formData, onUpdateFormData }: StepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">How should players be selected for bidding?</p>

      {/* Manual */}
      <Card
        className={`cursor-pointer border-2 p-6 transition-all duration-200 ${
          formData.playerSelection === 'MANUAL'
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50'
        }`}
        onClick={() => onUpdateFormData({ playerSelection: 'MANUAL' })}
      >
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="radio"
            name="playerSelection"
            value="MANUAL"
            checked={formData.playerSelection === 'MANUAL'}
            onChange={() => onUpdateFormData({ playerSelection: 'MANUAL' })}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Hand size={18} className="text-accent" />
              <strong>Manual Selection</strong>
            </div>
            <p className="text-sm text-text-muted">
              You manually pick players from the pool. Full control over bidding order.
            </p>
          </div>
        </label>
      </Card>

      {/* Automatic Draw */}
      <Card
        className={`cursor-pointer border-2 p-6 transition-all duration-200 ${
          formData.playerSelection === 'AUTOMATIC_DRAW'
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50'
        }`}
        onClick={() => onUpdateFormData({ playerSelection: 'AUTOMATIC_DRAW' })}
      >
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="radio"
            name="playerSelection"
            value="AUTOMATIC_DRAW"
            checked={formData.playerSelection === 'AUTOMATIC_DRAW'}
            onChange={() => onUpdateFormData({ playerSelection: 'AUTOMATIC_DRAW' })}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Dice5 size={18} className="text-accent" />
              <strong>Automatic Draw</strong>
            </div>
            <p className="text-sm text-text-muted">
              Players are randomly drawn from the pool. Fair and transparent bidding.
            </p>
          </div>
        </label>
      </Card>
    </div>
  );
}
