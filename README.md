# Orca plugins

My personal plugins for [Orca](https://github.com/stablyai/orca). This repository is an Orca catalog, so it can hold any kind of plugin: themes, panels, commands and more.

| Plugin | What it adds |
| --- | --- |
| [OLED Pair](plugins/oled-pair) | True black and true white themes with matching terminal colors |
| [Activity Monitor](plugins/activity-monitor) | Live CPU, memory, network, disk, GPU and processes in the sidebar, with a health strip that warns before your computer locks up |
| [Putt Request](plugins/putt-request) | Pixel-art mini golf for the wait between agents, with a private leaderboard |
| [Now Playing](plugins/now-playing) | Control Spotify from the sidebar: now playing, search, playlists, queue and devices |

## Install

In Orca, go to Settings → Plugins → ⋯ → Catalog sources, add `https://github.com/aamonnaig4/orca-plugins.git` with ref `main`, then install from the catalog.

## Add a plugin

1. Scaffold it: `orca plugin create plugins/<name> --template <template>`.
2. Try it locally: `orca plugin dev load plugins/<name>`.
3. Commit it, then run `orca plugin release-entry plugins/<name>`.
4. Add the printed release to `orca-catalog.json`, with `source.path` set to `plugins/<name>`, and commit.
5. Run `orca plugin validate orca-catalog.json`, then push.

To update a plugin, raise its `version` and repeat steps 3 to 5. List the newest release first.
