# Putt Request

Pixel-art mini golf for Orca's right sidebar, for the minutes you spend waiting on agents.

![Playing the first hole](media/demo.gif)

- Pull back on a hole and release to putt; the dots show your direction and power.
- **Main Branch** is a nine-hole course. Finishing a hole unlocks the next, and your place is saved.
- Finish the course to open **Endless**, which shuffles all nine holes and tracks your par streak.
- Your scores and streaks go on a leaderboard saved only in your copy of Orca.
- Walls, space and text follow your Orca theme.

It runs in a sandboxed panel with no network access. The only thing it asks for is to keep its own saved data.

## Develop

```sh
orca plugin validate .
orca plugin dev watch .
node --test tests/*.test.mjs
```
