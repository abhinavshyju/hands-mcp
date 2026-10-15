# Troubleshooting

**`/healthz` works locally but the tunnel does not.** Check `hands` logs for `tunnel.status`. Confirm `hands tunnel list` and DNS for the hostname. Re-run `hands tunnel setup` if the credentials file is missing.

**Chat client shows no tools.** Confirm bearer token matches `hands token list` / `hands connect`. Some clients need `mcp-remote` as a stdio bridge.

**Edits rejected as ambiguous.** `str_replace` requires a unique exact match. Copy a larger snippet from `read_file`, or set `expected_occurrences`.

**Shell tool hangs.** Use `start_process` for dev servers. `run_command` has a timeout (default 60s).

**Approvals time out.** Open the UI at `http://127.0.0.1:4877` or run an attended CLI (`hands start --headless` with a TTY). Default timeout is 120s.

**User git status looks dirty after agent edits.** That is expected — the agent edited the worktree. Shadow git is separate; restore via checkpoints without touching `HEAD`.
