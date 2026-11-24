'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import Button from '../Button';
import Card from '../Card';
import Badge from '../Badge';
import { createRoom } from '@/lib/api';
import { ROUTES } from '@/lib/constants';

// Step components
import RoomIdentityStep from './steps/RoomIdentityStep';
import VisibilityStep from './steps/VisibilityStep';
import TeamAllocationStep from './steps/TeamAllocationStep';
import AuctionControlStep from './steps/AuctionControlStep';
import AuctionFormatStep from './steps/AuctionFormatStep';
import PlayerSelectionStep from './steps/PlayerSelectionStep';
import TeamsSetupStep from './steps/TeamsSetupStep';
import PlayerCategoriesStep from './steps/PlayerCategoriesStep';
import BidBracketsStep from './steps/BidBracketsStep';
import SquadRulesStep from './steps/SquadRulesStep';
import BreakPolicyStep from './steps/BreakPolicyStep';
import HostParticipationStep from './steps/HostParticipationStep';
import PreviewStep from './steps/PreviewStep';

const STEPS = [
  { title: 'Room Identity', description: 'Name, description, and start time' },
  { title: 'Visibility', description: 'Public or private auction' },
  { title: 'Team Allocation', description: 'How teams are assigned' },
  { title: 'Auction Control', description: 'Host or system control' },
  { title: 'Format', description: 'Live countdown or turn-based' },
  { title: 'Player Selection', description: 'Manual or automatic draw' },
  { title: 'Teams', description: 'Team count and purse' },
  { title: 'Player Categories', description: 'Categories and base prices' },
  { title: 'Bid Brackets', description: 'Increment rules' },
  { title: 'Squad Rules', description: 'Squad size and composition' },
  { title: 'Break Policy', description: 'Breaks between bids' },
  { title: 'Host Participation', description: 'Can host participate?' },
  { title: 'Review', description: 'Review and create' },
];

const stepComponents = [
  RoomIdentityStep,
  VisibilityStep,
  TeamAllocationStep,
  AuctionControlStep,
  AuctionFormatStep,
  PlayerSelectionStep,
  TeamsSetupStep,
  PlayerCategoriesStep,
  BidBracketsStep,
  SquadRulesStep,
  BreakPolicyStep,
  HostParticipationStep,
  PreviewStep,
];

interface RoomWizardProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
  currentStep: number;
  onStepChange: (step: number) => void;
}

export default function RoomWizard({
  formData,
  onUpdateFormData,
  currentStep,
  onStepChange,
}: RoomWizardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<number, string>>({});

  const CurrentStepComponent = stepComponents[currentStep];

  const validateStep = useCallback((step: number): boolean => {
    const errors: Record<number, string> = {};

    switch (step) {
      case 0: // Room Identity
        if (!formData.name?.trim()) errors[step] = 'Room name is required';
        if (!formData.startDateTime) errors[step] = 'Start date and time is required';
        break;

      case 6: // Teams Setup
        if (formData.teamCount < 2 || formData.teamCount > 16) {
          errors[step] = 'Team count must be between 2 and 16';
        }
        if (!formData.teamPurse || formData.teamPurse <= 0) {
          errors[step] = 'Team purse must be greater than 0';
        }
        break;

      case 7: // Player Categories
        if (!formData.playerCategories?.length) {
          errors[step] = 'At least one player category is required';
        }
        break;

      case 9: // Squad Rules
        if (formData.squadSizeMin < 1 || formData.squadSizeMax < formData.squadSizeMin) {
          errors[step] = 'Invalid squad size configuration';
        }
        break;

      case 10: // Break Policy
        if (formData.breakAfterBidCount < 1) {
          errors[step] = 'Break interval must be at least 1';
        }
        if (formData.breakDurationSeconds < 10) {
          errors[step] = 'Break duration must be at least 10 seconds';
        }
        break;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const handleNext = useCallback(() => {
    if (validateStep(currentStep)) {
      if (currentStep < STEPS.length - 1) {
        onStepChange(currentStep + 1);
      }
    }
  }, [currentStep, validateStep, onStepChange]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      onStepChange(currentStep - 1);
    }
  }, [currentStep, onStepChange]);

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Transform form data to API format
      const payload = {
        name: formData.name,
        description: formData.description,
        status: 'DRAFT',
        visibility: formData.visibility,
        listed: formData.visibility === 'PUBLIC',
        settings: {
          teamCount: formData.teamCount,
          teamPurseMinor: formData.teamPurse,
          currency: 'PKR',
          format: formData.auctionFormat,
          controlMode: formData.auctionControl,
          playerSelectionMode: formData.playerSelection,
          hostParticipates: formData.hostParticipates,
          countdownDurationSeconds: formData.countdownDurationSeconds,
          turnDurationSeconds: formData.turnDurationSeconds,
          breakAfterBidCount: formData.breakAfterBidCount,
          breakDurationSeconds: formData.breakDurationSeconds,
          maxBreakAdjustments: formData.maxBreakAdjustments,
          bidIncrementBrackets: formData.bidBrackets,
          squadSizeMin: formData.squadSizeMin,
          squadSizeMax: formData.squadSizeMax,
          squadRules: formData.squadRules,
          teamAllocationMethod: formData.teamAllocation,
        },
      };

      const response = await createRoom(payload);

      if (response.success && response.data?.id) {
        // Redirect to room detail page
        router.push(`/auction/${response.data.id}`);
      } else {
        setError(response.error || 'Failed to create room');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the room');
    } finally {
      setLoading(false);
    }
  };

  const currentError = validationErrors[currentStep];
  const isPreviewStep = currentStep === STEPS.length - 1;

  return (
    <div>
      {/* Progress Indicator */}
      <Card className="mb-8 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">
              Step {currentStep + 1} of {STEPS.length}
            </h3>
            <p className="text-sm text-text-muted">{STEPS[currentStep].description}</p>
          </div>
          <Badge variant="info">{Math.round(((currentStep + 1) / STEPS.length) * 100)}%</Badge>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
          <motion.div
            className="h-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Step Dots */}
        <div className="mt-4 flex flex-wrap gap-2">
          {STEPS.map((step, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (idx <= currentStep) {
                  onStepChange(idx);
                }
              }}
              className={`inline-flex items-center justify-center rounded-full transition-all duration-200 ${
                idx === currentStep
                  ? 'h-8 w-8 bg-accent text-white'
                  : idx < currentStep
                    ? 'h-8 w-8 bg-success text-white'
                    : 'h-8 w-8 bg-surface-raised text-text-muted'
              }`}
              title={step.title}
              disabled={idx > currentStep}
            >
              {idx < currentStep ? (
                <CheckCircle2 size={16} />
              ) : (
                <span className="text-xs font-semibold">{idx + 1}</span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Current Step */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="mb-8 p-8">
            <h2 className="mb-6 text-2xl font-bold">{STEPS[currentStep].title}</h2>

            {currentError && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-danger/20 bg-danger/5 p-4">
                <AlertCircle className="mt-0.5 flex-shrink-0 text-danger" size={18} />
                <p className="text-sm text-danger">{currentError}</p>
              </div>
            )}

            {error && currentStep === STEPS.length - 1 && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-danger/20 bg-danger/5 p-4">
                <AlertCircle className="mt-0.5 flex-shrink-0 text-danger" size={18} />
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            {/* Step Content */}
            {CurrentStepComponent && (
              <CurrentStepComponent formData={formData} onUpdateFormData={onUpdateFormData} />
            )}
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button
          variant="outline"
          size="md"
          onClick={handlePrevious}
          disabled={currentStep === 0 || loading}
          className="flex items-center gap-2"
        >
          <ChevronLeft size={18} />
          Previous
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row">
          {!isPreviewStep && (
            <Button
              variant="outline"
              size="md"
              disabled={loading}
              className="text-text-muted hover:text-primary"
            >
              Save Draft
            </Button>
          )}
          <Button
            variant="primary"
            size="md"
            onClick={isPreviewStep ? handleSubmit : handleNext}
            loading={loading}
            disabled={loading}
            className="flex items-center gap-2"
          >
            {isPreviewStep ? (
              <>
                <CheckCircle2 size={18} />
                Create Room
              </>
            ) : (
              <>
                Next
                <ChevronRight size={18} />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
