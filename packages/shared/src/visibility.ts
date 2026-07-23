/**
 * THE single implementation of the Rating Visibility Rule.
 * Ported verbatim from the Flutter app's `lib/providers/derived/visibility.dart`
 * so client and server enforce identical semantics. The server treats this as
 * authoritative: unshared ratings must never be serialized to another user.
 */
import { RatingsShared } from './enums.js';

export interface VisibilityMember {
  user_id: string;
  ratings_shared: RatingsShared;
  shared_movie_ids?: number[];
}

export interface VisibilityRating {
  user_id: string;
  movie_tmdb_id: number;
}

/**
 * Aggregate view: the plain sharing switch WITHOUT the self short-circuit.
 * Drives averages, "N of M rated", library inclusion, and group-average sort.
 * `member` must be the circle-member record of the rating's author.
 */
export function isRatingShared(
  rating: VisibilityRating,
  member: VisibilityMember,
): boolean {
  if (rating.user_id !== member.user_id) {
    throw new Error(
      'isRatingShared must be called with the rating author\'s member record',
    );
  }
  switch (member.ratings_shared) {
    case RatingsShared.Approved:
      return true;
    case RatingsShared.Selective:
      return member.shared_movie_ids?.includes(rating.movie_tmdb_id) ?? false;
    case RatingsShared.None:
      return false;
    default:
      return false;
  }
}

/**
 * Self-inclusive view: the current user always sees their own score
 * (labelled "only you" in the UI when unshared).
 */
export function isRatingVisible(
  rating: VisibilityRating,
  member: VisibilityMember,
  currentUserId: string,
): boolean {
  return rating.user_id === currentUserId || isRatingShared(rating, member);
}
