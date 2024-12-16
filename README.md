This is a library for [Devvit - Reddit's Developer Platform](https://developers.reddit.com/).

It provides a function
```ts
getRealSubredditColors(subreddit_name: string, redis?: RedisClient): Promise<RealSubredditColors>
```
that returns the real subreddit colors for the given subreddit. If you are using redis this library
will automatically cache the latest colors every time the subreddit styles are changed. If you pass
the `RedisClient` to this function, it will return the cached colors instead of getting them again.
