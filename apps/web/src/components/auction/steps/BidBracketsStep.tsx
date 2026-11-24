'use client';

import React from 'react';
import Card from '../../Card';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function BidBracketsStep({ formData, onUpdateFormData }: StepProps) {
  const brackets = formData.bidBrackets || [];

  const updateBracket = (idx: number, field: string, value: number) => {
    const updated = [...brackets];
    updated[idx] = { ...updated[idx], [field]: value };
    onUpdateFormData({ bidBrackets: updated });
  };

  const formatCurrency = (minor: number): string => {
    const major = minor / 100;
    if (major >= 10000000) return `${(major / 10000000).toFixed(1)} Cr`;
    if (major >= 100000) return `${(major / 100000).toFixed(0)} L`;
    return `${major.toFixed(0)}`;
  };

  const presets = [
    {
      name: 'Standard (PSL)',
      brackets: [
        { fromMinor: 0, toMinor: 100000000, incrementMinor: 1000000 },
        { fromMinor: 100000000, toMinor: 220000000, incrementMinor: 1500000 },
        { fromMinor: 220000000, toMinor: 400000000, incrementMinor: 2000000 },
        { fromMinor: 400000000, toMinor: Number.MAX_SAFE_INTEGER, incrementMinor: 2500000 },
      ],
    },
    {
      name: 'Conservative',
      brackets: [
        { fromMinor: 0, toMinor: 50000000, incrementMinor: 500000 },
        { fromMinor: 50000000, toMinor: Number.MAX_SAFE_INTEGER, incrementMinor: 1000000 },
      ],
    },
    {
      name: 'Aggressive',
      brackets: [
        { fromMinor: 0, toMinor: 50000000, incrementMinor: 2000000 },
        { fromMinor: 50000000, toMinor: Number.MAX_SAFE_INTEGER, incrementMinor: 5000000 },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Define bid increment rules. The increment increases based on the current bid amount.
      </p>

      {/* Presets */}
      <div>
        <label className="mb-2 block text-sm font-semibold">Quick Presets</label>
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
          {presets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => onUpdateFormData({ bidBrackets: preset.brackets })}
              className={`rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                JSON.stringify(brackets) === JSON.stringify(preset.brackets)
                  ? 'border-accent bg-accent/10 text-primary'
                  : 'border-border bg-surface hover:border-accent/50'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Brackets */}
      <div>
        <label className="mb-3 block text-sm font-semibold">Bid Brackets</label>
        <div className="space-y-3">
          {brackets.map((bracket: any, idx: number) => (
            <Card key={idx} className="border-border/50 p-4">
              <div className="mb-2 text-xs font-semibold text-text-muted">Bracket {idx + 1}</div>
              <div className="grid gap-3 grid-cols-3 md:grid-cols-4 items-end">
                {/* From Amount */}
                <div>
                  <label className="mb-1 text-xs text-text-muted">From</label>
                  <input
                    type="number"
                    value={Math.round((bracket.fromMinor || 0) / 1000000)}
                    onChange={(e) =>
                      updateBracket(idx, 'fromMinor', parseInt(e.target.value) * 1000000)
                    }
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-primary focus:border-accent focus:outline-none"
                    placeholder="0"
                  />
                </div>

                {/* To Amount */}
                <div>
                  <label className="mb-1 text-xs text-text-muted">To</label>
                  <input
                    type="number"
                    value={
                      bracket.toMinor === Number.MAX_SAFE_INTEGER
                        ? 999
                        : Math.round((bracket.toMinor || 0) / 1000000)
                    }
                    onChange={(e) =>
                      updateBracket(
                        idx,
                        'toMinor',
                        parseInt(e.target.value) === 999
                          ? Number.MAX_SAFE_INTEGER
                          : parseInt(e.target.value) * 1000000
                      )
                    }
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-primary focus:border-accent focus:outline-none"
                    placeholder="Cr"
                  />
                </div>

                {/* Increment */}
                <div>
                  <label className="mb-1 text-xs text-text-muted">Increment</label>
                  <input
                    type="number"
                    value={Math.round((bracket.incrementMinor || 0) / 100000)}
                    onChange={(e) =>
                      updateBracket(idx, 'incrementMinor', parseInt(e.target.value) * 100000)
                    }
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-primary focus:border-accent focus:outline-none"
                    placeholder="L"
                  />
                </div>

                {/* Unit Label */}
                <div className="hidden md:block text-xs text-text-muted font-semibold">
                  (Cr/L)
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Example */}
      <Card className="border-info/20 bg-info/5 p-4">
        <h4 className="mb-2 text-sm font-semibold">Example</h4>
        <p className="text-xs text-text-muted">
          If a player is at PKR 1 Cr: Next valid bid is 1 Cr + 15 Lakh = 1.15 Cr
        </p>
      </Card>
    </div>
  );
}
