#!/usr/bin/env python3
"""Maintain Vue file-header BVISIBLE-FORK blocks.

Vue's template parser rejects `<!-- //// -->` markers inserted inline at most
positions a generic auto-generator would target (between '<tag' and its '>',
between multi-line attributes, etc.). For `.vue` files we therefore keep all
fork-divergence markers in a single block at the top of each file:

    <!--
      BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
      Each line corresponds to a logical block of fork-specific change.
      Grep the sha7 to find the originating commit via `git log`.
      //// <reason 1> — <sha7>
      //// <reason 2> — <sha7>
      ...
    -->
    <template>
    ...

When you add a NEW modification to an upstream-tracked .vue file, append one
`//// <reason> — <sha7>` line to its header block. Re-run this script to
re-extract every existing marker, reset the file to upstream baseline content,
and rewrite the header block.

Usage:
    python scripts/rebuild_vue_annotations.py <file.vue> [<file.vue> ...]
    grep -rl '////' POS/src --include='*.vue' | xargs python scripts/rebuild_vue_annotations.py
"""

import re
import subprocess
import sys
from pathlib import Path

BASELINE = "97a4e833"  # merge-base with upstream/version-15 at bootstrap time
MARKER_RE = re.compile(r"////[^\n]*", re.MULTILINE)


def extract_markers(path: str) -> list[str]:
	"""Return unique //// markers (without surrounding comment syntax)."""
	with open(path) as f:
		content = f.read()
	seen = set()
	out = []
	for m in MARKER_RE.finditer(content):
		txt = m.group(0)
		txt = re.sub(r"\s*-->\s*$", "", txt)
		txt = re.sub(r"\s*\*/\s*$", "", txt)
		txt = txt.strip()
		if txt and txt not in seen:
			seen.add(txt)
			out.append(txt)
	return out


def reset_to_baseline(path: str) -> None:
	subprocess.run(
		["git", "show", f"{BASELINE}:{path}"],
		stdout=open(path, "w"),
		check=True,
	)


def prepend_block(path: str, markers: list[str]) -> None:
	with open(path) as f:
		content = f.read()
	header = (
		"<!--\n"
		"  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.\n"
		"  Each line corresponds to a logical block of fork-specific change in this file.\n"
		"  Grep the sha7 to find the originating commit via `git log`.\n"
	)
	for m in markers:
		header += f"  {m}\n"
	header += "-->\n"
	with open(path, "w") as f:
		f.write(header + content)


def main() -> int:
	if len(sys.argv) < 2:
		print(
			"usage: rebuild_vue_annotations.py <file.vue> [<file.vue> ...]",
			file=sys.stderr,
		)
		return 2
	for path in sys.argv[1:]:
		if not Path(path).exists():
			print(f"skip (missing): {path}")
			continue
		markers = extract_markers(path)
		if not markers:
			print(f"skip (no markers): {path}")
			continue
		reset_to_baseline(path)
		prepend_block(path, markers)
		print(f"  rebuilt {path}: {len(markers)} markers")
	return 0


if __name__ == "__main__":
	sys.exit(main())
