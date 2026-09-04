#!/usr/bin/env python3
#//// Neoffice — added file (no upstream equivalent). Companion to annotate_fork.py for
#//// the files that cannot carry an inline marker at all — package.json, DocType JSON,
#//// lockfiles, pyproject.toml. It writes their divergence into BVISIBLE-MODS.md so the
#//// next upstream merge still has a written reason for them (4e0d3068, 2026-05-19
#//// "bootstrap tooling for upstream divergence tracking").
"""json_diff_to_registry.py — Generate BVISIBLE-MODS.md from non-annotable files.

For each JSON / lockfile / TOML file modified between merge-base (97a4e833) and
HEAD, produces a structured markdown section documenting the divergence.
Targets files that cannot host inline `////` markers but still need their
fork-specific changes traced for future upstream merges.

Usage:
    python scripts/json_diff_to_registry.py --dry-run
    python scripts/json_diff_to_registry.py --apply

Output: BVISIBLE-MODS.md at repo root.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

MERGE_BASE = "97a4e833"
REGISTRY_PATH = "BVISIBLE-MODS.md"

# File-type categorization
DOCTYPE_JSON_RE = re.compile(r"pos_next/pos_next/doctype/[^/]+/[^/]+\.json$")
PRINT_FORMAT_RE = re.compile(r"pos_next/pos_next/print_format/[^/]+/[^/]+\.json$")
CUSTOM_JSON_RE = re.compile(r"pos_next/pos_next/custom/[^/]+\.json$")
PACKAGE_JSON_RE = re.compile(r"(^|/)package\.json$")
PYPROJECT_RE = re.compile(r"pyproject\.toml$")


def run_git(*args: str) -> str:
	result = subprocess.run(
		["git", *args], capture_output=True, text=True, check=True
	)
	return result.stdout


def list_modified_non_annotable() -> list[str]:
	"""List modified non-annotable files (JSON, lock, toml, etc.)."""
	output = run_git("diff", "--name-status", f"{MERGE_BASE}..HEAD")
	files = []
	non_annotable_exts = {".json", ".toml", ".lock", ".yml", ".yaml"}
	for line in output.strip().split("\n"):
		if not line:
			continue
		parts = line.split("\t")
		if parts[0] != "M":
			continue
		path = parts[1]
		# Skip yarn.lock-style binary-like lockfiles (very large diffs, low value)
		if path.endswith("yarn.lock") or path.endswith("package-lock.json"):
			continue
		ext = Path(path).suffix
		if ext in non_annotable_exts:
			files.append(path)
	return files


def load_json_at(ref: str, file: str) -> dict | list | None:
	"""Load a JSON file at a given ref, or None if missing / unparseable."""
	try:
		content = run_git("show", f"{ref}:{file}")
	except subprocess.CalledProcessError:
		return None
	try:
		return json.loads(content)
	except json.JSONDecodeError:
		return None


def commits_touching_file(file: str) -> list[tuple[str, str]]:
	"""Return list of (sha7, subject) for commits that modified `file` since merge-base."""
	output = run_git(
		"log", f"{MERGE_BASE}..HEAD", "--format=%h\t%s", "--", file
	)
	entries = []
	for line in output.strip().split("\n"):
		if not line:
			continue
		parts = line.split("\t", 1)
		if len(parts) == 2:
			entries.append((parts[0], parts[1]))
	return entries


# ---------------------------------------------------------------------------
# DocType JSON
# ---------------------------------------------------------------------------


def diff_doctype(base: dict, head: dict) -> dict:
	"""Diff a Frappe DocType JSON. Returns structured divergences."""
	# Fields are a list of dicts with `fieldname` as key
	base_fields = {f.get("fieldname"): f for f in (base.get("fields") or [])}
	head_fields = {f.get("fieldname"): f for f in (head.get("fields") or [])}

	added = []
	removed = []
	modified = []

	for fname, hf in head_fields.items():
		if fname not in base_fields:
			added.append(hf)
		else:
			bf = base_fields[fname]
			changes = {}
			for key in set(hf.keys()) | set(bf.keys()):
				if hf.get(key) != bf.get(key):
					changes[key] = (bf.get(key), hf.get(key))
			if changes:
				modified.append((fname, changes))

	for fname, bf in base_fields.items():
		if fname not in head_fields:
			removed.append(bf)

	# Top-level properties
	top_changes = {}
	skip = {"fields", "permissions", "modified", "modified_by", "creation"}
	for key in set(head.keys()) | set(base.keys()):
		if key in skip:
			continue
		if head.get(key) != base.get(key):
			top_changes[key] = (base.get(key), head.get(key))

	# Permissions diff
	perm_added = []
	perm_removed = []
	base_perms = base.get("permissions") or []
	head_perms = head.get("permissions") or []

	def perm_key(p: dict) -> tuple:
		return (p.get("role"), p.get("permlevel", 0))

	base_perm_map = {perm_key(p): p for p in base_perms}
	head_perm_map = {perm_key(p): p for p in head_perms}
	for k, p in head_perm_map.items():
		if k not in base_perm_map:
			perm_added.append(p)
	for k, p in base_perm_map.items():
		if k not in head_perm_map:
			perm_removed.append(p)

	return {
		"added_fields": added,
		"removed_fields": removed,
		"modified_fields": modified,
		"top_changes": top_changes,
		"added_perms": perm_added,
		"removed_perms": perm_removed,
	}


def render_doctype(file: str, base: dict, head: dict, commits: list) -> str:
	d = diff_doctype(base, head)
	out = [f"## {file}", ""]
	out.append(
		f"**DocType**: `{head.get('name', '?')}` · "
		f"module `{head.get('module', '?')}`"
	)
	out.append("")

	if d["added_fields"]:
		out.append("### Fields added")
		out.append("| Fieldname | Type | Label | Properties of note |")
		out.append("|---|---|---|---|")
		for f in d["added_fields"]:
			notes = []
			for k in ("default", "reqd", "options", "depends_on", "fetch_from"):
				if f.get(k):
					val = str(f.get(k))
					if len(val) > 40:
						val = val[:37] + "…"
					notes.append(f"`{k}`={val}")
			out.append(
				f"| `{f.get('fieldname', '?')}` "
				f"| {f.get('fieldtype', '?')} "
				f"| {f.get('label', '')} "
				f"| {'; '.join(notes) if notes else '—'} |"
			)
		out.append("")

	if d["modified_fields"]:
		out.append("### Fields modified")
		out.append("| Fieldname | Property | Before | After |")
		out.append("|---|---|---|---|")
		for fname, changes in d["modified_fields"]:
			for key, (before, after) in sorted(changes.items()):
				before_s = json.dumps(before) if before is not None else "—"
				after_s = json.dumps(after) if after is not None else "—"
				if len(before_s) > 40:
					before_s = before_s[:37] + "…"
				if len(after_s) > 40:
					after_s = after_s[:37] + "…"
				out.append(
					f"| `{fname}` | `{key}` | `{before_s}` | `{after_s}` |"
				)
		out.append("")

	if d["removed_fields"]:
		out.append("### Fields removed")
		out.append("| Fieldname | Type |")
		out.append("|---|---|")
		for f in d["removed_fields"]:
			out.append(
				f"| `{f.get('fieldname', '?')}` | {f.get('fieldtype', '?')} |"
			)
		out.append("")

	if d["top_changes"]:
		out.append("### DocType-level properties changed")
		out.append("| Property | Before | After |")
		out.append("|---|---|---|")
		for key, (before, after) in sorted(d["top_changes"].items()):
			before_s = json.dumps(before)
			after_s = json.dumps(after)
			if len(before_s) > 40:
				before_s = before_s[:37] + "…"
			if len(after_s) > 40:
				after_s = after_s[:37] + "…"
			out.append(f"| `{key}` | `{before_s}` | `{after_s}` |")
		out.append("")

	if d["added_perms"] or d["removed_perms"]:
		out.append("### Permissions changed")
		for p in d["added_perms"]:
			out.append(f"- **added** role=`{p.get('role')}` permlevel={p.get('permlevel', 0)}")
		for p in d["removed_perms"]:
			out.append(f"- **removed** role=`{p.get('role')}` permlevel={p.get('permlevel', 0)}")
		out.append("")

	out.extend(render_commits_table(commits))
	return "\n".join(out)


# ---------------------------------------------------------------------------
# package.json
# ---------------------------------------------------------------------------


def diff_package_json(base: dict, head: dict) -> dict:
	"""Diff dependencies / devDependencies of a package.json."""
	out = {}
	for key in ("dependencies", "devDependencies", "scripts"):
		base_section = base.get(key) or {}
		head_section = head.get(key) or {}
		added = {}
		removed = {}
		changed = {}
		for k, v in head_section.items():
			if k not in base_section:
				added[k] = v
			elif base_section[k] != v:
				changed[k] = (base_section[k], v)
		for k, v in base_section.items():
			if k not in head_section:
				removed[k] = v
		if added or removed or changed:
			out[key] = {"added": added, "removed": removed, "changed": changed}
	return out


def render_package_json(file: str, base: dict, head: dict, commits: list) -> str:
	d = diff_package_json(base, head)
	out = [f"## {file}", ""]
	for section in ("dependencies", "devDependencies", "scripts"):
		if section not in d:
			continue
		s = d[section]
		out.append(f"### {section}")
		if s["added"]:
			out.append("**Added:**")
			for k, v in sorted(s["added"].items()):
				out.append(f"- `{k}@{v}`")
		if s["changed"]:
			out.append("**Version-bumped / changed:**")
			for k, (before, after) in sorted(s["changed"].items()):
				out.append(f"- `{k}`: `{before}` → `{after}`")
		if s["removed"]:
			out.append("**Removed:**")
			for k, v in sorted(s["removed"].items()):
				out.append(f"- `{k}@{v}`")
		out.append("")
	out.extend(render_commits_table(commits))
	return "\n".join(out)


# ---------------------------------------------------------------------------
# Generic JSON (custom fields, print format)
# ---------------------------------------------------------------------------


def render_generic_json(file: str, base, head, commits: list) -> str:
	out = [f"## {file}", ""]
	# Top-level dict diff
	if isinstance(head, dict) and isinstance(base, dict):
		changed_keys = []
		added_keys = []
		removed_keys = []
		for k in set(head.keys()) | set(base.keys()):
			if k in {"modified", "modified_by", "creation"}:
				continue
			if k not in base:
				added_keys.append(k)
			elif k not in head:
				removed_keys.append(k)
			elif base[k] != head[k]:
				changed_keys.append(k)
		if added_keys:
			out.append("**Top-level keys added:** " + ", ".join(f"`{k}`" for k in sorted(added_keys)))
			out.append("")
		if removed_keys:
			out.append("**Top-level keys removed:** " + ", ".join(f"`{k}`" for k in sorted(removed_keys)))
			out.append("")
		if changed_keys:
			out.append("**Top-level keys changed:** " + ", ".join(f"`{k}`" for k in sorted(changed_keys)))
			out.append("")
		# For a "Customize Form"-style export (pos_profile.json), break down customize_form_lists
		for list_key in (
			"custom_fields",
			"property_setters",
			"custom_perms",
			"links",
		):
			if list_key in head or list_key in base:
				base_list = base.get(list_key) or []
				head_list = head.get(list_key) or []
				out.extend(render_list_diff(list_key, base_list, head_list))
	elif isinstance(head, list):
		out.append(f"List length: base={len(base or [])} → head={len(head)}")
		out.append("")
	out.extend(render_commits_table(commits))
	return "\n".join(out)


def render_list_diff(name: str, base_list: list, head_list: list) -> list[str]:
	"""Render a section comparing two lists of dicts, keyed by name/fieldname."""
	def key_of(d):
		return (
			d.get("name")
			or d.get("fieldname")
			or d.get("property_setter_name")
			or d.get("doc_type", "?") + "::" + d.get("property", "?")
		)

	base_map = {key_of(d): d for d in base_list if isinstance(d, dict)}
	head_map = {key_of(d): d for d in head_list if isinstance(d, dict)}
	added = [k for k in head_map if k not in base_map]
	removed = [k for k in base_map if k not in head_map]
	changed = [k for k in head_map if k in base_map and head_map[k] != base_map[k]]
	if not (added or removed or changed):
		return []
	out = [f"### `{name}`"]
	if added:
		out.append(f"**Added ({len(added)}):** " + ", ".join(f"`{k}`" for k in sorted(added)[:20]))
		if len(added) > 20:
			out.append(f"  …and {len(added) - 20} more")
	if removed:
		out.append(f"**Removed ({len(removed)}):** " + ", ".join(f"`{k}`" for k in sorted(removed)[:20]))
	if changed:
		out.append(f"**Changed ({len(changed)}):** " + ", ".join(f"`{k}`" for k in sorted(changed)[:20]))
	out.append("")
	return out


# ---------------------------------------------------------------------------
# pyproject.toml + free-form fallback
# ---------------------------------------------------------------------------


def render_freeform(file: str, commits: list) -> str:
	"""Free-form section for files we don't parse structurally."""
	out = [f"## {file}", ""]
	out.append(
		"Free-form text or non-standard structure — see `git diff "
		f"{MERGE_BASE}..HEAD -- {file}` for the full diff."
	)
	out.append("")
	out.extend(render_commits_table(commits))
	return "\n".join(out)


# ---------------------------------------------------------------------------
# Shared rendering
# ---------------------------------------------------------------------------


def render_commits_table(commits: list[tuple[str, str]]) -> list[str]:
	if not commits:
		return []
	out = ["### Commits that touched this file", "| SHA | Subject |", "|---|---|"]
	for sha, subject in commits:
		subject = subject.replace("|", "\\|")
		if len(subject) > 100:
			subject = subject[:97] + "…"
		out.append(f"| `{sha}` | {subject} |")
	out.append("")
	return out


# ---------------------------------------------------------------------------
# Top-level orchestration
# ---------------------------------------------------------------------------


def classify(file: str) -> str:
	if DOCTYPE_JSON_RE.search(file):
		return "doctype"
	if PACKAGE_JSON_RE.search(file):
		return "package"
	if PRINT_FORMAT_RE.search(file):
		return "print_format"
	if CUSTOM_JSON_RE.search(file):
		return "custom"
	if PYPROJECT_RE.search(file):
		return "freeform"
	if file.endswith(".json"):
		return "generic"
	return "freeform"


def render_file(file: str) -> str:
	kind = classify(file)
	commits = commits_touching_file(file)

	if kind in ("doctype", "package", "print_format", "custom", "generic"):
		base = load_json_at(MERGE_BASE, file)
		head = load_json_at("HEAD", file)
		if base is None or head is None:
			return render_freeform(file, commits)
		if kind == "doctype":
			return render_doctype(file, base, head, commits)
		if kind == "package":
			return render_package_json(file, base, head, commits)
		# print_format / custom / generic share the same renderer
		return render_generic_json(file, base, head, commits)

	return render_freeform(file, commits)


HEADER = """# BVISIBLE-MODS — Divergences upstream (non-inline)

This file documents fork-specific changes on files where the inline `////`
marker cannot be inserted (pure JSON, lockfiles, TOML, etc.). For files
that DO support inline markers, see the `////` comments directly in the
code.

Generated by `scripts/json_diff_to_registry.py` from
`git diff {merge_base}..HEAD` over non-annotable files.

When you modify a non-annotable file, re-run the script — or add an entry
manually if the script does not yet support the file format.
"""


def main() -> int:
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--dry-run", action="store_true")
	parser.add_argument("--apply", action="store_true")
	parser.add_argument("--out", default=REGISTRY_PATH)
	args = parser.parse_args()

	if args.apply and args.dry_run:
		print("--apply and --dry-run are exclusive", file=sys.stderr)
		return 2

	files = list_modified_non_annotable()
	sections = [HEADER.format(merge_base=MERGE_BASE), ""]
	for f in sorted(files):
		print(f"processing {f}")
		sections.append(render_file(f))
		sections.append("")

	registry_text = "\n".join(sections)

	if args.apply:
		Path(args.out).write_text(registry_text)
		print(f"\nwrote {args.out} ({len(files)} files documented)")
	else:
		print(f"\n--dry-run: would write {args.out} ({len(files)} files)")
		print("=" * 60)
		print(registry_text[:2000])
		print("=" * 60)
		print(f"(truncated to 2000 chars; total {len(registry_text)} chars)")

	return 0


if __name__ == "__main__":
	sys.exit(main())
