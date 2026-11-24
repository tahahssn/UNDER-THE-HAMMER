'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';
import TeamForm from '@/components/TeamForm';
import { getTeamById, updateTeam } from '@/lib/api';
import { TeamDetailDto } from '@/lib/types';
import { CreateTeamFormData } from '@/lib/schemas/team.schema';

interface TeamEditPageProps {
  params: {
    id: string;
  };
}

export default function TeamEditPage({ params }: TeamEditPageProps) {
  const router = useRouter();
  const [team, setTeam] = useState<TeamDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTeam = async () => {
      try {
        setIsLoading(true);
        const response = await getTeamById(params.id);
        
        if (response.success && response.data) {
          setTeam(response.data);
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

  const handleSubmit = async (data: CreateTeamFormData) => {
    try {
      setIsSaving(true);
      const response = await updateTeam(params.id, data);
      
      if (response.success) {
        router.push(`/teams/${params.id}`);
      } else {
        throw new Error(response.error || 'Failed to update team');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <div>
        <section className="border-b border-border bg-surface px-4 py-12">
          <div className="mx-auto max-w-6xl">
            <div className="h-8 w-32 animate-pulse rounded bg-surface" />
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
              title="Edit Team"
              description="Update team details"
            />
          </div>
        </section>
        <section className="px-4 py-12">
          <div className="mx-auto max-w-2xl">
            <Card className="border-error bg-error/10 p-6">
              <p className="mb-4 text-error">{error}</p>
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
            title="Edit Team"
            description={`Update details for ${team?.name}`}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-2xl">
          {team && (
            <TeamForm
              initialData={team}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isLoading={isSaving}
            />
          )}
        </div>
      </section>
    </div>
  );
}
