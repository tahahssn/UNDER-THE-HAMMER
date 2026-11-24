'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Users, Zap, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { listPublicRooms, joinRoom } from '@/lib/api';
import { ROUTES } from '@/lib/constants';

interface Room {
  id: string;
  name: string;
  visibility: string;
  status: string;
  host?: {
    displayName: string;
  };
  settings?: {
    teamCount: number;
    teamPurseMinor: bigint;
  };
  memberCount?: number;
}

export default function JoinPublicAuctionPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'createdDate' | 'teams' | 'upcomingStart'>('createdDate');

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const response = await listPublicRooms({
          search,
          sortBy,
          take: 20,
        });
        if (response.success && response.data?.rooms) {
          setRooms(response.data.rooms);
        } else {
          setError('Could not load public rooms');
        }
      } catch (err) {
        setError('Failed to fetch rooms');
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
  }, [search, sortBy]);

  const handleJoin = async (roomId: string) => {
    setJoining(roomId);
    try {
      const response = await joinRoom(roomId, 'TEAM_OWNER');
      if (response.success) {
        // Redirect to room detail
        window.location.href = `/auction/${roomId}`;
      } else {
        setError(response.error || 'Failed to join room');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setJoining(null);
    }
  };

  const formatPurse = (minor: bigint): string => {
    const major = Number(minor) / 100;
    if (major >= 10000000) return `${(major / 10000000).toFixed(1)} Cr`;
    if (major >= 100000) return `${(major / 100000).toFixed(0)} L`;
    return `${major.toFixed(0)}`;
  };

  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            title="Browse Public Auctions"
            description="Join any public auction and start bidding"
            breadcrumbs={[
              { label: 'Home', href: ROUTES.home },
              { label: 'Auction', href: ROUTES.auctionWorkspace },
              { label: 'Browse' },
            ]}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-6xl">
          {/* Search & Filters */}
          <div className="mb-8 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
              <input
                type="text"
                placeholder="Search auction rooms..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface pl-10 pr-4 py-2 text-primary placeholder-text-muted focus:border-accent focus:outline-none"
              />
            </div>

            {/* Sort */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="text-sm font-semibold">Sort by:</label>
              <div className="flex gap-2">
                {(['createdDate', 'teams', 'upcomingStart'] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => setSortBy(option)}
                    className={`rounded-lg px-3 py-1 text-sm font-semibold transition-all duration-200 ${
                      sortBy === option
                        ? 'border border-accent bg-accent text-white'
                        : 'border border-border bg-surface hover:border-accent/50'
                    }`}
                  >
                    {option === 'createdDate' && 'Recently Created'}
                    {option === 'teams' && 'Team Count'}
                    {option === 'upcomingStart' && 'Starting Soon'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <Card className="mb-8 border-danger/20 bg-danger/5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-1 flex-shrink-0 text-danger" size={20} />
                <div>
                  <h3 className="font-semibold text-danger">Error</h3>
                  <p className="text-sm text-text-muted">{error}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {/* Empty State */}
          {!loading && rooms.length === 0 && (
            <Card className="border-info/20 bg-info/5 p-8 text-center">
              <p className="mb-4 text-text-muted">No public auctions available right now.</p>
              <Link href={ROUTES.auctionWorkspace}>
                <Button variant="primary" size="md">
                  Create Your Own Auction
                </Button>
              </Link>
            </Card>
          )}

          {/* Rooms Grid */}
          {!loading && rooms.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {rooms.map((room) => (
                <Card
                  key={room.id}
                  className="flex flex-col border-border/50 hover:border-accent/50 transition-all duration-200"
                >
                  <div className="mb-4 flex-1">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="text-lg font-bold">{room.name}</h3>
                      <Badge variant="success" className="flex-shrink-0">{room.status}</Badge>
                    </div>
                    <p className="mb-3 text-sm text-text-muted">
                      By {room.host?.displayName || 'Unknown'}
                    </p>

                    {/* Info */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Users size={16} className="text-text-muted" />
                        <span>
                          {room.settings?.teamCount || 8} teams · {room.memberCount || 0} members
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Zap size={16} className="text-text-muted" />
                        <span>Purse: {formatPurse(room.settings?.teamPurseMinor || 20000000n)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Link href={`/auction/${room.id}`} className="w-full">
                      <Button variant="outline" size="sm" className="w-full">
                        View Details
                      </Button>
                    </Link>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleJoin(room.id)}
                      loading={joining === room.id}
                      disabled={joining !== null}
                      className="w-full"
                    >
                      Join Auction
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
