/**
 * ELO rating calculation (FIDE-style)
 */

/**
 * K-factor based on rating and games played.
 * FIDE rules:
 *  - K=40 for new players (< 30 games or rating < 1000)
 *  - K=20 for players rated < 2400
 *  - K=10 for players rated >= 2400
 */
export function getKFactor(rating: number, gamesPlayed: number): number {
  if (gamesPlayed < 30 || rating < 1000) return 40;
  if (rating < 2400) return 20;
  return 10;
}

/**
 * Expected score for player A against player B.
 * Returns a value between 0 and 1.
 *
 * Rule of 400: if the rating difference exceeds 400 points,
 * it is capped at 400 to protect strong players from large
 * unexpected losses and limit the expected score spread.
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  const MAX_DIFF = 400;
  const diff = Math.max(-MAX_DIFF, Math.min(MAX_DIFF, ratingA - ratingB));
  return 1 / (1 + Math.pow(10, -diff / 400));
}

/**
 * Calculate new ratings after a game.
 * @param whiteRating  Current white rating
 * @param blackRating  Current black rating
 * @param result       1 = white wins, 0 = black wins, 0.5 = draw
 * @param whiteGames   Games played by white (for K-factor)
 * @param blackGames   Games played by black (for K-factor)
 */
export function calculateNewRatings(
  whiteRating: number,
  blackRating: number,
  result: 1 | 0 | 0.5,
  whiteGames = 30,
  blackGames = 30
): { whiteNew: number; blackNew: number; whiteChange: number; blackChange: number } {
  const kWhite = getKFactor(whiteRating, whiteGames);
  const kBlack = getKFactor(blackRating, blackGames);

  const expectedWhite = expectedScore(whiteRating, blackRating);
  const expectedBlack = 1 - expectedWhite;

  const actualWhite = result;
  const actualBlack = 1 - result;

  const whiteChange = Math.round(kWhite * (actualWhite - expectedWhite));
  const blackChange = Math.round(kBlack * (actualBlack - expectedBlack));

  return {
    whiteNew: Math.max(100, whiteRating + whiteChange),
    blackNew: Math.max(100, blackRating + blackChange),
    whiteChange,
    blackChange,
  };
}
