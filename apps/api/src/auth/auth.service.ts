import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CognitoService, type CognitoSignUpInput, type CognitoSignInInput } from './cognito.service';

export interface SignUpInput {
  email: string;
  password: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

/**
 * Orchestrates user authentication against Cognito and internal user management.
 * Bridges between Cognito (identity provider) and the User table (internal identity).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly cognito: CognitoService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Register a new user.
   * 1. Create Cognito user
   * 2. Create internal User record (initially unverified)
   * 3. Link Cognito subject to UserIdentity
   */
  async signUp(input: SignUpInput): Promise<{ userSub: string }> {
    // Try to create in Cognito first
    let cognitoUser: { userSub: string };
    try {
      cognitoUser = await this.cognito.signUp({
        email: input.email,
        password: input.password,
        attributes: [{ Name: 'email_verified', Value: 'false' }],
      } as CognitoSignUpInput);
    } catch (err) {
      // Handle Cognito errors
      if (err instanceof Error && err.message.includes('UsernameExistsException')) {
        throw new ConflictException('Email already registered');
      }
      if (err instanceof Error && err.message.includes('InvalidPasswordException')) {
        throw new BadRequestException('Password does not meet requirements');
      }
      throw err;
    }

    // Create internal User record
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          status: 'PENDING_VERIFICATION',
          identities: {
            create: {
              provider: 'COGNITO_PASSWORD',
              subject: cognitoUser.userSub,
            },
          },
        },
      });

      return { userSub: cognitoUser.userSub };
    } catch (err) {
      // If database creation fails, the Cognito user is left orphaned.
      // A cleanup job or manual intervention is needed.
      // For now, re-throw to signal the error.
      throw new Error(`Cognito user created (${cognitoUser.userSub}) but database creation failed`);
    }
  }

  /**
   * Confirm email signup with verification code.
   * Update User status to ACTIVE.
   */
  async confirmSignUp(email: string, code: string): Promise<void> {
    // Confirm in Cognito
    try {
      await this.cognito.confirmSignUp(email, code);
    } catch (err) {
      if (err instanceof Error && err.message.includes('ExpiredCodeException')) {
        throw new BadRequestException('Verification code expired');
      }
      if (err instanceof Error && err.message.includes('CodeMismatchException')) {
        throw new BadRequestException('Invalid verification code');
      }
      throw err;
    }

    // Update internal User status
    await this.prisma.user.updateMany({
      where: { email },
      data: {
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
  }

  /**
   * Resend verification code to email.
   */
  async resendConfirmationCode(email: string): Promise<void> {
    // Verify user exists in internal database
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new BadRequestException('Email not found');
    }

    await this.cognito.resendConfirmationCode(email);
  }

  /**
   * Sign in with email and password.
   * 1. Authenticate against Cognito
   * 2. Verify internal User exists and is ACTIVE
   * 3. Return tokens
   */
  async signIn(input: SignInInput): Promise<{ accessToken: string; idToken: string; refreshToken?: string; expiresIn: number }> {
    // Verify internal User exists and is not suspended/banned
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}. Contact support.`);
    }

    // Authenticate against Cognito
    let tokens;
    try {
      tokens = await this.cognito.signIn(input as CognitoSignInInput);
    } catch (err) {
      if (err instanceof Error && err.message.includes('UserNotConfirmedException')) {
        throw new UnauthorizedException('Email not verified. Check your inbox for confirmation code.');
      }
      if (err instanceof Error && err.message.includes('NotAuthorizedException')) {
        throw new UnauthorizedException('Invalid email or password');
      }
      if (err instanceof Error && err.message.includes('UserNotFoundException')) {
        throw new UnauthorizedException('Invalid email or password');
      }
      throw err;
    }

    return tokens;
  }

  /**
   * Refresh access token using refresh token.
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; idToken: string; expiresIn: number }> {
    return this.cognito.refreshToken(refreshToken);
  }

  /**
   * Initiate forgot password flow.
   */
  async forgotPassword(email: string): Promise<void> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal whether email exists for security
      return;
    }

    await this.cognito.forgotPassword(email);
  }

  /**
   * Confirm new password with reset code.
   */
  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    try {
      await this.cognito.confirmForgotPassword(email, code, newPassword);
    } catch (err) {
      if (err instanceof Error && err.message.includes('ExpiredCodeException')) {
        throw new BadRequestException('Reset code expired');
      }
      if (err instanceof Error && err.message.includes('CodeMismatchException')) {
        throw new BadRequestException('Invalid reset code');
      }
      throw err;
    }
  }
}
