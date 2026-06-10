# Commit Discipline

A reusable skill and validator for AI-assisted commits. It helps agents produce reviewable commit messages with clear intent, impact, verification, and AI attribution.

## Install

Install the skill with skills.sh:

```bash
npx skills add eggyshrimp/commit-discipline
```

After installation, the skill is available to supported coding agents. Installing the skill does not automatically modify a repository's Git hooks.

## Capabilities

- **Commit workflow guidance**: separates first-use setup from daily commit work so agents do not repeatedly load one-time hook instructions.
- **Structured commit messages**: requires intent, user-visible impact, summary bullets, verification evidence, AI attribution, and a convention version.
- **Message validation**: validates a commit message from a file path or stdin.
- **Hook enforcement**: installs or removes a `commit-msg` hook that runs the validator automatically.
- **Shared hook support**: preserves existing `commit-msg` hook content and updates only the `commit-discipline` block.
- **Custom hooks path support**: respects Git `core.hooksPath`.
- **Machine-readable output**: supports JSON output for agents and CI.
- **Optional staged secret scan**: can scan staged changes for sensitive values before allowing a commit.

## Boundaries

- It does not make commits for the user by itself.
- It does not replace a repository's existing commit convention; agents should adapt to the project convention first, then keep verification and AI attribution where allowed.
- It does not assume GitHub-only behavior. GitLab, self-hosted Git, and other platforms may interpret trailers differently.
- It does not automatically install Git hooks when the skill is installed through `npx skills add`.
- It does not hide validation failures. Failed messages should be repaired and validated again.

## Hook Activation

For one-time hook activation in a target repository, use:

```bash
node <skill>/scripts/install-hook.mjs
```

The script uses the bundled JavaScript validator that ships with the skill, then installs or updates the `commit-msg` hook without replacing existing hook content.

To remove hook enforcement:

```bash
node <skill>/dist/index.js --remove-hook
```

## CLI

```bash
commit-discipline [message-file]     # validate; stdin if no file
commit-discipline --json [file]      # validate with JSON output
commit-discipline --install-hook     # install commit-msg hook
commit-discipline --remove-hook      # remove commit-msg hook
commit-discipline --version          # print version
commit-discipline --help             # show help
```

## Configuration

Create `.commit-discipline.config.json` in the project root.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `scan_staged` | `boolean` | `false` | Scan staged diff for sensitive values before validating. |
| `allow_merge_commits` | `boolean` | `true` | Skip validation for Git-generated merge messages. |
| `allow_revert_commits` | `boolean` | `true` | Skip validation for Git-generated revert messages. |
| `warn_only` | `boolean` | `false` | Exit successfully even when validation reports warnings. |
| `output_json` | `boolean` | `false` | Emit validation results as JSON by default. |
| `allowed_scopes` | `string[]` | `null` | Restrict commit scopes. `null` allows any scope. |

Example:

```json
{
  "allowed_scopes": ["core", "api", "ui", "docs"],
  "allow_merge_commits": false,
  "allow_revert_commits": false,
  "scan_staged": true
}
```

## Message Shape

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

See [references/commit-message-schema.md](references/commit-message-schema.md) for the full schema.

## Test Coverage

The repository has three layers of checks:

- **Unit and integration tests**: validator rules, config parsing, secret scanning, CLI behavior, hook installation, hook removal, existing hook preservation, and `core.hooksPath`.
- **Project validation**: `npm run validate` runs typecheck, lint, build, and the Vitest suite.
- **Skill behavior eval**: `npm run test:skill` sends direct OpenAI-compatible model requests and checks whether the skill instructions produce expected behavior.

Current skill behavior cases:

- `first-use-setup`: first use reads hook setup guidance, uses the install script, and preserves existing hooks.
- `already-enabled`: existing hook enforcement avoids reinstalling setup.
- `daily-commit`: daily commit work skips setup-only material and produces the required message fields.
- `existing-project-convention`: project-specific commit conventions are preserved.
- `validation-failure-repair`: failed commit messages are repaired and validated instead of bypassed.

For local skill evals, copy `.skill-eval.env.example` to `.skill-eval.env`:

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.deepseek.com/v1
SKILL_EVAL_MODEL=deepseek-v4-flash
```

The local `.skill-eval.env` file is ignored by Git. In GitHub Actions, configure `OPENAI_API_KEY` and `OPENAI_BASE_URL` as repository secrets, and optionally set `SKILL_EVAL_MODEL` as a repository variable. If no key is configured, the eval skips without failing.

## Development

```bash
npm install
npm run validate
npm run test:skill
```

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Validation passed, or `warn_only` allowed warnings. |
| `1` | Validation failed. |
| `2` | Runtime error such as missing file, malformed config, or invalid Git context. |

## License

MIT
