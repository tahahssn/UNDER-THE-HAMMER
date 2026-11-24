'use client';

import React from 'react';
import { Users, Shuffle, Hand } from 'lucide-react';
import Card from '../../Card';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function TeamAllocationStep({ formData, onUpdateFormData }: StepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">How should teams be assigned to participants?</p>

      {/* User Selected */}
      <Card
        className={`cursor-pointer border-2 p-6 transition-all duration-200 ${
          formData.teamAllocation === 'USER_SELECTED'
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50'
        }`}
        onClick={() => onUpdateFormData({ teamAllocation: 'USER_SELECTED' })}
      >
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="radio"
            name="teamAllocation"
            value="USER_SELECTED"
            checked={formData.teamAllocation === 'USER_SELECTED'}
            onChange={() => onUpdateFormData({ teamAllocation: 'USER_SELECTED' })}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Hand size={18} className="text-accent" />
              <strong>User Selected</strong>
            </div>
            <p className="text-sm text-text-muted">
              Participants choose their own teams during registration.
            </p>
          </div>
        </label>
      </Card>

      {/* Random */}
      <Card
        className={`cursor-pointer border-2 p-6 transition-all duration-200 ${
          formData.teamAllocation === 'RANDOM'
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50'
        }`}
        onClick={() => onUpdateFormData({ teamAllocation: 'RANDOM' })}
      >
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="radio"
            name="teamAllocation"
            value="RANDOM"
            checked={formData.teamAllocation === 'RANDOM'}
            onChange={() => onUpdateFormData({ teamAllocation: 'RANDOM' })}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Shuffle size={18} className="text-accent" />
              <strong>Random</strong>
            </div>
            <p className="text-sm text-text-muted">
              Teams are randomly assigned to participants. Great for fair distribution.
            </p>
          </div>
        </label>
      </Card>

      {/* Custom */}
      <Card
        className={`cursor-pointer border-2 p-6 transition-all duration-200 ${
          formData.teamAllocation === 'CUSTOM'
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50'
        }`}
        onClick={() => onUpdateFormData({ teamAllocation: 'CUSTOM' })}
      >
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="radio"
            name="teamAllocation"
            value="CUSTOM"
            checked={formData.teamAllocation === 'CUSTOM'}
            onChange={() => onUpdateFormData({ teamAllocation: 'CUSTOM' })}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Users size={18} className="text-accent" />
              <strong>Custom</strong>
            </div>
            <p className="text-sm text-text-muted">
              You manually assign teams to participants. Full control over allocation.
            </p>
          </div>
        </label>
      </Card>
    </div>
  );
}
