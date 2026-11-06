# Putt Request

Pixel-art mini golf for Orca's right sidebar, for the minutes you spend waiting on agents.

![Playing the first hole](media/demo.gif)

- Pull back on a hole and release to putt; the dots show your direction and power.
- Three nine-hole courses: **Main Branch**, **Feature Branch** and **Hotfix**. Finishing a course unlocks the next. Finishing a hole unlocks the next hole, and your place is saved.
- Finish Main Branch to open **Endless**, which shuffles the holes of every course you have finished and tracks your par streak.
- Your leaderboard shows your best total across all three courses and your best Endless streak. It is saved only in your copy of Orca.
- Walls, space and text follow your Orca theme.

It runs in a sandboxed panel with no network access. The only thing it asks for is to keep its own saved data.

## Develop

```sh
orca plugin validate .
orca plugin dev watch .
node --test tests/*.test.mjs
```
