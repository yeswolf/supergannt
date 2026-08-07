#!/usr/bin/env bash
# Build a short git commit subject from a summary file (no extra model call).
# Usage: commit-msg-from-summary.sh <prefix> <file> <fallback>
# Prints one line (<= 72 chars), safe for git commit -m.
set -euo pipefail

prefix="${1:-}"
file="${2:-}"
fallback="${3:-chore: update files}"

msg=""
if [[ -n "$file" && -f "$file" ]]; then
  # Prefer explicit summary markers; else first non-empty non-heading line.
  msg=$(grep -E -m1 '^(IMPLEMENT_SUMMARY|FIX_SUMMARY|PM_SUMMARY):[[:space:]]*' "$file" 2>/dev/null \
    | sed -E 's/^(IMPLEMENT_SUMMARY|FIX_SUMMARY|PM_SUMMARY):[[:space:]]*//' \
    || true)
  if [[ -z "$msg" ]]; then
    msg=$(grep -E -m1 -v '^[[:space:]]*$|^#' "$file" 2>/dev/null || true)
  fi
fi

msg=$(printf '%s' "$msg" | tr '\n\r\t' ' ' | sed -E 's/[[:space:]]+/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//')
if [[ -z "$msg" ]]; then
  msg="$fallback"
fi

if [[ -n "$prefix" && "$msg" != "$prefix"* ]]; then
  msg="${prefix}${msg}"
fi

# Single-line subject, Git-friendly length.
msg=$(printf '%s' "$msg" | cut -c1-72 | sed -E 's/[[:space:]]+$//')
printf '%s\n' "$msg"
