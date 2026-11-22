/**
 * Shared TypeScript types and DTOs
 */

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDTO {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

export interface Team {
  id: string;
  name: string;
  logo?: string;
  primaryColor: string;
  secondaryColor?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Player {
  id: string;
  name: string;
  role: 'batsman' | 'bowler' | 'all-rounder' | 'wicket-keeper';
  country?: string;
  stats?: {
    matches: number;
    runs: number;
    wickets: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Auction {
  id: string;
  title: string;
  status: 'draft' | 'scheduled' | 'live' | 'completed';
  format: 'countdown' | 'turn-based';
  control: 'host-controlled' | 'automatic';
  hostId: string;
  teams: Team[];
  teamCount: number;
  startTime: string;
  endTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuctionRoom {
  id: string;
  auctionId: string;
  visibility: 'public' | 'private';
  code?: string;
  currentPlayer?: Player;
  currentBid?: number;
  biddingTeam?: Team;
  createdAt: string;
  updatedAt: string;
}

export interface News {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  author?: string;
  source?: string;
  imageUrl?: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Match {
  id: string;
  status: 'scheduled' | 'live' | 'completed';
  team1: {
    name: string;
    logo?: string;
    runs?: number;
    wickets?: number;
  };
  team2: {
    name: string;
    logo?: string;
    runs?: number;
    wickets?: number;
  };
  venue?: string;
  startTime: string;
  endTime?: string;
  winner?: string;
  dataProvider?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  user: UserDTO;
  token: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
