'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { PlayerRoleType, PlayerCategoryDto } from '@/lib/types';

interface PlayerSearchProps {
  onSearchChange: (query: string) => void;
  onFiltersChange: (filters: PlayerSearchFilters) => void;
  categories: PlayerCategoryDto[];
  countries: { code: string; name: string }[];
  isLoading?: boolean;
}

export interface PlayerSearchFilters {
  search?: string;
  category?: string;
  role?: PlayerRoleType;
  country?: string;
}

const ROLES: { value: PlayerRoleType; label: string }[] = [
  { value: 'BATTER', label: 'Batter' },
  { value: 'BOWLER', label: 'Bowler' },
  { value: 'ALL_ROUNDER', label: 'All-rounder' },
  { value: 'WICKETKEEPER', label: 'Wicket-keeper' },
];

export default function PlayerSearch({
  onSearchChange,
  onFiltersChange,
  categories,
  countries,
  isLoading,
}: PlayerSearchProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [role, setRole] = useState('');
  const [country, setCountry] = useState('');

  // Debounce search
  const [searchTimeout, setSearchTimeout] = React.useState<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => {
      onSearchChange(value);
    }, 300);
    setSearchTimeout(timeout);
  }, [searchTimeout, onSearchChange]);

  const handleCategoryChange = (categoryId: string) => {
    setCategory(categoryId);
    onFiltersChange({
      search,
      category: categoryId || undefined,
      role: role as PlayerRoleType | undefined,
      country: country || undefined,
    });
  };

  const handleRoleChange = (roleValue: string) => {
    setRole(roleValue);
    onFiltersChange({
      search,
      category: category || undefined,
      role: roleValue as PlayerRoleType | undefined,
      country: country || undefined,
    });
  };

  const handleCountryChange = (countryCode: string) => {
    setCountry(countryCode);
    onFiltersChange({
      search,
      category: category || undefined,
      role: role as PlayerRoleType | undefined,
      country: countryCode || undefined,
    });
  };

  const handleClear = () => {
    setSearch('');
    setCategory('');
    setRole('');
    setCountry('');
    onSearchChange('');
    onFiltersChange({});
  };

  const hasFilters = search || category || role || country;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      {/* Search Input */}
      <div className="mb-4">
        <label htmlFor="search" className="mb-2 block text-sm font-medium text-text">
          Search Players
        </label>
        <input
          id="search"
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name..."
          disabled={isLoading}
          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-text placeholder-text-muted disabled:opacity-50"
        />
      </div>

      {/* Filters Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Category Filter */}
        <div>
          <label htmlFor="category" className="mb-2 block text-sm font-medium text-text">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            disabled={isLoading}
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-text disabled:opacity-50"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Role Filter */}
        <div>
          <label htmlFor="role" className="mb-2 block text-sm font-medium text-text">
            Role
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
            disabled={isLoading}
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-text disabled:opacity-50"
          >
            <option value="">All Roles</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Country Filter */}
        <div>
          <label htmlFor="country" className="mb-2 block text-sm font-medium text-text">
            Country
          </label>
          <select
            id="country"
            value={country}
            onChange={(e) => handleCountryChange(e.target.value)}
            disabled={isLoading}
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-text disabled:opacity-50"
          >
            <option value="">All Countries</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Clear Filters */}
      {hasFilters && (
        <div className="mt-4">
          <button
            onClick={handleClear}
            disabled={isLoading}
            className="text-sm text-primary hover:text-primary-dark disabled:opacity-50"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
