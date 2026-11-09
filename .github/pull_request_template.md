## ELI5

<!-- Simple high-level explanation, in plain language. No jargon. -->

## What Changed

<!-- Which plugin, and what changed. Cover the before and after as the user experiences it, and the mechanism you changed, not just the symptom. -->

## Why

<!-- What problem does this solve, and why is this approach better than the alternatives you considered? -->

## Linked Issue

_If you are an outside contributor and do not link an issue, your PR **will** be ignored. Refs is not sufficient. Link an actual issue._
<!-- Maintainers: only attach pre-existing issues; don't open needless ones. -->

Fixes #

## Screenshots

<!--
Visual proof. REQUIRED when the PR changes a plugin's UI: non-test files under
plugins/*/panel/, plugins/*/src/panel*, plugins/*/themes/, plugins/*/terminal/
or plugins/*/media/. Checked by the PR Body workflow (see docs/pr-screenshots.md).

Attach a BEFORE and AFTER image here. NEVER commit attachments to the PR's
files: use the `gh image` extension or drag and drop into this description.

Also add a GIF walkthrough of each changed flow, in its own block under this
heading:

  ### Video: <label>
  <drag the .gif here>

If there is truly no visual or interaction change, write both lines instead:

  Screenshots: n/a (<reason>)
  Videos: n/a (<reason>)
-->

## Testing

<!-- How did you verify this? Steps a reviewer can follow. Which platforms did you actually test (macOS / Linux / Windows / SSH)? -->

- [ ] I loaded the plugin in Orca (`orca plugin dev load`) and tried the change
- [ ] Automated tests added/updated, or explained why not below
- [ ] Every added test fails without this change

## Risk

<!-- What could this break, and for whom? Name the riskiest part and what users would see if it went wrong. Call out anything that crosses a boundary: saved plugin settings or storage, new capabilities (users see a new approval prompt), other platforms, SSH workspaces, agents, or performance. Say how to back it out: a plain revert, or what a revert would not undo. -->

**Level:** <!-- Low, Medium, or High -->

## AI Disclosure

<!-- Which AI models, if any, were used. -->

## Review

<!-- Code review summary from your AI coding agent. It must explicitly cover: cross-platform (macOS, Linux, Windows), SSH/remote/local, agent and integration compatibility, performance, UI quality when applicable, and security (including any new capabilities). -->

## Author

<!-- Your X (Twitter) handle, so we can shout you out when this ships. -->

X:

## Notes

Ensure no issues in: Security, Cross-platform support (Linux, Windows, Mac), Remote SSH, backwards compatibility with saved plugin settings, performance

## Checklist

- [ ] This PR is small and focused on one plugin
- [ ] I explained what changed and why (ELI5, the user-facing before/after, the mechanism, and why over the alternatives)
- [ ] I stated the risk: what could break, for whom, and how to back it out
- [ ] Before/after screenshots and a GIF attached for UI changes (not committed), or both `n/a` lines with reasons
- [ ] Self-reviewed for correctness, security, and performance
- [ ] Only the capabilities the plugin needs, each explained in its README
- [ ] Cross-platform and SSH/remote impact considered (or N/A)
- [ ] No comments in source
- [ ] `orca plugin validate`, `orca plugin test` and `orca plugin check` pass for each changed plugin
