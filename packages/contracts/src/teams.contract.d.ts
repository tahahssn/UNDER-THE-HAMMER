export interface FileAssetDto {
    id: string;
    kind: string;
    status: string;
    objectKey: string;
    bucket: string;
    contentType?: string;
    width?: number;
    height?: number;
    sizeBytes?: number;
    uploadedBy?: {
        displayName: string;
    };
    rightsConfirmed: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface UserSummary {
    id: string;
    displayName: string;
}
export interface TeamDetailDto {
    id: string;
    name: string;
    shortName: string;
    description?: string;
    primaryColor: string;
    secondaryColor?: string;
    countryCode?: string;
    status: string;
    currentLogo?: FileAssetDto;
    createdBy: UserSummary;
    createdAt: string;
    updatedAt: string;
}
export interface TeamListItem {
    id: string;
    name: string;
    shortName: string;
    primaryColor: string;
    secondaryColor?: string;
    currentLogoAssetId?: string;
    createdBy: {
        displayName: string;
    };
}
export interface TeamCreateDto {
    name: string;
    shortName: string;
    description?: string;
    primaryColor: string;
    secondaryColor?: string;
    countryCode?: string;
}
export interface TeamUpdateDto {
    name?: string;
    shortName?: string;
    description?: string | null;
    primaryColor?: string;
    secondaryColor?: string | null;
    countryCode?: string | null;
}
export interface TeamListResponse {
    teams: TeamListItem[];
    total: number;
    hasMore: boolean;
}
