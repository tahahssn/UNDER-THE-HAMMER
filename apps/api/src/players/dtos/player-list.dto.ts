export interface PlayerCategoryDto {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
}

export interface CountryDto {
  code: string;
  name: string;
}

export interface PlayerListItem {
  id: string;
  displayName: string;
  role: string;
  category?: PlayerCategoryDto;
  country?: CountryDto;
  categoryId?: string;
}

export interface PlayerSearchResponse {
  players: PlayerListItem[];
  total: number;
  hasMore: boolean;
}

export interface PlayerSearchQuery {
  search?: string;
  category?: string;
  role?: string;
  country?: string;
  skip: number;
  take: number;
}
