'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';
import { getPlayers, getPlayerCategories } from '@/lib/api';
import { PlayerListItem, PlayerCategoryDto } from '@/lib/types';
import PlayerSearch, { PlayerSearchFilters } from '@/components/PlayerSearch';
import PlayerCard from '@/components/PlayerCard';
import Button from '@/components/Button';

const ITEMS_PER_PAGE = 20;

function PlayersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [categories, setCategories] = useState<PlayerCategoryDto[]>([]);
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(() => {
    const page = searchParams.get('page');
    return page ? parseInt(page, 10) : 1;
  });
  const [filters, setFilters] = useState<PlayerSearchFilters>({});

  // Load categories and initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true);
        
        // Load categories
        const categoryResponse = await getPlayerCategories();
        if (categoryResponse.success && categoryResponse.data?.categories) {
          setCategories(categoryResponse.data.categories);
        }

        // Load countries (would come from an API, for now use a default set)
        setCountries([
          { code: 'PK', name: 'Pakistan' },
          { code: 'IN', name: 'India' },
          { code: 'AU', name: 'Australia' },
          { code: 'SG', name: 'Singapore' },
          { code: 'AE', name: 'United Arab Emirates' },
          { code: 'ZA', name: 'South Africa' },
          { code: 'WI', name: 'West Indies' },
          { code: 'BD', name: 'Bangladesh' },
          { code: 'SL', name: 'Sri Lanka' },
        ]);
      } catch (err) {
        console.error('Failed to load initial data:', err);
        setError('Failed to load player data');
      }
    };

    loadInitialData();
  }, []);

  // Load players with current filters
  const loadPlayers = useCallback(
    async (page: number, searchFilters: PlayerSearchFilters) => {
      try {
        setIsLoading(true);
        setError(null);
        
        const skip = (page - 1) * ITEMS_PER_PAGE;
        const response = await getPlayers({
          ...searchFilters,
          skip,
          take: ITEMS_PER_PAGE,
        });

        if (response.success && response.data) {
          setPlayers(response.data.players || []);
          setTotal(response.data.total || 0);
          setCurrentPage(page);
          
          // Update URL
          const params = new URLSearchParams();
          params.set('page', page.toString());
          if (searchFilters.search) params.set('search', searchFilters.search);
          if (searchFilters.category) params.set('category', searchFilters.category);
          if (searchFilters.role) params.set('role', searchFilters.role);
          if (searchFilters.country) params.set('country', searchFilters.country);
          router.push(`?${params.toString()}`);
        } else {
          setError(response.error || 'Failed to load players');
        }
      } catch (err) {
        console.error('Failed to load players:', err);
        setError('Failed to load players');
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  // Initial load
  useEffect(() => {
    loadPlayers(currentPage, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = (query: string) => {
    setFilters((prev) => ({
      ...prev,
      search: query,
    }));
    loadPlayers(1, { ...filters, search: query });
  };

  const handleFiltersChange = (newFilters: PlayerSearchFilters) => {
    setFilters(newFilters);
    loadPlayers(1, newFilters);
  };

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            title="Player Directory"
            description="Browse and discover cricket players"
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Search and Filters */}
          <PlayerSearch
            onSearchChange={handleSearchChange}
            onFiltersChange={handleFiltersChange}
            categories={categories}
            countries={countries}
            isLoading={isLoading}
          />

          {/* Results Count */}
          {!isLoading && total > 0 && (
            <p className="text-sm text-text-muted">
              Found <strong>{total}</strong> player{total !== 1 ? 's' : ''}
            </p>
          )}

          {/* Error */}
          {error && (
            <Card className="border-error bg-error/10 p-4">
              <p className="text-sm text-error">{error}</p>
            </Card>
          )}

          {/* Players Grid */}
          {!isLoading && players.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {players.map((player) => (
                <PlayerCard key={player.id} player={player} />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && players.length === 0 && !error && (
            <Card className="border-info/20 bg-info/5 p-8 text-center">
              <p className="mb-2 text-sm text-text-muted">No players found</p>
              <p className="text-xs text-text-muted">Try adjusting your search or filters</p>
            </Card>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-56 animate-pulse rounded-lg bg-surface" />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadPlayers(Math.max(1, currentPage - 1), filters)}
                disabled={currentPage === 1 || isLoading}
              >
                Previous
              </Button>

              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  const pageNum = currentPage + i - 2;
                  if (pageNum < 1 || pageNum > totalPages) return null;
                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === currentPage ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => loadPlayers(pageNum, filters)}
                      disabled={isLoading}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadPlayers(Math.min(totalPages, currentPage + 1), filters)}
                disabled={currentPage === totalPages || isLoading}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export default function PlayersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <PlayersPageContent />
    </Suspense>
  );
}
