'use client';

import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import Button from '../Button';
import Card from '../Card';
import Badge from '../Badge';
import { getRoomDetail, allocateTeam } from '@/lib/api';

interface TeamAllocationUIProps {
  roomId: string;
}

interface Team {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor?: string;
  owners?: Array<any>;
}

export default function TeamAllocationUI({ roomId }: TeamAllocationUIProps) {
  const [loading, setLoading] = useState(true);
  const [allocating, setAllocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allocatedTeam, setAllocatedTeam] = useState<Team | null>(null);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [allocationMethod, setAllocationMethod] = useState<'USER_SELECTED' | 'RANDOM' | 'CUSTOM' | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const response = await getRoomDetail(roomId);
        if (response.success && response.data) {
          const room = response.data;
          
          // Get allocation method from settings
          const method = room.settings?.teamAllocationMethod || 'USER_SELECTED';
          setAllocationMethod(method);

          // Get available teams
          const teams = room.teams || [];
          setAvailableTeams(teams);

          // Check if already allocated
          // (This would be from team owners data or members)
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

  const handleAllocateTeam = async () => {
    if (!selectedTeamId) {
      setError('Please select a team');
      return;
    }

    setAllocating(true);
    setError(null);

    try {
      const response = await allocateTeam(roomId, selectedTeamId);
      if (response.success && response.data) {
        const allocated = availableTeams.find((t) => t.id === selectedTeamId);
        setAllocatedTeam(allocated || null);
        setSelectedTeamId(null);
      } else {
        setError(response.error || 'Failed to allocate team');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setAllocating(false);
    }
  };

  const handleRandomAllocation = async () => {
    setAllocating(true);
    setError(null);

    try {
      // For random, we don't specify a team ID
      const response = await allocateTeam(roomId, '');
      if (response.success && response.data?.teamId) {
        const allocated = availableTeams.find((t) => t.id === response.data.teamId);
        setAllocatedTeam(allocated || null);
      } else {
        setError(response.error || 'Failed to allocate team');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setAllocating(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin" size={24} />
        </div>
      </Card>
    );
  }

  if (allocatedTeam) {
    return (
      <Card className="border-success/20 bg-success/5 p-6">
        <div className="flex items-start gap-4">
          <div
            className="h-12 w-12 rounded-lg flex-shrink-0"
            style={{ backgroundColor: allocatedTeam.primaryColor }}
          />
          <div className="flex-1">
            <h3 className="mb-1 flex items-center gap-2 font-bold text-lg">
              <CheckCircle2 className="text-success" size={20} />
              Team Allocated
            </h3>
            <p className="text-sm text-text-muted">
              You've been assigned to <strong>{allocatedTeam.name}</strong>
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (allocationMethod === 'CUSTOM') {
    return (
      <Card className="border-info/20 bg-info/5 p-6">
        <h3 className="mb-2 font-bold">Team Allocation</h3>
        <p className="text-sm text-text-muted">
          The host will assign your team during the registration phase. Please wait for the host to complete allocations.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-6 text-2xl font-bold">Team Allocation</h2>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-danger/20 bg-danger/5 p-4">
          <AlertCircle className="mt-0.5 flex-shrink-0 text-danger" size={18} />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {allocationMethod === 'USER_SELECTED' && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Select your team from the available options:</p>

          {/* Teams Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {availableTeams.map((team) => (
              <div
                key={team.id}
                onClick={() => setSelectedTeamId(team.id)}
                className={`cursor-pointer rounded-lg border-2 p-4 transition-all duration-200 ${
                  selectedTeamId === team.id
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className="h-8 w-8 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: team.primaryColor }}
                  />
                  <span className="font-semibold">{team.name}</span>
                </div>
                <input
                  type="radio"
                  name="team"
                  value={team.id}
                  checked={selectedTeamId === team.id}
                  onChange={() => setSelectedTeamId(team.id)}
                  className="mt-2"
                />
              </div>
            ))}
          </div>

          {/* Select Button */}
          <Button
            variant="primary"
            size="md"
            onClick={handleAllocateTeam}
            loading={allocating}
            disabled={!selectedTeamId || allocating}
            className="w-full"
          >
            Select Team
          </Button>
        </div>
      )}

      {allocationMethod === 'RANDOM' && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Your team will be randomly assigned from the available options. Click the button below to request your allocation.
          </p>

          <Button
            variant="primary"
            size="md"
            onClick={handleRandomAllocation}
            loading={allocating}
            disabled={allocating}
            className="w-full"
          >
            Request Random Allocation
          </Button>
        </div>
      )}
    </Card>
  );
}
