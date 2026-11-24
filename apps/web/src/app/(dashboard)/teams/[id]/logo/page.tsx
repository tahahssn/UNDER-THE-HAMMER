'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import FileUpload from '@/components/FileUpload';
import { getTeamById } from '@/lib/api';
import { TeamDetailDto } from '@/lib/types';

interface LogoUploadPageProps {
  params: {
    id: string;
  };
}

export default function LogoUploadPage({ params }: LogoUploadPageProps) {
  const router = useRouter();
  const [team, setTeam] = useState<TeamDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
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

  const handleUploadSuccess = (fileAssetId: string) => {
    // Redirect back to team detail after successful upload
    router.push(`/teams/${params.id}`);
  };

  const handleUploadError = (errorMessage: string) => {
    setUploadError(errorMessage);
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
              title="Upload Logo"
              description="Add or replace team logo"
            />
          </div>
        </section>
        <section className="px-4 py-12">
          <div className="mx-auto max-w-2xl">
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
          <PageHeader
            title="Upload Logo"
            description={`Upload a logo for ${team.name}`}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Upload Info */}
          <Card className="bg-background p-4">
            <h3 className="mb-2 text-sm font-medium text-text">Requirements</h3>
            <ul className="space-y-1 text-xs text-text-muted">
              <li>• Format: JPEG or PNG</li>
              <li>• Size: Up to 5 MB</li>
              <li>• Dimensions: At least 200x200 pixels</li>
              <li>• You must have permission to use the image</li>
            </ul>
          </Card>

          {/* File Upload Component */}
          <FileUpload
            kind="TEAM_LOGO"
            teamId={team.id}
            onSuccess={handleUploadSuccess}
            onError={handleUploadError}
          />

          {/* Back Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            ← Go Back
          </Button>
        </div>
      </section>
    </div>
  );
}
