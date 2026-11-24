'use client';

import React from 'react';
import Card from '../../Card';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function SquadRulesStep({ formData, onUpdateFormData }: StepProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Define squad size and composition requirements for each team.
      </p>

      {/* Squad Size */}
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-semibold">
            Minimum Squad Size <span className="text-danger">*</span>
          </label>
          <input
            type="number"
            min="1"
            max="20"
            value={formData.squadSizeMin || 11}
            onChange={(e) => onUpdateFormData({ squadSizeMin: parseInt(e.target.value) })}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-primary focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-xs text-text-muted">Minimum players per team</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold">
            Maximum Squad Size <span className="text-danger">*</span>
          </label>
          <input
            type="number"
            min="1"
            max="20"
            value={formData.squadSizeMax || 15}
            onChange={(e) => onUpdateFormData({ squadSizeMax: parseInt(e.target.value) })}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-primary focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-xs text-text-muted">Maximum players per team</p>
        </div>
      </div>

      {/* Quick Presets */}
      <div>
        <label className="mb-2 block text-sm font-semibold">Quick Presets</label>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
          {[
            { label: '11-15 (Standard)', min: 11, max: 15 },
            { label: '10-14 (Medium)', min: 10, max: 14 },
            { label: '12-16 (Large)', min: 12, max: 16 },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() =>
                onUpdateFormData({ squadSizeMin: preset.min, squadSizeMax: preset.max })
              }
              className={`rounded-lg border-2 px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                formData.squadSizeMin === preset.min && formData.squadSizeMax === preset.max
                  ? 'border-accent bg-accent/10 text-primary'
                  : 'border-border bg-surface hover:border-accent/50'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Information */}
      <Card className="border-info/20 bg-info/5 p-4">
        <h4 className="mb-2 text-sm font-semibold">Squad Rules</h4>
        <ul className="space-y-1 text-xs text-text-muted">
          <li>
            • <strong>Min-Max Range:</strong> Each team must have between {formData.squadSizeMin || 11}{' '}
            and {formData.squadSizeMax || 15} players
          </li>
          <li>• Role and category composition rules can be added after auction creation</li>
          <li>• Teams exceeding max squad size will not be allowed to bid</li>
        </ul>
      </Card>
    </div>
  );
}
