# Provider integration

Start Creature Companion once before configuring providers. It creates this local bridge file:

```text
%APPDATA%\creature-companion\bridge.json
```

The file contains a loopback URL and random bearer token. Do not commit it.

## Recommended automatic setup

In the Creature Companion control panel, find **Quick setup** and click **Set up automatically** for the provider you use. The setup process:

1. Detects the Codex or Claude Code CLI on your `PATH`.
2. Reads and merges your existing provider JSON instead of replacing unrelated settings.
3. Adds one Creature Companion handler for each supported lifecycle event.
4. Creates a timestamped backup beside the original file before writing.
5. Reports the provider-specific trust or restart step in the UI.

After setup, click **Launch a session**, choose a project folder, complete the short collaboration profile, and use **Create & launch**. The new terminal inherits a private launch ID so its first provider event binds to the pending creature automatically.

If a configuration file contains invalid JSON, automatic setup stops without changing it. Fix the JSON or use the manual instructions below.

## Test the bridge

With Creature Companion running:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ElectronApp\scripts\send-demo-event.ps1 -Provider claude -EventName SessionStart
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ElectronApp\scripts\send-demo-event.ps1 -Provider claude -EventName PermissionRequest
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ElectronApp\scripts\send-demo-event.ps1 -Provider claude -EventName Stop
```

The same session creature should move from Idle to Needs input to Ready.

## Manual Claude Code setup

Merge the contents of `integrations/claude-settings.example.json` into your user-level Claude settings:

```text
%USERPROFILE%\.claude\settings.json
```

Do not overwrite existing settings or hooks. Merge the `hooks` entries and the `statusLine` entry. If this repository moves, update every script path in the example.

The lifecycle bridge reports session start, tool activity, permission requests, failures, and completion. The status-line bridge supplies exact context usage plus five-hour and seven-day subscription limit data when Claude provides it.

## Manual Codex setup

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
