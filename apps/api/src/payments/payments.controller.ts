import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  VERSION_NEUTRAL,
  Logger,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiResponse } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SafepayService } from './safepay.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import type { JwtPayload } from '../auth/jwt.strategy';
import type { Request } from 'express';

/**
 * PaymentsController
 *
 * Handles payment checkout and webhook endpoints.
 * - POST /v1/subscriptions/checkout/:planId: Authenticated checkout (requires JWT)
 * - POST /v1/payments/webhook/safepay: Webhook reception (signature verified, no JWT)
 *
 * Authorization:
 * - Checkout: JwtGuard ensures authenticated user
 * - Webhook: Signature verification via SafepayService (signature must match webhook secret)
 *
 * Error semantics:
 * - 400: Invalid planId (not found or inactive)
 * - 401: Invalid webhook signature
 * - 402: Payment required (insufficient funds) — handled by SafePay
 * - 503: SafePay service unavailable
 * - 202: Webhook accepted but not yet processed (retriable conditions)
 */
@ApiTags('payments')
@Controller({ path: '', version: VERSION_NEUTRAL })
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly safepayService: SafepayService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}

  /**
   * POST /v1/subscriptions/checkout/:planId
   * Create a checkout session for subscription payment.
   *
   * - Requires: Valid JWT (authenticated user)
   * - Returns: { paymentId, checkoutUrl, sessionId }
   * - 400: Invalid planId
   * - 503: SafePay API unavailable
   * - Idempotency: Requests with same idempotencyKey return same checkout URL
   */
  @Post('v1/subscriptions/checkout/:planId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: 'Checkout session created',
    schema: {
      properties: {
        paymentId: { type: 'string', format: 'uuid' },
        checkoutUrl: { type: 'string', format: 'url' },
        sessionId: { type: 'string' },
      },
    },
  })
  async createCheckoutSession(
    @Param('planId') planId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.logger.log(`Checkout requested for plan ${planId} by user ${user.sub}`);

    // 1. Validate plan exists and is active
    const plan = await this.subscriptionsRepository.getPlanById(planId);
    if (!plan || !plan.active) {
      this.logger.warn(`Plan not found or inactive: ${planId}`);
      throw new BadRequestException('Subscription plan not found or inactive');
    }

    // 2. Call SafepayService to create checkout session
    // SafepayService handles idempotency internally
    try {
      const response = await this.safepayService.createCheckoutSession(
        user.sub,
        planId,
        plan.priceMinor,
        plan.name,
        plan.currency,
        'safepay', // providerConfigId
        undefined, // idempotencyKey — SafepayService will generate one
      );

      this.logger.log(
        `Checkout session created for user ${user.sub}: ${response.paymentId}`,
      );

      return {
        paymentId: response.paymentId,
        checkoutUrl: response.checkoutUrl,
        sessionId: response.sessionId,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(
        `SafePay API error during checkout for user ${user.sub}:`,
        error,
      );
      throw new BadRequestException('Failed to create checkout session');
    }
  }

  /**
   * POST /v1/payments/webhook/safepay
   * Receive and process SafePay webhook events.
   *
   * - No authentication (signature verification instead)
   * - Returns: 202 Accepted on success or retriable error
   * - 401: Invalid webhook signature
   * - 202: Processing error (SafePay will retry)
   *
   * Webhook signature verification:
   * - SafePay sends X-Safepay-Signature header containing HMAC-SHA256(payload, secret)
   * - Controller extracts signature from header and passes to service
   *
   * Replay detection:
   * - SafePay events include unique providerEventId
   * - Duplicate events are detected via unique constraint in DB
   * - Subsequent payloads for same providerEventId return 202 immediately
   */
  @Post('v1/payments/webhook/safepay')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse({
    status: 202,
    description: 'Webhook accepted for processing',
    schema: {
      properties: {
        acknowledged: { type: 'boolean' },
      },
    },
  })
  async receiveWebhook(
    @Req() request: RawBodyRequest<Request>,
  ) {
    // 1. Extract signature from header
    const signature = request.get('x-safepay-signature');
    if (!signature) {
      this.logger.warn('Webhook received without signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    // 2. Get raw body (required for HMAC verification)
    // Note: NestJS provides raw body via request.rawBody after RawBodyMiddleware
    let payload: Record<string, any>;
    try {
      if (typeof request.body === 'string') {
        payload = JSON.parse(request.body);
      } else {
        payload = request.body;
      }
    } catch (error) {
      this.logger.error('Failed to parse webhook payload', error);
      throw new BadRequestException('Invalid JSON payload');
    }

    this.logger.debug(`Webhook event received: ${payload.id} (${payload.type})`);

    // 3. Process webhook (SafepayService handles signature verification)
    try {
      await this.safepayService.processWebhook(
        payload,
        signature,
        'safepay', // providerConfigId
      );

      this.logger.log(`Webhook processed successfully: ${payload.id}`);

      return { acknowledged: true };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        // Signature invalid: return 401
        this.logger.warn(`Invalid webhook signature for event ${payload.id}`);
        throw error;
      }

      // Any other error: return 202 so SafePay retries
      this.logger.error(`Error processing webhook ${payload.id}:`, error);
      return { acknowledged: false, error: String(error) };
    }
  }
}
