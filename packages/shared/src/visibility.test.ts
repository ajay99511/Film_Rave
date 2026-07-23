import { describe, expect, it } from 'vitest';
import { RatingsShared } from './enums.js';
import { isRatingShared, isRatingVisible } from './visibility.js';

const author = 'u1';
const rating = { user_id: author, movie_tmdb_id: 550 };

describe('isRatingShared', () => {
  it('approved shares everything', () => {
    expect(
      isRatingShared(rating, {
        user_id: author,
        ratings_shared: RatingsShared.Approved,
      }),
    ).toBe(true);
  });

  it('none shares nothing', () => {
    expect(
      isRatingShared(rating, {
        user_id: author,
        ratings_shared: RatingsShared.None,
      }),
    ).toBe(false);
  });

  it('selective shares only listed movies', () => {
    const member = {
      user_id: author,
      ratings_shared: RatingsShared.Selective,
      shared_movie_ids: [550],
    };
    expect(isRatingShared(rating, member)).toBe(true);
    expect(
      isRatingShared({ user_id: author, movie_tmdb_id: 99 }, member),
    ).toBe(false);
  });

  it('throws when member is not the rating author', () => {
    expect(() =>
      isRatingShared(rating, {
        user_id: 'someone-else',
        ratings_shared: RatingsShared.Approved,
      }),
    ).toThrow();
  });
});

describe('isRatingVisible', () => {
  it('author always sees own unshared rating', () => {
    expect(
      isRatingVisible(
        rating,
        { user_id: author, ratings_shared: RatingsShared.None },
        author,
      ),
    ).toBe(true);
  });

  it('others cannot see an unshared rating', () => {
    expect(
      isRatingVisible(
        rating,
        { user_id: author, ratings_shared: RatingsShared.None },
        'u2',
      ),
    ).toBe(false);
  });
});
