'use client';

import { useState, useCallback } from 'react';
import { ExportFormat } from '@uth/contracts';

interface UseSquadExportState {
  export: (format: ExportFormat) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export const useSquadExport = (auctionId: string, auctionName: string, roomName: string): UseSquadExportState => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateFilename = useCallback((format: ExportFormat): string => {
    const shortId = auctionId.substring(0, 8);
    const sanitized = sanitizeFilename(auctionName || 'export');
    const timestamp = new Date().toISOString().split('T')[0];
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

        const response = await fetch(`/api/v1/auctions/${auctionId}/export?format=${format}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          let errorMessage = `Export failed with status ${response.status}`;
          try {
            const errorBody = await response.json();
            errorMessage = errorBody.message || errorMessage;
          } catch {
            errorMessage = response.statusText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const blob = await response.blob();

        if (blob.size === 0) {
          throw new Error('Export file is empty');
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = generateFilename(format);

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

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

  return { export: handleExport, loading, error };
};
