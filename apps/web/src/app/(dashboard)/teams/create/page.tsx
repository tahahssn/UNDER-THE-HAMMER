'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import TeamForm from '@/components/TeamForm';
import { createTeam } from '@/lib/api';
import { CreateTeamFormData } from '@/lib/schemas/team.schema';

export default function CreateTeamPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: CreateTeamFormData) => {
    try {
      setIsLoading(true);
      const response = await createTeam(data);
      
      if (response.success && response.data?.id) {
        router.push(`/teams/${response.data.id}`);
      } else {
        throw new Error(response.error || 'Failed to create team');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            title="Create Team"
            description="Set up a new cricket team"
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <TeamForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={isLoading}
          />
        </div>
      </section>
    </div>
  );
}
