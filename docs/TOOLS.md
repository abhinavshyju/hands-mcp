# Tool reference

All tools are executed on the machine running the daemon. Paths are relative to the active workspace and jailed.

## Meta

| Tool | Mutating | Description |
| --- | --- | --- |
| `get_capabilities` | no | Version, mode, workspace, limits, groups |
| `get_config` | no | Merged config with secrets redacted |
| `list_workspaces` | no | Registered roots |
| `set_active_workspace` | no | Switch by id or name (cannot add roots) |
| `get_project_overview` | no | Languages, package manager, scripts, tree, README |

## Read

`read_file`, `read_many_files`, `list_dir`, `file_stat`

## Search

`grep_search`, `glob_search`, `list_symbols`, `find_symbol_definition`, `find_references`

## Edit (deterministic)

`write_file`, `create_file`, `str_replace`, `multi_edit`, `apply_patch`, `delete_path`, `move_path`

`str_replace` fails if the exact string is missing or not unique unless `expected_occurrences` is set.

## Exec

`run_command`, `start_process`, `list_processes`, `read_process_output`, `stop_process`

## Git (user repo)

`git_status`, `git_diff`, `git_log`, `git_branch`, `git_commit`

## Checkpoints (shadow git)

`list_checkpoints`, `diff_checkpoint`, `restore_checkpoint`

## Quality / high-level

`run_tests`, `run_lint`, `run_build`, `install_packages`, `scaffold_project`, `generate_image`

`generate_image` uses MCP sampling on the connected client. It fails with `SAMPLING_UNAVAILABLE` if the client has no sampling capability, and `SAMPLING_NOT_IMAGE` if the model returns text.

## Browser

`browser_navigate`, `browser_screenshot`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill`, `browser_select`, `browser_press_key`, `browser_scroll`, `browser_wait_for`, `browser_eval`, `browser_get_console`, `browser_assert`, `browser_sessions`, `browser_close`

Screenshots are saved under `.editer/media/` and returned as MCP image content when under the inline size cap. Localhost (and `allowedBrowserHosts`) can be opened without extra approval; other hosts still go through the approval path in `auto`. Requires Chromium (`npx playwright install chromium`).
