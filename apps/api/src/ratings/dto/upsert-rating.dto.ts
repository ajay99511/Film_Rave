import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { RatingSource } from '@filmrave/shared';

export class UpsertRatingDto {
  @IsInt()
  movie_tmdb_id!: number;

  // Invariant mirrored from the Flutter client: 1 <= score <= 10.
  @IsInt()
  @Min(1)
  @Max(10)
  score!: number;

  @IsEnum(RatingSource)
  source: RatingSource = RatingSource.App;
}
