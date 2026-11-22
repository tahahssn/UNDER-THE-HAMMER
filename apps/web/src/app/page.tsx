import React from 'react';
import Link from 'next/link';
import { Zap, Users, Trophy, TrendingUp } from 'lucide-react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { ROUTES } from '@/lib/constants';

const FeatureCard: React.FC<{
  icon: React.ComponentType<any>;
  title: string;
  description: string;
}> = ({ icon: Icon, title, description }) => (
  <Card className="text-center">
    <Icon size={32} className="mx-auto mb-4 text-accent" />
    <h3 className="mb-2 font-semibold text-lg">{title}</h3>
    <p className="text-sm text-text-muted">{description}</p>
  </Card>
);

export default function Home() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 py-20 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h1 className="mb-6 text-5xl font-bold leading-tight">
              The Ultimate Cricket Auction Platform
            </h1>
            <p className="mb-8 text-xl text-text-muted">
              Host or join live cricket auctions with real-time bidding, custom teams, and seamless
              player management. Experience competitive cricket like never before.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link href={ROUTES.auctionWorkspace}>
                <Button variant="primary" size="lg" className="w-full sm:w-auto">
                  Start Auction
                </Button>
              </Link>
              <Link href={ROUTES.about}>
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Learn More
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Cricket Coverage */}
      <section className="border-t border-border bg-surface px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-4xl font-bold">Live Cricket Coverage</h2>
            <p className="text-lg text-text-muted">
              Stay updated with live scores, match information, and cricket news
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={TrendingUp}
              title="Live Scores"
              description="Real-time match updates and live scoring"
            />
            <FeatureCard
              icon={Trophy}
              title="Player Stats"
              description="Comprehensive player statistics and performance"
            />
            <FeatureCard
              icon={Users}
              title="Team Directory"
              description="Browse and discover cricket teams"
            />
            <FeatureCard
              icon={Zap}
              title="Updates"
              description="Latest cricket news and headlines"
            />
          </div>
        </div>
      </section>

      {/* Latest News */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex items-center justify-between">
            <h2 className="text-4xl font-bold">Latest News</h2>
            <Link href={ROUTES.news} className="text-accent hover:underline">
              View All →
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <div className="mb-4 aspect-video rounded-lg bg-surface-raised" />
                <h3 className="mb-2 font-semibold">News Article {i}</h3>
                <p className="mb-4 text-sm text-text-muted">
                  Coming soon: Latest cricket news and updates
                </p>
                <Link href={ROUTES.news} className="text-sm font-semibold text-accent">
                  Read More →
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Auction Feature */}
      <section className="border-t border-border bg-surface px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h2 className="mb-6 text-4xl font-bold">Host or Join an Auction</h2>
            <p className="mb-8 text-lg text-text-muted">
              Take control with customizable auction formats, team allocations, and real-time bidding.
              Create your own cricket league or join existing auctions.
            </p>

            <div className="mb-8 space-y-4">
              <div className="flex gap-4">
                <Zap className="flex-shrink-0 text-accent" size={24} />
                <div>
                  <h3 className="font-semibold mb-1">Live Countdown & Turn-Based Formats</h3>
                  <p className="text-text-muted text-sm">Choose between fast-paced live bidding or strategic turn-based auctions</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Users className="flex-shrink-0 text-accent" size={24} />
                <div>
                  <h3 className="font-semibold mb-1">Create Custom Teams</h3>
                  <p className="text-text-muted text-sm">Upload logos, set colors, and manage teams your way</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Trophy className="flex-shrink-0 text-accent" size={24} />
                <div>
                  <h3 className="font-semibold mb-1">Public & Private Rooms</h3>
                  <p className="text-text-muted text-sm">Host open auctions or invite specific players with access codes</p>
                </div>
              </div>
            </div>

            <Link href={ROUTES.auctionWorkspace}>
              <Button variant="primary" size="lg">
                Go to Auction Workspace
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border px-4 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-6 text-4xl font-bold">Ready to Host Your First Auction?</h2>
          <p className="mb-8 text-lg text-text-muted">
            Sign up for a free account and start hosting auctions today
          </p>
          <div className="flex flex-col gap-4 sm:flex-row justify-center">
            <Link href={ROUTES.signUp}>
              <Button variant="primary" size="lg" className="w-full sm:w-auto">
                Get Started
              </Button>
            </Link>
            <Link href={ROUTES.about}>
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
