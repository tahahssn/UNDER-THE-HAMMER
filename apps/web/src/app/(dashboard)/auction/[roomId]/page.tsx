'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Calendar, Users, Zap, AlertCircle, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { getRoomDetail, startAuction } from '@/lib/api';
import { ROUTES } from '@/lib/constants';
import TeamAllocationUI from '@/components/auction/TeamAllocationUI';

interface RoomData {
  id: string;
  name: string;
  status: string;
  visibility: string;
  host?: {
    displayName: string;
  };
  settings?: {
    teamCount: number;
    teamPurseMinor: bigint;
    format: string;
    controlMode: string;
    hostParticipates: boolean;
  };
  members?: Array<any>;
  teams?: Array<any>;
}

export default function RoomDetailPage() {
  const params = useParams();
  const roomId = params?.roomId as string;
  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingAuction, setStartingAuction] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    const fetchRoom = async () => {
      try {
        const response = await getRoomDetail(roomId);
        if (response.success && response.data) {
          setRoom(response.data);
        } else {
          setError('Could not load room details');
        }
      } catch (err) {
        setError('Failed to fetch room');
      } finally {
        setLoading(false);
      }
    };

    fetchRoom();
  }, [roomId]);

  const handleStartAuction = async () => {
    setStartingAuction(true);
    try {
      const response = await startAuction(roomId);
      if (response.success) {
        // Redirect to live auction room
        window.location.href = `/live/${roomId}`;
      } else {
        setError(response.error || 'Failed to start auction');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setStartingAuction(false);
    }
  };

  const formatPurse = (minor: bigint): string => {
    const major = Number(minor) / 100;
    if (major >= 10000000) return `${(major / 10000000).toFixed(1)} Cr`;
    if (major >= 100000) return `${(major / 100000).toFixed(0)} L`;
    return `${major.toFixed(0)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (!room || error) {
    return (
      <div>
        <section className="border-b border-border bg-surface px-4 py-12">
          <div className="mx-auto max-w-6xl">
            <PageHeader
              title="Room Details"
              breadcrumbs={[
                { label: 'Home', href: ROUTES.home },
                { label: 'Auction', href: ROUTES.auctionWorkspace },
              ]}
            />
          </div>
        </section>

        <section className="px-4 py-12">
          <div className="mx-auto max-w-6xl">
            <Card className="border-danger/20 bg-danger/5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-1 flex-shrink-0 text-danger" size={20} />
                <div>
                  <h3 className="font-semibold text-danger">Error</h3>
                  <p className="text-sm text-text-muted">{error || 'Room not found'}</p>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            title={room.name}
            description={`Status: ${room.status}`}
            breadcrumbs={[
              { label: 'Home', href: ROUTES.home },
              { label: 'Auction', href: ROUTES.auctionWorkspace },
              { label: room.name },
            ]}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-6xl space-y-8">
          {/* Room Summary */}
          <Card className="border-accent/20 bg-accent/5 p-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-text-muted mb-1">Hosted By</p>
                <p className="font-semibold">{room.host?.displayName || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1 flex items-center gap-1">
                  <Users size={14} /> Teams
                </p>
                <p className="font-semibold">{room.settings?.teamCount || 8}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1 flex items-center gap-1">
                  <Zap size={14} /> Team Purse
                </p>
                <p className="font-semibold">{formatPurse(room.settings?.teamPurseMinor || 20000000n)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Status</p>
                <Badge variant={room.status === 'LIVE' ? 'success' : 'info'}>
                  {room.status}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Configuration */}
          <Card>
            <h2 className="mb-6 text-2xl font-bold">Configuration</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-surface-raised p-4">
                <p className="text-xs text-text-muted mb-2">Format</p>
                <Badge variant="info">{room.settings?.format || 'LIVE_COUNTDOWN'}</Badge>
              </div>
              <div className="rounded-lg bg-surface-raised p-4">
                <p className="text-xs text-text-muted mb-2">Control</p>
                <Badge variant="info">{room.settings?.controlMode || 'HOST_CONTROLLED'}</Badge>
              </div>
              <div className="rounded-lg bg-surface-raised p-4">
                <p className="text-xs text-text-muted mb-2">Host Participates</p>
                <Badge variant={room.settings?.hostParticipates ? 'success' : 'warning'}>
                  {room.settings?.hostParticipates ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div className="rounded-lg bg-surface-raised p-4">
                <p className="text-xs text-text-muted mb-2">Visibility</p>
                <Badge variant={room.visibility === 'PUBLIC' ? 'success' : 'warning'}>
                  {room.visibility}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Team Allocation */}
          {room.status !== 'LIVE' && room.status !== 'COMPLETED' && (
            <TeamAllocationUI roomId={room.id} />
          )}

          {/* Members */}
          <Card>
            <h2 className="mb-6 text-2xl font-bold">Members ({room.members?.length || 0})</h2>
            {room.members && room.members.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-semibold">Email</th>
                      <th className="text-left py-3 px-4 font-semibold">Role</th>
                      <th className="text-left py-3 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {room.members.map((member: any, idx: number) => (
                      <tr key={idx} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                        <td className="py-3 px-4">{member.user?.email || 'Unknown'}</td>
                        <td className="py-3 px-4">
                          <Badge variant="info" className="text-xs">
                            {member.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={member.status === 'ACTIVE' ? 'success' : 'warning'}
                            className="text-xs"
                          >
                            {member.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-text-muted">No members yet</p>
            )}
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {room.status === 'DRAFT' && (
              <Button
                variant="primary"
                size="md"
                onClick={handleStartAuction}
                loading={startingAuction}
                disabled={startingAuction}
                className="flex-1 flex items-center justify-center gap-2"
              >
                Start Auction
              </Button>
            )}
            <Link href={ROUTES.auctionWorkspace} className="flex-1">
              <Button variant="outline" size="md" className="w-full">
                Back to Workspace
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
