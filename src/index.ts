import { Devvit, RedisClient } from '@devvit/public-api';
import { JSDOM } from 'jsdom';
import { CSSStyleSheet, CSSStyleRule } from 'cssom';
import { assert } from 'assert';

Devvit.configure({
	http: true
});

export const REDIS_KEY = 'DEVVIT_REAL_SUBREDDIT_COLORS';

const CUSTOM_ASSERTION_ERROR = new assert.AssertionError();

/**
	Reddit currently has 6 style rule blocks:
	default and explicit light,
	default and explicit light stickied,
	browser style dark and not explicit light,
	browser style dark and not explicit light stickied,
	explicit dark,
	explicit dark stickied.
	The last two pairs use the same colors.
*/
export type Styles = 'light' | 'light stickied' | 'dark' | 'dark stickied';

export type CSSPropertyName = `--${string}`;

export type RealSubredditColors = { [style in Styles]: CSSPropertyName[] };


async function getCachedColors(redis?: RedisClient): Promise<RealSubredditColors> {
	if (redis) {
		const colors = await redis.get(REDIS_KEY);
		if (colors) {
			return JSON.parse(colors);
		}
	}
	return null;
}

function colorsHaveChanged(old_colors: RealSubredditColors, new_colors: RealSubredditColors): boolean {
	try {
		// this throws when the colors *are* equal
		assert.notDeepStrictEquals(old_colors,new_colors,CUSTOM_ASSERTION_ERROR);
		return true;
	} catch (e) {
		if (e === CUSTOM_ASSERTION_ERROR)) {
			return false;
		}
		throw new Error('An error occurred while checking if the current subreddit colors have changed since they were last cached.', { cause: e });
	}
}

/**
 Gets the real colors used on Sh / Shiny / New New Reddit.
 @param subreddit_name - The name of the subreddit to get the colors for.
 @param redis - The redis client. If given, this function will first attempt to get the cached color from redis before trying to get them from the subreddit.
 */
export async function getRealSubredditColors(subreddit_name: string, redis?: RedisClient): Promise<RealSubredditColors> {
	const cached_colors = await getCachedColors(redis);
	if (cached_colors) return cached_colors;

	const html = await fetch('https://sh.reddit.com/r/' + subreddit_name).then(r => r.text());
	const dom = new JSDOM(html);
	const style_element = dom.window.document.getElementById('community-styles-style-element') as HTMLStyleElement;
	// The JSDOM/CSSOM CSSStyleSheet is not quite the same as the spec CSSStyleSheet.
	const stylesheet = style_element.sheet as unknown as CSSStyleSheet;
	const rules = Array.from(
		stylesheet.cssRules
	).filter(
		(rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE
	).map(rule => {
		// Parse Selector
		let style: Styles;
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
		const properties: { [property: CSSPropertyName]: string } = {};
		for (let property of Array.from(style_declaration)) {
			if (property.startsWith('--')) {
				properties[property as CSSPropertyName] = style_declaration.getPropertyValue(property);
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

		const cached_colors = await getCachedColors(context.redis);
		// Is `event.subreddit` the subreddit name? If not:
		//const subreddit = (await context.reddit.getSubredditById(context.subredditId)).name;
		const new_colors = await getRealSubredditColors(event.subreddit);

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
