import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSquadExport } from '../useSquadExport';
import { ExportFormat } from '@uth/contracts';

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('useSquadExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('mock-token');
    
    // Mock document methods
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with no error or loading', () => {
    const { result } = renderHook(() =>
      useSquadExport('auction-1', 'Test Auction', 'Test Room')
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should handle successful CSV export', async () => {
    const mockCsvData = 'team,player\nTeamA,Player1';
    const mockBlob = new Blob([mockCsvData], { type: 'text/csv' });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      blob: vi.fn().mockResolvedValueOnce(mockBlob),
    });

    const { result } = renderHook(() =>
      useSquadExport('auction-1', 'Test Auction', 'Test Room')
    );

    await act(async () => {
      await result.current.export(ExportFormat.CSV);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/auctions/auction-1/export?format=csv',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-token',
        }),
      })
    );
  });

  it('should handle successful XLSX export', async () => {
    const mockXlsxData = Buffer.from([0x50, 0x4b]); // PK header
    const mockBlob = new Blob([mockXlsxData], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      blob: vi.fn().mockResolvedValueOnce(mockBlob),
    });

    const { result } = renderHook(() =>
      useSquadExport('auction-1', 'Test Auction', 'Test Room')
    );

    await act(async () => {
      await result.current.export(ExportFormat.XLSX);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/auctions/auction-1/export?format=xlsx',
      expect.any(Object)
    );
  });

  it('should show error when response is not ok', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: vi.fn().mockResolvedValueOnce({ message: 'Not authorized' }),
    });

    const { result } = renderHook(() =>
      useSquadExport('auction-1', 'Test Auction', 'Test Room')
    );

    await act(async () => {
      await result.current.export(ExportFormat.CSV);
    });

    expect(result.current.error).toContain('Not authorized');
  });

  it('should handle 404 auction not found', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValueOnce({ message: 'Auction not found' }),
    });

    const { result } = renderHook(() =>
      useSquadExport('auction-missing', 'Test Auction', 'Test Room')
    );

    await act(async () => {
      await result.current.export(ExportFormat.CSV);
    });

    expect(result.current.error).toContain('Auction not found');
  });

  it('should handle network error', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() =>
      useSquadExport('auction-1', 'Test Auction', 'Test Room')
    );

    await act(async () => {
      await result.current.export(ExportFormat.CSV);
    });

    expect(result.current.error).toContain('Network error');
  });

  it('should handle graceful JSON parse failure', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: vi.fn().mockRejectedValueOnce(new Error('Invalid JSON')),
    });

    const { result } = renderHook(() =>
      useSquadExport('auction-1', 'Test Auction', 'Test Room')
    );

    await act(async () => {
      await result.current.export(ExportFormat.CSV);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.error).toContain('500');
  });

  it('should trigger file download with correct filename', async () => {
    const mockCsvData = 'team,player\nTeamA,Player1';
    const mockBlob = new Blob([mockCsvData], { type: 'text/csv' });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      blob: vi.fn().mockResolvedValueOnce(mockBlob),
    });

    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);

    const { result } = renderHook(() =>
      useSquadExport('auction-12345678', 'My Auction', 'Test Room')
    );

    await act(async () => {
      await result.current.export(ExportFormat.CSV);
    });

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(mockLink.download).toContain('squad_export_auction1');
    expect(mockLink.download).toContain('My_Auction');
    expect(mockLink.download).toEndWith('.csv');
    expect(mockLink.click).toHaveBeenCalled();

    createElementSpy.mockRestore();
  });

  it('should handle missing token', async () => {
    localStorageMock.getItem.mockReturnValueOnce(null);

    const { result } = renderHook(() =>
      useSquadExport('auction-1', 'Test Auction', 'Test Room')
    );

    await act(async () => {
      await result.current.export(ExportFormat.CSV);
    });

    expect(result.current.error).toContain('Authentication required');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should handle empty blob response', async () => {
    const mockBlob = new Blob([], { type: 'text/csv' });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      blob: vi.fn().mockResolvedValueOnce(mockBlob),
    });

    const { result } = renderHook(() =>
      useSquadExport('auction-1', 'Test Auction', 'Test Room')
    );

    await act(async () => {
      await result.current.export(ExportFormat.CSV);
    });

    expect(result.current.error).toContain('empty');
  });

  it('should clean up object URL after download', async () => {
    const mockCsvData = 'team,player\nTeamA,Player1';
    const mockBlob = new Blob([mockCsvData], { type: 'text/csv' });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      blob: vi.fn().mockResolvedValueOnce(mockBlob),
    });

    const { result } = renderHook(() =>
      useSquadExport('auction-1', 'Test Auction', 'Test Room')
    );

    await act(async () => {
      await result.current.export(ExportFormat.CSV);
    });

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('should generate correct filename for different formats', async () => {
    const mockBlob = new Blob(['data'], { type: 'text/csv' });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(mockBlob),
    });

    const mockLink = { href: '', download: '', click: vi.fn() };
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);

    const { result } = renderHook(() =>
      useSquadExport('auction-abc12345', 'Test Event', 'Test Room')
    );

    // CSV export
    await act(async () => {
      await result.current.export(ExportFormat.CSV);
    });
    expect(mockLink.download).toEndWith('.csv');

    // Reset mock
    mockLink.download = '';

    // XLSX export
    await act(async () => {
      await result.current.export(ExportFormat.XLSX);
    });
    expect(mockLink.download).toEndWith('.xlsx');

    createElementSpy.mockRestore();
  });
});
