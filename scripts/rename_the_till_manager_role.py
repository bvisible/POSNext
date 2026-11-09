#!/usr/bin/env python3
# //// Neoffice — added file (no upstream equivalent). The till manager role is `Nexus POS Manager` upstream and
# //// `POSNext Manager` here (product owner, 09.11.2026). Upstream writes the name in the permission rows of dozens of
# //// doctype and report JSON files, which cannot carry a `////` marker, so a merge of upstream brings the old name
# //// back in every file it touches, without a conflict. This script puts the new name back; the contract of
# //// NEOFFICE_FORK_MARKERS.md (« Role names ») turns a merge that forgot it red.
"""rename_the_till_manager_role.py — put `POSNext Manager` where upstream writes `Nexus POS Manager`.

    python3 scripts/rename_the_till_manager_role.py            # rewrite the files, say which
    python3 scripts/rename_the_till_manager_role.py --check    # change nothing, exit 1 if the old name is still there

Run it after every merge of upstream, then read `git diff --stat`: only permission rows, role lists and the
strings that name the role should move. The history (CHANGELOG.md), the manifest, the patch that renames the
role on existing sites and every line that carries a `////` marker keep the old name on purpose.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

OLD = "Nexus POS Manager"
NEW = "POSNext Manager"
SUFFIXES = {".json", ".py", ".js", ".vue", ".html", ".po", ".pot", ".yml", ".yaml", ".md"}
# The old name stays in: the story of the rename, upstream's changelog, the manifest, this tool and its patch.
KEEP = {
	"CHANGELOG.md",
	"NEOFFICE_FORK_MARKERS.md",
	"scripts/rename_the_till_manager_role.py",
	"pos_next/patches/rename_the_till_manager_role.py",
	"pos_next/tests/test_the_till_manager_role_is_renamed.py",
}
SKIP_PARTS = ("node_modules/", "/dist/", "pos_next/public/pos/assets/", "POS/dist/", ".claude/")


def tracked_files(root: Path) -> list[str]:
	out = subprocess.run(["git", "ls-files"], cwd=root, check=True, capture_output=True, text=True).stdout
	return [p for p in out.splitlines() if p]


def main(argv: list[str]) -> int:
	check = "--check" in argv
	root = Path(__file__).resolve().parent.parent
	touched = []
	for rel in tracked_files(root):
		path = root / rel
		if rel in KEEP or any(part in f"/{rel}" for part in SKIP_PARTS) or path.suffix not in SUFFIXES:
			continue
		try:
			text = path.read_text(encoding="utf-8")
		except (UnicodeDecodeError, FileNotFoundError):
			continue
		if OLD not in text:
			continue
		# A line that carries a `////` marker tells the story of the rename: it names the old name on purpose and stays.
		lines = text.split("\n")
		hits = sum(line.count(OLD) for line in lines if "////" not in line)
		if not hits:
			continue
		touched.append((rel, hits))
		if not check:
			path.write_text(
				"\n".join(line if "////" in line else line.replace(OLD, NEW) for line in lines),
				encoding="utf-8",
			)
	for rel, count in touched:
		print(f"{'FOUND ' if check else 'changed'} {rel} ({count})")
	if check and touched:
		print(f"{len(touched)} file(s) still name {OLD!r}: run scripts/rename_the_till_manager_role.py")
		return 1
	print(f"{len(touched)} file(s) {'to change' if check else 'changed'}.")
	return 0


if __name__ == "__main__":
	sys.exit(main(sys.argv[1:]))
