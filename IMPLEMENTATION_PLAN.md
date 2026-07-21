# Creature Companion implementation plan

Revised: 2026-07-21

This plan replaces the assumptions in the original planning chat with an implementation path based on the current repository and the current official OpenAI, Anthropic, Electron, and Windows documentation.

## Product boundary

Creature Companion will be a Windows-first Electron tray application with a transparent, click-through creature overlay. It will support multiple simultaneous Claude Code and Codex sessions, user-selected creature media, a short collaboration-profile quiz, attention notifications, and usage displays where the provider exposes supported data.

The integration boundary is intentionally strict:

- Claude Code is integrated with user-level lifecycle hooks plus the supported status-line JSON feed.
- Codex in the ChatGPT desktop app is integrated with user-level Codex lifecycle hooks. A separate local App Server connection may read account-level rate limits and create persistent threads.
- Exact per-thread Codex context usage is only available to the App Server client that hosts or resumes and drives that thread. It is not promised for a thread being driven by a different Desktop App Server process.
- The installed `codex://threads/<id>` route is a compatibility adapter, not a documented public OpenAI deep-link contract. It must be probed and have a visible fallback.
- Ordinary Chat and Work conversations in ChatGPT are not integrated. There is no supported lifecycle API for a third-party desktop companion to observe them. Screen scraping and UI Automation are out of scope for the default product.
- The companion never approves, denies, rewrites, or injects content into provider work. Its hooks are observability-only and always fail open.

## Current implementation assessment

| Area | Current state | Required correction |
| --- | --- | --- |
| Transparent multi-display overlay | Working MVP | Add DPI/display-change regression tests and performance caps. |
| Multiple creatures | Partial | Make provider session IDs authoritative and add deterministic deduplication tests. |
| Claude lifecycle | Partial | Add prompt, notification, API-failure, compaction, and session-end events. |
| Claude telemetry | Mostly working | Preserve or compose with existing status lines, add a refresh interval, and report the documented input-token semantics. |
| Codex lifecycle | Partial | Expand hook coverage, verify trust by hook hash/discovery, and handle the lack of a SessionEnd hook with stale-session policy. |
| Codex Desktop launch | Experimental compatibility path | Separate documented App Server thread creation from the undocumented Desktop deep link; add version/protocol diagnostics and fallback. |
| Codex telemetry | Missing | Read exact account rate limits through App Server; mark Desktop per-thread context unavailable instead of estimating it as exact. |
| Collaboration quiz | Working MVP | Turn answers into reusable profiles and assignment rules. |
| Creature assets | Per-session MVP | Add reusable creature profiles, validation, copied media storage, and global/per-provider/per-state rules. |
| Click to focus a session | Missing | Add provider-specific open/focus actions without general UI Automation. |
| Notifications, sound, quiet hours | Missing | Add explicit preferences, packaged app identity, throttling, and per-trigger controls. |
| Archive, summaries, XP | Missing | Build from local event summaries only; never parse unstable provider transcripts by default. |
| Packaging, signing, updates | Missing | Add a Windows installer, unpacked hook helper resources, stable app identity, signing, and an update policy. |
| Electron hardening | Partial | Add CSP, navigation/window restrictions, permission denial, sender validation, fuses, and current Electron. |

## Permissions and consent matrix

“No prompt” means Windows does not normally show a system permission dialog. It does not mean the app should act without explaining the behavior.

| Capability | OS/provider authority needed | Product rule |
| --- | --- | --- |
| Transparent always-on-top overlay | No special Windows permission | Never require Administrator. Keep the window click-through except over an intentional creature interaction region. |
| Multi-display placement and dragging | No special permission | Store logical display ID and coordinates; clamp positions after monitor or DPI changes. |
| Read user-selected GIF/WebP/PNG/JPEG | File-picker consent; normal user read access | Copy selected media into the app data directory so moved files and packaged paths do not break profiles. Never crawl image folders. |
| Play local sounds | No special permission | Off by default during onboarding preview; respect global mute and quiet hours. |
| Native notifications | User's Windows notification settings; packaged app identity/shortcut | Ask in-app before enabling. Configure stable AppUserModelID and ToastActivatorCLSID in the installer. Provide a test notification and a direct link to Windows settings when delivery is disabled. |
| Start at sign-in | Windows login-item registration | Explicit opt-in only, implemented with Electron login-item settings. Never add it silently during installation. |
| Local event bridge | No firewall exception for loopback-only listening is expected | Bind only to `127.0.0.1`, require a high-entropy bearer token, cap body size, rotate credentials, and never expose a LAN listener. |
| Modify `~/.claude/settings.json` | Normal user file write; explicit user consent | Show a preview, merge instead of replace, create a timestamped backup, validate after writing, and provide one-click restore/uninstall. Respect managed settings. |
| Run Claude command hooks | Hooks run with the user's full OS permissions | Install only an absolute, packaged helper path. Keep it observability-only, validate input, use a short timeout, return success, and never echo secrets. |
| Configure Claude status line | Normal user file write; existing status line may belong to another tool | Do not replace a third-party status line. Offer a safe composition path or lifecycle-only mode. |
| Modify `~/.codex/hooks.json` | Normal user file write plus Codex trust review | Preview and back up the edit. The user must review/trust the exact hook hash in Codex `/hooks`; the companion must not bypass trust. |
| Run Codex command hooks | Codex trust plus hooks running as the user | Same observability-only helper and fail-open rules as Claude. Managed hooks and policy always win. |
| Use Codex App Server | Installed Codex CLI, existing Codex authentication, local child-process access | Use stdio, identify the client, remain on the stable protocol, and never copy or display Codex credentials. Do not expose experimental WebSocket transport. |
| Create/open a Codex Desktop thread | App Server can create the thread; Windows protocol activation opens the installed handler | Treat the exact thread deep link as compatibility behavior. Probe it and fall back to opening Codex plus showing/copying the thread ID. |
| Answer Codex approvals | User approval in the Codex host | Out of scope. The companion displays attention state but never answers App Server approval requests on the user's behalf. |
| Focus a Claude terminal | Process/window handle for a terminal launched by the companion | Retain a launch record and use a narrowly scoped terminal activation helper. Do not enumerate or inspect unrelated windows. |
| Focus Codex Desktop | Constant, validated protocol URI and recorded thread ID | Open only a companion-generated URI. Never pass hook/provider text to `shell.openExternal`. |
| Inspect arbitrary Desktop chats with UI Automation | Accessibility/UI Automation access and potentially elevated process access | Excluded from the supported implementation. Any future experiment must be separately installed, opt-in, visibly active, and have a privacy review. |
| Crash/usage analytics | Network access and privacy consent | Local-only by default. Any remote diagnostics must be opt-in, documented, redacted, and exclude prompts, tool inputs, paths, and transcripts. |
| Automatic updates | Network access, signed release channel, installer identity | Enable only after signed builds and rollback are working. Never download or execute an unsigned hook helper. |

## Provider event design

### Claude Code

Install these user-level hooks in `~/.claude/settings.json`. Each handler forwards the provider JSON unchanged inside a bounded local envelope and exits successfully. The bridge maps state; the hook must not make policy decisions.

| Hook | Creature effect | Required? |
| --- | --- | --- |
| `SessionStart` | Create/bind the creature; `idle` | Yes |
| `UserPromptSubmit` | `working` immediately, including turns with no tool call | Yes |
| `PreToolUse` | Refresh `working` and activity timestamp | Yes |
| `PermissionRequest` | `needs_input` | Yes |
| `Notification` with `permission_prompt`, `elicitation_dialog`, or `agent_needs_input` | `needs_input` and optional user notification | Yes |
| `Notification` with `idle_prompt` or `agent_completed` | `ready` unless a failure is active | Yes |
| `PostToolUseFailure` | `blocked` with a redacted category | Yes |
| `PermissionDenied` | `blocked` or a short-lived denied badge; never request retry | Yes for auto mode support |
| `Stop` | `ready`, unless documented background tasks remain | Yes |
| `StopFailure` | `blocked`; map rate limit, auth, overload, billing, and server categories | Yes |
| `PostCompact` | Clear stale token samples and wait for the next status-line update | Yes |
| `SessionEnd` | `closed` and eligible for archive | Yes |
| `SubagentStart` / `SubagentStop` | Activity badge or optional child creature | Later, opt-in |

Claude telemetry comes from `statusLine`, not transcripts. The documented feed includes context-window size, used percentage, current usage, cost/duration/change counters, and Pro/Max five-hour and seven-day rate-limit windows when present. Set `refreshInterval` to five seconds only when Creature Companion owns the status-line entry. Status updates are snapshots from the latest API response, not a continuously sampled meter.

### Codex

Install these hooks in `~/.codex/hooks.json`. Non-managed hooks remain disabled until the user trusts their current hash in `/hooks`.

| Hook | Creature effect | Required? |
| --- | --- | --- |
| `SessionStart` | Create/bind the creature; `idle` | Yes |
| `UserPromptSubmit` | `working` before the first tool | Yes |
| `PreToolUse` | Refresh `working` | Yes |
| `PermissionRequest` | `needs_input`; never return an allow/deny decision | Yes |
| `PostToolUse` | Remain `working`; capture only tool category and success timing | Yes |
| `Stop` | `ready` | Yes |
| `PreCompact` / `PostCompact` | Optional compacting animation; invalidate stale context display | Later |
| `SubagentStart` / `SubagentStop` | Activity badge or optional child creature | Later, opt-in |

Codex currently has no SessionEnd hook in the documented lifecycle. A `Stop` event means the turn is ready, not that the Desktop thread closed. The registry therefore marks a Codex creature `idle` after a configurable inactivity period and archives it only on an explicit user action or a supported persisted-thread state change.

App Server has two distinct roles:

1. A short-lived account connection can call `account/rateLimits/read` and receive `account/rateLimits/updated`. This provides exact ChatGPT Codex quota windows at account level.
2. A long-lived App Server host receives `thread/status/changed`, `turn/*`, `item/*`, approval requests, and `thread/tokenUsage/updated` for threads it starts or resumes on that connection.

Creature Companion's Desktop mode uses role 1 plus hooks. It must not resume a thread concurrently merely to observe a separate Desktop App Server, because that risks two hosts loading or mutating the same persisted conversation. A future “hosted mode” could embed a full Codex client in Creature Companion, but that is a separate product surface and is not required for Desktop companionship.

### State normalization and deduplication

- Canonical identity is `provider + provider session/thread ID`.
- A companion launch ID is a temporary alias only until the first canonical ID arrives.
- Multiple hook and status-line events for the same ID must update one creature, regardless of arrival order.
- State priority is `needs_input` > `blocked` > `working` > `ready` > `idle`; later events may clear a higher state only when they represent a new provider transition.
- Deduplicate identical events in a short window, but never merge two different canonical IDs merely because they share a folder.
- Add regression fixtures for the observed “one Claude launch creates two creatures” failure.
- Store event sequence/time and reject stale updates that arrive after a newer transition.

## Onboarding design

The onboarding flow should make the security boundary visible without asking a new user to hand-edit JSON.

1. **Detect**: locate Desktop host, CLI, provider version, config paths, existing status line, managed-policy restrictions, packaged hook helper, and loopback bridge health.
2. **Explain**: show exactly which files will change and that command hooks run with the user's normal OS authority.
3. **Preview**: render the proposed JSON diff. Let the user choose lifecycle-only mode when a Claude status line already exists.
4. **Install**: write an atomic merge, keep a backup, validate the resulting JSON, and record an installation manifest containing only paths and hashes.
5. **Provider action**: ask Claude users to restart or start a new session; launch Codex CLI directly to `/hooks` review but leave the trust decision to the user.
6. **Verify**: distinguish bridge self-test, hook discovery, hook trust, and first live provider event. A self-test must never be shown as a live provider connection.
7. **Repair/remove**: detect changed/missing helper hashes, update only Creature Companion entries, restore the prior status line when safe, and remove all installed entries without disturbing other hooks.

The packaged helper is a release blocker. Hook commands cannot point into a development checkout or an `app.asar` archive. The installer must place a signed helper and telemetry script in a stable, unpacked per-user application directory, then write that absolute path into provider settings.

## Electron and local security baseline

Before expanding features, complete the Electron security checklist for every window:

- Upgrade from Electron 37 to the current supported Electron 43 line after running overlay and packaging tests.
- Keep `nodeIntegration: false`, `contextIsolation: true`, and renderer sandboxing enabled.
- Add a restrictive production Content Security Policy. Development may allow only the local Vite origin.
- Deny all Chromium permission requests because the app does not need camera, microphone, geolocation, MIDI, USB, Bluetooth, or clipboard permissions in page content.
- Block renderer navigation and new windows. Allow external opening only through main-process functions with constant or strictly validated `https:`/provider-protocol targets.
- Validate every IPC sender against a known Creature Companion window and validate every argument with runtime schemas.
- Keep the custom media protocol secure and allowlist exact copied asset paths plus MIME types.
- Validate bridge JSON with a runtime schema, cap strings/arrays/depth as well as the total body, use constant-time token comparison, add request-rate limiting, and return generic errors.
- Store state with atomic replacement and recovery. Restrict credential/state files to the current Windows user where packaging APIs permit it.
- Acquire a single-instance lock so a second launch cannot create a competing bridge, tray, or overlay.
- Disable unnecessary Electron fuses and package no development tools or source maps containing local paths.
- Never require elevation. If a provider is running elevated, report that focus/interaction can be limited rather than elevating the companion.

## Revised delivery plan

### Phase 0 — release-safe foundation

Deliverables:

- Packaging with stable per-user paths for the executable, signed/unpacked hook helper, telemetry script, assets, and state.
- Electron 43 upgrade, CSP, navigation/window restrictions, permission denial, IPC validation, single-instance lock, and hardened bridge validation.
- Atomic state and integration writes plus install manifest, restore, repair, and uninstall paths.
- Versioned provider adapter interfaces and recorded minimum supported Codex/Claude versions.
- Fix mojibake strings and add structured local diagnostic logs with prompt/tool/path redaction.

Exit criteria:

- A packaged install can add, run, repair, and remove both provider integrations after the source checkout is deleted.
- Security tests cannot invoke privileged IPC from an unknown window, navigate to remote content, read an unselected file, or post an unauthenticated/oversized bridge event.
- App restart, second-instance launch, port collision, invalid JSON, and interrupted config write recover without data loss.

### Phase 1 — reliable provider connections

Deliverables:

- Expand Claude and Codex hooks to the required matrices above.
- Add typed event normalization, sequence handling, failure categories, stale-session policy, and deterministic launch binding.
- Add safe Claude status-line ownership/composition and exact telemetry labels.
- Add a persistent, supervised Codex account App Server client for rate-limit reads/updates only; reconnect with backoff and stop cleanly.
- Add Codex hook discovery diagnostics through stable App Server `hooks/list` where available, while keeping user trust in Codex.
- Rewrite onboarding as detect → explain → preview → install → provider action → live verify → repair/remove.

Exit criteria:

- Repeated live launches create exactly one creature per canonical session.
- Permission prompts, normal completion, API failure, compaction, restart/resume, and closure map correctly in the live provider matrix.
- Claude context/quota fields are marked exact; Codex account quota is exact; unavailable Codex Desktop thread context is visibly unavailable.
- Existing third-party hooks and status lines survive install and uninstall byte-for-byte outside the companion-owned entries.

### Phase 2 — session launch and interaction

Deliverables:

- Keep App Server thread creation on its stable API surface with client identity and version negotiation.
- Isolate the undocumented Codex Desktop deep link behind a capability probe and fallback flow.
- Preserve session profile/contract in local companion state. Treat developer-instruction injection as an explicit advanced option because it changes agent behavior.
- Track companion-launched Claude terminal instances and provide a scoped focus action.
- Make click/double-click behavior configurable: show details, focus/open provider session, or toggle interaction lock.
- Add manual attach by canonical session ID for recovery; do not scan transcripts.

Exit criteria:

- Codex launch either opens the exact created thread or clearly falls back without claiming success.
- Focusing one creature never spawns a second provider session.
- The collaboration quiz cannot silently alter provider instructions unless the user enabled that option.

### Phase 3 — creature profiles and attention system

Deliverables:

- Reusable creature profiles containing assets for starting, working, needs-input, ready, blocked, idle, and compacting states.
- Assignment rules with precedence: session override → provider rule → global default.
- Asset validation, preview, copied storage, missing-file repair, and an accessible reduced-motion fallback.
- Native notifications for needs-input, blocked, and ready; notification grouping per session; click-to-open behavior.
- Optional sounds and meme reactions with cooldowns, per-trigger switches, volume, quiet hours, and global mute.
- Compact overlay badges for provider, title, state, exact/estimated/unavailable telemetry, and quota reset time.

Exit criteria:

- Every noisy behavior is opt-in or has a visible global off switch.
- Quiet hours suppress sound and native notifications while creature state remains accurate.
- A 20-session synthetic load remains responsive and idle CPU/GPU usage meets a recorded budget.

### Phase 4 — history, polish, and distribution

Deliverables:

- Local session archive using event summaries, durations, state counts, and user-authored notes; no transcript parsing by default.
- Optional local XP/progression derived from companion-observed events, clearly framed as playful rather than productivity scoring.
- Tray controls for pause monitoring, overlay, mute, quiet hours, diagnostics, repair integrations, and quit.
- Signed Windows installer, stable AppUserModelID/ToastActivatorCLSID, opt-in start-at-login, signed updates, rollback, privacy documentation, and release notes.
- Accessibility pass for keyboard control, screen-reader labels in the control panel, reduced motion, color contrast, and non-visual notification alternatives.

Exit criteria:

- Clean install, upgrade, rollback, and uninstall leave provider configs valid and remove only companion-owned entries.
- Windows notifications work from the installed build and open the intended session or a safe fallback.
- The published feature matrix distinguishes supported, provider-limited, experimental, and unavailable behavior.

## Test matrix

- **Unit fixtures:** one sanitized JSON fixture for every installed Claude/Codex hook and status-line variant, including missing/null/new fields.
- **Integration config tests:** empty, existing, managed, malformed, BOM, concurrent edit, third-party status line, duplicate install, repair, and uninstall.
- **Live provider tests:** fresh session, resume, compact, permission prompt, denied permission, tool failure, API/rate-limit failure, background work, normal stop, and application close.
- **Launch tests:** no CLI, no Desktop handler, old/new CLI schema, unsigned/missing helper, WSL path, non-ASCII path, path with spaces, and Desktop deep-link failure.
- **Overlay tests:** one/two/three monitors, mixed DPI, negative coordinates, display removal, full-screen apps, sleep/wake, Explorer restart, and GPU-disabled mode.
- **Security tests:** remote navigation, window opening, IPC spoofing, path traversal, MIME mismatch, token guessing, oversized/deep JSON, bridge flood, symlink/reparse-point asset, and malicious provider strings.
- **Release tests:** installed app after source removal, standard user account, enterprise-managed provider settings, notification disabled, start-at-login toggle, update rollback, and complete uninstall.

## Documentation sources

Primary references checked for this revision:

- OpenAI, [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- OpenAI, [Codex Hooks](https://learn.chatgpt.com/docs/hooks)
- OpenAI, [ChatGPT desktop app for Windows](https://learn.chatgpt.com/docs/windows/windows-app)
- Anthropic, [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- Anthropic, [Claude Code status line](https://code.claude.com/docs/en/statusline)
- Anthropic, [Claude Code permissions](https://code.claude.com/docs/en/permissions)
- Anthropic, [Claude Code settings](https://code.claude.com/docs/en/settings)
- Electron, [Security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- Electron, [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
- Electron, [Notifications](https://www.electronjs.org/docs/latest/tutorial/notifications)
- Electron, [app API](https://www.electronjs.org/docs/latest/api/app)
- Electron, [Electron 43 release](https://www.electronjs.org/blog/electron-43-0)
- Microsoft, [Launch the default Windows app for a URI](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-default-app)

