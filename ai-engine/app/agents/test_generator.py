import re
import uuid
from typing import List, Dict, Any, Tuple
from app.agents.state import ReviewFinding, SynthesizedTest

class TestGeneratorAgent:
    """
    Test Generator & Coverage Auditor Agent.
    Detects modified business logic lacking unit test coverage and
    automatically synthesizes runnable test suites.
    """

    async def analyze(self, files: List[Dict[str, Any]], context: Dict[str, Any]) -> Tuple[List[ReviewFinding], List[SynthesizedTest]]:
        findings: List[ReviewFinding] = []
        synthesized_tests: List[SynthesizedTest] = []

        # Check if tests were touched in this PR
        has_tests_in_pr = any(
            any(t_kw in f.get("file_path", "").lower() for t_kw in [".test.", ".spec.", "tests/", "__tests__/"])
            for f in files
        )

        for file_info in files:
            file_path = file_info.get("file_path", "")
            # Skip test files and non-source files
            if any(t_kw in file_path.lower() for t_kw in [".test.", ".spec.", ".json", ".md"]):
                continue

            diff = file_info.get("diff", "")
            lines = diff.splitlines()

            # Find added functions or complex branching
            new_functions = []
            for line in lines:
                if line.startswith("+") and not line.startswith("+++"):
                    m = re.search(r'(?:function|const|def)\s+([a-zA-Z0-9_$]+)\s*(?:=\s*(?:async\s*)?\([^)]*\)|\()', line)
                    if m:
                        new_functions.append(m.group(1))

            if new_functions and not has_tests_in_pr:
                target_func = new_functions[0]
                
                # Create finding
                findings.append(ReviewFinding(
                    id=f"test-{uuid.uuid4().hex[:8]}",
                    category="testing",
                    severity="warning",
                    file_path=file_path,
                    line_number=max(1, len(lines) // 2),
                    title=f"Missing Unit Tests for '{target_func}'",
                    message=f"Function '{target_func}' was introduced or modified without corresponding unit tests. Business logic modifications require test validation.",
                    suggested_fix=f"Add unit test suite covering happy path and edge cases for '{target_func}'.",
                    confidence_score=0.91,
                    rule_id="rule-4"
                ))

                # Synthesize concrete test code
                ext = file_path.split(".")[-1]
                if ext in ["py"]:
                    test_code = (
                        f"import pytest\n"
                        f"# Test suite for {target_func}\n\n"
                        f"def test_{target_func}_happy_path():\n"
                        f"    # Arrange & Act\n"
                        f"    result = {target_func}()\n"
                        f"    # Assert\n"
                        f"    assert result is not None\n\n"
                        f"def test_{target_func}_invalid_input():\n"
                        f"    with pytest.raises(ValueError):\n"
                        f"        {target_func}(None)\n"
                    )
                    framework = "pytest"
                else:
                    test_code = (
                        f"import {{ describe, it, expect, vi }} from 'vitest';\n"
                        f"// Unit tests for {target_func}\n\n"
                        f"describe('{target_func}', () => {{\n"
                        f"  it('should process valid input correctly', async () => {{\n"
                        f"    // Arrange\n"
                        f"    const mockInput = {{ id: 'test-123' }};\n"
                        f"    // Act\n"
                        f"    const result = await {target_func}(mockInput);\n"
                        f"    // Assert\n"
                        f"    expect(result).toBeDefined();\n"
                        f"  }});\n\n"
                        f"  it('should throw an error on empty or invalid inputs', async () => {{\n"
                        f"    await expect({target_func}(null)).rejects.toThrow();\n"
                        f"  }});\n"
                        f"}});\n"
                    )
                    framework = "vitest"

                synthesized_tests.append(SynthesizedTest(
                    id=f"syn-test-{uuid.uuid4().hex[:8]}",
                    file_path=f"{file_path}.test.{ext}",
                    test_framework=framework,
                    test_code=test_code,
                    target_function=target_func,
                    description=f"Auto-generated unit test suite for newly modified '{target_func}'"
                ))

        return findings, synthesized_tests

test_generator_agent = TestGeneratorAgent()
