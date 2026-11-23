import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  Request,
  Get,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import type { JwtPayload } from './jwt.strategy';

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
type SignUpDto = z.infer<typeof signUpSchema>;

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type SignInDto = z.infer<typeof signInSchema>;

const confirmSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1).max(10),
});
type ConfirmDto = z.infer<typeof confirmSchema>;

const resetSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1).max(10),
  newPassword: z.string().min(8).max(128),
});
type ResetDto = z.infer<typeof resetSchema>;

const resendSchema = z.object({
  email: z.string().email(),
});
type ResendDto = z.infer<typeof resendSchema>;

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
type RefreshDto = z.infer<typeof refreshSchema>;

@ApiTags('auth')
@Controller({ path: 'auth', version: VERSION_NEUTRAL })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Register a new user with email and password.
   * User must confirm email via code before signing in.
   */
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signUp(
    @Body(new ZodValidationPipe(signUpSchema)) dto: SignUpDto,
  ): Promise<{ message: string; userSub: string }> {
    const result = await this.auth.signUp(dto);
    return {
      message: 'Verification code sent to email. Confirm within 24 hours.',
      userSub: result.userSub,
    };
  }

  /**
   * Confirm email signup with verification code.
   */
  @Post('confirm-signup')
  @HttpCode(HttpStatus.OK)
  async confirmSignUp(
    @Body(new ZodValidationPipe(confirmSchema)) dto: ConfirmDto,
  ): Promise<{ message: string }> {
    await this.auth.confirmSignUp(dto.email, dto.code);
    return { message: 'Email confirmed. You can now sign in.' };
  }

  /**
   * Resend verification code to email.
   */
  @Post('resend-code')
  @HttpCode(HttpStatus.OK)
  async resendCode(@Body(new ZodValidationPipe(resendSchema)) dto: ResendDto): Promise<{ message: string }> {
    await this.auth.resendConfirmationCode(dto.email);
    return { message: 'Verification code resent to email.' };
  }

  /**
   * Sign in with email and password. Returns access, ID and refresh tokens.
   */
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body(new ZodValidationPipe(signInSchema)) dto: SignInDto,
  ): Promise<{ accessToken: string; idToken: string; refreshToken?: string; expiresIn: number }> {
    return this.auth.signIn(dto);
  }

  /**
   * Refresh access token using refresh token.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
  ): Promise<{ accessToken: string; idToken: string; expiresIn: number }> {
    return this.auth.refreshToken(dto.refreshToken);
  }

  /**
   * Initiate forgot password flow. Code sent to email.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body(new ZodValidationPipe(resendSchema)) dto: ResendDto): Promise<{ message: string }> {
    await this.auth.forgotPassword(dto.email);
    return { message: 'Reset code sent to email.' };
  }

  /**
   * Confirm new password with reset code.
   */
  @Post('confirm-password')
  @HttpCode(HttpStatus.OK)
  async confirmPassword(
    @Body(new ZodValidationPipe(resetSchema)) dto: ResetDto,
  ): Promise<{ message: string }> {
    await this.auth.confirmForgotPassword(dto.email, dto.code, dto.newPassword);
    return { message: 'Password reset successful. Sign in with your new password.' };
  }

  /**
   * Verify current JWT and return user claims.
   * Requires Authorization: Bearer <idToken>
   */
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  me(@Request() req: { user: JwtPayload }): { user: JwtPayload } {
    return { user: req.user };
  }
}
