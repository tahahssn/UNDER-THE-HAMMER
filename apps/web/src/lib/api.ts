/**
 * API client with authentication headers and error handling
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import { API_CONFIG } from './constants';
import { ApiResponse, AuthResponse, News, Match, Auction } from './types';

let authToken: string | null = null;

export const setAuthToken = (token: string | null): void => {
  authToken = token;
};

export const getAuthToken = (): string | null => {
  return authToken;
};

const createAxiosInstance = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: API_CONFIG.baseUrl,
    timeout: API_CONFIG.timeout,
  });

  instance.interceptors.request.use((config) => {
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        // Token expired or invalid
        authToken = null;
        // Redirect to sign-in handled by component
      }
      return Promise.reject(error);
    }
  );

  return instance;
};

const api = createAxiosInstance();

// Health check
export const healthCheck = async (): Promise<ApiResponse<{ status: string }>> => {
  try {
    const response = await api.get('/api/health');
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Health check failed',
    };
  }
};

// Auth endpoints
export const getAuthUser = async (): Promise<ApiResponse<{ user: any }>> => {
  try {
    const response = await api.get('/api/auth/me');
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch user',
    };
  }
};

export const signIn = async (email: string, password: string): Promise<ApiResponse<AuthResponse>> => {
  try {
    const response = await api.post('/api/auth/sign-in', { email, password });
    if (response.data.data?.token) {
      setAuthToken(response.data.data.token);
    }
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Sign in failed',
    };
  }
};

export const signUp = async (
  email: string,
  password: string,
  firstName?: string,
  lastName?: string
): Promise<ApiResponse<AuthResponse>> => {
  try {
    const response = await api.post('/api/auth/sign-up', {
      email,
      password,
      firstName,
      lastName,
    });
    if (response.data.data?.token) {
      setAuthToken(response.data.data.token);
    }
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Sign up failed',
    };
  }
};

export const verifyEmail = async (email: string, code: string): Promise<ApiResponse<any>> => {
  try {
    const response = await api.post('/api/auth/verify-email', { email, code });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Email verification failed',
    };
  }
};

export const forgotPassword = async (email: string): Promise<ApiResponse<any>> => {
  try {
    const response = await api.post('/api/auth/forgot-password', { email });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Forgot password request failed',
    };
  }
};

export const resetPassword = async (
  email: string,
  code: string,
  newPassword: string
): Promise<ApiResponse<any>> => {
  try {
    const response = await api.post('/api/auth/reset-password', {
      email,
      code,
      newPassword,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Password reset failed',
    };
  }
};

// News endpoints
// TODO: Phase M — implement when news data API is ready
export const getNews = async (page: number = 1, pageSize: number = 10): Promise<ApiResponse<any>> => {
  try {
    const response = await api.get('/api/news', { params: { page, pageSize } });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch news',
    };
  }
};

export const getNewsArticle = async (slug: string): Promise<ApiResponse<News>> => {
  try {
    const response = await api.get(`/api/news/${slug}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch article',
    };
  }
};

// Live match endpoints
// TODO: Phase M — implement when live data API is ready
export const getLiveMatches = async (): Promise<ApiResponse<any>> => {
  try {
    const response = await api.get('/api/live/matches');
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch live matches',
    };
  }
};

// Player endpoints
// TODO: Phase M — implement when player/stats API is ready
export const getPlayers = async (page: number = 1, pageSize: number = 20): Promise<ApiResponse<any>> => {
  try {
    const response = await api.get('/api/players', { params: { page, pageSize } });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch players',
    };
  }
};

// Auction endpoints
// TODO: Phase E — implement when auction engine is ready
export const getAuctions = async (status?: string): Promise<ApiResponse<any>> => {
  try {
    const response = await api.get('/api/auctions', { params: { status } });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch auctions',
    };
  }
};

export const getActiveAuctions = async (): Promise<ApiResponse<any>> => {
  try {
    const response = await api.get('/api/auctions?status=active');
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch active auctions',
    };
  }
};

export const joinAuction = async (auctionId: string): Promise<ApiResponse<any>> => {
  try {
    const response = await api.post(`/api/auctions/${auctionId}/join`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to join auction',
    };
  }
};

export const getAuctionById = async (id: string): Promise<ApiResponse<Auction>> => {
  try {
    const response = await api.get(`/api/auctions/${id}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch auction',
    };
  }
};

// Team endpoints
// TODO: Phase E — implement when team management is ready
export const getUserTeams = async (): Promise<ApiResponse<any>> => {
  try {
    const response = await api.get('/api/teams');
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch teams',
    };
  }
};

export default api;
