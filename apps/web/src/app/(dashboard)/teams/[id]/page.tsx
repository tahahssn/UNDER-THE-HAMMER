'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { getTeamById, getDownloadUrl } from '@/lib/api';
import { TeamDetailDto } from '@/lib/types';

interface TeamDetailPageProps {
  params: {
    id: string;
  };
}

export default function TeamDetailPage({ params }: TeamDetailPageProps) {
  const router = useRouter();
  const [team, setTeam] = useState<TeamDetailDto | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTeam = async () => {
      try {
        setIsLoading(true);
        const response = await getTeamById(params.id);
        
        if (response.success && response.data) {
          setTeam(response.data);
          
          // Load logo URL if available
          if (response.data.currentLogo?.id) {
            const logoResponse = await getDownloadUrl(response.data.currentLogo.id);
            if (logoResponse.success && logoResponse.data?.url) {
              setLogoUrl(logoResponse.data.url);
            }
          }
        } else {
          setError(response.error || 'Team not found');
        }
      } catch (err) {
        console.error('Failed to load team:', err);
        setError('Failed to load team details');
      } finally {
        setIsLoading(false);
      }
    };

    loadTeam();
  }, [params.id]);

  if (isLoading) {
    return (
      <div>
        <section className="border-b border-border bg-surface px-4 py-12">
          <div className="mx-auto max-w-6xl">
            <div className="h-8 w-32 animate-pulse rounded bg-surface" />
          </div>
        </section>
        <section className="px-4 py-12">
          <div className="mx-auto max-w-4xl space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-surface" />
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <section className="border-b border-border bg-surface px-4 py-12">
          <div className="mx-auto max-w-6xl">
            <PageHeader
              title="Team"
              description="View team details"
            />
          </div>
        </section>
        <section className="px-4 py-12">
          <div className="mx-auto max-w-4xl">
            <Card className="border-error bg-error/10 p-6">
              <p className="mb-4 text-error">{error}</p>
              <Button
                onClick={() => router.back()}
                variant="secondary"
                size="sm"
              >
                Go Back
              </Button>
            </Card>
          </div>
        </section>
      </div>
    );
  }

  if (!team) {
    return null;
  }

  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-start gap-6">
            {/* Logo / Avatar */}
            <div
              className="flex h-24 w-24 items-center justify-center rounded-lg font-bold text-white text-2xl flex-shrink-0"
              style={{
                background: logoUrl
                  ? `url('${logoUrl}') center / cover`
                  : `linear-gradient(135deg, ${team.primaryColor}, ${team.secondaryColor || team.primaryColor})`,
              }}
            >
              {!logoUrl && team.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>

            {/* Info */}
            <div className="flex-1">
              <PageHeader
                title={team.name}
                description={`${team.shortName} • Created by ${team.createdBy.displayName}`}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <div className="flex gap-2">
                  <div
                    className="h-6 w-6 rounded border border-border"
                    style={{ background: team.primaryColor }}
                    title={team.primaryColor}
                  />
                  {team.secondaryColor && (
                    <div
                      className="h-6 w-6 rounded border border-border"
                      style={{ background: team.secondaryColor }}
                      title={team.secondaryColor}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Team Info */}
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-text">Team Information</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-text-muted">Team Name</p>
                <p className="mt-1 text-sm text-text">{team.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted">Short Name</p>
                <p className="mt-1 text-sm text-text">{team.shortName}</p>
              </div>
              {team.description && (
                <div className="md:col-span-2">
                  <p className="text-xs font-medium text-text-muted">Description</p>
                  <p className="mt-1 text-sm text-text">{team.description}</p>
                </div>
              )}
              {team.countryCode && (
                <div>
                  <p className="text-xs font-medium text-text-muted">Country</p>
                  <p className="mt-1 text-sm text-text">{team.countryCode}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-text-muted">Status</p>
                <p className="mt-1 text-sm text-text capitalize">{team.status}</p>
              </div>
            </div>
          </Card>

          {/* Logo Section */}
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-text">Team Logo</h2>
            {logoUrl ? (
              <div className="mb-4 max-w-sm">
                <Image
                  src={logoUrl}
                  alt={`${team.name} logo`}
                  width={500}
                  height={500}
                  className="h-auto w-full rounded-lg border border-border"
                  unoptimized
                />
              </div>
            ) : (
              <div className="mb-4 flex h-40 w-40 items-center justify-center rounded-lg bg-surface text-text-muted text-sm">
                No logo uploaded
              </div>
            )}
            <Link href={`/teams/${team.id}/logo`}>
              <Button size="sm">
                {logoUrl ? 'Replace Logo' : 'Upload Logo'}
              </Button>
            </Link>
          </Card>

          {/* Actions */}
          <Card className="bg-background p-4">
            <div className="flex flex-wrap gap-3">
              <Link href={`/teams/${team.id}/edit`}>
                <Button variant="secondary" size="sm">
                  Edit Team
                </Button>
              </Link>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (confirm('Are you sure you want to archive this team?')) {
                    // Delete action would go here
                  }
                }}
              >
                Archive Team
              </Button>
            </div>
          </Card>

          {/* Back Button */}
          <div>
            <Button
              onClick={() => router.back()}
              variant="ghost"
              size="sm"
            >
              ← Go Back
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
