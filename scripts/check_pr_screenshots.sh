#!/usr/bin/env bash

set -uo pipefail

REPO_SLUG="${GITHUB_REPOSITORY:-aamonnaig4/orca-plugins}"

usage() {
    echo "Usage: $0 <pr-number>" >&2
    echo "   or: $0 --body <file> --files <file>" >&2
}

body=""
files=""

if [ "${1:-}" = "--body" ]; then
    if [ "$#" -lt 4 ] || [ "${3:-}" != "--files" ]; then
        echo "check_pr_screenshots: --body requires a matching --files <file>." >&2
        usage
        exit 2
    fi
    body_file="$2"
    files_file="$4"
    if [ ! -f "$body_file" ] || [ ! -f "$files_file" ]; then
        echo "check_pr_screenshots: --body/--files file not found." >&2
        exit 2
    fi
    body=$(cat "$body_file")
    files=$(cat "$files_file")
else
    pr="${1:-}"
    if [ -z "$pr" ]; then
        echo "check_pr_screenshots: missing PR number." >&2
        usage
        exit 2
    fi
    case "$pr" in
        ''|*[!0-9]*)
            echo "check_pr_screenshots: PR number must be digits, got: $pr" >&2
            exit 2
            ;;
    esac

    if ! body=$(gh api "repos/$REPO_SLUG/pulls/$pr" --jq '.body // ""' 2>&1); then
        echo "check_pr_screenshots: could not read PR #$pr body:" >&2
        echo "$body" >&2
        exit 2
    fi

    if ! files=$(gh api "repos/$REPO_SLUG/pulls/$pr/files" --paginate --jq '.[].filename' 2>&1); then
        echo "check_pr_screenshots: could not list changed files for PR #$pr:" >&2
        echo "$files" >&2
        exit 2
    fi
fi

needs_screenshot=0
while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
        plugins/*/panel/*|plugins/*/src/panel*|plugins/*/themes/*|plugins/*/terminal/*|plugins/*/media/*)
            case "$f" in
                *.test.*|*.spec.*|*/__tests__/*|*/__mocks__/*|*/tests/*) continue ;;
            esac
            needs_screenshot=1
            ;;
    esac
done <<<"$files"

if [ "$needs_screenshot" -eq 0 ]; then
    echo "check_pr_screenshots: OK — no plugin UI file changed; no screenshot required."
    exit 0
fi

strip_html_comments() {
    awk '
        { text = text $0 "\n" }
        END {
            out = ""
            s = text
            while ((i = index(s, "<!--")) > 0) {
                out = out substr(s, 1, i - 1)
                rest = substr(s, i + 4)
                j = index(rest, "-->")
                if (j == 0) {
                    s = ""
                    break
                }
                s = substr(rest, j + 3)
            }
            out = out s
            printf "%s", out
        }
    '
}

visible_body=$(printf '%s\n' "$body" | strip_html_comments)

has_na_line() {
    printf '%s\n' "$visible_body" | grep -qE "^[[:space:]]{0,3}$1:[[:space:]]*n/a[[:space:]]*\([^)]+\)[[:space:]]*\$"
}

proof_awk='
function is_video(l) {
    return l ~ /!\[[^]]*\]\([^) ]*\.gif([?#][^) ]*)?([ \t]+"[^"]*")?\)/ ||
        l ~ /<img[^>]*src="[^"]*\.gif/ ||
        l ~ /https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f]/
}
{ line = tolower($0) }
line ~ /^ ? ? ?## screenshots/ { seen = 1; in_shots = 1; in_video = 0; next }
line ~ /^ ? ? ?### video:/ { in_video = in_shots; next }
line ~ /^ ? ? ?(#|##)([ \t\r]|$)/ { in_shots = 0; in_video = 0; next }
line ~ /^ ? ? ?###([ \t\r]|$)/ { in_video = 0; next }
in_video && is_video(line) { video = 1; next }
seen && (line ~ /!\[/ || line ~ /<img[ >]/) { shots = 1 }
END { exit !(want == "video" ? video : shots) }
'

has_proof() {
    printf '%s\n' "$visible_body" | awk -v want="$1" "$proof_awk"
}

shots_ok=0
if has_na_line Screenshots; then
    echo "check_pr_screenshots: OK — Screenshots: n/a line with a reason."
    shots_ok=1
elif has_proof shots; then
    echo "check_pr_screenshots: OK — ## Screenshots heading with an image."
    shots_ok=1
fi

video_ok=0
if has_na_line Videos; then
    echo "check_pr_screenshots: OK — Videos: n/a line with a reason."
    video_ok=1
elif has_proof video; then
    echo "check_pr_screenshots: OK — ### Video: block with a GIF walkthrough."
    video_ok=1
fi

if [ "$shots_ok" -eq 1 ] && [ "$video_ok" -eq 1 ]; then
    exit 0
fi

if [ "$shots_ok" -ne 1 ]; then
    echo "check_pr_screenshots: FAIL — this PR changes a plugin UI file but the body has no screenshot."
    echo
    echo "Fix it one of two ways:"
    echo
    echo "  1. Capture before (from main) and after (this branch) stills of the panel,"
    echo "     commit them under docs/design/<plugin>/, and add them under a"
    echo "     '## Screenshots' heading in the PR body."
    echo
    echo "  2. If there is truly nothing to screenshot (e.g. a copy-only"
    echo "     change), add a line to the body:"
    echo
    echo "       Screenshots: n/a (<short reason>)"
    echo
fi

if [ "$video_ok" -ne 1 ]; then
    echo "check_pr_screenshots: FAIL — this PR changes a plugin UI file but the body has no GIF walkthrough."
    echo
    echo "Fix it one of two ways:"
    echo
    echo "  1. Record each changed flow locally as a GIF, then add it under"
    echo "     '## Screenshots' in a '### Video: <label>' block. A GIF or video"
    echo "     dragged into the GitHub editor under that heading also counts."
    echo
    echo "  2. If the change has no flow to show, add a line to the body:"
    echo
    echo "       Videos: n/a (<short reason>)"
fi
exit 1
