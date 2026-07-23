'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Bell, CheckCheck } from 'lucide-react';
import type { NotificationDto } from '@filmrave/shared';
import { notifications as notifApi } from '@/lib/client';
import { timeAgo } from '@/lib/ui';

export function NotificationsPanel({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    notifApi
      .list()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const markAll = async () => {
    await notifApi.markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <motion.div
        initial={{ x: 400 }}
        animate={{ x: 0 }}
        exit={{ x: 400 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm h-full bg-white dark:bg-[#141417] border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl"
      >
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-500" /> Notifications
          </h2>
          <div className="flex items-center gap-3">
            <button onClick={markAll} title="Mark all read" className="text-slate-400 hover:text-orange-500">
              <CheckCheck className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-6 text-sm text-slate-500">Loading…</p>}
          {!loading && items.length === 0 && (
            <div className="p-10 text-center text-slate-500">
              <Bell className="w-8 h-8 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
              <p className="text-sm">You&apos;re all caught up.</p>
            </div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              className={`p-4 border-b border-slate-100 dark:border-slate-800/50 ${
                n.read_at ? '' : 'bg-orange-50/60 dark:bg-orange-950/10'
              }`}
            >
              <div className="flex items-start gap-3">
                {!n.read_at && <span className="w-2 h-2 mt-2 rounded-full bg-orange-500 shrink-0" />}
                <div className={n.read_at ? 'pl-5' : ''}>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{n.title}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{n.body}</p>
                  <p className="text-[10px] font-mono text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
