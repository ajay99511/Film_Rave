import type { AppUserDto } from '@filmrave/shared';
import { cn, initials, userColor } from '@/lib/ui';

interface AvatarProps {
  user: Pick<AppUserDto, 'user_id' | 'display_name' | 'avatar_color' | 'avatar_url'>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  ring?: boolean;
  className?: string;
}

const SIZES = {
  xs: 'w-5 h-5 text-[8px]',
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-lg',
} as const;

export function Avatar({ user, size = 'md', ring, className }: AvatarProps) {
  const ringClass = ring && 'border-2 border-white dark:border-[#0A0A0B]';
  if (user.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatar_url}
        alt={user.display_name}
        title={user.display_name}
        referrerPolicy="no-referrer"
        className={cn('rounded-full object-cover shrink-0 shadow-sm', SIZES[size], ringClass, className)}
      />
    );
  }
  return (
    <div
      title={user.display_name}
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white shrink-0 shadow-sm',
        SIZES[size],
        userColor(user),
        ringClass,
        className,
      )}
    >
      {initials(user.display_name)}
    </div>
  );
}
