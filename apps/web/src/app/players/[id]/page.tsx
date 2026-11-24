'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { getPlayerById } from '@/lib/api';
import { PlayerDetailDto } from '@/lib/types';

interface PlayerDetailPageProps {
  params: {
    id: string;
  };
}

export default function PlayerDetailPage({ params }: PlayerDetailPageProps) {
  const router = useRouter();
  const [player, setPlayer] = useState<PlayerDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPlayer = async () => {
      try {
        setIsLoading(true);
        const response = await getPlayerById(params.id);
        
        if (response.success && response.data) {
          setPlayer(response.data);
        } else {
          setError(response.error || 'Player not found');
        }
      } catch (err) {
        console.error('Failed to load player:', err);
        setError('Failed to load player details');
      } finally {
        setIsLoading(false);
      }
    };

    loadPlayer();
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
              title="Player"
              description="View player details"
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

  if (!player) {
    return null;
  }

  const getRoleLabel = (role: string) => {
    const roleMap: Record<string, string> = {
      BATTER: 'Batter',
      BOWLER: 'Bowler',
      ALL_ROUNDER: 'All-rounder',
      WICKETKEEPER: 'Wicket-keeper',
    };
    return roleMap[role] || role;
  };

  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-start gap-6">
            {/* Avatar */}
            <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-primary/10 text-2xl font-bold text-primary">
              {player.displayName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>
            
            {/* Info */}
            <div className="flex-1">
              <PageHeader
                title={player.displayName}
                description={player.fullName}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <span className="rounded-lg bg-primary/20 px-3 py-1 text-sm font-medium text-primary">
                  {getRoleLabel(player.role)}
                </span>
                {player.category && (
                  <span className="rounded-lg bg-secondary/20 px-3 py-1 text-sm font-medium text-secondary">
                    {player.category.name}
                  </span>
                )}
                {player.country && (
                  <span className="rounded-lg bg-border px-3 py-1 text-sm text-text">
                    {player.country.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Overview */}
          <Card>
            <h2 className="mb-4 text-xl font-semibold text-text">Overview</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {player.dateOfBirth && (
                <div>
                  <p className="text-xs font-medium text-text-muted">Date of Birth</p>
                  <p className="text-sm text-text">
                    {new Date(player.dateOfBirth).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              )}
              {player.battingStyle && (
                <div>
                  <p className="text-xs font-medium text-text-muted">Batting Style</p>
                  <p className="text-sm text-text">
                    {player.battingStyle === 'LEFT_HAND' ? 'Left-handed' : 'Right-handed'}
                  </p>
                </div>
              )}
              {player.bowlingStyle && (
                <div>
                  <p className="text-xs font-medium text-text-muted">Bowling Style</p>
                  <p className="text-sm text-text">{player.bowlingStyle}</p>
                </div>
              )}
              {player.country && (
                <div>
                  <p className="text-xs font-medium text-text-muted">Country</p>
                  <p className="text-sm text-text">{player.country.name}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Aliases */}
          {player.aliases.length > 0 && (
            <Card>
              <h2 className="mb-3 text-lg font-semibold text-text">Also Known As</h2>
              <div className="flex flex-wrap gap-2">
                {player.aliases.map((alias) => (
                  <span
                    key={alias}
                    className="rounded-lg bg-surface px-3 py-1 text-sm text-text"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* Statistics */}
          {Object.keys(player.statistics).length > 0 ? (
            <Card>
              <h2 className="mb-4 text-lg font-semibold text-text">Statistics</h2>
              <div className="space-y-6">
                {Object.entries(player.statistics).map(([format, stats]) => (
                  <div key={format}>
                    <h3 className="mb-3 font-medium text-text">{format}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="px-2 py-2 text-left text-xs font-semibold text-text-muted">
                              Stat
                            </th>
                            <th className="px-2 py-2 text-right text-xs font-semibold text-text-muted">
                              Value
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.map((stat, idx) => (
                            <React.Fragment key={idx}>
                              {stat.matches !== undefined && (
                                <tr className="border-b border-border/50">
                                  <td className="px-2 py-2 text-text">Matches</td>
                                  <td className="px-2 py-2 text-right font-medium text-text">
                                    {stat.matches}
                                  </td>
                                </tr>
                              )}
                              {stat.runs !== undefined && (
                                <tr className="border-b border-border/50">
                                  <td className="px-2 py-2 text-text">Runs</td>
                                  <td className="px-2 py-2 text-right font-medium text-text">
                                    {stat.runs}
                                  </td>
                                </tr>
                              )}
                              {stat.wickets !== undefined && (
                                <tr className="border-b border-border/50">
                                  <td className="px-2 py-2 text-text">Wickets</td>
                                  <td className="px-2 py-2 text-right font-medium text-text">
                                    {stat.wickets}
                                  </td>
                                </tr>
                              )}
                              {stat.battingAverage !== undefined && (
                                <tr className="border-b border-border/50">
                                  <td className="px-2 py-2 text-text">Batting Avg</td>
                                  <td className="px-2 py-2 text-right font-medium text-text">
                                    {stat.battingAverage.toFixed(2)}
                                  </td>
                                </tr>
                              )}
                              {stat.strikeRate !== undefined && (
                                <tr className="border-b border-border/50">
                                  <td className="px-2 py-2 text-text">Strike Rate</td>
                                  <td className="px-2 py-2 text-right font-medium text-text">
                                    {stat.strikeRate.toFixed(2)}
                                  </td>
                                </tr>
                              )}
                              {stat.bowlingAverage !== undefined && (
                                <tr className="border-b border-border/50">
                                  <td className="px-2 py-2 text-text">Bowling Avg</td>
                                  <td className="px-2 py-2 text-right font-medium text-text">
                                    {stat.bowlingAverage.toFixed(2)}
                                  </td>
                                </tr>
                              )}
                              {stat.bowlingEconomy !== undefined && (
                                <tr className="border-b border-border/50">
                                  <td className="px-2 py-2 text-text">Economy</td>
                                  <td className="px-2 py-2 text-right font-medium text-text">
                                    {stat.bowlingEconomy.toFixed(2)}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {stats[0]?.asOf && (
                      <p className="mt-2 text-xs text-text-muted">
                        As of {new Date(stats[0].asOf).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="border-info/20 bg-info/5">
              <p className="text-sm text-text-muted">No statistics available for this player</p>
            </Card>
          )}

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
