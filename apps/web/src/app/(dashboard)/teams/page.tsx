'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { getMyTeams } from '@/lib/api';
import { TeamListItem } from '@/lib/types';
import TeamCard from '@/components/TeamCard';

export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTeams = async () => {
      try {
        setIsLoading(true);
        const response = await getMyTeams();
        
        if (response.success && response.data?.teams) {
          setTeams(response.data.teams);
        } else if (response.error?.includes('401') || response.error?.includes('Unauthorized')) {
          router.push('/auth/sign-in');
        } else {
          setError(response.error || 'Failed to load teams');
        }
      } catch (err) {
        console.error('Failed to load teams:', err);
        setError('Failed to load teams');
      } finally {
        setIsLoading(false);
      }
    };

    loadTeams();
  }, [router]);

  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <PageHeader
            title="My Teams"
            description="Create and manage your cricket teams"
          />
          <Link href="/teams/create">
            <Button className="hidden md:inline-flex">
              + Create Team
            </Button>
          </Link>
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Error */}
          {error && (
            <Card className="border-error bg-error/10 p-4">
              <p className="text-sm text-error">{error}</p>
            </Card>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-48 animate-pulse rounded-lg bg-surface" />
              ))}
            </div>
          )}

          {/* Teams Grid */}
          {!isLoading && teams.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {teams.map((team) => (
                <TeamCard key={team.id} team={team} />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && teams.length === 0 && !error && (
            <Card className="border-info/20 bg-info/5 p-8 text-center">
              <p className="mb-4 text-text-muted">You haven&apos;t created any teams yet</p>
              <Link href="/teams/create">
                <Button>Create Your First Team</Button>
              </Link>
            </Card>
          )}

          {/* Mobile Create Button */}
          {!isLoading && teams.length > 0 && (
            <div className="flex md:hidden">
              <Link href="/teams/create" className="w-full">
                <Button className="w-full">+ Create Team</Button>
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
