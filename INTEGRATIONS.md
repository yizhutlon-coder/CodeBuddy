# Provider integration

Start Creature Companion once before configuring providers. It creates this local bridge file:

```text
%APPDATA%\creature-companion\bridge.json
```

The file contains a loopback URL and random bearer token. Do not commit it.

## Test the bridge

With Creature Companion running:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ElectronApp\scripts\send-demo-event.ps1 -Provider claude -EventName SessionStart
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ElectronApp\scripts\send-demo-event.ps1 -Provider claude -EventName PermissionRequest
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ElectronApp\scripts\send-demo-event.ps1 -Provider claude -EventName Stop
```

The same session creature should move from Idle to Needs input to Ready.

## Claude Code

Merge the contents of `integrations/claude-settings.example.json` into your user-level Claude settings:

```text
%USERPROFILE%\.claude\settings.json
```

Do not overwrite existing settings or hooks. Merge the `hooks` entries and the `statusLine` entry. If this repository moves, update every script path in the example.

The lifecycle bridge reports session start, tool activity, permission requests, failures, and completion. The status-line bridge supplies exact context usage plus five-hour and seven-day subscription limit data when Claude provides it.

## Codex

Merge `integrations/codex-hooks.example.json` into your user hook file:

```text
%USERPROFILE%\.codex\hooks.json
```

Codex requires newly added or changed non-managed hooks to be reviewed and trusted before they run. If this repository moves, update every script path in the example.

Codex hooks provide reliable lifecycle and stable session IDs. Exact live token updates from an already-running Desktop process are not promised through hooks; an App Server-owned session adapter is a later milestone.

## Status mapping

| Provider event | Creature state |
| --- | --- |
| `SessionStart` | Idle |
| `UserPromptSubmit`, `PreToolUse`, `PostToolUse` | Working |
| `PermissionRequest` | Needs input |
| `Stop` | Ready |
| Failure or error event | Blocked |

Hook scripts always exit successfully so the companion cannot interrupt AI work.
