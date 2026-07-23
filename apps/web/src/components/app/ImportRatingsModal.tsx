'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Upload, Check, FileText } from 'lucide-react';
import type { ImportResultDto } from '@filmrave/shared';
import { ApiError, imports } from '@/lib/client';

type Format = 'auto' | 'imdb' | 'letterboxd';

export function ImportRatingsModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResultDto | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    setError(null);
  };

  const run = async () => {
    if (!csv.trim()) {
      setError('Choose a CSV export first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await imports.ratings(csv, format);
      setResult(res);
      onImported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-lg bg-white dark:bg-[#1A1A1D] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Upload className="w-5 h-5 text-amber-500" /> Import Ratings
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="p-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <Check className="w-9 h-9 text-emerald-500" />
            </div>
            <h3 className="text-center text-lg font-bold mb-1">
              {result.staged_ratings.length} ratings imported
            </h3>
            <p className="text-center text-sm text-slate-500 mb-6">
              {result.matched} matched · {result.duplicates_skipped} already had ·{' '}
              {result.unmatched} couldn&apos;t be matched
            </p>
            {result.unmatched_titles.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Not matched
                </p>
                <div className="max-h-32 overflow-y-auto text-sm text-slate-500 space-y-1">
                  {result.unmatched_titles.map((t) => (
                    <div key={t} className="flex items-center gap-2">
                      <FileText className="w-3 h-3 shrink-0" /> {t}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <p className="text-sm text-slate-500">
              Export your ratings from IMDb or Letterboxd and drop the CSV here.
              Your imported ratings stay private until you share a circle.
            </p>
            <label className="block border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-orange-500 rounded-2xl p-8 text-center cursor-pointer transition-colors">
              <Upload className="w-8 h-8 mx-auto mb-3 text-slate-400" />
              <span className="font-bold block">
                {fileName ?? 'Tap to choose ratings.csv'}
              </span>
              <span className="text-xs text-slate-500">IMDb or Letterboxd export</span>
              <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
            </label>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Format
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['auto', 'imdb', 'letterboxd'] as Format[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`py-2 rounded-xl text-sm font-bold capitalize transition-colors ${
                      format === f
                        ? 'bg-orange-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-rose-500 text-sm">{error}</p>}
            <button
              onClick={run}
              disabled={busy || !csv.trim()}
              className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-xl"
            >
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
