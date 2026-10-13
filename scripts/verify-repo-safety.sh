#!/bin/sh
set -u
fail=0
root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$root" || exit 1

bad_ignore=$(grep -nE '^!\.env' .gitignore 2>/dev/null | grep -vE '^[0-9]+:(!\.env\.example|!\*\.env\.example)$')
if [ -n "$bad_ignore" ]; then
  echo "FAIL: .gitignore re-includes env files:"; echo "$bad_ignore"; fail=1
fi

if [ -f .vscode/tasks.json ] || git ls-files --error-unmatch .vscode/tasks.json >/dev/null 2>&1; then
  echo "FAIL: .vscode/tasks.json exists"; fail=1
fi

if grep -rIlE --exclude-dir=.git --exclude-dir=node_modules --include='*.json' --include='*.code-workspace' -e '"runOn"[[:space:]]*:[[:space:]]*"folderOpen"' -e '"task.allowAutomaticTasks"[[:space:]]*:[[:space:]]*(true|"on")' . 2>/dev/null | grep -q .; then
  echo "FAIL: automatic task configuration found"; fail=1
fi

for f in $(git ls-files '*package.json' 2>/dev/null); do
  if grep -nE '"(preinstall|install|postinstall|prepare)"' "$f" >/dev/null 2>&1; then
    echo "FAIL: install-time script in $f"; fail=1
  fi
done

if git ls-files 2>/dev/null | grep -E '(^|/)\.env($|\.)' | grep -vE '\.env\.example$' | grep -q .; then
  echo "FAIL: env file tracked"; fail=1
fi

pattern='-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}'
if git ls-files -z 2>/dev/null | xargs -0 grep -IlE -e "$pattern" 2>/dev/null | grep -v 'scripts/verify-repo-safety.sh' | grep -q .; then
  echo "FAIL: possible secret in tracked files"; fail=1
fi

if [ "$fail" -eq 0 ]; then echo "OK: repository safety checks passed"; fi
exit "$fail"
