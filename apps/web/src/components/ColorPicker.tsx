'use client';

import React from 'react';

interface ColorPickerProps {
  value?: string;
  onChange: (value: string) => void;
  label: string;
  id?: string;
  error?: string;
  required?: boolean;
}

export default function ColorPicker({
  value,
  onChange,
  label,
  id,
  error,
  required,
}: ColorPickerProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-text">
        {label}
        {required && <span className="text-error"> *</span>}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-16 cursor-pointer rounded border border-border"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#FF5733"
          className="flex-1 rounded-lg border border-border bg-background px-4 py-2 font-mono text-sm text-text"
          pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
        />
        {value && (
          <div
            className="h-10 w-10 rounded border border-border"
            style={{ backgroundColor: value }}
            aria-label={`Color preview: ${value}`}
            title={value}
          />
        )}
      </div>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}
