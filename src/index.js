import { Devvit } from '@devvit/public-api';
import { JSDOM } from 'jsdom';
import { CSSStyleSheet, CSSStyleRule } from 'cssom';
import assert from 'node:assert';

Devvit.configure({
	http: true
});

export const REDIS_KEY = 'DEVVIT_REAL_SUBREDDIT_COLORS';

const CUSTOM_ASSERTION_ERROR = new assert.AssertionError();

/**
 * @typedef {import('@devvit/public-api').RedisClient} RedisClient
 */

/**
 * Reddit currently has 6 style rule blocks:
 * default and explicit light,
 * default and explicit light stickied,
 * browser style dark and not explicit light,
 * browser style dark and not explicit light stickied,
 * explicit dark,
 * explicit dark stickied.
 * The last two pairs use the same colors.
 * @typedef {'light' | 'light stickied' | 'dark' | 'dark stickied'} Styles
 */

/**
 * @typedef {`--${string}`} CSSPropertyName
 */

/**
 * @typedef {{[style in Styles]: CSSPropertyName[]}} RealSubredditColors
 */


/**
 * @param {?RedisClient} [redis]
 * @returns {Promise<?RealSubredditColors>}
 */
async function getCachedColors(redis) {
	if (redis) {
		const colors = await redis.get(REDIS_KEY);
		if (colors) {
			return JSON.parse(colors);
		}
	}
	return null;
}

/**
 * Checks if the old and new colors are different.
 * @param {RealSubredditColors} old_colors 
 * @param {RealSubredditColors} new_colors 
 * @returns {boolean}
 */
function colorsHaveChanged(old_colors,new_colors) {
	try {
		// this throws when the colors *are* equal
		assert.notDeepStrictEqual(old_colors,new_colors,CUSTOM_ASSERTION_ERROR);
		return true;
	} catch (e) {
		if (e === CUSTOM_ASSERTION_ERROR) {
			return false;
		}
		throw new Error('An error occurred while checking if the current subreddit colors have changed since they were last cached.', { cause: e });
	}
}

/**
 * Gets the real colors used on Sh / Shiny / New New Reddit.
 * @param {string} subreddit_name - The name of the subreddit to get the colors for.
 * @param {?RedisClient} [redis] - The redis client. If given, this function will first attempt to get the cached color from redis before trying to get them from the subreddit.
 * @returns {Promise<RealSubredditColors>}
 */
export async function getRealSubredditColors(subreddit_name,redis) {
	const cached_colors = await getCachedColors(redis);
	if (cached_colors) return cached_colors;

	const html = await fetch('https://sh.reddit.com/r/' + subreddit_name).then(r => r.text());
	const dom = new JSDOM(html);
	const style_element = /** @type {HTMLStyleElement} */ (dom.window.document.getElementById('community-styles-style-element'));
	// The JSDOM/CSSOM CSSStyleSheet is not quite the same as the spec CSSStyleSheet.
	const stylesheet = /** @type {CSSStyleSheet} */ (/** @type {any} */ (style_element.sheet));
	const rules = Array.from(
		stylesheet.cssRules
	).filter(
		/**
		 * @param {CSSRule} rule
		 * @returns {rule is CSSStyleRule}
		 */
		// @ts-ignore
		rule => rule.constructor.name === 'CSSStyleRule'
	).map(rule => {
		// Parse Selector
		let /** @type {Styles} */ style;
		if (rule.selectorText.startsWith(':root .sidebar-grid,')) {
			style = 'light';
		} else if (rule.selectorText.startsWith(':root .sidebar-grid .theme-beta.stickied,')) {
			style = 'light stickied';
		} else if (rule.selectorText.startsWith(':root.theme-dark .sidebar-grid,')) {
			style = 'dark';
		} else if (rule.selectorText.startsWith(':root.theme-dark .sidebar-grid .theme-beta.stickied,')) {
			style = 'dark stickied';
		} else {
			return null;
		}
		// Collect Properties
		const style_declaration = rule.style;
		const /** @type {{[property:CSSPropertyName]:string}} */ properties = {};
		for (const property of Array.from(style_declaration)) {
			if (property.startsWith('--')) {
				const css_property_name = /** @type {CSSPropertyName} */ (property);
				properties[css_property_name] = style_declaration.getPropertyValue(property);
			}
		}
		return [style,properties];
	}).filter(
		style => style !== null
	);
	return Object.fromEntries(rules);
}

// https://developers.reddit.com/docs/event_triggers/
Devvit.addTrigger({
	events: ['AppInstall','AppUpgrade','ModAction'],
	onEvent: async (event,context) => {
		// https://developers.reddit.com/docs/mod_actions/
		if (event.type === 'ModAction' && event.action !== 'community_styling') {
			return;
		}

		// This should always be set, but we need to check to make TypeScript happy.
		if (!event.subreddit) {
			return;
		}

		const cached_colors = await getCachedColors(context.redis);
		const new_colors = await getRealSubredditColors(event.subreddit.name);

		let colors_have_changed = true;

		if (cached_colors) {
			colors_have_changed = colorsHaveChanged(cached_colors,new_colors);
			if (colors_have_changed) {
				context.redis.set(REDIS_KEY,JSON.stringify(new_colors));
			}
		}

		if (colors_have_changed) {
			// TODO emit custom event with color values
		}
	}
});

export default Devvit;
