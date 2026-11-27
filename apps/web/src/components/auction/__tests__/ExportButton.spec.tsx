import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ExportButton } from '../ExportButton';
import { ExportFormat } from '@uth/contracts';

// Mock the useSquadExport hook
vi.mock('../../hooks/useSquadExport', () => ({
  useSquadExport: vi.fn(),
}));

import * as useSquadExportModule from '../../hooks/useSquadExport';

describe('ExportButton', () => {
  const defaultProps = {
    auctionId: 'auction-1',
    auctionName: 'PSL 2026',
    roomName: 'Room A',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('should render both CSV and XLSX buttons', () => {
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: vi.fn(),
      loading: false,
      error: null,
    });

    render(<ExportButton {...defaultProps} />);

    expect(screen.getByText('CSV')).toBeTruthy();
    expect(screen.getByText('XLSX')).toBeTruthy();
  });

  it('should disable buttons when loading', () => {
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: vi.fn(),
      loading: true,
      error: null,
    });

    render(<ExportButton {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      expect(button).toHaveAttribute('disabled');
    });
  });

  it('should show loading spinner during export', () => {
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: vi.fn(),
      loading: true,
      error: null,
    });

    render(<ExportButton {...defaultProps} />);

    // Check for Loader2 animation elements
    const spinnerElements = document.querySelectorAll('.animate-spin');
    expect(spinnerElements.length).toBeGreaterThan(0);
  });

  it('should call export with CSV format on CSV button click', async () => {
    const mockExport = vi.fn();
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: mockExport,
      loading: false,
      error: null,
    });

    render(<ExportButton {...defaultProps} />);

    const csvButton = screen.getByText('CSV').closest('button');
    fireEvent.click(csvButton!);

    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledWith(ExportFormat.CSV);
    });
  });

  it('should call export with XLSX format on XLSX button click', async () => {
    const mockExport = vi.fn();
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: mockExport,
      loading: false,
      error: null,
    });

    render(<ExportButton {...defaultProps} />);

    const xlsxButton = screen.getByText('XLSX').closest('button');
    fireEvent.click(xlsxButton!);

    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledWith(ExportFormat.XLSX);
    });
  });

  it('should display error message when export fails', () => {
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: vi.fn(),
      loading: false,
      error: 'Export failed: Not authorized',
    });

    render(<ExportButton {...defaultProps} />);

    expect(screen.getByText('Export failed: Not authorized')).toBeTruthy();
  });

  it('should show retry button in error state', () => {
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: vi.fn(),
      loading: false,
      error: 'Export failed',
    });

    render(<ExportButton {...defaultProps} />);

    const dismissButton = screen.getByText('Dismiss');
    expect(dismissButton).toBeTruthy();
  });

  it('should dismiss error when dismiss button is clicked', async () => {
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: vi.fn(),
      loading: false,
      error: 'Export failed',
    });

    render(<ExportButton {...defaultProps} />);

    const errorText = screen.getByText('Export failed: Not authorized');
    expect(errorText).toBeTruthy();

    const dismissButton = screen.getByText('Dismiss');
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByText('Export failed: Not authorized')).toBeFalsy();
    });
  });

  it('should disable buttons when disabled prop is true', () => {
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: vi.fn(),
      loading: false,
      error: null,
    });

    render(<ExportButton {...defaultProps} disabled={true} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      expect(button).toHaveAttribute('disabled');
    });
  });

  it('should show loading state description', () => {
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: vi.fn(),
      loading: true,
      error: null,
    });

    render(<ExportButton {...defaultProps} />);

    expect(screen.getByText('Generating export...')).toBeTruthy();
  });

  it('should show help text when no error', () => {
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: vi.fn(),
      loading: false,
      error: null,
    });

    render(<ExportButton {...defaultProps} />);

    expect(screen.getByText(/Download squad data in CSV or Excel format/)).toBeTruthy();
  });

  it('should handle multiple export attempts', async () => {
    const mockExport = vi.fn();
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: mockExport,
      loading: false,
      error: null,
    });

    render(<ExportButton {...defaultProps} />);

    const csvButton = screen.getByText('CSV').closest('button');
    const xlsxButton = screen.getByText('XLSX').closest('button');

    fireEvent.click(csvButton!);
    await waitFor(() => expect(mockExport).toHaveBeenCalledWith(ExportFormat.CSV));

    mockExport.mockClear();

    fireEvent.click(xlsxButton!);
    await waitFor(() => expect(mockExport).toHaveBeenCalledWith(ExportFormat.XLSX));

    expect(mockExport).toHaveBeenCalledTimes(1);
  });

  it('should pass correct props to useSquadExport hook', () => {
    const useSquadExportMock = vi.fn().mockReturnValue({
      export: vi.fn(),
      loading: false,
      error: null,
    });

    (useSquadExportModule.useSquadExport as any) = useSquadExportMock;

    render(<ExportButton {...defaultProps} />);

    expect(useSquadExportMock).toHaveBeenCalledWith('auction-1', 'PSL 2026', 'Room A');
  });

  it('should have accessible button titles', () => {
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: vi.fn(),
      loading: false,
      error: null,
    });

    render(<ExportButton {...defaultProps} />);

    const csvButton = screen.getByText('CSV').closest('button');
    const xlsxButton = screen.getByText('XLSX').closest('button');

    expect(csvButton?.getAttribute('title')).toContain('CSV');
    expect(xlsxButton?.getAttribute('title')).toContain('Excel');
  });

  it('should maintain error across re-renders when not dismissed', async () => {
    const mockExport = vi.fn();
    const { rerender } = render(
      <ExportButton
        {...defaultProps}
        {...{
          useSquadExport: vi.fn().mockReturnValue({
            export: mockExport,
            loading: false,
            error: 'Export failed',
          }),
        }}
      />
    );

    // Setup hook with error
    (useSquadExportModule.useSquadExport as any).mockReturnValue({
      export: mockExport,
      loading: false,
      error: 'Export failed',
    });

    rerender(<ExportButton {...defaultProps} />);

    // Error should still be visible
    expect(screen.getByText('Export failed')).toBeTruthy();
  });
});
