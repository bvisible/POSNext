#!/usr/bin/env python3
"""check_annotations.py — pre-commit hook for fork-annotation discipline.

For every staged file listed in `.bvisible-tracked-files`, ensure that the
staged diff adds at least one new `////` marker. Trivial commits can opt out
via the `Annotate: skip` git trailer in the commit message.

Exit codes:
    0 — all tracked-file changes are properly annotated (or correctly bypassed).
    1 — at least one tracked file is missing its annotation.
    2 — script invocation error.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

TRACKED_FILE = ".bvisible-tracked-files"
SKIP_TRAILER_RE = re.compile(r"^Annotate:\s*skip\s*$", re.I | re.M)
SENTINEL_RE = re.compile(r"^\+(?!\+\+).*(?:^|//|#|<!--|/\*)\s*////")
# Match an added line (starts with +) that introduces a //// marker.
# This is a regex on the unified-diff body of a staged change.
ANNOTATION_DIFF_RE = re.compile(r"^\+.*////", re.M)


def run_git(*args: str) -> str:
	result = subprocess.run(
		["git", *args], capture_output=True, text=True, check=False
	)
	return result.stdout


def load_tracked() -> set[str]:
	path = Path(TRACKED_FILE)
	if not path.exists():
		return set()
	return {
		line.strip()
		for line in path.read_text().splitlines()
		if line.strip() and not line.startswith("#")
	}


def staged_files() -> list[str]:
	output = run_git("diff", "--cached", "--name-only")
	return [line for line in output.splitlines() if line]


def commit_message_text() -> str:
	"""Best-effort read of the in-progress commit message (for `Annotate: skip`)."""
	for candidate in (".git/COMMIT_EDITMSG", ".git/MERGE_MSG"):
		p = Path(candidate)
		if p.exists():
			try:
				return p.read_text()
			except OSError:
				pass
	return ""


def staged_diff_for(file: str) -> str:
	return run_git("diff", "--cached", "--unified=0", "--", file)


def main() -> int:
	tracked = load_tracked()
	if not tracked:
		# No tracked-file inventory → nothing to enforce.
		return 0

	commit_msg = commit_message_text()
	if SKIP_TRAILER_RE.search(commit_msg):
		# Explicit opt-out for trivial commits (whitespace, renames, etc.)
		return 0

	staged = staged_files()
	violations: list[str] = []

	for f in staged:
		if f not in tracked:
			continue
		diff = staged_diff_for(f)
		if not diff:
			continue
		if not ANNOTATION_DIFF_RE.search(diff):
			violations.append(f)

	if not violations:
		return 0

	print(
		"\n×  Fork-annotation discipline check failed.",
		file=sys.stderr,
	)
	print(
		"\nThese files are listed in .bvisible-tracked-files (i.e. they came",
		"from upstream BrainWise-DEV/POSNext and we modified them) but the",
		"staged diff does not introduce any `////` marker:\n",
		sep="\n",
		file=sys.stderr,
	)
	for v in violations:
		print(f"  - {v}", file=sys.stderr)
	print(
		"\nAdd a //// comment above your modification block explaining WHY",
		"the change is needed, ending with the commit short-sha (if you have",
		"one). Example:\n",
		"  //// preserve TIP item across submit cycles — 3574de52\n",
		"For files that cannot host inline markers (JSON/lockfiles/DocType),",
		"update BVISIBLE-MODS.md instead.",
		"",
		"To bypass for a trivial commit, add a trailer to the commit message:",
		"  Annotate: skip",
		"",
		"See CLAUDE.md (section 'Annotations fork //// ') for the full convention.",
		sep="\n",
		file=sys.stderr,
	)
	return 1


if __name__ == "__main__":
	sys.exit(main())
