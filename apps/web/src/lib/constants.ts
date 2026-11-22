/**
 * Application constants and configuration
 */

export const BREAKPOINTS = {
  xs: 375,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1440,
} as const;

export const ANIMATION_DURATION = {
  fast: 150,
  normal: 300,
  slow: 500,
} as const;

export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  timeout: 10000,
  retries: 3,
};

export const COGNITO_CONFIG = {
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
  region: process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1',
};

export const ROUTES = {
  home: '/',
  about: '/about',
  news: '/news',
  live: '/live',
  auction: '/auction',
  auctionWorkspace: '/auction/workspace',
  signIn: '/auth/sign-in',
  signUp: '/auth/sign-up',
  verifyEmail: '/auth/verify-email',
  forgotPassword: '/auth/forgot-password',
  teams: '/teams',
  players: '/players',
} as const;

export const NAV_ITEMS = [
  { label: 'Home', href: ROUTES.home },
  { label: 'About', href: ROUTES.about },
  { label: 'News', href: ROUTES.news },
  { label: 'Live', href: ROUTES.live },
  { label: 'Auction', href: ROUTES.auction },
] as const;

export const FOOTER_LINKS = [
  {
    title: 'Product',
    links: [
      { label: 'About', href: ROUTES.about },
      { label: 'News', href: ROUTES.news },
      { label: 'Auction', href: ROUTES.auction },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Contact', href: '#contact' },
      { label: 'Blog', href: '#blog' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '#privacy' },
      { label: 'Terms', href: '#terms' },
      { label: 'Cookies', href: '#cookies' },
    ],
  },
] as const;
