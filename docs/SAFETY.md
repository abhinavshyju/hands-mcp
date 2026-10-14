# Safety model

Every mutating tool call follows: jail path → resolve mode → approve if required → snapshot checkpoint → apply → audit.

## Modes

| Mode | Edits | Shell / quality |
| --- | --- | --- |
| `readonly` | deny | deny |
| `review` | allow | approve |
| `auto` | allow | allow |

`auto` does not prompt for approvals. Destructive denylisted commands and the path jail still apply in every mode. Use `toolGroupOverrides` to put a group back on the approval path.

Set mode:

```
editer mode set review
```

## Path jail

Inputs are resolved with `realpath`. Symlinks that leave the workspace are rejected. `.env*`, `.git/config`, keys, `~/.ssh`, `~/.aws`, and writes under `node_modules` / `.git` are blocked.

## Checkpoints

Before a mutating file tool, touched files are snapshotted into `.editer/shadow.git` using a private `GIT_DIR`. Restore from the UI or `restore_checkpoint`. The user's `HEAD` and index are not used.

## Approvals

If policy is `approve` and no UI/CLI surface is attached, the call is denied. Timeout (default 120s) also denies, with a message telling the model to retry.
