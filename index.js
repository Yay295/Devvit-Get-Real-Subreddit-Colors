import { Devvit } from '@devvit/public-api';
import { parseHTML } from 'linkedom';
import { CSSStyleSheet, CSSRule, CSSStyleRule } from 'cssom';
import { dequal } from 'dequal';

// It looks like we're trying to import from this same file, but TypeScript
// will actually try to import the types from the index.d.ts file instead.
/** @import { CSSPropertyName, Styles } from './index.js' */
/** @import { type getCachedColors as GetCachedColorsType } from './index.js' */
/** @import { type getRealSubredditColors as GetRealSubredditColorsType } from './index.js' */


Devvit.configure({
	http: true
});

export const REDIS_KEY = 'DEVVIT_REAL_SUBREDDIT_COLORS';


/** @type GetCachedColorsType */
async function getCachedColors(redis) {
	if (redis) {
		const colors = await redis.get(REDIS_KEY);
		if (colors) {
			return JSON.parse(colors);
		}
	}
	return null;
}

/** @type GetRealSubredditColorsType */
export async function getRealSubredditColors(subreddit_name,redis) {
	const cached_colors = await getCachedColors(redis);
	if (cached_colors) return cached_colors;

	const html = await fetch('https://sh.reddit.com/r/' + subreddit_name).then(r => r.text());
	const { document } = parseHTML(html);
	const style_element = /** @type {HTMLStyleElement} */ (document.getElementById('community-styles-style-element'));
	// The CSSOM CSSStyleSheet is not quite the same as the spec CSSStyleSheet.
	const stylesheet = /** @type {CSSStyleSheet} */ (/** @type {any} */ (style_element.sheet));
	const rules = Array.from(
		stylesheet.cssRules
	).filter(
		/**
		 * @param {CSSRule} rule
		 * @returns {rule is CSSStyleRule}
		 */
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
			colors_have_changed = !dequal(cached_colors,new_colors);
			if (colors_have_changed) {
				context.redis.set(REDIS_KEY,JSON.stringify(new_colors));
			}
		}

		if (colors_have_changed) {
			// TODO emit custom event with color values
		}
	}
});
