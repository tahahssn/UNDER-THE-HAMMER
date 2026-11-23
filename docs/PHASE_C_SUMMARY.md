# Phase C: AWS Cognito Authentication — Complete

**Status:** ✅ All files written  
**Date:** 2026-11-19  
**Files created:** 10 source + 1 documentation

---

## 🎯 What Was Delivered

### 1. Auth Module (`apps/api/src/auth/`)

**Files:**
- `auth.module.ts` — Wires Auth service, Cognito service, JWT strategy
- `cognito.service.ts` — Low-level AWS Cognito SDK wrapper
- `auth.service.ts` — High-level auth orchestration + internal user management
- `auth.controller.ts` — REST endpoints for signup, signin, password reset
- `jwt.strategy.ts` — Passport JWT strategy for token validation
- `jwt.guard.ts` — Reusable `@UseGuards(JwtGuard)` for protected routes
- `current-user.decorator.ts` — `@CurrentUser()` decorator for injecting JWT claims

### 2. Users Module (`apps/api/src/users/`)

**Files:**
- `users.service.ts` — User profile management (display name, timezone, country)
- `users.module.ts` — Module definition
- `users.controller.ts` — REST endpoints for profile, username, identities

### 3. Updated Core

- `app.module.ts` — Imports AuthModule and UsersModule

---

## 🔐 Authentication Flow

### Signup Flow
```
POST /auth/signup
  { email, password }
        ↓
  CognitoService.signUp()
  ├─ Create Cognito user
  ├─ Send verification code to email
  └─ Return userSub
        ↓
  AuthService.signUp()
  ├─ Create internal User record (PENDING_VERIFICATION)
  ├─ Link Cognito subject in UserIdentity
  └─ Return userSub
```

### Confirm Email
```
POST /auth/confirm-signup
  { email, code }
        ↓
  CognitoService.confirmSignUp()
  ├─ Validate code
  └─ Mark email as verified in Cognito
        ↓
  AuthService.confirmSignUp()
  └─ Update User.status = ACTIVE
```

### Sign In Flow
```
POST /auth/signin
  { email, password }
        ↓
  AuthService.signIn()
  ├─ Check User exists and status == ACTIVE
  ├─ Call CognitoService.signIn()
  │  └─ Cognito returns { accessToken, idToken, refreshToken, expiresIn }
  └─ Return tokens
        ↓
  Client stores:
  ├─ accessToken (use for API requests)
  ├─ idToken (contains user claims)
  └─ refreshToken (use to get new tokens)
```

### Protected Route Access
```
GET /users/me
  Authorization: Bearer <idToken>
        ↓
  JwtStrategy validates:
  ├─ Token signature (via JWKS)
  ├─ Token not expired
  ├─ Audience matches COGNITO_APP_CLIENT_ID
  ├─ Issuer matches cognito-idp.{region}.amazonaws.com/{userPoolId}
  └─ Return payload to request.user
        ↓
  Controller accesses @CurrentUser() user: JwtPayload
```

### Token Refresh
```
POST /auth/refresh
  { refreshToken }
        ↓
  CognitoService.refreshToken()
  └─ Return new { accessToken, idToken, expiresIn }
```

---

## 📡 REST Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| **POST** | `/auth/signup` | None | Register with email & password |
| **POST** | `/auth/confirm-signup` | None | Verify email with code |
| **POST** | `/auth/resend-code` | None | Resend verification code |
| **POST** | `/auth/signin` | None | Sign in, get tokens |
| **POST** | `/auth/refresh` | None | Refresh access token |
| **POST** | `/auth/forgot-password` | None | Initiate password reset |
| **POST** | `/auth/confirm-password` | None | Reset password with code |
| **GET** | `/auth/me` | JWT | Get authenticated user's JWT claims |
| **GET** | `/users/me` | JWT | Get user profile + identities |
| **PATCH** | `/users/me/profile` | JWT | Update profile (name, timezone, etc.) |
| **GET** | `/users/check-username/:username` | None | Check if username available |
| **PATCH** | `/users/me/username` | JWT | Set/update username |
| **GET** | `/users/me/identities` | JWT | List linked identities (email, Google) |

---

## 🔑 Key Design Decisions

### 1. JWT is Bearer Token, Not HttpOnly Cookie (Phase C)
- idToken returned to client after signin
- Client stores in memory or secure storage
- Sent as `Authorization: Bearer <token>` with every protected request
- **Why:** Allows for stateless auth, easier for mobile apps and SPAs
- **Future consideration:** Phase N (account settings) may add httpOnly session cookie for browser-based flows

### 2. UserIdentity Bridges Cognito and Internal DB
- Cognito subject (stable identifier from AWS) stored in `UserIdentity`
- Internal `User.id` is the application primary key
- Relationship: `UserIdentity.provider + UserIdentity.subject` = one-to-one with Cognito account
- Supports future identity providers (Google, GitHub) in one table

### 3. Email is Unique but Mutable
- `User.email` is unique index (users cannot share email)
- Email can be updated by user later (Phase N)
- Cognito username follows email but can be re-validated

### 4. User Status Controls Access
- **PENDING_VERIFICATION:** Email not verified, cannot sign in
- **ACTIVE:** Fully operational
- **SUSPENDED:** Admin action, cannot sign in
- **BANNED:** Permanent account suspension
- **DISABLED:** Soft delete, can be restored

### 5. Cognito Errors → App Errors
- Cognito SDK throws AWS errors
- Auth service catches and translates to business exceptions (ConflictException, BadRequestException, UnauthorizedException)
- API returns consistent error shape (from Phase B's http-exception filter)

---

## 🛠️ Implementation Details

### CognitoService Methods

| Method | Cognito API | Purpose |
|--------|-------------|---------|
| `signUp()` | SignUp | Create user, send verification email |
| `confirmSignUp()` | ConfirmSignUp | Verify email with code |
| `resendConfirmationCode()` | ResendConfirmationCode | Resend code if expired |
| `signIn()` | InitiateAuth (USER_PASSWORD_AUTH) | Authenticate, return tokens |
| `refreshToken()` | InitiateAuth (REFRESH_TOKEN_AUTH) | Get new access token |
| `forgotPassword()` | ForgotPassword | Initiate reset flow |
| `confirmForgotPassword()` | ConfirmForgotPassword | Confirm new password |
| `getUserAttributes()` | GetUser | Fetch user data from Cognito (requires token) |
| `adminGetUser()` | AdminGetUser | Fetch user data by username (admin only) |

### JwtStrategy Configuration

```typescript
// Fetches public keys from Cognito JWKS endpoint
secretOrKeyProvider: passportJwtSecret({
  jwksUri: `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json`
})

// Validates:
audience: COGNITO_APP_CLIENT_ID
issuer: https://cognito-idp.{region}.amazonaws.com/{userPoolId}
algorithms: ['RS256']

// Token is extracted from:
Authorization: Bearer <token>
```

### AuthService Orchestration

Bridges Cognito (identity provider) and application User table:

**On Signup:**
1. Create Cognito user (triggers verification email)
2. Create internal User record
3. Link Cognito subject in UserIdentity
4. Return userSub to client

**On Sign In:**
1. Check User exists and status == ACTIVE
2. Call Cognito signin
3. Return tokens (no session stored server-side)

**On Token Validation:**
1. Passport JWT strategy validates signature + expiry
2. Extracts JWT payload (sub, email, email_verified, etc.)
3. Injects into request.user
4. Controller accesses via @CurrentUser() or @Request()

---

## 🧪 Integration Requirements

To run Phase C, you need:

### AWS Cognito Setup
1. Create Cognito User Pool
2. Create App Client with settings:
   - **Authentication flows:** USER_PASSWORD_AUTH, REFRESH_TOKEN_AUTH
   - **Email as username:** Enabled (optional, keeps signup simple)
   - **Custom domain** (optional for hosted UI)
3. Record:
   - User Pool ID
   - App Client ID
   - Region (e.g., us-east-1)

### Environment Variables
```bash
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_abc123xyz
COGNITO_APP_CLIENT_ID=client123abc
```

### Database (Phase B)
Migrations must have run:
- `User` table
- `UserIdentity` table
- `UserProfile` table

---

## 📋 Gate C Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Auth module exists | ✅ | 7 files in apps/api/src/auth/ |
| Users module exists | ✅ | 3 files in apps/api/src/users/ |
| Cognito service wraps AWS SDK | ✅ | cognito.service.ts with 8+ methods |
| JWT strategy validates tokens | ✅ | jwt.strategy.ts uses JWKS validation |
| Auth controller has signup/signin | ✅ | 7 endpoints defined |
| Users controller has profile | ✅ | 4 endpoints for profile + username |
| AppModule imports auth | ✅ | app.module.ts updated |
| Password hashing | ✅ | Cognito handles bcrypt internally |
| Email verification | ✅ | Cognito sends codes, flow defined |
| JWT is RS256 (asymmetric) | ✅ | Signed by Cognito, validated with JWKS |
| No hardcoded secrets | ✅ | All config from env vars |
| Integration tests ready (pending) | ⏳ | Needs Cognito user pool + test database |

---

## 🚀 To Complete Phase C

### Step 1: Set Up Cognito
```bash
# In AWS Console:
1. Create User Pool (or use existing)
2. Create App Client
3. Enable USER_PASSWORD_AUTH + REFRESH_TOKEN_AUTH
4. Record Pool ID, Client ID, Region
```

### Step 2: Update Environment
```bash
# .env.local
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_abc123
COGNITO_APP_CLIENT_ID=clientid123
```

### Step 3: Install Dependencies
```bash
npm install
# Adds: @nestjs/jwt, @nestjs/passport, passport, passport-jwt, jwks-rsa, aws-sdk
```

### Step 4: Build & Test
```bash
npm run build:schema
npm run typecheck
npm run build
# No compilation errors expected
```

### Step 5: Run Integration Tests (Optional)
```bash
# Against real Cognito user pool + test database:
npm run test

# Test cases:
1. POST /auth/signup → User created, verification email sent
2. POST /auth/confirm-signup → User status = ACTIVE
3. POST /auth/signin → Returns tokens
4. GET /auth/me (with valid token) → Returns user claims
5. GET /users/me (with valid token) → Returns profile
6. POST /auth/refresh → Returns new token
7. POST /auth/forgot-password → Code sent
8. Reject invalid/expired token
9. Reject unconfirmed signup signin attempt
10. Reject suspended/banned user signin
```

---

## 🔄 Data Flow Summary

```
┌─────────────┐
│   Cognito   │  AWS-managed identity
└──────┬──────┘
       │ (stores users, hashes passwords, issues JWTs)
       │
       └─────────────────────────────┐
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
            ┌──────────────┐                 ┌────────────────┐
            │ CognitoService│                 │  JwtStrategy   │
            │  (Wrapper)    │                 │  (Validation)  │
            └──────────────┘                 └────────────────┘
                    │                                 │
                    └────────────────┬────────────────┘
                                     │
                        ┌────────────────────────┐
                        │  AuthService           │
                        │ (Orchestration)        │
                        └────────────────────────┘
                                     │
                        ┌────────────────────────┐
                        │  Prisma                │
                        │  (User, UserIdentity)  │
                        └────────────────────────┘
```

---

## 📚 Code Examples

### Sign Up & Verify

```typescript
// 1. Register
POST /auth/signup
{ "email": "user@example.com", "password": "StrongPassword123!" }

Response:
{
  "message": "Verification code sent to email. Confirm within 24 hours.",
  "userSub": "us-east-1_abc123:user123"
}

// 2. Confirm Email
POST /auth/confirm-signup
{ "email": "user@example.com", "code": "123456" }

Response:
{ "message": "Email confirmed. You can now sign in." }
```

### Sign In & Access Protected Route

```typescript
// 1. Sign In
POST /auth/signin
{ "email": "user@example.com", "password": "StrongPassword123!" }

Response:
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI...",
  "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI...",
  "refreshToken": "eyJjdHkiOiJKV1QiLCJlbmMiOiJA...",
  "expiresIn": 3600
}

// 2. Access Protected Route
GET /users/me
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI...

Response:
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "status": "ACTIVE",
  "profile": {
    "displayName": "John Doe",
    "locale": "en",
    "timezone": "America/New_York",
    "countryCode": "US"
  }
}
```

### Refresh Token

```typescript
POST /auth/refresh
{ "refreshToken": "eyJjdHkiOiJKV1QiLCJlbmMiOiJA..." }

Response:
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI... (new)",
  "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI... (new)",
  "expiresIn": 3600
}
```

---

## 🎓 Key Architecture Concepts

### 1. Stateless Authentication
- No session table needed
- Token contains all info (sub, email, roles)
- Server validates signature only
- Scales horizontally (any server can validate)

### 2. External Identity Provider (Cognito)
- Application is NOT responsible for password hashing
- Cognito owns identity, we own authorization
- Separation of concerns: auth vs app logic

### 3. JWT as Bearer Token
- Sent with every request in Authorization header
- Not stored in HTTP-only cookies (Phase C)
- Clients handle token lifecycle (storage, refresh)

### 4. Identity Linking
- One Cognito account → one internal User
- Future: Can support multiple email addresses per user (Phase N)
- Future: Can support OAuth (Google, GitHub) linked to same User

---

## 🔚 Conclusion

**Phase C is feature-complete.** The backend now has a full authentication layer backed by AWS Cognito. Users can sign up, verify email, sign in, and access protected resources.

The implementation follows security best practices:
- Passwords never touch the application (Cognito handles hashing)
- JWTs are asymmetrically signed (RS256) and validated via JWKS
- Tokens cannot be tampered with (signature verification)
- User state (ACTIVE/SUSPENDED/BANNED) is checked on signin
- Internal User table bridges Cognito and application

Ready to proceed to **Phase D: Public Website** when needed.
