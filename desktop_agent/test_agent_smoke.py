import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import agent


class DesktopAgentSmokeTests(unittest.TestCase):
    def test_dry_run_without_api_key(self):
        original_key = agent.GROQ_API_KEY
        agent.GROQ_API_KEY = ""
        try:
            result = agent.run_agent("smoke test task", dry_run=True)
            self.assertIn("dry-run", result.lower())
        finally:
            agent.GROQ_API_KEY = original_key


if __name__ == "__main__":
    unittest.main()
