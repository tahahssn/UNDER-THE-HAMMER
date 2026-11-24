'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTeamSchema, CreateTeamFormData } from '@/lib/schemas/team.schema';
import { TeamDetailDto } from '@/lib/types';
import Button from './Button';
import ColorPicker from './ColorPicker';
import Card from './Card';

interface TeamFormProps {
  initialData?: TeamDetailDto;
  onSubmit: (data: CreateTeamFormData) => Promise<void>;
  isLoading?: boolean;
  onCancel?: () => void;
}

const COUNTRIES = [
  { code: 'PK', name: 'Pakistan' },
  { code: 'IN', name: 'India' },
  { code: 'AU', name: 'Australia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'WI', name: 'West Indies' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'SL', name: 'Sri Lanka' },
  { code: 'IE', name: 'Ireland' },
  { code: 'GB', name: 'England' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'US', name: 'United States' },
];

export default function TeamForm({
  initialData,
  onSubmit,
  isLoading,
  onCancel,
}: TeamFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
  } = useForm<CreateTeamFormData>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: initialData
      ? {
          name: initialData.name,
          shortName: initialData.shortName,
          description: initialData.description || '',
          primaryColor: initialData.primaryColor,
          secondaryColor: initialData.secondaryColor || '',
          countryCode: initialData.countryCode || '',
        }
      : {
          name: '',
          shortName: '',
          description: '',
          primaryColor: '#3B82F6',
          secondaryColor: '#1E40AF',
          countryCode: '',
        },
  });

  const primaryColor = watch('primaryColor');
  const secondaryColor = watch('secondaryColor');

  const handleFormSubmit = async (data: CreateTeamFormData) => {
    try {
      setSubmitError(null);
      await onSubmit(data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit form';
      setSubmitError(message);
    }
  };

  return (
    <Card className="max-w-2xl">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
        {/* Team Name */}
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-text">
            Team Name <span className="text-error">*</span>
          </label>
          <input
            id="name"
            type="text"
            {...register('name')}
            placeholder="e.g., Karachi Kings"
            disabled={isLoading}
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-text placeholder-text-muted disabled:opacity-50"
          />
          {errors.name && <p className="mt-1 text-xs text-error">{errors.name.message}</p>}
        </div>

        {/* Short Name */}
        <div>
          <label htmlFor="shortName" className="mb-2 block text-sm font-medium text-text">
            Short Name <span className="text-error">*</span>
          </label>
          <input
            id="shortName"
            type="text"
            {...register('shortName')}
            placeholder="e.g., KK"
            disabled={isLoading}
            maxLength={20}
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-text placeholder-text-muted disabled:opacity-50"
          />
          {errors.shortName && <p className="mt-1 text-xs text-error">{errors.shortName.message}</p>}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="mb-2 block text-sm font-medium text-text">
            Description
          </label>
          <textarea
            id="description"
            {...register('description')}
            placeholder="Team description (optional)"
            disabled={isLoading}
            maxLength={500}
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-text placeholder-text-muted disabled:opacity-50"
          />
          {errors.description && (
            <p className="mt-1 text-xs text-error">{errors.description.message}</p>
          )}
        </div>

        {/* Colors */}
        <div className="grid gap-4 md:grid-cols-2">
          <ColorPicker
            value={primaryColor}
            onChange={(value) => setValue('primaryColor', value)}
            label="Primary Color"
            id="primaryColor"
            error={errors.primaryColor?.message}
            required
          />
          <ColorPicker
            value={secondaryColor}
            onChange={(value) => setValue('secondaryColor', value)}
            label="Secondary Color"
            id="secondaryColor"
            error={errors.secondaryColor?.message}
          />
        </div>

        {/* Color Preview */}
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="mb-3 text-sm font-medium text-text">Color Preview</p>
          <div
            className="h-20 rounded-lg border border-border"
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor || primaryColor})`,
            }}
            aria-label="Color preview"
          />
        </div>

        {/* Country */}
        <div>
          <label htmlFor="countryCode" className="mb-2 block text-sm font-medium text-text">
            Country
          </label>
          <select
            id="countryCode"
            {...register('countryCode')}
            disabled={isLoading}
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-text disabled:opacity-50"
          >
            <option value="">Select a country (optional)</option>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          {errors.countryCode && (
            <p className="mt-1 text-xs text-error">{errors.countryCode.message}</p>
          )}
        </div>

        {/* Error Message */}
        {submitError && (
          <div className="rounded-lg border border-error bg-error/10 p-3 text-sm text-error">
            {submitError}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            type="submit"
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? 'Saving...' : initialData ? 'Update Team' : 'Create Team'}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
