'use client';

import React, { useState, useEffect } from 'react';
import { Download, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { ExportFormat } from '@uth/contracts';
import { useSquadExport } from '../../hooks/useSquadExport';

interface ExportButtonProps {
  auctionId: string;
  auctionName: string;
  roomName: string;
  disabled?: boolean;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  auctionId,
  auctionName,
  roomName,
  disabled = false,
}) => {
  const { export: exportSquad, loading, error, success } = useSquadExport(auctionId, auctionName, roomName);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Hide success message after 3 seconds
  useEffect(() => {
    if (success) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleCsvExport = async () => {
    setErrorDismissed(false);
    await exportSquad(ExportFormat.CSV);
  };

  const handleXlsxExport = async () => {
    setErrorDismissed(false);
    await exportSquad(ExportFormat.XLSX);
  };

  const handleDismissError = () => {
    setErrorDismissed(true);
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Export Squad</h3>
        {loading && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
      </div>

      {error && !errorDismissed && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button
              onClick={handleDismissError}
              className="mt-2 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-300">Export completed successfully!</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleCsvExport}
          disabled={disabled || loading}
          className="
            flex items-center justify-center gap-2 px-4 min-h-[44px]
            bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
            dark:bg-blue-600 dark:hover:bg-blue-700 dark:disabled:bg-gray-700
            text-white text-sm font-medium rounded
            transition-colors duration-200
            cursor-pointer
          "
          title="Download squad data as CSV"
          aria-label="Export squad as CSV"
        >
          <Download className="w-4 h-4 flex-shrink-0" />
          <span>CSV</span>
          {loading && <Loader2 className="w-4 h-4 animate-spin ml-1 flex-shrink-0" />}
        </button>

        <button
          onClick={handleXlsxExport}
          disabled={disabled || loading}
          className="
            flex items-center justify-center gap-2 px-4 min-h-[44px]
            bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed
            dark:bg-green-600 dark:hover:bg-green-700 dark:disabled:bg-gray-700
            text-white text-sm font-medium rounded
            transition-colors duration-200
            cursor-pointer
          "
          title="Download squad data as Excel"
          aria-label="Export squad as Excel"
        >
          <Download className="w-4 h-4 flex-shrink-0" />
          <span>XLSX</span>
          {loading && <Loader2 className="w-4 h-4 animate-spin ml-1 flex-shrink-0" />}
        </button>
      </div>

      {loading && (
        <p className="text-xs text-slate-600 dark:text-slate-400">Generating export...</p>
      )}

      {!loading && !error && !showSuccess && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Download squad data in CSV or Excel format.
        </p>
      )}
    </div>
  );
};

export default ExportButton;
