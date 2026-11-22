import React from 'react';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';
import Badge from '@/components/Badge';

interface MatchCardProps {
  status: 'live' | 'upcoming' | 'completed';
  team1: string;
  team2: string;
  runs1?: number;
  runs2?: number;
  time: string;
}

const MatchCard: React.FC<MatchCardProps> = ({ status, team1, team2, runs1, runs2, time }) => {
  const statusColors = {
    live: 'danger',
    upcoming: 'info',
    completed: 'neutral',
  } as const;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <Badge variant={statusColors[status]}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
        <span className="text-xs text-text-muted">{time}</span>
      </div>

      <div className="space-y-3">
        {/* Team 1 */}
        <div className="flex items-center justify-between">
          <span className="font-semibold">{team1}</span>
          {status !== 'upcoming' && <span className="text-lg font-bold text-accent">{runs1}</span>}
        </div>

        {/* VS */}
        <div className="text-center text-xs text-text-muted">vs</div>

        {/* Team 2 */}
        <div className="flex items-center justify-between">
          <span className="font-semibold">{team2}</span>
          {status !== 'upcoming' && <span className="text-lg font-bold text-accent">{runs2}</span>}
        </div>
      </div>
    </Card>
  );
};

export default function Live() {
  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            title="Live Cricket"
            description="Live scores, upcoming matches, and completed games"
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-6xl">
          {/* Live Matches */}
          <div className="mb-12">
            <h2 className="mb-6 text-2xl font-bold">Live Now</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <MatchCard
                status="live"
                team1="Team A"
                team2="Team B"
                runs1={156}
                runs2={45}
                time="23 overs"
              />
            </div>
          </div>

          {/* Upcoming Matches */}
          <div className="mb-12">
            <h2 className="mb-6 text-2xl font-bold">Upcoming Matches</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <MatchCard
                status="upcoming"
                team1="Team C"
                team2="Team D"
                time="In 2 hours"
              />
              <MatchCard
                status="upcoming"
                team1="Team E"
                team2="Team F"
                time="Tomorrow, 7:00 PM"
              />
            </div>
          </div>

          {/* Completed Matches */}
          <div>
            <h2 className="mb-6 text-2xl font-bold">Completed Matches</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <MatchCard
                status="completed"
                team1="Team G"
                team2="Team H"
                runs1={189}
                runs2={175}
                time="2 days ago"
              />
              <MatchCard
                status="completed"
                team1="Team I"
                team2="Team J"
                runs1={142}
                runs2={165}
                time="3 days ago"
              />
            </div>
          </div>

          {/* Empty State */}
          <div className="mt-16 rounded-lg border-2 border-dashed border-border bg-surface/50 py-12 text-center">
            <h3 className="mb-2 text-lg font-semibold">Live match data coming soon</h3>
            <p className="text-text-muted">
              Real-time cricket scores will be available when live data API is integrated in Phase M
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
