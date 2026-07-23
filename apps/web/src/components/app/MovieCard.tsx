import { motion } from 'motion/react';
import { MessageCircle, Star, History } from 'lucide-react';
import type { FeedItemDto } from '@filmrave/shared';

export function MovieCard({
  item,
  onOpen,
}: {
  item: FeedItemDto;
  onOpen: () => void;
}) {
  const { movie, group_average, shared_rated_count, my_rating, comment_count } =
    item;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className="bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 transition-colors shadow-lg dark:shadow-xl cursor-pointer flex flex-col group/card"
    >
      <div className="relative h-64 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#141417] to-transparent z-10" />
        {movie.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={movie.poster_url}
            alt={movie.title}
            className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full bg-slate-200 dark:bg-slate-800" />
        )}
        <div className="absolute bottom-4 left-4 z-20">
          <div className="flex items-center gap-2 mb-1">
            {movie.year && (
              <span className="text-xs font-mono px-2 py-0.5 bg-white/80 dark:bg-slate-800/80 rounded-full text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm shadow-sm">
                {movie.year}
              </span>
            )}
            {item.co_watched && (
              <span className="text-xs font-mono px-2 py-0.5 bg-emerald-500/90 rounded-full text-white flex items-center gap-1 shadow-sm">
                <History className="w-3 h-3" /> Co-watched
              </span>
            )}
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase italic tracking-tight">
            {movie.title}
          </h3>
        </div>
      </div>
      <div className="p-5">
        {movie.overview && (
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-6 line-clamp-3">
            {movie.overview}
          </p>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/50 pt-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Star
                className={`w-5 h-5 ${my_rating ? 'fill-orange-500 text-orange-500' : 'text-slate-400 dark:text-orange-500/50'}`}
              />
              <div className="flex flex-col items-start leading-none">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {group_average != null ? group_average.toFixed(1) : '—'}
                </span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mt-1">
                  {shared_rated_count} shared
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              <div className="flex flex-col items-start leading-none">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {comment_count}
                </span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                  Discussion
                </span>
              </div>
            </div>
          </div>
          {my_rating != null && (
            <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-orange-500/40">
              {my_rating}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
