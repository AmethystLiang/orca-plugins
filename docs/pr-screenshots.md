# The screenshots + GIF rule

## When it applies

The PR changes a plugin UI file that isn't a test. UI files are anything under:

- `plugins/*/panel/`
- `plugins/*/src/panel*` (for example Now Playing's `panel.ts` and `panel-css.ts`)
- `plugins/*/themes/` and `plugins/*/terminal/` (theme plugins like OLED Pair)
- `plugins/*/media/` (the cover and screenshots shown in the catalog)

Test files don't count: `*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/` and `tests/`. Any other PR passes right away.

## The two proofs

Both go in the PR body. Each one needs either the real thing or an n/a line with a reason.

| Proof | Passes when | Escape line |
|---|---|---|
| Screenshots | A `## Screenshots` heading with at least one image (`![…]` or `<img>`) | `Screenshots: n/a (<reason>)` |
| GIF walkthrough | Under `## Screenshots`, a `### Video:` block holding a `.gif` image or a GitHub user-attachments upload | `Videos: n/a (<reason>)` |

How the body is read:

- HTML comments are removed first, so the template's placeholder text can't satisfy the check.
- A `### Video:` block ends at the next heading. It only counts if it sits inside `## Screenshots`.
- One n/a line doesn't cover the other proof. A UI PR with nothing to show needs both lines.
- The reason in parentheses is required. A bare `n/a` fails.

## How it runs

`.github/workflows/pr-body.yml` runs `scripts/check_pr_screenshots.sh <pr>` when a PR is opened, edited, gets new commits, is reopened, or is marked ready for review. Because `edited` is included, fixing the body re-runs the check without a push. Draft PRs are skipped.

**The check is required.** A ruleset on `main` makes the `PR screenshots` status check required, so a UI PR can't merge until its body has both proofs or both n/a lines. The check re-runs when you edit the body, so you don't need a new push to clear it.

To check a body locally before opening the PR:

```bash
scripts/check_pr_screenshots.sh --body body.md --files changed-files.txt
```

`changed-files.txt` holds one path per line (for example, from `git diff --name-only main...HEAD`).

## Making the proofs

- **Stills:** capture Before from `main` and After from your branch, for example with a headless harness (Playwright loading the panel with a fake `window.orca`).
- **GIF:** record frames of the changed flow and encode them with ffmpeg, for example `ffmpeg -framerate 8 -i f%03d.png -vf "split[a][b];[a]palettegen[p];[b][p]paletteuse" demo.gif`.
- **Attach, never commit.** Upload images and GIFs with the `gh image` extension, or drag and drop them into the PR description. They become `github.com/user-attachments/...` links, which the check accepts. Don't add them to the PR's files. Design-round mockup pages may still live in `docs/design/`.
- Capture locally only.

See [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) for the rest of the PR requirements.

Ported from rhettworks' `scripts/check_pr_screenshots.sh` and `.github/workflows/pr-body.yml`. Its upload helpers (`pr_screenshots.sh`, `pr_video.sh`) were left out; use `gh image` or drag and drop instead.
