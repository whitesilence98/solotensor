---
name: git-push
description: >-
  Standard operating procedure for preparing, validating, committing, and pushing code to Git repositories.
  Use when the user asks to push changes, commit work, sync with remote repositories, or run pre-push verification.
---

# Git Push: Safe Commit & Remote Publishing Workflow

This skill guides the agent through safely preparing, validating, committing, and pushing changes to remote Git repositories.

---

## 1. Pre-Flight Verification (Never Push Broken Code)

Before staging or committing any code, always run project-specific verification suites:

1. **Type & Lint Checks**:
   - Frontend: `cmd /c npx tsc --noEmit`
   - Formatter / Linter: Ensure no syntax errors or unresolved imports.
2. **Automated Test Suites**:
   - Backend: `python -m unittest discover -s tests` (or `pytest`)
   - Ensure 100% test pass rate with 0 regressions.
3. **Build Validation**:
   - If frontend code was modified: `cmd /c npm run build` to verify Next.js route bundling.

If any check fails, resolve the issue before proceeding to commit or push.

---

## 2. Working Tree Hygiene

Inspect the working tree carefully:

```powershell
git status -u
```

### Exclude or Clean Up Artifacts
- **Build artifacts & caches**: Ensure `node_modules/`, `.next/`, `dist/`, `__pycache__/`, `*.tsbuildinfo` are ignored in `.gitignore`.
- **Agent / IDE scratch paths**: `.claude/agents/` and `.claude/skills/` are intentionally tracked and shared, so they belong in git. What must stay ignored is `.claude/settings.local.json`, `.claude/worktrees/`, `.agent/` (retired), and `.gemini/`.
- **Accidentally tracked subprojects/gitlinks**:
  If a folder was accidentally tracked as a submodule or cache entry:
  ```powershell
  git rm --cached <path>
  ```
- **Secrets & environment variables**: Verify `.env`, private keys, and credentials are never staged.

---

## 3. Staging & Commit Strategy

### Formulate Atomic Conventional Commits
Use standard Conventional Commits structure:
- `feat(<scope>): <description>` — New user-facing features or capabilities
- `fix(<scope>): <description>` — Bug fixes or regression corrections
- `refactor(<scope>): <description>` — Code reorganization without functional changes
- `test(<scope>): <description>` — Adding or updating test cases
- `docs(<scope>): <description>` — Documentation or architectural design guides
- `chore(<scope>): <description>` — Build configs, dependencies, or `.gitignore` updates

### Staging Process
1. Stage relevant tracked and untracked files:
   ```powershell
   git add <file1> <file2> ...
   # or git add -A (after confirming .gitignore is comprehensive)
   ```
2. Verify staged diff:
   ```powershell
   git diff --cached --stat
   ```
3. Commit with a structured message including summary bullets:
   ```powershell
   git commit -m "feat(tools): implement tool deletion and advanced workflow parsing" -m "- Add AIToolService.delete() with filesystem cleanup and path traversal protection" -m "- Add DELETE /api/tools/{tool_id} endpoint and frontend confirmation modal" -m "- Add comprehensive unit tests in test_ai_tools.py"
   ```

---

## 4. Safe Push Execution

1. **Verify Remote & Upstream**:
   ```powershell
   git remote -v
   git branch --show-current
   ```
2. **Check SSH / Auth Status**:
   If using SSH (`git@github.com:...`):
   ```powershell
   ssh -T -o BatchMode=yes git@github.com
   ```
3. **Push to Remote**:
   ```powershell
   git push origin <branch>
   ```
   If pushing a newly created branch for the first time:
   ```powershell
   git push -u origin <branch>
   ```
4. **Confirm Push Success**:
   ```powershell
   git status
   ```
   Confirm that working tree shows: `Your branch is up to date with 'origin/<branch>'`.

---

## 5. Troubleshooting & Conflict Resolution

- **Non-fast-forward / Remote Divergence**:
  If remote has newer commits:
  ```powershell
  git fetch origin
  git status -uno
  ```
  Rebase or pull cleanly:
  ```powershell
  git pull --rebase origin <branch>
  ```
- **Permission / Auth Denied**:
  Confirm GitHub account match with remote repository owner via `ssh -T git@github.com`.
