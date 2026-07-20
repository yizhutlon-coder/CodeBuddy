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
- Codex Desktop thread creation through the documented App Server, with terminal fallback
- Interactive Claude Code terminal launch from the session quiz
- Automatic binding between a launched provider session and its pending creature
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

After the application starts, follow the **Guided setup** checklist for each provider. Creature Companion reports provider-app detection, standalone CLI availability, hook configuration, and verified live activity separately.

For Codex, the wizard can open OpenAI's official standalone CLI installer when the CLI is missing. It then opens a dedicated terminal explaining the one unavoidable trust action: enter `/hooks` inside the Codex CLI and approve the Creature Companion commands. `/hooks` is not available in Codex Desktop chats. The app does not claim a live connection until an authenticated provider event actually arrives.

After setup, **Create & launch** creates a named local Codex thread through `codex app-server` and opens that exact thread in Codex Desktop. The generated collaboration contract is stored as the thread's developer instructions. If the Desktop protocol or App Server is unavailable, Creature Companion falls back to its visible terminal launcher.

For Claude Code, the wizard safely merges the lifecycle and status-line hooks, then waits for an event after Claude Code restarts. A timestamped backup is created before any provider configuration is replaced.

See [INTEGRATIONS.md](./INTEGRATIONS.md) for manual setup and troubleshooting.

## Security model

- Renderer processes have Node integration disabled, context isolation enabled, and sandboxing enabled.
- Provider hooks send events only to `127.0.0.1` with a randomly generated bearer token.
- Local media is served through a restricted custom protocol and only if the user selected that exact file.
- Hook delivery failures never block or modify the provider's work.
- Automatic setup preserves existing JSON fields and creates a timestamped backup before replacing a provider configuration file.
- The optional Codex CLI installer requires an explicit confirmation and downloads the official installer from `https://chatgpt.com/codex/install.ps1` into a visible PowerShell session.
- Session data, bridge credentials, and media paths stay in Electron's local `userData` directory.

## Project shape

- `src/main`: Electron lifecycle, overlays, persistence, IPC, and event bridge
- `src/renderer`: control panel and overlay UI
- `src/shared`: typed session/event contracts
- `scripts`: provider bridge and telemetry scripts
- `integrations`: example provider configuration
