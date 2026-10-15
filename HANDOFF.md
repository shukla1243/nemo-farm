# NEMO FRNS FARM: coming-soon build (handoff)

## What this is

A maintenance / coming-soon screen for NEMO FRNS FARM, built as a FriendSDK 1.0 game so it can be
mounted on rarefriends.com now, while the full game is finished.

- Manifest: id `nemo-farm`, title `NEMO FRNS FARM`, version `0.1.0`.
- Client only: no server rules, no actions, no items, no currency. Nothing can be bought or paid.
- The screen shows a small dusk island drawn from the full game's isometric pixel art, with the
  player's own Friend (from `game.art`) waiting on the dock, a short teaser of what is coming and a
  "Follow updates on X" button (`game.openLink`).
- It honours `game.paused` and `prefers-reduced-motion`, keeps the host's full-screen corner free,
  and works from 320 px wide in portrait and landscape. It has no audio.
- Display bounds: `minAspectRatio` 9:20, `maxAspectRatio` 21:9.

## Build

Node.js 22 or later.

```sh
npm ci
npx friendsdk check
npx friendsdk build      # writes .friendsdk/build
```

`contract-request.json` in the build is empty of actions and items: no contracts are needed.

## Publish (owner guide steps that apply)

This build has no actions, so the contract, terms, deployment record, compose and keeper steps of
the release sequence do not apply.

1. Run `friendsdk check` and `friendsdk build` (above).
2. Add the build to the games origin and deploy it:
   `friendsdk site --out games-site <path>/nemo-teaser/.friendsdk/build`
   This publishes `games-site/nemo-farm/0.1.0/`.
3. Mount it on the website with `game.url`
   `https://play.rarefriends.com/nemo-farm/0.1.0/index.html`, the published `friendsdk.json` as
   `game.manifest`, and `game.record: null`. No deployment record is needed.
4. Nakama: the game has no server rules, so it adds nothing to the composed module.

## Later

Version `1.0.0` of the same id, `nemo-farm`, is the full game. It will replace this build on the
games origin and the website; this `0.1.0` stays published and immutable as the site requires.
