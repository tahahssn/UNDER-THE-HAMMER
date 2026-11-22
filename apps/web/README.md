# Under The Hammer Web Application

The Next.js frontend for Under The Hammer — a cricket information and multiplayer auction platform.

## Overview

- **Framework:** Next.js 14+ with App Router
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS with semantic color tokens
- **State Management:** React Context (Auth)
- **API Client:** Axios with JWT authentication
- **UI Components:** Custom component library
- **Animation:** Framer Motion (accessible, respects prefers-reduced-motion)

## Project Structure

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Authentication pages (sign-in, sign-up, etc.)
│   │   ├── (dashboard)/       # Protected authenticated routes
│   │   │   └── auction/
│   │   │       ├── workspace/ # Main auction entry point
│   │   │       └── create/    # Auction creation (future)
│   │   ├── about/             # Public page
│   │   ├── news/              # News list and articles
│   │   ├── live/              # Live matches page
│   │   ├── auction/           # Auction marketing page
│   │   ├── players/           # Player directory (future)
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Home page
│   │   ├── error.tsx          # Error boundary
│   │   └── not-found.tsx      # 404 page
│   ├── components/            # Reusable component library
│   │   ├── Header.tsx         # Main navigation header
│   │   ├── Footer.tsx         # Footer
│   │   ├── Button.tsx         # Button component
│   │   ├── Card.tsx           # Card wrapper
│   │   ├── Avatar.tsx         # Avatar component
│   │   ├── Badge.tsx          # Status badges
│   │   ├── ErrorBoundary.tsx  # Error handling
│   │   ├── LoadingSpinner.tsx # Loading indicator
│   │   └── ...
│   ├── contexts/              # React Context providers
│   │   └── AuthContext.tsx    # Authentication state
│   ├── hooks/                 # Custom React hooks
│   │   ├── useAuth.ts         # Auth context hook
│   │   └── useAuthGuard.ts    # Route protection hook
│   ├── lib/
│   │   ├── api.ts             # API client and endpoints
│   │   ├── types.ts           # TypeScript types and DTOs
│   │   ├── constants.ts       # App constants (routes, config)
│   │   └── schemas/
│   │       └── auth.ts        # Zod validation schemas
│   └── app/globals.css        # Design tokens and global styles
├── public/                    # Static assets
├── tailwind.config.ts         # Tailwind configuration
├── tsconfig.json              # TypeScript configuration
├── next.config.js             # Next.js configuration
├── package.json               # Dependencies
└── README.md                  # This file
```

## Design System

### Semantic Color Tokens

Colors are defined as CSS custom properties in `src/app/globals.css`:

- `--color-bg` — Main background
- `--color-surface` — Card/panel background
- `--color-surface-raised` — Elevated surfaces (overlays, dropdowns)
- `--color-border` — Subtle separators
- `--color-text` — Primary text
- `--color-text-muted` — Secondary/metadata text
- `--color-accent` — Brand action color
- `--color-success` — Success state
- `--color-warning` — Warning/pending state
- `--color-danger` — Error/dangerous state
- `--color-info` — Informational state

Use Tailwind utilities to apply these:

```tsx
<div className="bg-surface border border-border text-primary text-text-muted">
  Content with semantic colors
</div>
```

### Typography

Responsive typography scale (mobile-first):

- `h1` — 48px → 56px (desktop)
- `h2` — 36px → 48px
- `h3` — 28px → 40px
- `body` — 16px (consistent on all sizes)
- `small` — 14px

### Spacing

Uses Tailwind's 4-unit spacing grid:

```
p-4   (1rem)
p-8   (2rem)
p-12  (3rem)
p-16  (4rem)
```

## Component Library

### Common Components

#### Button

Variants: `primary`, `secondary`, `outline`, `ghost`, `danger`, `success`  
Sizes: `sm`, `md`, `lg`, `icon`

```tsx
import Button from '@/components/Button';

<Button variant="primary" size="lg" loading={isLoading}>
  Click me
</Button>
```

#### Card

Wrapper for surface/panel content

```tsx
import Card from '@/components/Card';

<Card variant="default">
  <h3>Content</h3>
</Card>
```

#### Badge

Status indicators

```tsx
import Badge from '@/components/Badge';

<Badge variant="success">Active</Badge>
```

#### Avatar

User profile pictures

```tsx
import Avatar from '@/components/Avatar';

<Avatar src={imageUrl} alt="User" size="md" />
<Avatar initials="JD" size="lg" />
```

## Authentication

### Flow

1. User signs in/up on `/auth/sign-in` or `/auth/sign-up`
2. `AuthContext` stores token in memory
3. API client adds `Authorization: Bearer <token>` header
4. Protected routes use `useAuthGuard()` to redirect unauthenticated users to sign-in
5. 401 responses trigger sign-out

### Usage

```tsx
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { user, isAuthenticated, signOut } = useAuth();
  
  if (!isAuthenticated) return <div>Not signed in</div>;
  
  return <div>Hello, {user.email}</div>;
}
```

### Protecting Routes

```tsx
// In a (dashboard) layout.tsx
'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

export default function DashboardLayout({ children }) {
  useAuthGuard(); // Redirects if not authenticated
  return <>{children}</>;
}
```

## API Integration

### API Client

Located in `src/lib/api.ts`. All endpoints return `ApiResponse<T>`:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### Endpoints (Stubs)

- `healthCheck()` — GET /api/health
- `getAuthUser()` — GET /api/auth/me
- `signIn()` — POST /api/auth/sign-in
- `signUp()` — POST /api/auth/sign-up
- `getNews()` — GET /api/news (TODO: Phase M)
- `getLiveMatches()` — GET /api/live/matches (TODO: Phase M)
- `getPlayers()` — GET /api/players (TODO: Phase M)
- `getAuctions()` — GET /api/auctions (TODO: Phase E)

Each endpoint is marked with a TODO comment indicating when it will be implemented.

## Responsive Design

Breakpoints tested at:
- **375px** (mobile)
- **768px** (tablet)
- **1024px** (desktop)
- **1440px** (wide)

Use Tailwind's responsive prefixes:

```tsx
<div className="text-sm md:text-base lg:text-lg">
  Responsive text
</div>
```

## Accessibility

- Semantic HTML (`<nav>`, `<main>`, `<footer>`, `<article>`)
- Focus states on all interactive elements
- Alt text on all images
- Color is never the only indicator
- ARIA labels where appropriate
- Keyboard navigation throughout
- Respects `prefers-reduced-motion` (Framer Motion animations disabled)

## Performance & Optimization

- **Image optimization** — Next.js `Image` component with AVIF support
- **Code splitting** — Route-based code splitting via App Router
- **Bundle** — Only necessary dependencies included
- **Caching** — HTTP cache headers configured in `next.config.js`

## Setup & Development

### Prerequisites

- Node.js 20+
- pnpm (or npm)

### Installation

```bash
cd apps/web
pnpm install
```

### Development Server

```bash
pnpm run dev
```

Open http://localhost:3000

### Build for Production

```bash
pnpm run build
pnpm run start
```

### TypeScript Type Checking

```bash
pnpm run typecheck
```

### Linting

```bash
pnpm run lint
```

## Environment Variables

Create `.env.local` based on `.env.example`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_COGNITO_CLIENT_ID=your_client_id
NEXT_PUBLIC_COGNITO_USER_POOL_ID=your_pool_id
NEXT_PUBLIC_COGNITO_REGION=us-east-1
```

**Note:** Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Never put secrets here.

## Stubs & Future Implementation

### Fully Stubbed (Coming in Future Phases)

| Feature | Stub | Phase |
|---------|------|-------|
| News | List shows placeholders | M |
| Live Scores | Match cards show demo data | M |
| Players | "Coming Soon" placeholder | M |
| Auction Creation | Redirect to workspace | E |
| Team Management | "Coming Soon" placeholder | E |
| Auction Joining | "Coming Soon" placeholder | E |
| Auction Live Room | Not included | E |
| Payment Integration | Not included | H |
| Admin Dashboard | Not included | J |

### Implemented

- ✅ Public pages (Home, About, News, Live, Auction)
- ✅ Authentication (sign-in, sign-up)
- ✅ Protected routes (Auction workspace)
- ✅ Global navigation (Header, Footer, mobile menu)
- ✅ Component library
- ✅ Design system with semantic colors
- ✅ Responsive layout (375px—1440px)
- ✅ Error handling and loading states
- ✅ Accessibility compliance

## Testing

### Unit Tests (Future)

```bash
pnpm run test
```

### E2E Tests (Future)

```bash
pnpm run test:e2e
```

## Deployment

### Vercel (Recommended)

```bash
vercel deploy
```

### Docker

```bash
docker build -t uth-web .
docker run -p 3000:3000 uth-web
```

## Troubleshooting

### Port Already in Use

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :3000
kill -9 <PID>
```

### TypeScript Errors

Run type checking:

```bash
pnpm run typecheck
```

### Build Failures

Clear cache and rebuild:

```bash
rm -rf .next node_modules
pnpm install
pnpm run build
```

## Contributing

- Follow TypeScript strict mode
- Use semantic colors (never hardcode colors)
- Add `cursor-pointer` to interactive elements
- Ensure animations respect `prefers-reduced-motion`
- Test responsive at all breakpoints
- Document components in README

## License

Under The Hammer © 2026
