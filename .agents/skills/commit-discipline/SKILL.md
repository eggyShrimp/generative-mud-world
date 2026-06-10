---
name: commit-discipline
description: Prepare, write, review, or validate AI-assisted commits. Use when the agent needs to commit changes, split a diff into reviewable commits, write a commit message, add AI attribution, record verification, or enforce commit hygiene for agent-made code changes.
license: MIT
compatibility: requires Node.js 18+ and git
metadata:
  author: Yuan
  version: "0.2.0"
  topics: git, code-quality, devops, agent-workflows
---

# Commit Discipline

Use this skill to create commits that a maintainer can review without reconstructing the agent's reasoning from chat history. The commit must explain why the change exists, what user-visible effect it has, what changed at a high level, how the work was verified, and how AI participated.

## Commit Workflow

First use in a repository:

1. Check whether automatic commit-message enforcement is already active.
2. If activation is needed, follow the ## Hook Setup steps below.
3. If enforcement is already active, continue with daily use.

Daily use:

1. Inspect repository status and the current branch.
2. Read the diff before deciding commit scope.
3. Split unrelated changes into separate commits when the user did not explicitly request one combined commit.
4. Verify the change with the strongest practical command for the repository.
5. Write the commit message from the diff and the verification result.
6. Run the bundled validator before committing when the repository allows local scripts.
7. If a commit message fails validation, repair the message and run the bundled validator again.

Do not hide uncertainty with fallback code or vague wording. If the diff exposes a broken existing mechanism, describe the fix to that mechanism instead of presenting the change as a workaround.

## Commit Message

Use this structure by default:

```text
<type>(<scope>): <subject>

Why: <reason this change is needed>
Impact: <user-visible behavior, or "None">

Summary:
- <change 1>
- <change 2>

Verification:
- <command or manual check and result>

AI-Agent: <tool or agent name and role>
Convention-Version: YYYY-MM-DD
```

Choose a specific `type` from this list:

- `feat` for a user-facing capability.
- `fix` for a defect.
- `docs` for documentation only.
- `refactor` for behavior-preserving code changes.
- `test` for tests only.
- `chore` for maintenance.
- `build` for build-system changes.
- `ci` for CI changes.
- `perf` for performance changes.
- `style` for formatting only.

Use a concise `scope` when the repository has a clear module, package, or feature name. Omit `scope` when the change spans the whole project.

## Attribution

Record AI participation with one trailer. Prefer `AI-Agent:` because it states that an agent participated without claiming sole authorship.

Use these values consistently:

- `AI-Agent: <agent-name> assisted with implementation and verification`
- `AI-Agent: <agent-name> generated the initial patch; maintainer reviewed`
- `Co-developed-by: <agent-name>`
- `AI-Generated: <agent-name>`

Replace `<agent-name>` with the actual agent or tool name (e.g. `Codex`, `Claude Code`, `Cursor`, `Copilot`).

Add human `Co-authored-by:` trailers only when the repository or hosting platform recognizes them and the required name and email are known. Do not assume every Git host displays or interprets the same trailers.

## Validation

The bundled tool validates the message format:

```bash
node <skill>/dist/index.js .git/COMMIT_EDITMSG
```

For machine-readable output (useful in CI or agent pipelines):

```bash
node <skill>/dist/index.js --json .git/COMMIT_EDITMSG
```

If the repository already has a commit convention, adapt the message to that convention first. Keep the AI attribution and verification record unless the project explicitly forbids them.

## Hook Setup

Installing the skill makes it available to the agent. It does not automatically modify `.git/hooks`.

### Enable Enforcement

From inside the target Git repository, run:

```bash
node <skill>/dist/index.js --install-hook
```

This installs or updates the `commit-msg` hook. The hook runs the bundled validator on every commit message and exits non-zero on failure.

To also pre-fill the commit template in empty commit messages, run:

```bash
node <skill>/dist/index.js --install-template-hook
```

This installs a `prepare-commit-msg` hook that inserts the commit template when no message exists yet.

### Existing Hooks

Before installing, check whether `.git/hooks/commit-msg` or the configured `core.hooksPath` already contains a `commit-discipline` block.

If a hook already exists, preserve the existing content and add only the `commit-discipline` block. If the block already exists, leave it in place unless the user asks to refresh it.

### Remove Enforcement

To remove the `commit-msg` hook:

```bash
rm .git/hooks/commit-msg
```

To remove the `prepare-commit-msg` hook:

```bash
rm .git/hooks/prepare-commit-msg
```

## Final Report

When reporting to the user, use plain language. State what changed, whether verification passed, and where the commit or hook now exists. Avoid internal reasoning unless the user asks for it.
