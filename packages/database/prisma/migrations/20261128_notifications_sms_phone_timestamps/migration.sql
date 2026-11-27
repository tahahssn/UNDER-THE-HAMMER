-- Add SMS to NotificationChannel enum
ALTER TYPE "NotificationChannel" ADD VALUE 'SMS';

-- Add phoneNumber to UserProfile table with index
ALTER TABLE "UserProfile" ADD COLUMN "phoneNumber" TEXT;
CREATE INDEX "UserProfile_phoneNumber_idx" ON "UserProfile"("phoneNumber");

-- Add createdAt and updatedAt to NotificationDelivery
ALTER TABLE "NotificationDelivery" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "NotificationDelivery" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create index for retry queries: (status, updatedAt)
CREATE INDEX "NotificationDelivery_status_updatedAt_idx" ON "NotificationDelivery"("status", "updatedAt");
