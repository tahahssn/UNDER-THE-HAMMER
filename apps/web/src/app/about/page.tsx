import React from 'react';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';

export default function About() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b border-border bg-surface px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            title="About Under The Hammer"
            description="Cricket information and multiplayer auction platform"
          />
        </div>
      </section>

      {/* Mission */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-3xl font-bold">Our Mission</h2>
          <p className="mb-4 text-lg text-text-muted">
            Under The Hammer is building the most comprehensive and engaging cricket information
            and auction platform. We believe that cricket fans deserve a space to connect, compete,
            and create their own cricket experiences.
          </p>
          <p className="text-lg text-text-muted">
            Our platform combines real-time cricket data with interactive auction experiences,
            making it possible for anyone to host or join live cricket auctions.
          </p>
        </div>
      </section>

      {/* Cricket Coverage */}
      <section className="border-t border-border bg-surface px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-3xl font-bold">Cricket Coverage</h2>
          <p className="mb-6 text-lg text-text-muted">
            We provide comprehensive cricket information and live updates covering:
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h3 className="mb-3 font-semibold">International Matches</h3>
              <p className="text-sm text-text-muted">
                Live scores and updates from Test, ODI, and T20 international cricket
              </p>
            </Card>
            <Card>
              <h3 className="mb-3 font-semibold">League Cricket</h3>
              <p className="text-sm text-text-muted">
                Coverage of major T20 leagues including PSL, IPL, and international franchise leagues
              </p>
            </Card>
            <Card>
              <h3 className="mb-3 font-semibold">Player Statistics</h3>
              <p className="text-sm text-text-muted">
                Detailed player profiles, career statistics, and performance metrics
              </p>
            </Card>
            <Card>
              <h3 className="mb-3 font-semibold">Cricket News</h3>
              <p className="text-sm text-text-muted">
                Latest news, analysis, and commentary from the cricket world
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Auction Platform */}
      <section className="border-t border-border px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-3xl font-bold">The Auction Platform</h2>
          <p className="mb-6 text-lg text-text-muted">
            Our auction platform enables:
          </p>
          <ul className="space-y-4 text-lg text-text-muted">
            <li className="flex gap-3">
              <span className="text-accent">✓</span>
              <span>Host or join live cricket auctions with configurable formats</span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent">✓</span>
              <span>Create custom teams with logos and colors</span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent">✓</span>
              <span>Public auctions for community participation</span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent">✓</span>
              <span>Private auctions with access codes for friends and organizations</span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent">✓</span>
              <span>Real-time bidding with customizable bid increments</span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent">✓</span>
              <span>Squad management and roster viewing</span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent">✓</span>
              <span>Spectator access for tournament viewers</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Hosting & Subscriptions */}
      <section className="border-t border-border bg-surface px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-3xl font-bold">Hosting an Auction</h2>
          <p className="mb-6 text-lg text-text-muted">
            Hosting an auction requires an active subscription. We offer flexible subscription plans
            to suit individual enthusiasts and organizations. Participation in public auctions is free.
          </p>
          <Card className="border-accent/20 bg-accent/5">
            <h3 className="mb-3 font-semibold text-accent">Important</h3>
            <p className="text-sm text-text-muted">
              Under The Hammer is an independent platform and is not officially affiliated with PSL,
              IPL, or any other professional cricket league. Teams are user-created and customizable.
            </p>
          </Card>
        </div>
      </section>

      {/* Team & Credentials */}
      <section className="border-t border-border px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-3xl font-bold">About Our Team</h2>
          <p className="mb-6 text-lg text-text-muted">
            Under The Hammer is built by cricket enthusiasts who believe in creating engaging,
            transparent, and fair platforms for the cricket community.
          </p>
          <div className="mb-6 p-4 border border-border rounded-lg bg-surface">
            <p className="text-sm text-text-muted">
              <strong>Data Attribution:</strong> All cricket data, news, and statistics are sourced
              from licensed providers and are presented in accordance with applicable terms and
              conditions. We provide proper attribution for all external content.
            </p>
          </div>
          <div className="p-4 border border-border rounded-lg bg-surface">
            <p className="text-sm text-text-muted">
              <strong>Non-Affiliation:</strong> Under The Hammer is not endorsed by or affiliated with
              any professional cricket league, team, or player. We respect all intellectual property
              rights and operate in compliance with applicable regulations.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
