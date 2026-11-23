# Phase D Implementation Plan: Next.js Public Website & Authenticated Auction Entry

**Phase:** D  
**Objective:** Build a responsive Next.js public website with marketing pages (Home, About, News, Live, Auction) and an authenticated Auction entry/workspace page for signed-in users.

**Status:** Ready for implementation  
**Effort Estimate:** 60–80 hours for core pages + auth guard  
**Dependencies:** Backend API contracts (Cognito JWT validation, user endpoints), database schema (Phase 1 complete)

---

## Exploration Findings

### Repository State
- **Monorepo:** pnpm + Turborepo configured
- **Backend:** NestJS API in `apps/api` with Prisma schema (PostgreSQL)
- **Database:** Schema includes User, UserIdentity, teams, players, news, matches, auctions
- **Missing:** `apps/web` (Next.js frontend) does not exist
- **Config:** `packages/config` for shared TypeScript/lint config
- **Design:** DESIGN.md defines brand colors (semantic tokens), typography, responsive breakpoints (375px, 768px, 1024px, 1440px)

### Key Constraints & Decisions Locked
- No production fake data in core features; demo/stub data only in display components
- Backend authoritative for authentication, permissions, auction state
- No dark-mode toggle yet (design shows dark aesthetic)
- No unconfirmed bid logic, no fake winners, no localStorage for auth tokens
- Semantic color tokens from DESIGN.md (--color-bg, --color-surface, --color-accent, etc.)
- Framer Motion animations must respect `prefers-reduced-motion`
- No emoji icons; use Heroicons, Lucide or Simple Icons
- Cursor pointer on interactive elements, smooth transitions
- Tailwind CSS for styling with semantic color system
- Next.js App Router (not Pages Router)

### Design System (from DESIGN.md § 2–6)
- **Brand:** Dark, confident, editorial, sports-focused. Avoid excessive gradients/glassmorphism.
- **Colors:** Deep charcoal base + warm metallic/amber accent (pending final approval)
- **Typography:** Modern sans-serif (legible numerals, tabular numbers for prices/timers)
- **Motion:** Framer Motion for transitions; GSAP for orchestrated auction sequences
- **Navigation:** Home, About, News, Live, Auction (public); Profile dropdown (authenticated)
- **Public pages:** Home, About, News (list + article detail), Live, Auction (marketing)
- **Authenticated:** Auction workspace (/auction/workspace) with host/join/spectate options

---

## Implementation Plan

### Phase D.1: Next.js Foundation & Design Tokens (8 hours)

**What to do:**
Initialize Next.js 14+ with App Router, TypeScript strict mode, Tailwind CSS, and semantic color design tokens in `globals.css`. Set up responsive breakpoints, typography scale, and component base styles. Configure build, dev and type-check scripts in package.json.

**Files:**
- Create `apps/web/` directory structure
- Create `apps/web/package.json` with Next.js, React, TypeScript, Tailwind, Framer Motion, Lucide icons, React Query
- Create `apps/web/tsconfig.json` (extends `packages/config/tsconfig.json`)
- Create `apps/web/.eslintrc.json` (extends `packages/config`)
- Create `apps/web/next.config.ts` with optimizations, image config, redirects placeholder
- Create `apps/web/src/app/layout.tsx` (root shell)
- Create `apps/web/src/app/globals.css` with semantic color tokens, typography scale, responsive utilities
- Create `apps/web/src/lib/constants.ts` (breakpoints, animation durations)
- Create `apps/web/.env.example` with API_URL, NEXT_PUBLIC_COGNITO_* placeholders

**Verify:**
```bash
cd apps/web && npm install && npm run build
```
Expected: No build errors; TypeScript strict mode passes; `next.config.ts` loads.

---

### Phase D.2: Root Shell & Global Navigation (6 hours)

**What to do:**
Build the persistent shell components: Header (with logo, main nav, sign-in/profile button), Footer, and mobile navigation drawer. Implement responsive layout that works at 375px, 768px, 1024px, 1440px. Use Tailwind semantic colors and Lucide icons.

**Files:**
- Create `apps/web/src/components/Header.tsx` (logo, nav links, profile button, mobile toggle)
- Create `apps/web/src/components/MobileNav.tsx` (drawer for mobile navigation)
- Create `apps/web/src/components/Footer.tsx` (footer with links, legal, social)
- Create `apps/web/src/app/layout.tsx` (wrap routes with Header/Footer)
- Create `apps/web/src/lib/navigation.ts` (nav items, links)

**Component Details:**
- Header: responsive flex, logo left, nav center (hidden on mobile), profile/signin right. Mobile hamburger icon (Lucide Menu) triggers drawer.
- Footer: dark background, organized columns (product, company, legal, social), copyright notice.
- Mobile Nav: slides in from left, full-screen on mobile, closes on route or X button. Same nav items as header.
- Use semantic colors: `bg-surface`, `text-primary`, `border-subtle`, `hover:bg-surface-raised`.
- Icons from Lucide: Menu, X, LogOut, Settings, User.
- No animations on nav itself (reduce-motion compliant); smooth transitions on color changes.

**Verify:**
```bash
cd apps/web && npm run dev
```
Navigate to `localhost:3000`, check Header and Footer render correctly at 375px, 768px, 1024px, 1440px (use browser dev tools). Mobile menu opens/closes. No console errors.

---

### Phase D.3: Authentication Context & Hooks (7 hours)

**What to do:**
Set up React Context for auth state (user, token, loading, error). Create `useAuth` hook and authentication guard. Connect to backend auth endpoints (sign-in, sign-up, verify email, refresh token). Store auth state in React state only (never localStorage), use secure HTTP-only cookies if backend provides them. Handle Cognito JWT validation on backend.

**Files:**
- Create `apps/web/src/contexts/AuthContext.tsx` (global auth state)
- Create `apps/web/src/hooks/useAuth.ts` (useAuth hook)
- Create `apps/web/src/hooks/useAuthGuard.ts` (redirect to sign-in if not authenticated)
- Create `apps/web/src/lib/api.ts` (API client, auth headers)
- Create `apps/web/src/lib/auth-storage.ts` (session helpers, never localStorage for tokens)

**Context/Hooks Details:**
- `AuthContext` holds: `user` (UserDTO | null), `isLoading`, `isAuthenticated`, `error`, `signIn`, `signUp`, `signOut`, `refreshToken`
- `useAuth()` returns context; throws if used outside provider
- `useAuthGuard()` returns user or redirects to `/sign-in` after checking backend
- API client adds `Authorization: Bearer <token>` to all requests if token exists
- Backend validates token on each request; 401 triggers sign-out + redirect
- No token stored in localStorage; session stored in memory + optional HTTP-only cookie from backend

**Verify:**
```bash
Create a test component that calls useAuth() and renders user email or "not signed in". 
Check context provider wraps root layout. No console errors.
```

---

### Phase D.4: Sign-In, Sign-Up & Auth Screens (8 hours)

**What to do:**
Build Cognito-connected sign-in, sign-up, email verification and password recovery screens. Use form validation (Zod + React Hook Form), error messages, loading states. Redirect to `/auction/workspace` after successful sign-in. Handle Cognito errors gracefully (user exists, invalid password, etc.).

**Files:**
- Create `apps/web/src/app/(auth)/layout.tsx` (auth page shell, centered card)
- Create `apps/web/src/app/(auth)/sign-in/page.tsx` (email + password form, sign-up link)
- Create `apps/web/src/app/(auth)/sign-up/page.tsx` (email + password + confirm, terms checkbox, sign-in link)
- Create `apps/web/src/app/(auth)/verify-email/page.tsx` (OTP input, resend link)
- Create `apps/web/src/app/(auth)/forgot-password/page.tsx` (email input, reset code input, new password)
- Create `apps/web/src/components/AuthForm.tsx` (shared form input, button, error display)
- Create `apps/web/src/lib/schemas/auth.ts` (Zod schemas for sign-in, sign-up, verify)

**Form Details:**
- Use React Hook Form + Zod validation
- Fields: email (required, valid email), password (required, min 8 chars)
- Sign-up adds: confirm password, terms checkbox (required)
- Error messages display below fields (error color: `text-danger`)
- Loading button shows spinner during submit
- Submit on Enter key
- Links to other auth pages
- No form data persisted to localStorage

**Verify:**
```bash
cd apps/web && npm run dev
Navigate to /sign-in, /sign-up, /verify-email, /forgot-password.
Forms render, validation works (try invalid email, short password).
Check API calls are made to backend (use network tab).
Redirect to /auction/workspace after successful sign-in (mock if backend not ready).
```

---

### Phase D.5: Public Pages — Home, About (10 hours)

**What to do:**
Build Home and About marketing pages following DESIGN.md § 6. Home includes brand statement, cricket info preview, live match preview, latest news teaser, player discovery teaser, auction feature CTA. About explains mission, cricket coverage, auction platform, team credibility. Both fully responsive, no data yet (stub sections with "Coming soon" or demo data).

**Files:**
- Create `apps/web/src/app/page.tsx` (Home)
- Create `apps/web/src/app/about/page.tsx` (About)
- Create `apps/web/src/components/HeroSection.tsx` (reusable hero with title, subtitle, CTA)
- Create `apps/web/src/components/NewsPreview.tsx` (news teaser grid)
- Create `apps/web/src/components/LiveMatchPreview.tsx` (live matches teaser)
- Create `apps/web/src/components/FeatureCard.tsx` (feature card with icon, title, description)

**Home Page Sections:**
1. Hero: "Under The Hammer — Cricket Information & Live Auctions" + CTA ("Start Auction" / "Sign In")
2. Cricket Info: "Live Scores & Coverage" (stub match cards)
3. News Preview: "Latest News" (3–4 article cards, "View All" link to /news)
4. Live Matches: "Upcoming & Live Matches" (stub, link to /live)
5. Player Discovery: "Browse Players" (stub, link to player directory when ready)
6. Auction Feature: "Host or Join Live Auctions" (explain format, CTA)
7. CTA Footer: "Ready to host? Subscribe to start." / "Join a public auction." (different CTAs based on auth state)

**About Page Sections:**
1. Hero: "About Under The Hammer"
2. Mission: Product vision paragraph
3. Cricket Coverage: Explain scope (Pakistan focus initially, expanding internationally)
4. Auction Platform: Explain configurable rooms, team creation, subscription model
5. Team & Credibility: Brief team intro, non-affiliation disclaimer
6. How It Works: 3–4 simple cards explaining host/participant/spectator flows

**Design Details:**
- Use semantic colors: `bg-bg`, `text-primary`, `text-muted`, `border-subtle`
- Typography: Large headlines (h1 36–48px), body text readable at 16px minimum
- Spacing: 4-unit Tailwind grid (gap-4, py-8, etc.)
- Responsive: Stack cards vertically on mobile, 2–3 columns on tablet/desktop
- No animations on initial page load (reduce-motion compliant)
- Lucide icons for feature cards (Zap, Users, Trophy, etc.)

**Verify:**
```bash
cd apps/web && npm run dev
Navigate to / and /about. Check responsive at 375px, 768px, 1024px, 1440px.
Check all links navigate correctly. No broken images. Semantic colors applied. No console errors.
```

---

### Phase D.6: Public Pages — News (12 hours)

**What to do:**
Build News list page (`/news`) and article detail page (`/news/[slug]`). List shows editorial grid with category, source, publication time, image. Detail page shows article title, byline, publication info, article content (from backend), link to external publisher. Use Next.js dynamic routes. Connect to backend news API endpoints (list, detail).

**Files:**
- Create `apps/web/src/app/news/page.tsx` (news list)
- Create `apps/web/src/app/news/[slug]/page.tsx` (news detail)
- Create `apps/web/src/components/NewsCard.tsx` (reusable news card for lists)
- Create `apps/web/src/components/NewsList.tsx` (paginated list with filters placeholder)
- Create `apps/web/src/lib/api/news.ts` (API calls for news list, detail)

**News List:**
- Grid layout: 1 column on mobile, 2–3 on desktop
- Each card: image, category badge (bg-accent/10, text-accent), headline, source, date, excerpt
- Pagination or infinite scroll (placeholder; can use React Query for server state)
- Search/filter placeholder (not functional in Phase D, stub only)
- "No articles yet" state with icon

**News Detail:**
- Full-width article container (max-width-2xl)
- Article hero image
- Title, byline (author, publication, date), category badge
- Body content (HTML or markdown, sanitized on backend)
- "Read on [Source]" link to external publisher
- Related articles teaser (future; stub for now)
- Share buttons (web share API or simple copy link)
- Back to news link

**API Contracts (stub endpoints; real implementation in backend):**
```ts
GET /api/news
  ?limit=10&offset=0&category=...
  -> { items: NewsArticle[], total: number, hasMore: boolean }

GET /api/news/:slug
  -> NewsArticle (full detail + body)

type NewsArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  image?: string;
  source: string;
  sourceUrl?: string;
  category: string;
  publishedAt: ISO8601;
  body: string;
}
```

**Verify:**
```bash
cd apps/web && npm run dev
Navigate to /news. Mock data renders (use hardcoded array if backend not ready).
Click article card → navigates to /news/article-slug.
Article detail renders with mock data.
Responsive on mobile/tablet/desktop. No console errors.
```

---

### Phase D.7: Public Pages — Live Scores (8 hours)

**What to do:**
Build Live matches page (`/live`) showing upcoming, live and completed matches grouped by status. Each match card displays match name, teams, score/status, provider, last-updated timestamp. Connect to backend live-match API. Stale/unavailable states handled gracefully.

**Files:**
- Create `apps/web/src/app/live/page.tsx` (live matches page)
- Create `apps/web/src/components/MatchCard.tsx` (reusable match card)
- Create `apps/web/src/components/MatchGroup.tsx` (group by status)
- Create `apps/web/src/lib/api/matches.ts` (API calls for matches list)

**Live Page Layout:**
- Three sections: "Live", "Upcoming", "Completed"
- Each section lists match cards
- Empty state if no matches in section
- Refresh button (future: auto-refresh with polling)

**Match Card:**
- Match name (competition, teams)
- Status badge: "Live" (red), "Upcoming" (blue), "Completed" (gray)
- Teams and logos (if available; placeholder icon if not)
- Current score / next match time
- Provider and last-updated timestamp (small text, `text-muted`)
- Link to detail page (future; placeholder for now)

**API Contracts (stub):**
```ts
GET /api/live/matches
  ?status=live|upcoming|completed
  -> { matches: Match[], status: string }

type Match = {
  id: string;
  name: string;
  teams: { name: string; logo?: string }[];
  status: 'live' | 'upcoming' | 'completed';
  score?: { runs: number; wickets: number; overs: string }[];
  startTime?: ISO8601;
  provider: string;
  lastUpdated: ISO8601;
}
```

**Verify:**
```bash
cd apps/web && npm run dev
Navigate to /live. Mock data groups by status and renders.
Check responsive on mobile/tablet/desktop.
No console errors. Semantic colors applied.
```

---

### Phase D.8: Auction Marketing Page (10 hours)

**What to do:**
Build the public Auction marketing page (`/auction`). Explain what auctions are, how they work, host subscription requirement, free participation, team creation, logo uploads, auction formats (countdown, turn-based), host-controlled vs automatic, spectator access. Include CTAs: "Host an Auction" (sign-in required), "Join Public Auction" (sign-in required), "Learn More" (anchor links within page).

**Files:**
- Create `apps/web/src/app/auction/page.tsx` (auction marketing)
- Create `apps/web/src/components/AuctionFeatureCard.tsx` (feature card with icon, title, description)
- Create `apps/web/src/components/AuctionComparison.tsx` (public vs private comparison table)

**Page Sections:**
1. Hero: "Live Multiplayer Auctions" + CTA ("Host" / "Join")
2. How It Works: 4–5 step cards (create/join room, allocate teams, bid live, build squad, export result)
3. Format Explanation: Countdown vs turn-based (cards with descriptions)
4. Auction Modes: Host-controlled vs automatic (cards with descriptions)
5. Team Creation: "Create Custom Teams & Upload Logos" (explain user-created teams, no PSL restriction)
6. Public vs Private: Comparison table (visibility, spectators, access)
7. Subscription: "Host an Auction" (explain subscription model, link to pricing)
8. Spectate: "Watch Live Auctions" (explain spectator mode)
9. CTA Footer: Prominent buttons ("Host an Auction", "Join Public Auction")

**Design Details:**
- Use Lucide icons for step cards (Users, Zap, Trophy, Download, etc.)
- Color accents: use `bg-accent`, `text-accent` strategically
- Responsive: Stack sections vertically on mobile, multi-column on desktop
- Comparison table: horizontal on desktop, stacked cards on mobile

**Verify:**
```bash
cd apps/web && npm run dev
Navigate to /auction. All sections render with mock data.
CTAs show correct state (not signed in: "Sign in", signed in: "Host Auction").
Check responsive on mobile/tablet/desktop.
No console errors.
```

---

### Phase D.9: Authenticated Auction Workspace (12 hours)

**What to do:**
Build the authenticated auction entry/workspace page (`/auction/workspace`) accessible only to signed-in users. Displays options: "Host an Auction" (checks subscription entitlement), "Join Public Auction", "Join Private Auction" (code/invite), "Spectate Public" (optional), "Active Auctions" list, "Recent/Past Auctions" list. Host action checks subscription status and shows reason if ineligible. All UI is responsive, no real auction data yet (stubs/mock).

**Files:**
- Create `apps/web/src/app/auction/workspace/page.tsx` (workspace page)
- Create `apps/web/src/app/auction/workspace/+layout.tsx` (auth guard wrapper)
- Create `apps/web/src/components/AuctionAction.tsx` (action card with icon, title, button)
- Create `apps/web/src/components/AuctionList.tsx` (table/grid of auctions)
- Create `apps/web/src/components/SubscriptionStatus.tsx` (subscription status widget)
- Create `apps/web/src/lib/api/auctions.ts` (API calls for auctions, subscription status)

**Workspace Sections:**
1. Subscription Status: Widget showing current plan, expiry, upgrade link (if no plan)
2. Quick Actions: 4 action cards
   - "Host an Auction" → checks subscription, shows reason if ineligible, opens create/room dialog (future)
   - "Join Public Auction" → modal to browse public rooms (future)
   - "Join Private Auction" → modal to enter code or select from invitations (future)
   - "Spectate Public" → (optional, can stub)
3. Active Auctions: Table/grid of ongoing auctions (user owns or is participant)
4. Recent Auctions: Table/grid of past auctions

**Design Details:**
- Use Lucide icons for action cards (Plus, Users, Lock, Eye, etc.)
- Subscription Status: color-coded (green if active, yellow if expiring, red if none)
- Auction tables: sortable by date, name (future); responsive columns on mobile
- Each auction row: name, teams, status (live, completed, scheduled), user role (host, owner, spectator), action link (enter room, view results)

**Auth Guard:**
- Redirect to `/sign-in?redirect=/auction/workspace` if not authenticated
- Use `useAuthGuard()` hook; display loading spinner while checking auth

**Verify:**
```bash
cd apps/web && npm run dev
Navigate to /auction/workspace without signing in → redirects to /sign-in.
Sign in (mock auth if backend not ready) → redirects to /auction/workspace.
Page renders with mock auctions list, subscription status.
Check responsive on mobile/tablet/desktop.
No console errors.
```

---

### Phase D.10: Profile Dropdown & Account Navigation (6 hours)

**What to do:**
Build the profile dropdown menu (top-right avatar button) accessible from signed-in state. Dropdown shows user email, links to Profile (future), Account Settings (future), Billing/Subscription (future), Notifications (future), and Sign Out. Implement as a Popover or Radix Dialog. Close on click outside or Escape key.

**Files:**
- Create `apps/web/src/components/ProfileDropdown.tsx` (dropdown menu)
- Create `apps/web/src/components/UserAvatar.tsx` (avatar button)

**Dropdown Contents:**
- User email (read-only, small text)
- Divider
- "Auction" link → `/auction/workspace`
- "Profile" link (stub, future) → `/account/profile`
- "Settings" link (stub, future) → `/account/settings`
- "Billing" link (stub, future) → `/account/billing`
- "Notifications" link (stub, future) → `/account/notifications`
- Divider
- "Sign Out" button (calls `auth.signOut()`)

**Design Details:**
- Avatar: initials or generic user icon (Lucide User)
- Dropdown: positioned below avatar, 240px wide, shadow, `bg-surface-raised`
- Menu items: `text-primary`, hover state `bg-surface`, `cursor-pointer`
- Sign Out: `text-danger` color, animated icon (LogOut)
- Close on click outside, Escape key

**Verify:**
```bash
Navigate to /auction/workspace (signed in).
Click avatar → dropdown appears with links and email.
Click "Sign Out" → signs out, redirects to /sign-in or /.
Dropdown closes on Escape key or click outside.
No console errors.
```

---

### Phase D.11: Responsive Design & Mobile Optimization (8 hours)

**What to do:**
Test all pages at 375px, 768px, 1024px, 1440px breakpoints. Verify no horizontal scroll, readable text, touch-friendly buttons (min 44px), collapsible nav on mobile, stacked cards on small screens. Implement mobile-first CSS, Tailwind responsive utilities. Verify accessibility: keyboard navigation (Tab, Enter, Escape), screen reader compat, color contrast (4.5:1 minimum), focus indicators.

**Files:**
- Review all component Tailwind classes for `md:`, `lg:`, `xl:` responsive prefixes
- Create `apps/web/src/lib/responsive.ts` (helper functions for responsive UI)
- Create `apps/web/src/hooks/useMediaQuery.ts` (hook to detect breakpoints)

**Testing Checklist:**
- [ ] All text readable at 375px without zooming
- [ ] No horizontal scroll at 375px (scroll only vertically)
- [ ] Mobile nav drawer works on touch (tap hamburger, tap link to navigate)
- [ ] Form inputs at least 44x44px (touch-friendly)
- [ ] Buttons at least 44x44px
- [ ] Spacing consistent (multiples of 4px)
- [ ] Links underlined or have distinct color
- [ ] Images have alt text
- [ ] Form labels associated with inputs (`<label htmlFor="...">`)
- [ ] Keyboard navigation: Tab through interactive elements, Enter to activate, Escape to close modals
- [ ] Focus states visible (outline or border)
- [ ] Color contrast 4.5:1 for body text, 3:1 for large text
- [ ] Reduced motion: animations disabled when `prefers-reduced-motion: reduce` is set

**Verify:**
```bash
npm run build (TypeScript + Next.js build)
npx tsc --noEmit (TypeScript check)
npx next@latest telemetry disable (optional)
Use browser dev tools: Device toolbar for 375px, 768px, 1024px, 1440px.
Keyboard Tab through all pages → verify focus states and tab order.
Screen reader test (NVDA / VoiceOver): navigate home and news pages.
Check WebAIM contrast checker for all text colors.
```

---

### Phase D.12: Global Error Handling & Loading States (5 hours)

**What to do:**
Implement global error boundary component, 404 page, 500 error page. Add loading spinners for route transitions and async data. Add error toast/alert for failed API calls. Implement recovery mechanism (retry button).

**Files:**
- Create `apps/web/src/components/ErrorBoundary.tsx` (error boundary wrapper)
- Create `apps/web/src/app/error.tsx` (error boundary handler)
- Create `apps/web/src/app/not-found.tsx` (404 page)
- Create `apps/web/src/components/LoadingSpinner.tsx` (reusable spinner)
- Create `apps/web/src/components/Toast.tsx` (notification toast)
- Create `apps/web/src/hooks/useToast.ts` (toast context hook)

**Error Handling:**
- 404 page: "Page not found" message, link back to home
- 500 page: "Something went wrong" message, retry button, link to support
- Error boundary: catches React errors, displays fallback UI
- API error toast: shows error message, auto-dismiss or manual close, optional retry button
- 401 Unauthorized: sign out user, redirect to sign-in
- 403 Forbidden: show "Access denied" message

**Loading States:**
- Spinner while fetching data
- Skeleton placeholders for lists (future, stub with spinner for now)
- Route transition loading indicator (top bar or center)

**Verify:**
```bash
Navigate to /nonexistent → 404 page renders.
Trigger JS error in component → error boundary catches it.
Mock API error → error toast appears with message.
Check animations respect prefers-reduced-motion.
```

---

### Phase D.13: Documentation & README (3 hours)

**What to do:**
Create `apps/web/README.md` documenting the app structure, build/dev commands, environment variables, API contracts stubs, component library, testing approach, and deployment notes. Update root `README.md` with Phase D completion notes.

**Files:**
- Create `apps/web/README.md` (comprehensive documentation)
- Update root `README.md` (Phase D section)

**Documentation Contents:**
- Quick start (install, build, dev)
- Directory structure
- Environment variables (.env.example)
- API contracts (stubs for news, matches, auctions, auth)
- Component library (Button, Card, Avatar, etc.)
- Styling (Tailwind, semantic tokens, responsive)
- Authentication flow (Cognito, context, hooks)
- Testing approach (unit, integration, e2e future)
- Known limitations (Phase D — no real data, no live auction room, etc.)
- Future work (Phase E+)

**Verify:**
```bash
README renders in browser/editor without broken links.
Follow instructions in README to build and run locally.
Environment variables documented.
API contracts clear.
```

---

### Phase D.14: Integration Tests & Build Validation (5 hours)

**What to do:**
Add integration tests for auth flow, navigation, error states using Vitest. Set up build validation script. Ensure TypeScript strict mode passes. Run npm run build and confirm no errors. Set up pre-commit hooks if needed (future).

**Files:**
- Create `apps/web/__tests__/auth.test.ts` (auth context, sign-in flow)
- Create `apps/web/__tests__/navigation.test.ts` (nav rendering, links)
- Create `apps/web/__tests__/pages.test.ts` (home, about, news pages render)
- Create `apps/web/vitest.config.ts` (Vitest configuration)
- Create `apps/web/jest.setup.ts` (test utilities, mocks)

**Tests:**
- Auth context: user sign-in, sign-out, state updates
- Navigation: Header renders, mobile nav opens/closes, links navigate
- Pages: Home renders sections, About renders sections, News renders list
- Error boundary: catches errors gracefully
- Responsive: components adapt to breakpoints

**Verify:**
```bash
cd apps/web && npm run test
cd apps/web && npm run build
npm run typecheck (from root)
npm run build (from root, Turborepo)
All tests pass. Build succeeds. No TypeScript errors.
```

---

## Digest: Files & Changes

### New Files Created

#### Root Structure
- `apps/web/` — entire directory
- `apps/web/package.json` — dependencies: next, react, typescript, tailwind, framer-motion, lucide-react, @tanstack/react-query, zod, react-hook-form
- `apps/web/tsconfig.json` — strict mode, extends packages/config
- `apps/web/next.config.ts` — image optimization, redirects placeholder
- `apps/web/.env.example` — API_URL, NEXT_PUBLIC_COGNITO_*

#### App Structure
- `apps/web/src/app/layout.tsx` — root layout, shell provider
- `apps/web/src/app/globals.css` — semantic tokens, typography, responsive utilities
- `apps/web/src/app/page.tsx` — Home page
- `apps/web/src/app/about/page.tsx` — About page
- `apps/web/src/app/news/page.tsx` — News list
- `apps/web/src/app/news/[slug]/page.tsx` — News detail
- `apps/web/src/app/live/page.tsx` — Live matches
- `apps/web/src/app/auction/page.tsx` — Auction marketing
- `apps/web/src/app/auction/workspace/page.tsx` — Authenticated auction entry
- `apps/web/src/app/auction/workspace/+layout.tsx` — Auth guard
- `apps/web/src/app/(auth)/layout.tsx` — Auth page shell
- `apps/web/src/app/(auth)/sign-in/page.tsx` — Sign-in
- `apps/web/src/app/(auth)/sign-up/page.tsx` — Sign-up
- `apps/web/src/app/(auth)/verify-email/page.tsx` — Email verification
- `apps/web/src/app/(auth)/forgot-password/page.tsx` — Password recovery
- `apps/web/src/app/error.tsx` — Error boundary
- `apps/web/src/app/not-found.tsx` — 404 page

#### Components
- `apps/web/src/components/Header.tsx`
- `apps/web/src/components/MobileNav.tsx`
- `apps/web/src/components/Footer.tsx`
- `apps/web/src/components/AuthForm.tsx`
- `apps/web/src/components/HeroSection.tsx`
- `apps/web/src/components/NewsCard.tsx`
- `apps/web/src/components/NewsList.tsx`
- `apps/web/src/components/MatchCard.tsx`
- `apps/web/src/components/MatchGroup.tsx`
- `apps/web/src/components/AuctionFeatureCard.tsx`
- `apps/web/src/components/AuctionComparison.tsx`
- `apps/web/src/components/AuctionAction.tsx`
- `apps/web/src/components/AuctionList.tsx`
- `apps/web/src/components/SubscriptionStatus.tsx`
- `apps/web/src/components/ProfileDropdown.tsx`
- `apps/web/src/components/UserAvatar.tsx`
- `apps/web/src/components/LoadingSpinner.tsx`
- `apps/web/src/components/Toast.tsx`
- `apps/web/src/components/ErrorBoundary.tsx`

#### Context & Hooks
- `apps/web/src/contexts/AuthContext.tsx`
- `apps/web/src/hooks/useAuth.ts`
- `apps/web/src/hooks/useAuthGuard.ts`
- `apps/web/src/hooks/useToast.ts`
- `apps/web/src/hooks/useMediaQuery.ts`

#### Lib & Utils
- `apps/web/src/lib/constants.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/auth-storage.ts`
- `apps/web/src/lib/responsive.ts`
- `apps/web/src/lib/schemas/auth.ts`
- `apps/web/src/lib/api/news.ts`
- `apps/web/src/lib/api/matches.ts`
- `apps/web/src/lib/api/auctions.ts`
- `apps/web/src/lib/navigation.ts`

#### Tests
- `apps/web/__tests__/auth.test.ts`
- `apps/web/__tests__/navigation.test.ts`
- `apps/web/__tests__/pages.test.ts`
- `apps/web/vitest.config.ts`
- `apps/web/jest.setup.ts`

#### Documentation
- `apps/web/README.md`
- Updated root `README.md` (Phase D completion notes)

---

## Verification Commands

### Build & TypeScript
```bash
cd apps/web
npm run build                    # Next.js build
npm run type-check              # TypeScript check (from workspace)
npm run lint                     # Lint (if configured)
npm run test                     # Unit/integration tests
```

### Local Development
```bash
cd apps/web
npm run dev
# Visit http://localhost:3000
# Test all pages: /, /about, /news, /news/article-slug, /live, /auction, /auction/workspace (after sign-in)
```

### Responsive Testing
```bash
# Browser dev tools: Device toolbar
# 375px: mobile, verify no horizontal scroll, touch-friendly buttons
# 768px: tablet, verify columns adapt
# 1024px, 1440px: desktop, verify full layout
```

### Accessibility Testing
```bash
# Keyboard: Tab through all pages, Escape closes modals
# Screen reader: Navigate home and news (NVDA/VoiceOver)
# Contrast: WebAIM contrast checker, verify 4.5:1 for body text
# Reduced motion: Set `prefers-reduced-motion: reduce` in OS, verify animations disabled
```

---

## Notes & Limitations (Phase D)

### Not Included
- Real auction room (live bidding, real-time events, Socket.IO) — Phase E
- Real cricket data ingestion (news, players, matches) — Phase I
- Payment integration (Safepay) — Phase H
- Admin application — Phase J
- Team creation & logo upload flow (design exists; backend integration needed) — Phase F
- Player directory & profiles — Phase G
- Spaces — Later release

### Stubs & Future Integration
- API endpoints called with mock/stub data; backend implementation in separate phase
- Auth tested against mock Cognito; real integration requires Cognito setup (Phase 1)
- Room creation, join/host actions are UI-only; backend logic in Phase E+
- News/matches/auctions lists show hardcoded demo data; replaced with API calls in Phase I+

### Auth Guard
- Commented out if Cognito credentials unavailable; demo mode allows unauthenticated access to `/auction/workspace`
- Real JWT validation happens on backend; frontend redirects on 401 response

### Design System
- Semantic color tokens defined in `globals.css`; final brand colors may require adjustment
- Typography scale defined with Tailwind classes
- Motion respects `prefers-reduced-motion`; animations optional on elements
- Responsive breakpoints: 375px, 768px, 1024px, 1440px; Tailwind utilities handle responsive classes

---

## Next Phase (Phase E)

After Phase D completes:
1. Connect real API endpoints (replace mock data)
2. Implement real Cognito authentication
3. Build Socket.IO real-time layer for auction rooms
4. Implement live auction room UI (Phase 6 from IMPLEMENTATION.md)
5. Add chat, breaks, squad views (Phase 7)

---

**End of Phase D Plan**

