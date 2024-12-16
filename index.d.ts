/**
 * Reddit currently has 6 style rule blocks:
 * default and explicit light,
 * default and explicit light stickied,
 * browser style dark and not explicit light,
 * browser style dark and not explicit light stickied,
 * explicit dark,
 * explicit dark stickied.
 * The last two pairs use the same colors.
 */
export type Styles = 'light' | 'light stickied' | 'dark' | 'dark stickied';

export type CSSPropertyName = `--${string}`;

export type RealSubredditColors = {
	[style in Styles]: CSSPropertyName[];
};

import { RedisClient } from '@devvit/public-api';

export function getCachedColors(redis?: RedisClient | null): Promise<RealSubredditColors | null>;

/** Checks if the old and new colors are different. */
export function colorsHaveChanged(old_colors: RealSubredditColors, new_colors: RealSubredditColors): boolean;

/**
 * Gets the real colors used on Sh / Shiny / New New Reddit.
 * @param subreddit_name - The name of the subreddit to get the colors for.
 * @param redis - The redis client. If given, this function will first attempt to get the cached color from redis before trying to get them from the subreddit.
 */
export function getRealSubredditColors(subreddit_name: string, redis?: RedisClient | null): Promise<RealSubredditColors>;
