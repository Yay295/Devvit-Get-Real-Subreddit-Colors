This is a library for [Devvit - Reddit's Developer Platform](https://developers.reddit.com/).

It provides a function
```ts
getRealSubredditColors(subreddit_name: string, redis?: RedisClient): Promise<RealSubredditColors>
```
that returns the real subreddit colors for the given subreddit. If you are using redis this library
will automatically cache the latest colors every time the subreddit styles are changed. If you pass
the `RedisClient` to this function, it will return the cached colors instead of getting them again.

This module is not in npm. You can depend on it like this:
```json
{
  "dependencies": {
    "devvit-get-real-subreddit-colors": "github:Yay295/Devvit-Get-Real-Subreddit-Colors"
  }
}
```
You can depend on a specific version by adding the commit ID to the end like this:
```json
{
  "dependencies": {
    "devvit-get-real-subreddit-colors": "github:Yay295/Devvit-Get-Real-Subreddit-Colors#dcedb91"
  }
}
```
