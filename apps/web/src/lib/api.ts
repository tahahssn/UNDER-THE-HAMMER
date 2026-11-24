/**
 * API client with authentication headers and error handling
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import { API_CONFIG } from './constants';
import {
  ApiResponse,
  AuthResponse,
  News,
  Match,
  Auction,
  PlayerSearchResponse,
  PlayerDetailDto,
  TeamDetailDto,
  TeamCreateDto,
  TeamUpdateDto,
  FileAssetDto,
  UploadIntentRequest,
  UploadIntentResponse,
  ConfirmUploadRequest,
  DownloadUrlResponse,
} from './types';

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

// Player endpoints - Phase E
export const getPlayers = async (params: {
  search?: string;
  category?: string;
  role?: string;
  country?: string;
  skip?: number;
  take?: number;
} = {}): Promise<ApiResponse<PlayerSearchResponse>> => {
  try {
    const response = await api.get('/api/players', {
      params: {
        skip: params.skip ?? 0,
        take: params.take ?? 20,
        ...params,
      },
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch players',
    };
  }
};

export const searchPlayers = async (query: string): Promise<ApiResponse<PlayerSearchResponse>> => {
  try {
    const response = await api.get('/api/players', {
      params: { search: query, skip: 0, take: 20 },
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to search players',
    };
  }
};

export const getPlayerById = async (id: string): Promise<ApiResponse<PlayerDetailDto>> => {
  try {
    const response = await api.get(`/api/players/${id}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch player',
    };
  }
};

export const getPlayerCategories = async (): Promise<ApiResponse<any>> => {
  try {
    const response = await api.get('/api/player-categories');
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch player categories',
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

// Team endpoints - Phase E
export const getMyTeams = async (): Promise<ApiResponse<{ teams: TeamDetailDto[] }>> => {
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

export const getTeamById = async (id: string): Promise<ApiResponse<TeamDetailDto>> => {
  try {
    const response = await api.get(`/api/teams/${id}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to fetch team',
    };
  }
};

export const createTeam = async (data: TeamCreateDto): Promise<ApiResponse<TeamDetailDto>> => {
  try {
    const response = await api.post('/api/teams', data);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to create team',
    };
  }
};

export const updateTeam = async (
  id: string,
  data: TeamUpdateDto
): Promise<ApiResponse<TeamDetailDto>> => {
  try {
    const response = await api.patch(`/api/teams/${id}`, data);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to update team',
    };
  }
};

export const deleteTeam = async (id: string): Promise<ApiResponse<null>> => {
  try {
    const response = await api.delete(`/api/teams/${id}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to delete team',
    };
  }
};

// File Upload endpoints - Phase E
export const getUploadIntent = async (
  payload: UploadIntentRequest
): Promise<ApiResponse<UploadIntentResponse>> => {
  try {
    const response = await api.post('/api/files/upload-intent', payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to get upload intent',
    };
  }
};

export const confirmUpload = async (
  payload: ConfirmUploadRequest
): Promise<ApiResponse<FileAssetDto>> => {
  try {
    const response = await api.post('/api/files/confirm-upload', payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to confirm upload',
    };
  }
};

export const verifyUpload = async (uploadId: string): Promise<ApiResponse<FileAssetDto>> => {
  try {
    const response = await api.get(`/api/files/${uploadId}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to verify upload',
    };
  }
};

export const getDownloadUrl = async (fileId: string): Promise<ApiResponse<DownloadUrlResponse>> => {
  try {
    const response = await api.get(`/api/files/${fileId}/download-url`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: 'Failed to get download URL',
    };
  }
};

export default api;
