'use client';

import React from 'react';
import Card from '../../Card';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function TeamsSetupStep({ formData, onUpdateFormData }: StepProps) {
  const formatCurrency = (minor: number): string => {
    const major = minor / 100;
    return `PKR ${major.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  return (
    <div className="space-y-6">
      {/* Team Count */}
      <div>
        <label className="mb-2 block text-sm font-semibold">
          Number of Teams <span className="text-danger">*</span>
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="2"
            max="16"
            value={formData.teamCount || 8}
            onChange={(e) => onUpdateFormData({ teamCount: parseInt(e.target.value) })}
            className="flex-1"
          />
          <div className="min-w-16 rounded-lg border border-border bg-surface-raised px-3 py-2 text-center font-semibold">
            {formData.teamCount || 8}
          </div>
        </div>
        <p className="mt-1 text-xs text-text-muted">Select 2–16 teams for your auction</p>
      </div>

      {/* Team Purse */}
      <div>
        <label className="mb-2 block text-sm font-semibold">
          Team Purse <span className="text-danger">*</span>
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          <div className="flex-1">
            <input
              type="number"
              value={Math.round((formData.teamPurse || 20000000) / 1000000)}
              onChange={(e) => onUpdateFormData({ teamPurse: parseInt(e.target.value) * 1000000 })}
              placeholder="20"
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-primary focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-text-muted">Enter amount in millions</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised px-4 py-2 font-semibold">
            {formatCurrency(formData.teamPurse || 20000000)}
          </div>
        </div>
      </div>

      {/* Quick Presets */}
      <div>
        <label className="mb-2 block text-sm font-semibold">Quick Presets</label>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
          {[
            { label: '10 Cr', value: 10 },
            { label: '15 Cr', value: 15 },
            { label: '20 Cr', value: 20 },
            { label: '25 Cr', value: 25 },
            { label: '30 Cr', value: 30 },
            { label: '50 Cr', value: 50 },
          ].map((preset) => (
            <button
              key={preset.value}
              onClick={() => onUpdateFormData({ teamPurse: preset.value * 1000000 })}
              className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-all duration-200 ${
                formData.teamPurse === preset.value * 1000000
                  ? 'border-accent bg-accent/10 text-primary'
                  : 'border-border bg-surface hover:border-accent/50'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Team Colors Preview */}
      <div>
        <label className="mb-2 block text-sm font-semibold">Team Colors</label>
        <Card className="border-border/50 bg-surface-raised p-4">
          <p className="mb-3 text-xs text-text-muted">
            Teams will use their default colors. User logos and branding will be respected.
          </p>
          <div className="grid gap-2 grid-cols-4 sm:grid-cols-6 md:grid-cols-8">
            {Array(formData.teamCount || 8)
              .fill(null)
              .map((_, idx) => (
                <div
                  key={idx}
                  className="aspect-square rounded-lg border-2 border-border"
                  style={{ backgroundColor: '#0066CC' }}
                  title={`Team ${idx + 1}`}
                />
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
