import ast
import re
import hashlib
from typing import List, Dict, Any, Optional

class ASTChunker:
    """
    AST-Aware Code Chunker.
    Deconstructs source code files into semantic AST units (functions, methods, classes, interfaces)
    preserving full scopes, signatures, and line boundaries.
    """

    def chunk_file(self, file_path: str, content: str, repo_id: str = "default") -> List[Dict[str, Any]]:
        ext = file_path.split(".")[-1].lower() if "." in file_path else ""
        
        if ext in ["py"]:
            return self._chunk_python(file_path, content, repo_id)
        elif ext in ["js", "ts", "jsx", "tsx"]:
            return self._chunk_javascript_typescript(file_path, content, repo_id)
        else:
            return self._chunk_generic(file_path, content, repo_id)

    def _chunk_python(self, file_path: str, content: str, repo_id: str) -> List[Dict[str, Any]]:
        chunks: List[Dict[str, Any]] = []
        try:
            tree = ast.parse(content)
            lines = content.splitlines()

            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    start = node.lineno
                    end = getattr(node, "end_lineno", start + 5)
                    func_body = "\n".join(lines[start - 1 : end])
                    
                    # Extract args
                    arg_names = [a.arg for a in node.args.args]
                    sig = f"def {node.name}({', '.join(arg_names)})"

                    chunk_id = self._generate_id(repo_id, file_path, node.name, start)
                    chunks.append({
                        "id": chunk_id,
                        "repo_id": repo_id,
                        "file_path": file_path,
                        "chunk_type": "function",
                        "name": node.name,
                        "scope": "module",
                        "start_line": start,
                        "end_line": end,
                        "signature": sig,
                        "content": func_body
                    })

                elif isinstance(node, ast.ClassDef):
                    start = node.lineno
                    end = getattr(node, "end_lineno", start + 10)
                    class_body = "\n".join(lines[start - 1 : end])
                    
                    chunk_id = self._generate_id(repo_id, file_path, node.name, start)
                    chunks.append({
                        "id": chunk_id,
                        "repo_id": repo_id,
                        "file_path": file_path,
                        "chunk_type": "class",
                        "name": node.name,
                        "scope": "module",
                        "start_line": start,
                        "end_line": end,
                        "signature": f"class {node.name}",
                        "content": class_body
                    })

        except Exception as e:
            # Fallback to generic chunking if syntax error in partial diff
            return self._chunk_generic(file_path, content, repo_id)

        return chunks if chunks else self._chunk_generic(file_path, content, repo_id)

    def _chunk_javascript_typescript(self, file_path: str, content: str, repo_id: str) -> List[Dict[str, Any]]:
        chunks: List[Dict[str, Any]] = []
        lines = content.splitlines()
        
        # Regex patterns for function/method/class boundaries in JS/TS
        patterns = [
            # async function / function: function foo(x, y)
            (r'(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)', "function"),
            # arrow function: const foo = (x, y) => or const foo = async () =>
            (r'(?:export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=>]+)?\s*=>', "function"),
            # class: class Foo or export class Foo
            (r'(?:export\s+)?class\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+[a-zA-Z0-9_$]+)?', "class"),
            # interface / type: interface UserConfig
            (r'(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)', "interface")
        ]

        for i, line in enumerate(lines):
            line_str = line.strip()
            for pattern, c_type in patterns:
                match = re.search(pattern, line_str)
                if match:
                    name = match.group(1)
                    start_line = i + 1
                    
                    # Track brace depth to find actual semantic end
                    end_line = self._find_closing_brace(lines, i)
                    content_block = "\n".join(lines[i : end_line])
                    sig = line_str.split("{")[0].strip() if "{" in line_str else line_str

                    chunk_id = self._generate_id(repo_id, file_path, name, start_line)
                    chunks.append({
                        "id": chunk_id,
                        "repo_id": repo_id,
                        "file_path": file_path,
                        "chunk_type": c_type,
                        "name": name,
                        "scope": "module",
                        "start_line": start_line,
                        "end_line": end_line,
                        "signature": sig,
                        "content": content_block
                    })
                    break

        return chunks if chunks else self._chunk_generic(file_path, content, repo_id)

    def _find_closing_brace(self, lines: List[str], start_idx: int) -> int:
        open_braces = 0
        found_first = False
        max_lookahead = min(len(lines), start_idx + 250)

        for idx in range(start_idx, max_lookahead):
            line = lines[idx]
            for ch in line:
                if ch == '{':
                    open_braces += 1
                    found_first = True
                elif ch == '}':
                    open_braces -= 1
                    if found_first and open_braces <= 0:
                        return idx + 1
        
        # Default fallback block size
        return min(len(lines), start_idx + 25)

    def _chunk_generic(self, file_path: str, content: str, repo_id: str) -> List[Dict[str, Any]]:
        chunks = []
        lines = content.splitlines()
        step = 50
        for i in range(0, len(lines), step):
            start = i + 1
            end = min(len(lines), i + step)
            block = "\n".join(lines[i:end])
            chunk_id = self._generate_id(repo_id, file_path, f"block_{start}", start)
            chunks.append({
                "id": chunk_id,
                "repo_id": repo_id,
                "file_path": file_path,
                "chunk_type": "block",
                "name": f"lines_{start}_{end}",
                "scope": "module",
                "start_line": start,
                "end_line": end,
                "signature": f"{file_path} [{start}-{end}]",
                "content": block
            })
        return chunks

    def _generate_id(self, repo_id: str, file_path: str, name: str, start: int) -> str:
        raw = f"{repo_id}:{file_path}:{name}:{start}"
        return hashlib.sha256(raw.encode()).hexdigest()[:24]

ast_chunker = ASTChunker()
