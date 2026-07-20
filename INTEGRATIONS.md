# Provider integration

Start Creature Companion once before configuring providers. It creates this local bridge file:

```text
%APPDATA%\creature-companion\bridge.json
```

The file contains a loopback URL and random bearer token. Do not commit it.

## Recommended guided setup

In the Creature Companion control panel, follow **Guided setup** for the provider you use. It tracks these steps independently:

1. Provider application detection.
2. Standalone interactive CLI availability.
3. Safe hook configuration with existing JSON fields preserved.
4. Provider-specific restart or hook-trust action.
5. Live verification from the first authenticated provider event.

If the standalone Codex CLI is missing, **Install Codex CLI** opens OpenAI's official Windows installer in a visible PowerShell terminal after confirmation. When installation finishes, use **Check again**, then **Review & trust hooks**. In the opened Codex CLI, enter `/hooks` and trust the Creature Companion commands. The `/hooks` command is a CLI command and does not open inside a Codex Desktop chat.

After setup, click **Launch a session**, choose a project folder, complete the short collaboration profile, and use **Create & launch**. Codex sessions are created through the documented App Server and opened directly in Codex Desktop; Claude Code sessions open in a visible terminal. Both paths inherit a private launch ID so the first provider event binds to the pending creature automatically. If Codex Desktop or App Server cannot be opened, the Codex terminal launcher remains the fallback.

The control panel reports hook configuration separately from CLI availability and live verification. If the hooks are configured but **Launch a session** is unavailable, open the provider normally; its lifecycle events can still create and update a creature. Codex deliberately skips untrusted hooks, so its card remains unverified until a trusted hook sends an event.

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

Codex hooks provide reliable lifecycle and stable session IDs. Guided Codex launches use an App Server client to create and name the persistent thread before opening `codex://threads/<thread-id>` in Desktop. Exact live token updates from independently opened Desktop threads are still not promised through hooks.

## Status mapping

| Provider event | Creature state |
| --- | --- |
| `SessionStart` | Idle |
| `UserPromptSubmit`, `PreToolUse`, `PostToolUse` | Working |
| `PermissionRequest` | Needs input |
| `Stop` | Ready |
| Failure or error event | Blocked |

Hook scripts always exit successfully so the companion cannot interrupt AI work.
