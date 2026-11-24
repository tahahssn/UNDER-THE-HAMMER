'use client';

import React from 'react';
import { Globe, Lock } from 'lucide-react';
import Card from '../../Card';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function VisibilityStep({ formData, onUpdateFormData }: StepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">Who should be able to see your auction?</p>

      {/* Public Option */}
      <Card
        className={`cursor-pointer border-2 p-6 transition-all duration-200 ${
          formData.visibility === 'PUBLIC'
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50'
        }`}
        onClick={() => onUpdateFormData({ visibility: 'PUBLIC' })}
      >
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="radio"
            name="visibility"
            value="PUBLIC"
            checked={formData.visibility === 'PUBLIC'}
            onChange={() => onUpdateFormData({ visibility: 'PUBLIC' })}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Globe size={18} className="text-accent" />
              <strong>Public Auction</strong>
            </div>
            <p className="text-sm text-text-muted">
              Anyone can see and join your auction. Great for reaching more participants.
            </p>
          </div>
        </label>
      </Card>

      {/* Private Option */}
      <Card
        className={`cursor-pointer border-2 p-6 transition-all duration-200 ${
          formData.visibility === 'PRIVATE'
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50'
        }`}
        onClick={() => onUpdateFormData({ visibility: 'PRIVATE' })}
      >
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="radio"
            name="visibility"
            value="PRIVATE"
            checked={formData.visibility === 'PRIVATE'}
            onChange={() => onUpdateFormData({ visibility: 'PRIVATE' })}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Lock size={18} className="text-warning" />
              <strong>Private Auction</strong>
            </div>
            <p className="text-sm text-text-muted">
              Only invited participants can see and join. Perfect for closed group auctions.
            </p>
          </div>
        </label>
      </Card>
    </div>
  );
}
