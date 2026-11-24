'use client';

import React from 'react';
import Card from '../../Card';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function BreakPolicyStep({ formData, onUpdateFormData }: StepProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Configure breaks during the auction to give participants time to discuss and strategize.
      </p>

      {/* Break Interval */}
      <div>
        <label className="mb-2 block text-sm font-semibold">
          Break After Every <span className="text-danger">*</span>
        </label>
        <div className="flex items-center gap-4">
          <input
            type="number"
            min="1"
            value={formData.breakAfterBidCount || 5}
            onChange={(e) => onUpdateFormData({ breakAfterBidCount: parseInt(e.target.value) })}
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-primary focus:border-accent focus:outline-none"
          />
          <span className="text-sm text-text-muted whitespace-nowrap">accepted bids</span>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          A break will occur after this many players are sold
        </p>
      </div>

      {/* Break Duration */}
      <div>
        <label className="mb-2 block text-sm font-semibold">
          Break Duration <span className="text-danger">*</span>
        </label>
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="number"
              min="10"
              step="10"
              value={formData.breakDurationSeconds || 120}
              onChange={(e) =>
                onUpdateFormData({ breakDurationSeconds: parseInt(e.target.value) })
              }
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-primary focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-text-muted">Duration in seconds</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised px-4 py-2 font-semibold whitespace-nowrap">
            {formData.breakDurationSeconds
              ? `${Math.floor((formData.breakDurationSeconds || 120) / 60)}m ${(formData.breakDurationSeconds || 120) % 60}s`
              : '2m'}
          </div>
        </div>
      </div>

      {/* Quick Presets */}
      <div>
        <label className="mb-2 block text-sm font-semibold">Quick Presets</label>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          {[
            { label: '1m', value: 60 },
            { label: '2m', value: 120 },
            { label: '3m', value: 180 },
            { label: '5m', value: 300 },
          ].map((preset) => (
            <button
              key={preset.value}
              onClick={() => onUpdateFormData({ breakDurationSeconds: preset.value })}
              className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-all duration-200 ${
                formData.breakDurationSeconds === preset.value
                  ? 'border-accent bg-accent/10 text-primary'
                  : 'border-border bg-surface hover:border-accent/50'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Break Adjustments */}
      <div>
        <label className="mb-2 block text-sm font-semibold">Max Break Adjustments</label>
        <input
          type="number"
          min="0"
          max="10"
          value={formData.maxBreakAdjustments || 2}
          onChange={(e) => onUpdateFormData({ maxBreakAdjustments: parseInt(e.target.value) })}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-primary focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-xs text-text-muted">
          How many times host can adjust break duration during auction
        </p>
      </div>

      {/* Information */}
      <Card className="border-info/20 bg-info/5 p-4">
        <h4 className="mb-2 text-sm font-semibold">Break Policy</h4>
        <p className="text-xs text-text-muted">
          Currently configured: Break every {formData.breakAfterBidCount || 5} bids for{' '}
          {formData.breakDurationSeconds
            ? `${Math.floor((formData.breakDurationSeconds || 120) / 60)}m ${(formData.breakDurationSeconds || 120) % 60}s`
            : '2m'}
          . Host can adjust up to {formData.maxBreakAdjustments || 2} times.
        </p>
      </Card>
    </div>
  );
}
