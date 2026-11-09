# Contributing to orca-plugins

Thanks for contributing. This repo holds Orca plugins (`plugins/<id>/`) and the catalog that lists them (`orca-catalog.json`).

## Before You Start

- Keep each PR to one plugin and one clear improvement, bug fix, or refactor.
- Orca runs on macOS, Linux, and Windows. Plugin code must work on all three unless it is explicitly guarded by a runtime platform check. When a platform can't provide something, skip it rather than guess. See the per-OS readers in `plugins/activity-monitor/src/` for the pattern.
- Plugins can run against local, remote, and SSH workspaces. Do not assume a process, file, credential, shell, or network path exists only on the local machine.
- Orca supports many CLI agents and integrations. Keep generic behavior agent-neutral, and guard agent-specific logic behind explicit checks.
- Ask only for the capabilities the plugin uses (`capabilities` in `orca-plugin.json`). Every new capability shows up in the user's approval prompt, so explain each one in the plugin's README.
- Keep plugins light: avoid work in hot paths and background timers, and clean up what you start.
- No comments in source. Explanations go in the README, a doc, or the commit message.
- For UI work, use Orca's theme tokens (`--orca-*` CSS variables) so panels look right in light and dark themes, and check them at narrow and wide panel widths.

## Local Setup

You need the Orca desktop app; its CLI (`orca`) does the rest.

```bash
orca plugin dev load plugins/<id>
orca plugin dev watch plugins/<id>
```

`dev load` asks you to approve the plugin's access. `dev watch` streams logs and reloads on change.

## Branch Naming

Use a clear name that reflects the change, for example `fix/now-playing-cover-size`, `feat/activity-monitor-cleanup`, or `chore/contributing-guide`. Avoid vague names like `test`, `misc`, or `changes`.

## Before Opening a PR

For each plugin you changed, run:

```bash
orca plugin validate plugins/<id>
orca plugin test plugins/<id>
orca plugin check plugins/<id>
```

- `validate` checks the manifest the way Orca loads it.
- `test` runs the plugin's own tests, if it has a `tests/` folder.
- `check` renders each panel once.

Add tests for behavior changes and bug fixes, and make sure each one fails without your change. If your change affects UI or interaction, try it in Orca on the platforms it could affect.

## Pull Requests

Each PR follows [`.github/pull_request_template.md`](./pull_request_template.md). In particular:

- If you are an outside contributor, link the issue your PR addresses. PRs from outside contributors without a linked issue are ignored.
- Open with an ELI5 of the change, a plain-language paragraph. The PR title is the one-liner.
- Explain what changed and why, and keep to a single topic.
- For any UI or interaction change, add **before and after** screenshots and a GIF walkthrough under `## Screenshots`. The PR Body check enforces this; see [`docs/pr-screenshots.md`](../docs/pr-screenshots.md). If there is no visual or interaction change, write the `n/a` lines with a reason.
- **Never commit screenshots, GIFs, or videos to the PR's files.** Attach them with the `gh image` extension or drag and drop them into the PR description.
- Include tests when behavior changes or bug fixes warrant them.
- Include a brief code review summary from your AI coding agent. It must explicitly cover cross-platform compatibility, SSH/remote/local compatibility, agent and integration compatibility, performance, UI quality when applicable, and security, including any new capabilities.
- Mention any platform-specific, SSH-specific, or agent-specific behavior and how you tested it.
- **Include your X (Twitter) handle** in the template's Author section so we can shout you out when your change ships.

## Releases

Version bumps and catalog entries are maintainer-managed. Don't change a plugin's `version` or `orca-catalog.json` in a normal contribution unless a maintainer asks.

For maintainers:

- A release bumps the plugin's `version` in `orca-plugin.json` in its PR.
- After the PR merges, a follow-up commit adds the catalog entry from `orca plugin release-entry plugins/<id>`.
- Catalog entries pin a commit SHA, so merge PRs with a **merge commit**, never a squash.
