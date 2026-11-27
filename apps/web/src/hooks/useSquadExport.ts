'use client';

import { useState, useCallback } from 'react';
import { ExportFormat } from '@uth/contracts';

interface UseSquadExportState {
  export: (format: ExportFormat) => Promise<void>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to handle squad export functionality.
 * Fetches export from backend and triggers browser download.
 * Handles CSV and XLSX formats.
 */
export const useSquadExport = (auctionId: string, auctionName: string, roomName: string): UseSquadExportState => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateFilename = useCallback((format: ExportFormat): string => {
    const shortId = auctionId.substring(0, 8);
    const sanitized = sanitizeFilename(auctionName || 'export');
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const ext = format === ExportFormat.CSV ? 'csv' : 'xlsx';
    return `squad_export_${shortId}_${sanitized}_${timestamp}.${ext}`;
  }, [auctionId, auctionName]);

  const sanitizeFilename = (input: string): string => {
    let sanitized = input.replace(/[^\w\s\-.]/g, '_');
    sanitized = sanitized.replace(/[\s_]+/g, '_').trim().replace(/^_|_$/g, '');
    if (!sanitized) {
      sanitized = 'export';
    }
    return sanitized.substring(0, 200);
  };

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Authentication required');
        }

        // Fetch export from backend
        const response = await fetch(`/api/v1/auctions/${auctionId}/export?format=${format}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          // Try to parse JSON error response
          let errorMessage = `Export failed with status ${response.status}`;
          try {
            const errorBody = await response.json();
            errorMessage = errorBody.message || errorMessage;
          } catch {
            // If JSON parsing fails, use status text
            errorMessage = response.statusText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        // Get the response as blob
        const blob = await response.blob();

        // Verify blob is not empty
        if (blob.size === 0) {
          throw new Error('Export file is empty');
        }

        // Create object URL and download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = generateFilename(format);

        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up object URL
        URL.revokeObjectURL(url);

        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred during export';
        setError(errorMessage);
        console.error('Export error:', err);
      } finally {
        setLoading(false);
      }
    },
    [auctionId, generateFilename]
  );

  return {
    export: handleExport,
    loading,
    error,
  };
};
