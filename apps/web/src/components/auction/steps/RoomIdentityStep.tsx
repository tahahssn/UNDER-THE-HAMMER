'use client';

import React from 'react';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function RoomIdentityStep({ formData, onUpdateFormData }: StepProps) {
  return (
    <div className="space-y-6">
      {/* Room Name */}
      <div>
        <label className="mb-2 block text-sm font-semibold">
          Room Name <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => onUpdateFormData({ name: e.target.value })}
          placeholder="e.g., PSL 2024 Main Auction"
          className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-primary placeholder-text-muted focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-xs text-text-muted">Give your auction a memorable name</p>
      </div>

      {/* Description */}
      <div>
        <label className="mb-2 block text-sm font-semibold">Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => onUpdateFormData({ description: e.target.value })}
          placeholder="Describe your auction (optional)"
          rows={4}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-primary placeholder-text-muted focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-xs text-text-muted">
          Help participants understand the auction format and rules
        </p>
      </div>

      {/* Start Date and Time */}
      <div>
        <label className="mb-2 block text-sm font-semibold">
          Start Date & Time <span className="text-danger">*</span>
        </label>
        <input
          type="datetime-local"
          value={formData.startDateTime || ''}
          onChange={(e) => onUpdateFormData({ startDateTime: e.target.value })}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-primary focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-xs text-text-muted">When should the auction begin?</p>
      </div>
    </div>
  );
}
