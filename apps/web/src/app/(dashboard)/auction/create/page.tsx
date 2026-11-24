'use client';

import React, { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { ROUTES } from '@/lib/constants';
import RoomWizard from '@/components/auction/RoomWizard';

export default function CreateAuctionPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<any>({
    // Step 1: Room Identity
    name: '',
    description: '',
    startDateTime: new Date().toISOString().slice(0, 16),

    // Step 2: Visibility
    visibility: 'PUBLIC',

    // Step 3: Team Allocation
    teamAllocation: 'USER_SELECTED',

    // Step 4: Auction Control
    auctionControl: 'HOST_CONTROLLED',

    // Step 5: Auction Format
    auctionFormat: 'LIVE_COUNTDOWN',

    // Step 6: Player Selection
    playerSelection: 'MANUAL',

    // Step 7: Teams Setup
    teamCount: 8,
    teamPurse: 20000000, // Minor units
    teamColors: Array(16)
      .fill(null)
      .map((_, i) => ({
        primary: '#0066CC',
        secondary: '#00AA00',
      })),

    // Step 8: Player Categories
    playerCategories: [
      { id: 'CAT_01', name: 'Elite', basePrice: 10000000 },
      { id: 'CAT_02', name: 'Premium', basePrice: 5000000 },
      { id: 'CAT_03', name: 'Standard', basePrice: 2000000 },
      { id: 'CAT_04', name: 'Basic', basePrice: 500000 },
    ],

    // Step 9: Bid Brackets
    bidBrackets: [
      { fromMinor: 0, toMinor: 100000000, incrementMinor: 1000000 }, // 0 to 1cr: +10L
      { fromMinor: 100000000, toMinor: 220000000, incrementMinor: 1500000 }, // 1cr to 2.2cr: +15L
      { fromMinor: 220000000, toMinor: 400000000, incrementMinor: 2000000 }, // 2.2cr to 4cr: +20L
      { fromMinor: 400000000, toMinor: Number.MAX_SAFE_INTEGER, incrementMinor: 2500000 }, // >4cr: +25L
    ],

    // Step 10: Squad Rules
    squadSizeMin: 11,
    squadSizeMax: 15,
    squadRules: [],

    // Step 11: Break Policy
    breakAfterBidCount: 5,
    breakDurationSeconds: 120,

    // Step 12: Host Participation
    hostParticipates: false,

    // Additional settings
    countdownDurationSeconds: 30,
    turnDurationSeconds: 60,
    maxBreakAdjustments: 2,
  });

  const updateFormData = useCallback((updates: any) => {
    setFormData((prev: any) => ({ ...prev, ...updates }));
  }, []);

  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            title="Create Auction Room"
            description="Set up your cricket auction with custom configurations"
            breadcrumbs={[
              { label: 'Home', href: ROUTES.home },
              { label: 'Auction', href: ROUTES.auctionWorkspace },
              { label: 'Create' },
            ]}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <RoomWizard
            formData={formData}
            onUpdateFormData={updateFormData}
            currentStep={currentStep}
            onStepChange={setCurrentStep}
          />
        </div>
      </section>
    </div>
  );
}
