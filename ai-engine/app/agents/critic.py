from typing import List, Dict, Any, Tuple
from app.agents.state import ReviewFinding
from app.config import settings

class CriticFilterNode:
    """
    Critic & False Positive Filter Node.
    The primary gatekeeper ensuring high signal-to-noise ratio.
    Filters out low-confidence hallucinations, deduplicates cross-agent suggestions,
    and validates diff line offsets.
    """

    def filter_findings(
        self,
        raw_findings: List[ReviewFinding],
        files_changed: List[Dict[str, Any]]
    ) -> Tuple[List[ReviewFinding], int]:
        approved_findings: List[ReviewFinding] = []
        dropped_count = 0

        # Build map of valid diff lines per file
        valid_lines_map: Dict[str, set] = {}
        for f in files_changed:
            fp = f.get("file_path", "")
            diff = f.get("diff", "")
            valid_lines_map[fp] = self._extract_diff_line_numbers(diff)

        seen_keys = set()

        for finding in raw_findings:
            # 1. Filter: Drop findings below the strict confidence threshold (0.85)
            if finding.confidence_score < settings.CRITIC_MIN_CONFIDENCE:
                dropped_count += 1
                continue

            # 2. Filter: Drop trivial nitpicks / linter concerns
            trivial_keywords = ["whitespace", "semicolon", "trailing comma", "indentation", "variable name casing"]
            if any(kw in finding.title.lower() or kw in finding.message.lower() for kw in trivial_keywords):
                dropped_count += 1
                continue

            # 3. Filter: Deduplication across parallel agents
            # e.g., if Security and Architecture both flagged line 42 of authController.ts
            key = f"{finding.file_path}:{finding.line_number}:{finding.category}"
            if key in seen_keys:
                dropped_count += 1
                continue
            seen_keys.add(key)

            # 4. Normalization: Verify line falls within modified range
            valid_lines = valid_lines_map.get(finding.file_path, set())
            if valid_lines and finding.line_number not in valid_lines:
                # Snap to closest modified line in the file
                closest = min(valid_lines, key=lambda l: abs(l - finding.line_number))
                finding.line_number = closest

            approved_findings.append(finding)

        # Cap max findings per file to prevent PR comment flooding
        file_counts: Dict[str, int] = {}
        final_list: List[ReviewFinding] = []
        for f in approved_findings:
            file_counts[f.file_path] = file_counts.get(f.file_path, 0) + 1
            if file_counts[f.file_path] <= settings.MAX_FINDINGS_PER_FILE:
                final_list.append(f)
            else:
                dropped_count += 1

        return final_list, dropped_count

    def _extract_diff_line_numbers(self, diff_text: str) -> set:
        valid_lines = set()
        current_line = 1
        for line in diff_text.splitlines():
            if line.startswith("@@"):
                import re
                m = re.search(r'\+(\d+)', line)
                if m:
                    current_line = int(m.group(1))
            elif line.startswith("+") and not line.startswith("+++"):
                valid_lines.add(current_line)
                current_line += 1
            elif not line.startswith("-"):
                current_line += 1
        return valid_lines

critic_node = CriticFilterNode()
