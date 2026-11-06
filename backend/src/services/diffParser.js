/**
 * Unified Diff Parser.
 * Converts raw git unified diffs into structured file representations
 * with accurate line numbering for split and unified rendering.
 */
export function parseUnifiedDiff(rawDiff) {
  const files = [];
  if (!rawDiff) return files;

  const rawFiles = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const rawFile of rawFiles) {
    const lines = rawFile.split('\n');
    let oldPath = '';
    let newPath = '';

    for (const line of lines) {
      if (line.startsWith('--- a/')) {
        oldPath = line.replace('--- a/', '').trim();
      } else if (line.startsWith('+++ b/')) {
        newPath = line.replace('+++ b/', '').trim();
      }
    }

    const filePath = newPath || oldPath || 'unknown';
    const hunks = [];
    let currentHunk = null;
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        // Hunk header e.g. @@ -1,7 +1,9 @@
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLine = parseInt(match[1], 10);
          newLine = parseInt(match[2], 10);
        }
        currentHunk = {
          header: line,
          lines: []
        };
        hunks.push(currentHunk);
      } else if (currentHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.lines.push({
            type: 'add',
            content: line.slice(1),
            newLineNumber: newLine++,
            oldLineNumber: null
          });
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push({
            type: 'del',
            content: line.slice(1),
            newLineNumber: null,
            oldLineNumber: oldLine++
          });
        } else if (!line.startsWith('\\')) {
          currentHunk.lines.push({
            type: 'normal',
            content: line.startsWith(' ') ? line.slice(1) : line,
            newLineNumber: newLine++,
            oldLineNumber: oldLine++
          });
        }
      }
    }

    files.push({
      filePath,
      diff: rawFile,
      hunks,
      additions: hunks.reduce((acc, h) => acc + h.lines.filter(l => l.type === 'add').length, 0),
      deletions: hunks.reduce((acc, h) => acc + h.lines.filter(l => l.type === 'del').length, 0)
    });
  }

  return files;
}
