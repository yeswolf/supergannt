#!/usr/bin/env bash
# Detect whether a task explicitly authorizes creating/fixing GitHub Actions.
# Prints "true" or "false" to stdout.
#
# Usage:
#   allow-github-ci.sh /path/to/title.txt /path/to/body.md
set -euo pipefail

title_file="${1:-}"
body_file="${2:-}"

title=""
body=""
if [[ -n "$title_file" && -f "$title_file" ]]; then
  title=$(tr -d '\000' < "$title_file" | tr -d '\r')
fi
if [[ -n "$body_file" && -f "$body_file" ]]; then
  body=$(tr -d '\000' < "$body_file" | tr -d '\r')
fi

blob=$(printf '%s\n%s' "$title" "$body" | tr '[:upper:]' '[:lower:]')

# Must mention CI / workflows / .github (EN + common RU).
if ! printf '%s' "$blob" | grep -Eqi \
  '(\.github|github[[:space:]_-]*actions?|/workflows/|\bworkflows?\b|воркфлоу|\bci\b)'; then
  echo "false"
  exit 0
fi

# And must ask to create / fix / finish / update them (EN + RU stems).
# Avoid \b around Cyrillic — GNU grep word boundaries are ASCII-oriented.
if printf '%s' "$blob" | grep -Eqi \
  '(create|add|make|build|write|fix|update|amend|finish|complete|implement|author|introduce|добав|созда|поправ|додел|исправ|сделай|напиши|обнов)'; then
  echo "true"
  exit 0
fi

echo "false"
