# Creature Companion

Creature Companion is a local Electron habitat for multiple Codex and Claude Code sessions. Every session gets its own draggable creature, state, animation, role profile, context meter, and rate-limit display when the provider exposes that data.

## Current MVP

- Transparent, always-on-top overlay on every display
- Multiple simultaneous logical creatures
- Persistent tray application and control panel
- User-selected GIF, WebP, PNG, or JPEG per session state
- Session quiz and generated collaboration contract
- Authenticated localhost event bridge
- Claude Code hooks and exact status-line telemetry
- Codex lifecycle hooks
- One-click, backed-up provider hook setup
- Interactive Codex or Claude Code terminal launch from the session quiz
- Automatic binding between a launched terminal and its pending creature
- Manual state controls and demo sessions for visual testing

Ordinary ChatGPT conversations are intentionally marked experimental. The MVP does not inspect screenshots or scrape the ChatGPT interface.

## Run locally

```powershell
pnpm install
pnpm run build
pnpm start
```

For development:

```powershell
pnpm run dev
```

On Windows, after the first install and build, you can also double-click `launch.cmd`.

After the application starts, use **Set up automatically** for Codex or Claude Code. Creature Companion detects each CLI, preserves existing settings and hooks, creates a timestamped configuration backup, and shows the remaining provider trust step. Then choose **Launch a session**, select a working folder, and the app opens an interactive provider terminal that is already paired with its creature.

Hook configuration and automatic terminal launch are reported separately. A provider can connect sessions through hooks even when its interactive CLI is not on `PATH`; in that case, open the session in the provider normally. Codex requires a new task plus explicit trust through `/hooks` before newly configured hooks run.

See [INTEGRATIONS.md](./INTEGRATIONS.md) for manual setup and troubleshooting.

## Security model

- Renderer processes have Node integration disabled, context isolation enabled, and sandboxing enabled.
- Provider hooks send events only to `127.0.0.1` with a randomly generated bearer token.
- Local media is served through a restricted custom protocol and only if the user selected that exact file.
- Hook delivery failures never block or modify the provider's work.
- Automatic setup preserves existing JSON fields and creates a timestamped backup before replacing a provider configuration file.
- Session data, bridge credentials, and media paths stay in Electron's local `userData` directory.

## Project shape

- `src/main`: Electron lifecycle, overlays, persistence, IPC, and event bridge
- `src/renderer`: control panel and overlay UI
- `src/shared`: typed session/event contracts
- `scripts`: provider bridge and telemetry scripts
- `integrations`: example provider configuration
