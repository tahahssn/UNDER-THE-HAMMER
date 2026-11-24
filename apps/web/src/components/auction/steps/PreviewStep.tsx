'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import Card from '../../Card';
import Badge from '../../Badge';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function PreviewStep({ formData }: StepProps) {
  const formatCurrency = (minor: number): string => {
    const major = minor / 100;
    return `PKR ${major.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'Not set';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const categories = formData.playerCategories || [];
  const brackets = formData.bidBrackets || [];

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Review your auction configuration before creating the room.
      </p>

      {/* Basic Information */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 font-bold text-lg">
          <CheckCircle2 size={20} className="text-success" />
          Basic Information
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-text-muted mb-1">Room Name</p>
            <p className="font-semibold">{formData.name || 'Not set'}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Start Date & Time</p>
            <p className="font-semibold">{formatDate(formData.startDateTime)}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs text-text-muted mb-1">Description</p>
            <p className="font-semibold">{formData.description || 'No description'}</p>
          </div>
        </div>
      </Card>

      {/* Configuration */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 font-bold text-lg">
          <CheckCircle2 size={20} className="text-success" />
          Auction Configuration
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-text-muted mb-1">Visibility</p>
            <Badge variant={formData.visibility === 'PUBLIC' ? 'success' : 'info'}>
              {formData.visibility}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Team Allocation</p>
            <Badge variant="info">{formData.teamAllocation}</Badge>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Auction Control</p>
            <Badge variant="info">{formData.auctionControl}</Badge>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Format</p>
            <Badge variant="info">{formData.auctionFormat}</Badge>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Player Selection</p>
            <Badge variant="info">{formData.playerSelection}</Badge>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Host Participates</p>
            <Badge variant={formData.hostParticipates ? 'success' : 'warning'}>
              {formData.hostParticipates ? 'Yes' : 'No'}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Teams & Purse */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 font-bold text-lg">
          <CheckCircle2 size={20} className="text-success" />
          Teams & Purse
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-text-muted mb-1">Number of Teams</p>
            <p className="font-semibold text-lg">{formData.teamCount || 8}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Team Purse</p>
            <p className="font-semibold text-lg">{formatCurrency(formData.teamPurse || 20000000)}</p>
          </div>
        </div>
      </Card>

      {/* Player Categories */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 font-bold text-lg">
          <CheckCircle2 size={20} className="text-success" />
          Player Categories ({categories.length})
        </h3>
        <div className="space-y-2">
          {categories.map((cat: any, idx: number) => (
            <div key={cat.id} className="flex justify-between items-center border-b border-border pb-2 last:border-b-0">
              <span className="text-sm">{cat.name || 'Unnamed'}</span>
              <span className="text-sm font-semibold text-accent">{formatCurrency(cat.basePrice || 0)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Squad Rules */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 font-bold text-lg">
          <CheckCircle2 size={20} className="text-success" />
          Squad Rules
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-text-muted mb-1">Minimum Squad Size</p>
            <p className="font-semibold text-lg">{formData.squadSizeMin || 11}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Maximum Squad Size</p>
            <p className="font-semibold text-lg">{formData.squadSizeMax || 15}</p>
          </div>
        </div>
      </Card>

      {/* Break Policy */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 font-bold text-lg">
          <CheckCircle2 size={20} className="text-success" />
          Break Policy
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-text-muted mb-1">Break After</p>
            <p className="font-semibold">
              Every {formData.breakAfterBidCount || 5} accepted bids
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Break Duration</p>
            <p className="font-semibold">
              {formData.breakDurationSeconds
                ? `${Math.floor((formData.breakDurationSeconds || 120) / 60)}m ${(formData.breakDurationSeconds || 120) % 60}s`
                : '2m'}
            </p>
          </div>
        </div>
      </Card>

      {/* Bid Brackets Summary */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 font-bold text-lg">
          <CheckCircle2 size={20} className="text-success" />
          Bid Increments ({brackets.length} brackets)
        </h3>
        <div className="space-y-2 text-xs">
          {brackets.map((bracket: any, idx: number) => (
            <div key={idx} className="flex justify-between items-center border-b border-border pb-2 last:border-b-0">
              <span>
                {Math.round((bracket.fromMinor || 0) / 10000000)} Cr{' '}
                {bracket.toMinor === Number.MAX_SAFE_INTEGER ? '→' : `→ ${Math.round((bracket.toMinor || 0) / 10000000)} Cr`}
              </span>
              <span className="font-semibold text-accent">
                +{Math.round((bracket.incrementMinor || 0) / 100000)} L
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Ready to Create */}
      <Card className="border-success/20 bg-success/5 p-6 text-center">
        <h3 className="mb-2 flex items-center justify-center gap-2 font-bold text-lg text-success">
          <CheckCircle2 size={24} />
          All Set!
        </h3>
        <p className="text-sm text-text-muted">
          Your auction room is ready to be created. Click "Create Room" to proceed.
        </p>
      </Card>
    </div>
  );
}
