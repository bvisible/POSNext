#!/usr/bin/env python3
"""annotate_fork.py — Annotate fork divergence vs upstream/version-15.

For each hunk of difference between merge-base (`97a4e833`) and HEAD, this script
identifies the originating commit, groups hunks into logical blocks, and inserts
`////` markers above each block to preserve the "why" of every modification we
applied on top of the upstream codebase.

Marker format:  //// <reason ≤70 chars> — <sha7>

Usage:
    python scripts/annotate_fork.py --dry-run
    python scripts/annotate_fork.py --dry-run --file POS/src/stores/posCart.js
    python scripts/annotate_fork.py --apply
    python scripts/annotate_fork.py --apply --file <path>

Output:
    /tmp/bvisible-annotations.patch  (unified diff to git apply)
    BVISIBLE-MODS-REVIEW.todo        (blocks needing human review)
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

MERGE_BASE = "97a4e833"

# Languages supported. .vue is handled specially (multi-section: template / script / style).
LANG_JS = {".js", ".ts", ".mjs", ".cjs"}
LANG_PY = {".py"}
LANG_HTML = {".html", ".htm"}
LANG_CSS = {".css", ".scss", ".sass", ".less"}
LANG_VUE = {".vue"}
# Markdown / YAML are intentionally NOT auto-annotated — keep them for the registry
SUPPORTED_EXTS = LANG_JS | LANG_PY | LANG_HTML | LANG_CSS | LANG_VUE

# Threshold to split a same-commit block when hunks are far apart in the file.
# Originally 8 lines, but real-world testing on posCart.js (one "rebrand" commit
# touching 50+ zones) showed that splitting same-commit hunks produces dozens
# of identical annotations. Same-commit hunks are now ALWAYS one block — gap
# threshold is kept only as a safety guard against runaway groupings.
HUNK_GAP_THRESHOLD = 10_000

# Hard cap on the "reason" length (aligns with conventional 72-char subject)
REASON_MAX_LEN = 70

# Poor commit-message detection — these end up in the REVIEW.todo
POOR_MSG_REGEX = re.compile(r"^(wip|tmp|fix|update|stash|style|chore)\.?$", re.I)

# Strip conventional-commit prefix from subjects: "fix(scope): subject" → "subject"
CONVENTIONAL_PREFIX = re.compile(
    r"^(fix|feat|refactor|chore|docs|test|style|perf|build|ci|revert)"
    r"(\([^)]+\))?\s*:\s*",
    re.I,
)

# Sentinel detection for idempotency: skip blocks whose insertion point already has ////
SENTINEL_RE = re.compile(r"^\s*(?://|#|<!--|/\*)\s*////")

# Manifest sidecar — tracks annotations applied across runs so subsequent runs
# don't re-insert the same comment on a working-tree that has them but where
# HEAD does not (typical post-apply, pre-commit state).
MANIFEST_PATH = ".bvisible-annotations.json"

# Vue SFC section detection — anchored at start of line (indent=0) so we only
# match root SFC blocks, never the inner <template v-if="…"> tags or any other
# nested element that uses the same names.
VUE_SECTION_OPEN = re.compile(r"^<(template|script|style)(\s[^>]*)?>", re.I)
VUE_SECTION_CLOSE = re.compile(r"^</(template|script|style)>", re.I)

# Conventional commit scope grouping for fusion of adjacent different-commit blocks
SCOPE_RE = re.compile(r"^(fix|feat|refactor)(\(([^)]+)\))?\s*:", re.I)


@dataclass
class Hunk:
	"""A single hunk parsed from `git diff --unified=0`."""

	old_start: int
	old_count: int
	new_start: int
	new_count: int
	added_lines: int  # number of '+' lines in the hunk


@dataclass
class Block:
	"""A logical group of contiguous hunks attributed to a primary commit."""

	file: str
	hunks: list[Hunk] = field(default_factory=list)
	commit_weights: dict[str, int] = field(default_factory=dict)

	@property
	def first_line(self) -> int:
		"""1-based line number where annotation should be inserted (in HEAD)."""
		return min(h.new_start for h in self.hunks if h.new_count > 0 or h.new_start > 0)

	@property
	def last_line_end(self) -> int:
		"""End line of the last hunk in HEAD coordinates."""
		last = self.hunks[-1]
		return last.new_start + max(last.new_count, 1)

	@property
	def primary_commit(self) -> str:
		"""Commit with the highest added-lines weight in the block."""
		if not self.commit_weights:
			return "unknown"
		return max(self.commit_weights.items(), key=lambda kv: kv[1])[0]


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------


def run_git(*args: str, check: bool = True) -> str:
	"""Run a git command and return stdout (text)."""
	result = subprocess.run(
		["git", *args],
		capture_output=True,
		text=True,
		check=check,
	)
	return result.stdout


def list_modified_files() -> list[str]:
	"""Return list of files MODIFIED (status M) between merge-base and HEAD."""
	output = run_git("diff", "--name-status", f"{MERGE_BASE}..HEAD")
	files = []
	for line in output.strip().split("\n"):
		if not line:
			continue
		parts = line.split("\t")
		status = parts[0]
		if status == "M":
			files.append(parts[1])
	return files


def parse_hunks(file: str) -> list[Hunk]:
	"""Parse the unified diff for one file into Hunk records.

	Uses --unified=0 so only +/- lines are present (no context noise).
	"""
	diff = run_git("diff", "--unified=0", f"{MERGE_BASE}..HEAD", "--", file)
	hunks: list[Hunk] = []
	header_re = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")

	current: Hunk | None = None
	for line in diff.split("\n"):
		m = header_re.match(line)
		if m:
			if current is not None:
				hunks.append(current)
			current = Hunk(
				old_start=int(m.group(1)),
				old_count=int(m.group(2) or "1"),
				new_start=int(m.group(3)),
				new_count=int(m.group(4) or "1"),
				added_lines=0,
			)
			continue
		if current is None:
			continue
		if line.startswith("+") and not line.startswith("+++"):
			current.added_lines += 1
	if current is not None:
		hunks.append(current)
	return hunks


def blame_lines(file: str, start: int, count: int) -> dict[str, int]:
	"""Return {sha7: line_count} for a range of HEAD lines."""
	if count <= 0:
		return {}
	end = start + count - 1
	try:
		output = run_git(
			"blame", "-L", f"{start},{end}", "--abbrev=7", "-l", "HEAD", "--", file
		)
	except subprocess.CalledProcessError:
		return {}
	counts: dict[str, int] = defaultdict(int)
	for line in output.split("\n"):
		stripped = line.strip()
		if not stripped:
			continue
		token = stripped.split(maxsplit=1)[0].lstrip("^")
		sha7 = token[:7]
		counts[sha7] += 1
	return dict(counts)


def commit_subject(sha: str) -> str:
	"""Return the subject line of a commit, or '' if unknown."""
	try:
		return run_git("log", "-1", "--format=%s", sha).strip()
	except subprocess.CalledProcessError:
		return ""


# ---------------------------------------------------------------------------
# Reason / SHA formatting
# ---------------------------------------------------------------------------


def clean_subject(subject: str) -> str:
	"""Strip conventional-commit prefix and clamp length."""
	cleaned = CONVENTIONAL_PREFIX.sub("", subject).strip()
	if len(cleaned) > REASON_MAX_LEN:
		cleaned = cleaned[: REASON_MAX_LEN - 1].rstrip() + "…"
	return cleaned


def is_poor_message(subject: str) -> bool:
	"""Detect commit subjects that won't give useful annotation context."""
	stripped = subject.strip()
	if len(stripped) < 10:
		return True
	cleaned = CONVENTIONAL_PREFIX.sub("", stripped).strip()
	if len(cleaned) < 5:
		return True
	if POOR_MSG_REGEX.match(stripped) or POOR_MSG_REGEX.match(cleaned):
		return True
	return False


def commit_scope(subject: str) -> str | None:
	"""Extract the conventional-commit scope (e.g. 'pos' in 'fix(pos): …')."""
	m = SCOPE_RE.match(subject.strip())
	if not m:
		return None
	return m.group(3)


def format_sha_summary(weights: dict[str, int]) -> str:
	"""Build the SHA part of the marker: 'sha7' | 'sha7a + sha7b' | 'sha7a + sha7b (+N more)'."""
	if not weights:
		return "unknown"
	ordered = [s for s, _ in sorted(weights.items(), key=lambda kv: -kv[1]) if s != "unknown"]
	if not ordered:
		return "unknown"
	if len(ordered) == 1:
		return ordered[0]
	if len(ordered) == 2:
		return f"{ordered[0]} + {ordered[1]}"
	return f"{ordered[0]} + {ordered[1]} (+{len(ordered) - 2} more)"


# ---------------------------------------------------------------------------
# Marker syntax per language
# ---------------------------------------------------------------------------


def format_marker(ext: str, reason: str, sha_summary: str, vue_section: str = "") -> str:
	"""Return the comment string to insert (no trailing newline).

	For .vue files, `vue_section` selects the correct comment syntax:
	"template" → <!-- … -->, "script" → //, "style" → /* … */.
	"""
	body = f"//// {reason} — {sha_summary}"
	if ext in LANG_PY:
		return f"# {body}"
	if ext in LANG_JS:
		return body  # // + //// = leading //
	if ext in LANG_HTML:
		return f"<!-- {body} -->"
	if ext in LANG_CSS:
		return f"/* {body} */"
	if ext in LANG_VUE:
		if vue_section == "template":
			return f"<!-- {body} -->"
		if vue_section == "style":
			return f"/* {body} */"
		# script or unknown → JS comment syntax
		return body
	return body


# ---------------------------------------------------------------------------
# Hunk → Block grouping
# ---------------------------------------------------------------------------


def attribute_hunks(file: str, hunks: list[Hunk]) -> list[tuple[Hunk, dict[str, int]]]:
	"""For each hunk, return (hunk, {sha7: lines_weight})."""
	out = []
	for h in hunks:
		if h.new_count > 0 and h.added_lines > 0:
			# Blame the added range
			weights = blame_lines(file, h.new_start, h.new_count)
		elif h.new_count > 0:
			# Pure modification with no '+': blame the range anyway
			weights = blame_lines(file, h.new_start, h.new_count)
		else:
			# Pure deletion → no HEAD line to blame; attribute to surrounding line
			weights = blame_lines(file, max(1, h.new_start), 1)
		out.append((h, weights))
	return out


def group_into_blocks(file: str, hunks: list[Hunk]) -> list[Block]:
	"""Group all hunks of one file by their primary attributing commit.

	One block per (file, primary_commit). The annotation lands above the first
	hunk of that commit in the file. Subsequent hunks of the same commit are
	left un-annotated — the SHA remains greppable in `git log` and the first
	annotation is enough to give context for the entire commit's footprint.
	"""
	attributed = attribute_hunks(file, hunks)
	by_commit: dict[str, Block] = {}

	for h, weights in attributed:
		if weights:
			primary = max(weights.items(), key=lambda kv: kv[1])[0]
		else:
			primary = "unknown"
		block = by_commit.get(primary)
		if block is None:
			block = Block(file=file, hunks=[], commit_weights={})
			by_commit[primary] = block
		block.hunks.append(h)
		for sha, n in weights.items():
			block.commit_weights[sha] = block.commit_weights.get(sha, 0) + n

	# Sort by where each block's first hunk appears in the file
	return sorted(by_commit.values(), key=lambda b: b.first_line)


# ---------------------------------------------------------------------------
# Insertion + patch generation
# ---------------------------------------------------------------------------


def read_head_file(file: str) -> list[str]:
	"""Read file content at HEAD as a list of lines (no line terminators)."""
	content = run_git("show", f"HEAD:{file}")
	# Don't keep terminal "" line from trailing \n
	lines = content.split("\n")
	if lines and lines[-1] == "":
		lines.pop()
	return lines


def is_already_annotated(lines: list[str], line_no: int) -> bool:
	"""Return True if a //// marker is found in the 3 lines above line_no (1-based)."""
	# line_no is 1-based; lines is 0-based
	upper = max(0, line_no - 4)
	lower = max(0, line_no - 1)
	for i in range(upper, lower):
		if i < len(lines) and SENTINEL_RE.match(lines[i]):
			return True
	return False


def detect_vue_section(lines: list[str], line_no: int) -> str:
	"""Return 'template', 'script', 'style', or '' for a 1-based line in a .vue SFC."""
	current = ""
	limit = min(line_no - 1, len(lines))
	for i in range(limit):
		line = lines[i]
		close = VUE_SECTION_CLOSE.search(line)
		open_ = VUE_SECTION_OPEN.search(line)
		# If the line both opens & closes (rare), close takes precedence
		if close:
			closed = close.group(1).lower()
			if current == closed:
				current = ""
		if open_:
			current = open_.group(1).lower()
	return current


def is_inside_python_docstring(lines: list[str], line_no: int) -> bool:
	# Count triple-quote occurrences (both double and single) before line_no.
	# Odd count = we're still inside a triple-quoted string at that line.
	# Imperfect (doesn't track escaped or mid-line triple-quotes) — ambiguous
	# cases get routed to REVIEW.todo instead of being annotated blindly.
	upper = min(line_no - 1, len(lines))
	dq = sq = 0
	triple_dq = chr(34) * 3
	triple_sq = chr(39) * 3
	for i in range(upper):
		dq += lines[i].count(triple_dq)
		sq += lines[i].count(triple_sq)
	return (dq % 2 == 1) or (sq % 2 == 1)


def is_inside_js_template_literal(lines: list[str], line_no: int) -> bool:
	"""Return True if line_no (1-based) sits inside an unclosed JS template literal.

	Counts un-escaped backticks before the line. Imperfect (doesn't track strings
	or regexes that contain backticks) but good enough — ambiguous cases go to REVIEW.
	"""
	upper = min(line_no - 1, len(lines))
	count = 0
	for i in range(upper):
		# strip escaped backticks before counting
		stripped = re.sub(r"\\`", "", lines[i])
		count += stripped.count("`")
	return count % 2 == 1


def find_safe_insertion_line(
	ext: str, lines: list[str], line_no: int
) -> tuple[int, str | None]:
	"""Return (adjusted_line, reason_if_unsafe).

	If the target line is inside a string / docstring / template literal, or
	if it would land on a closing bracket (which makes the comment land in
	the middle of an object / array / call), we return (line_no, reason)
	and let the caller send the block to REVIEW.
	Otherwise (line_no, None) confirming the insertion point is safe.
	"""
	if ext in LANG_PY and is_inside_python_docstring(lines, line_no):
		return line_no, "inside Python docstring"
	if ext in LANG_JS and is_inside_js_template_literal(lines, line_no):
		return line_no, "inside JS template literal"
	if ext in LANG_VUE:
		section = detect_vue_section(lines, line_no)
		if section == "script" and is_inside_js_template_literal(lines, line_no):
			return line_no, "inside Vue script template literal"

	target = lines[line_no - 1] if line_no - 1 < len(lines) else ""
	stripped = target.strip()
	# Closing-bracket targets are visually awkward: the comment lands in the
	# middle of an object/array/call. Route them to REVIEW for manual placement.
	if stripped in {")", "}", "]", "},", "],", "});", "};", "];", ");", "})"}:
		return line_no, "target line is closing bracket — comment would split structure"

	return line_no, None


# ---------------------------------------------------------------------------
# Manifest sidecar
# ---------------------------------------------------------------------------


def block_target_hash(target_line: str) -> str:
	"""Stable hash of a target line (used as block identity for idempotency)."""
	return hashlib.sha1(target_line.encode("utf-8", errors="replace")).hexdigest()[:12]


def load_manifest(path: str) -> dict:
	if not Path(path).exists():
		return {}
	try:
		return json.loads(Path(path).read_text())
	except (json.JSONDecodeError, OSError):
		return {}


def save_manifest(path: str, data: dict) -> None:
	Path(path).write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")


def is_in_manifest(manifest: dict, file: str, target_hash: str) -> bool:
	entries = manifest.get(file, [])
	return any(e.get("target_hash") == target_hash for e in entries)


def is_already_annotated_working_tree(
	file: str, target_line_text: str
) -> bool:
	"""Check the working tree for a //// sentinel above the target line.

	Useful between --apply and the eventual commit: HEAD doesn't yet contain
	the annotations but the working tree does, so subsequent dry-runs need to
	see them to remain idempotent.
	"""
	try:
		with open(file, encoding="utf-8", errors="replace") as f:
			wt_lines = f.read().split("\n")
	except (FileNotFoundError, OSError):
		return False
	for i, line in enumerate(wt_lines):
		if line == target_line_text:
			# Check up to 3 lines above
			for j in range(max(0, i - 3), i):
				if SENTINEL_RE.match(wt_lines[j]):
					return True
			# Found target but no sentinel: it might appear again later
			# — but typically each "anchor" line is unique, so we stop here.
			return False
	return False


@dataclass
class FileResult:
	file: str
	annotations: list[tuple[int, str, str]] = field(default_factory=list)
	# (line_no, marker_with_indent, target_hash)
	review: list[tuple[int, str, str]] = field(default_factory=list)
	# (line_no, sha7, reason)
	skipped_existing: int = 0
	skipped_manifest: int = 0
	skipped_wt: int = 0
	skipped_unsupported_ext: bool = False
	total_blocks: int = 0


def process_file(file: str, manifest: dict) -> FileResult:
	"""Compute annotations for one file. No filesystem writes."""
	res = FileResult(file=file)
	ext = Path(file).suffix
	if ext not in SUPPORTED_EXTS:
		res.skipped_unsupported_ext = True
		return res

	hunks = parse_hunks(file)
	if not hunks:
		return res

	blocks = group_into_blocks(file, hunks)
	res.total_blocks = len(blocks)
	lines = read_head_file(file)

	for block in blocks:
		line_no = block.first_line
		if line_no < 1 or line_no > len(lines) + 1:
			res.review.append(
				(line_no, block.primary_commit, "out-of-range insertion point")
			)
			continue

		# Pick up the target line + indentation
		target_line = lines[line_no - 1] if line_no - 1 < len(lines) else ""
		target_hash = block_target_hash(target_line)

		# Idempotence 1: HEAD already has the sentinel above this line
		if is_already_annotated(lines, line_no):
			res.skipped_existing += 1
			continue
		# Idempotence 2: manifest records this exact target was annotated
		if is_in_manifest(manifest, file, target_hash):
			res.skipped_manifest += 1
			continue
		# Idempotence 3: working tree already has the sentinel (post-apply, pre-commit)
		if is_already_annotated_working_tree(file, target_line):
			res.skipped_wt += 1
			continue

		# Safety: don't insert into strings / docstrings / template literals
		_, unsafe_reason = find_safe_insertion_line(ext, lines, line_no)
		if unsafe_reason:
			res.review.append((line_no, block.primary_commit, unsafe_reason))
			continue

		# Build the marker
		primary_sha = block.primary_commit
		subject = commit_subject(primary_sha) if primary_sha != "unknown" else ""
		if not subject or is_poor_message(subject):
			res.review.append(
				(line_no, primary_sha, f"poor commit message: {subject!r}")
			)
			reason = "TODO"
		else:
			reason = clean_subject(subject)

		sha_part = format_sha_summary(block.commit_weights)
		vue_section = detect_vue_section(lines, line_no) if ext in LANG_VUE else ""
		marker = format_marker(ext, reason, sha_part, vue_section=vue_section)

		indent_m = re.match(r"^(\s*)", target_line)
		indent = indent_m.group(1) if indent_m else ""
		marker_with_indent = f"{indent}{marker}"

		res.annotations.append((line_no, marker_with_indent, target_hash))

	return res


def render_patch(file: str, original: list[str], result: FileResult) -> str:
	"""Produce a unified diff inserting annotation markers in original."""
	if not result.annotations:
		return ""
	new_lines = list(original)
	# Insert in reverse so indices remain stable
	for line_no, marker, _hash in sorted(result.annotations, key=lambda x: -x[0]):
		insert_at = min(line_no - 1, len(new_lines))
		new_lines.insert(insert_at, marker)
	patch = difflib.unified_diff(
		original,
		new_lines,
		fromfile=f"a/{file}",
		tofile=f"b/{file}",
		lineterm="",
		n=3,
	)
	return "\n".join(patch)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument(
		"--apply",
		action="store_true",
		help="Apply the generated patch via git apply (default: dry-run).",
	)
	parser.add_argument("--dry-run", action="store_true", help="Default mode.")
	parser.add_argument(
		"--file", help="Operate on a single file (otherwise: all modified files)."
	)
	parser.add_argument(
		"--patch-out",
		default="/tmp/bvisible-annotations.patch",
		help="Where to write the unified patch.",
	)
	parser.add_argument(
		"--review-out",
		default="BVISIBLE-MODS-REVIEW.todo",
		help="Where to write the review todo list.",
	)
	parser.add_argument(
		"--manifest",
		default=MANIFEST_PATH,
		help="Path to the idempotence manifest sidecar.",
	)
	parser.add_argument(
		"--update-sha",
		action="store_true",
		help="Refresh SHAs in existing annotations after upstream merge (not yet implemented).",
	)
	parser.add_argument(
		"--verbose", "-v", action="store_true", help="Print per-file summary."
	)
	args = parser.parse_args()

	if args.apply and args.dry_run:
		print("error: --apply and --dry-run are exclusive", file=sys.stderr)
		return 2

	if args.update_sha:
		print(
			"--update-sha is reserved for post-merge SHA refresh and not yet implemented.",
			file=sys.stderr,
		)
		return 2

	apply_mode = bool(args.apply)

	if args.file:
		files = [args.file]
	else:
		files = list_modified_files()

	manifest = load_manifest(args.manifest)
	all_results: list[FileResult] = []
	patches: list[str] = []
	review_lines: list[str] = []

	for f in files:
		res = process_file(f, manifest)
		all_results.append(res)
		if res.skipped_unsupported_ext:
			continue
		if args.verbose:
			print(
				f"{f}: blocks={res.total_blocks} "
				f"annotate={len(res.annotations)} "
				f"review={len(res.review)} "
				f"skip-existing={res.skipped_existing} "
				f"skip-manifest={res.skipped_manifest} "
				f"skip-wt={res.skipped_wt}"
			)
		if res.annotations:
			original = read_head_file(f)
			patch = render_patch(f, original, res)
			if patch:
				patches.append(patch)
		for line_no, sha, msg in res.review:
			review_lines.append(f"{f}:{line_no}\t{sha}\t{msg}")

	patch_text = "\n".join(patches)
	if patch_text:
		Path(args.patch_out).write_text(patch_text + "\n")
		print(f"patch written: {args.patch_out} ({len(patches)} files)")
	else:
		print("no annotations to insert")

	if review_lines:
		Path(args.review_out).write_text("\n".join(review_lines) + "\n")
		print(f"review entries: {args.review_out} ({len(review_lines)} blocks)")

	# Totals
	total_blocks = sum(r.total_blocks for r in all_results)
	total_annot = sum(len(r.annotations) for r in all_results)
	total_review = sum(len(r.review) for r in all_results)
	total_skip_existing = sum(r.skipped_existing for r in all_results)
	total_skip_manifest = sum(r.skipped_manifest for r in all_results)
	total_skip_wt = sum(r.skipped_wt for r in all_results)
	supported = [r for r in all_results if not r.skipped_unsupported_ext]
	print(
		f"\nsummary: files-considered={len(supported)} "
		f"blocks={total_blocks} annotations={total_annot} "
		f"review={total_review} "
		f"idempotent-skips={total_skip_existing}+{total_skip_manifest}+{total_skip_wt}"
		" (HEAD+manifest+wt)"
	)

	if apply_mode:
		if not patch_text:
			print("nothing to apply")
			return 0
		check = subprocess.run(
			["git", "apply", "--check", args.patch_out],
			capture_output=True,
			text=True,
		)
		if check.returncode != 0:
			print("git apply --check failed:", file=sys.stderr)
			print(check.stderr, file=sys.stderr)
			return 1
		applied = subprocess.run(
			["git", "apply", args.patch_out], capture_output=True, text=True
		)
		if applied.returncode != 0:
			print("git apply failed:", file=sys.stderr)
			print(applied.stderr, file=sys.stderr)
			return 1

		# Persist manifest entries so subsequent runs stay idempotent
		head_sha = run_git("rev-parse", "HEAD").strip()
		for res in all_results:
			if not res.annotations:
				continue
			entries = manifest.setdefault(res.file, [])
			existing_hashes = {e.get("target_hash") for e in entries}
			for _line, _marker, target_hash in res.annotations:
				if target_hash in existing_hashes:
					continue
				entries.append(
					{
						"target_hash": target_hash,
						"head_sha_at_apply": head_sha,
					}
				)
		save_manifest(args.manifest, manifest)
		print(f"manifest updated: {args.manifest}")
		print("patch applied successfully")

	return 0


if __name__ == "__main__":
	sys.exit(main())
