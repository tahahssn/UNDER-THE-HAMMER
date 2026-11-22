import React from 'react';
import Link from 'next/link';
import { Zap, Users, Lock, Eye, Trophy, TrendingUp } from 'lucide-react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { ROUTES } from '@/lib/constants';

const FeatureCard: React.FC<{
  icon: React.ComponentType<any>;
  title: string;
  description: string;
}> = ({ icon: Icon, title, description }) => (
  <Card>
    <Icon size={32} className="mb-4 text-accent" />
    <h3 className="mb-2 font-semibold">{title}</h3>
    <p className="text-sm text-text-muted">{description}</p>
  </Card>
);

export default function AuctionMarketing() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 py-20 lg:py-32 border-b border-border">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <h1 className="mb-6 text-5xl font-bold leading-tight">
              Host or Join Live Cricket Auctions
            </h1>
            <p className="mb-8 text-xl text-text-muted">
              Take control of your cricket league. Configure formats, manage teams, and experience
              real-time bidding with customizable auction settings.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link href={ROUTES.auctionWorkspace}>
                <Button variant="primary" size="lg">
                  Enter Auction Workspace
                </Button>
              </Link>
              <Link href={ROUTES.about}>
                <Button variant="outline" size="lg">
                  Learn More
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="bg-surface px-4 py-20 border-b border-border">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-4xl font-bold">Flexible Auction Formats</h2>
            <p className="text-lg text-text-muted">
              Customize every aspect of your auction experience
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Zap}
              title="Live Countdown"
              description="Fast-paced real-time bidding with configurable countdown timers"
            />
            <FeatureCard
              icon={Users}
              title="Turn-Based"
              description="Strategic auction format where teams bid in turns"
            />
            <FeatureCard
              icon={Trophy}
              title="Host Control"
              description="Host manages the auction flow, timers, and player queue"
            />
            <FeatureCard
              icon={Lock}
              title="Automatic Control"
              description="System automatically progresses through players and rounds"
            />
            <FeatureCard
              icon={Eye}
              title="Spectator Mode"
              description="Allow viewers to watch auctions in real-time"
            />
            <FeatureCard
              icon={TrendingUp}
              title="Real-Time Updates"
              description="Live bid tracking and squad management during auctions"
            />
          </div>
        </div>
      </section>

      {/* Team Management */}
      <section className="px-4 py-20 border-b border-border">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-6 text-3xl font-bold">Team Creation & Management</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-4 text-xl font-semibold">Custom Teams</h3>
              <ul className="space-y-3 text-text-muted">
                <li className="flex gap-3">
                  <span className="text-accent">✓</span>
                  <span>Create teams with custom names and identities</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-accent">✓</span>
                  <span>Upload team logos and set brand colors</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-accent">✓</span>
                  <span>Manage team rosters and squad composition</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-accent">✓</span>
                  <span>Track team purse and budget allocation</span>
                </li>
              </ul>
            </div>
            <Card className="border-accent/20 bg-accent/5">
              <p className="text-sm text-text-muted">
                <strong>Your Teams:</strong> Create and manage unlimited teams. Each team
                can participate in multiple auctions with custom rosters and budgets.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Room Types */}
      <section className="bg-surface px-4 py-20 border-b border-border">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-6 text-3xl font-bold">Public & Private Auctions</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <h3 className="mb-4 font-semibold text-lg flex items-center gap-2">
                <Eye size={20} className="text-accent" />
                Public Auctions
              </h3>
              <ul className="space-y-2 text-sm text-text-muted">
                <li>✓ Open to all users</li>
                <li>✓ Browse and join available auctions</li>
                <li>✓ Build your league community</li>
                <li>✓ Discover new players and formats</li>
              </ul>
            </Card>
            <Card>
              <h3 className="mb-4 font-semibold text-lg flex items-center gap-2">
                <Lock size={20} className="text-accent" />
                Private Auctions
              </h3>
              <ul className="space-y-2 text-sm text-text-muted">
                <li>✓ Invite-only with access codes</li>
                <li>✓ Host specific groups or friends</li>
                <li>✓ Corporate or organization events</li>
                <li>✓ Full control over participants</li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* Hosting Requirements */}
      <section className="px-4 py-20 border-b border-border">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-6 text-3xl font-bold">Host Requirements</h2>
          <Card className="border-warning/20 bg-warning/5 mb-6">
            <p className="text-text-muted">
              <strong className="text-warning">Subscription Required:</strong> Hosting an auction requires
              an active subscription. Subscriptions are monthly or annual, with flexible plans for different
              hosting needs. Participation in public auctions remains free.
            </p>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-4 font-semibold">What&apos;s Included</h3>
              <ul className="space-y-2 text-text-muted text-sm">
                <li>✓ Unlimited auction hosting</li>
                <li>✓ Custom team creation</li>
                <li>✓ Real-time bidding management</li>
                <li>✓ Spectator access control</li>
                <li>✓ Squad management tools</li>
                <li>✓ Auction history and analytics</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 font-semibold">Player Participation</h3>
              <ul className="space-y-2 text-text-muted text-sm">
                <li>✓ Free to join public auctions</li>
                <li>✓ Create unlimited teams</li>
                <li>✓ Manage personal squads</li>
                <li>✓ View auction history</li>
                <li>✓ Spectate any public auction</li>
                <li>✓ Participate with invitation codes</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Auction Configuration */}
      <section className="bg-surface px-4 py-20 border-b border-border">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-6 text-3xl font-bold">Customize Your Auction</h2>
          <p className="mb-8 text-lg text-text-muted">
            Configure these settings for complete control over your auction:
          </p>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <h3 className="mb-3 font-semibold">Team Setup</h3>
              <ul className="space-y-2 text-xs text-text-muted">
                <li>• Number of teams</li>
                <li>• Team purse / budget</li>
                <li>• Team allocation mode</li>
                <li>• Logo & color settings</li>
              </ul>
            </Card>
            <Card>
              <h3 className="mb-3 font-semibold">Bidding Rules</h3>
              <ul className="space-y-2 text-xs text-text-muted">
                <li>• Bid increment brackets</li>
                <li>• Minimum bid amounts</li>
                <li>• Reserve prices</li>
                <li>• Unsold handling</li>
              </ul>
            </Card>
            <Card>
              <h3 className="mb-3 font-semibold">Timing</h3>
              <ul className="space-y-2 text-xs text-text-muted">
                <li>• Countdown duration</li>
                <li>• Break intervals</li>
                <li>• Round durations</li>
                <li>• Adjustment limits</li>
              </ul>
            </Card>
            <Card>
              <h3 className="mb-3 font-semibold">Player Selection</h3>
              <ul className="space-y-2 text-xs text-text-muted">
                <li>• Manual selection</li>
                <li>• Automatic draw pool</li>
                <li>• Category pricing</li>
                <li>• Round structure</li>
              </ul>
            </Card>
            <Card>
              <h3 className="mb-3 font-semibold">Squad Requirements</h3>
              <ul className="space-y-2 text-xs text-text-muted">
                <li>• Squad size limits</li>
                <li>• Role composition</li>
                <li>• Min/max per category</li>
                <li>• Over limit penalties</li>
              </ul>
            </Card>
            <Card>
              <h3 className="mb-3 font-semibold">Access & Visibility</h3>
              <ul className="space-y-2 text-xs text-text-muted">
                <li>• Public or private</li>
                <li>• Access codes</li>
                <li>• Spectator permissions</li>
                <li>• Chat settings</li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-6 text-4xl font-bold">Ready to Host Your Auction?</h2>
          <p className="mb-8 text-lg text-text-muted">
            Sign in or create an account to get started
          </p>
          <Link href={ROUTES.auctionWorkspace}>
            <Button variant="primary" size="lg">
              Go to Auction Workspace
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
