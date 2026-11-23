import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../config/env';

export interface JwtPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  token_use: string;
}

/**
 * Passport strategy for JWT tokens from AWS Cognito.
 * Validates token signature and expiry automatically.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly config: ConfigService<Env, true>) {
    const region = config.get('COGNITO_REGION', { infer: true });
    const userPoolId = config.get('COGNITO_USER_POOL_ID', { infer: true });

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: config.get('COGNITO_APP_CLIENT_ID', { infer: true }),
      issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
      algorithms: ['RS256'],
      passReqToCallback: false,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    // Token is already validated by Passport (signature, expiry, audience, issuer).
    // We just return the payload to attach to the request.
    return payload;
  }
}
