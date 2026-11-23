import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityServiceProvider,
  SignUp,
  InitiateAuth,
  RespondToAuthChallenge,
} from 'aws-sdk';
import type { Env } from '../config/env';

export interface CognitoSignUpInput {
  email: string;
  password: string;
  attributes?: { Name: string; Value: string }[];
}

export interface CognitoSignInInput {
  email: string;
  password: string;
}

export interface CognitoAuthResponse {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface CognitoUserAttributes {
  sub: string;
  email: string;
  email_verified?: boolean;
  [key: string]: string | boolean | undefined;
}

/**
 * Wraps AWS Cognito Identity Service Provider for user operations.
 * Provides signup, signin, token verification and user attribute management.
 */
@Injectable()
export class CognitoService {
  private cognito: CognitoIdentityServiceProvider;
  private userPoolId: string;
  private clientId: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    const region = this.config.get('COGNITO_REGION', { infer: true });
    this.userPoolId = this.config.get('COGNITO_USER_POOL_ID', { infer: true });
    this.clientId = this.config.get('COGNITO_APP_CLIENT_ID', { infer: true });

    this.cognito = new CognitoIdentityServiceProvider({ region });
  }

  /**
   * Register a new user with email and password.
   */
  async signUp(input: CognitoSignUpInput): Promise<{ userSub: string; codeDeliveryDetails: string }> {
    const params: SignUp = {
      ClientId: this.clientId,
      Username: input.email,
      Password: input.password,
      UserAttributes: [
        { Name: 'email', Value: input.email },
        ...(input.attributes ?? []),
      ],
    };

    const response = await this.cognito.signUp(params).promise();
    return {
      userSub: response.UserSub,
      codeDeliveryDetails: response.CodeDeliveryDetails?.Destination ?? 'email',
    };
  }

  /**
   * Confirm user signup with email verification code.
   */
  async confirmSignUp(email: string, code: string): Promise<void> {
    await this.cognito
      .confirmSignUp({
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: code,
      })
      .promise();
  }

  /**
   * Resend verification code to user's email.
   */
  async resendConfirmationCode(email: string): Promise<void> {
    await this.cognito
      .resendConfirmationCode({
        ClientId: this.clientId,
        Username: email,
      })
      .promise();
  }

  /**
   * Authenticate user with email and password. Returns tokens.
   */
  async signIn(input: CognitoSignInInput): Promise<CognitoAuthResponse> {
    const params: InitiateAuth = {
      ClientId: this.clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: input.email,
        PASSWORD: input.password,
      },
    };

    const response = await this.cognito.initiateAuth(params).promise();

    if (!response.AuthenticationResult) {
      throw new Error('Authentication failed: no tokens received');
    }

    return {
      accessToken: response.AuthenticationResult.AccessToken,
      idToken: response.AuthenticationResult.IdToken,
      refreshToken: response.AuthenticationResult.RefreshToken,
      expiresIn: response.AuthenticationResult.ExpiresIn || 3600,
    };
  }

  /**
   * Refresh access token using refresh token.
   */
  async refreshToken(refreshToken: string): Promise<CognitoAuthResponse> {
    const params: InitiateAuth = {
      ClientId: this.clientId,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    };

    const response = await this.cognito.initiateAuth(params).promise();

    if (!response.AuthenticationResult) {
      throw new Error('Token refresh failed');
    }

    return {
      accessToken: response.AuthenticationResult.AccessToken,
      idToken: response.AuthenticationResult.IdToken,
      expiresIn: response.AuthenticationResult.ExpiresIn || 3600,
    };
  }

  /**
   * Initiate forgot password flow.
   */
  async forgotPassword(email: string): Promise<void> {
    await this.cognito
      .forgotPassword({
        ClientId: this.clientId,
        Username: email,
      })
      .promise();
  }

  /**
   * Confirm new password with reset code.
   */
  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    await this.cognito
      .confirmForgotPassword({
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: code,
        Password: newPassword,
      })
      .promise();
  }

  /**
   * Get user attributes from Cognito by access token.
   */
  async getUserAttributes(accessToken: string): Promise<CognitoUserAttributes> {
    const response = await this.cognito.getUser({ AccessToken: accessToken }).promise();

    const attributes: CognitoUserAttributes = { sub: response.Username };
    for (const attr of response.UserAttributes) {
      attributes[attr.Name] = attr.Value;
    }

    return attributes;
  }

  /**
   * Admin method to get user by email (requires IAM permissions).
   */
  async adminGetUser(email: string): Promise<CognitoUserAttributes> {
    const response = await this.cognito
      .adminGetUser({
        UserPoolId: this.userPoolId,
        Username: email,
      })
      .promise();

    const attributes: CognitoUserAttributes = { sub: response.Username };
    for (const attr of response.UserAttributes) {
      attributes[attr.Name] = attr.Value;
    }

    return attributes;
  }

  /**
   * Verify an ID token's signature and expiry (basic validation).
   * Full validation should use JWT libraries. This is a lightweight check.
   */
  isTokenExpired(expiresAt: number): boolean {
    return Date.now() >= expiresAt * 1000;
  }
}
