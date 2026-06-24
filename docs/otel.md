# OTel Setup

`tscope otel` configures the GitHub Copilot CLI to export telemetry to a local file, giving `tscope` access to **server-side AI credit data** that is not available from the Copilot log files alone.

## Why Enable OTel?

| Without OTel | With OTel |
|---|---|
| Token counts from `events.jsonl`; estimated session-level AI credits for Copilot CLI 1.0+ sessions when `totalNanoAiu` is present; no per-model cost breakdown | Token counts **and** authoritative server-side AI credits per session **and per model** (from `github.copilot.nano_aiu`) |
| Historical sessions available | Historical sessions **plus** new sessions captured live |
| `--source logs` behavior | `--source auto` (default) merges both |

OTel data is written entirely to disk — no network calls are made by `tscope`.

## Subcommands

### `tscope otel enable`

Adds the OTel configuration to your shell startup file, then creates the export directory.

```bash
tscope otel enable
```

`enable` **previews** the change it will make to your profile and asks for confirmation before writing:

```
tscope otel enable

Shell profile:  /home/user/.bashrc
Export file:    /home/user/.copilot/tscope/otel.jsonl

The following managed block will be ADDED:

  # >>> tscope otel (managed) >>>
  # Enables GitHub Copilot CLI OpenTelemetry file export for tscope.
  export COPILOT_OTEL_FILE_EXPORTER_PATH="$HOME/.copilot/tscope/otel.jsonl"
  # <<< tscope otel (managed) <<<

Apply this change? [y/N]
```

Enter `y` to confirm. Then **open a new terminal** (or restart your shell) so the environment variable takes effect for new Copilot sessions.

**Shell support:** `tscope otel enable` automatically detects your shell and writes the correct syntax:

| Shell | Profile edited | Export syntax |
|---|---|---|
| Bash | `~/.bashrc` | `export VAR="..."` |
| Zsh | `~/.zshrc` | `export VAR="..."` |
| Fish | `~/.config/fish/config.fish` | `set -gx VAR "..."` |
| PowerShell | `$PROFILE.CurrentUserAllHosts` | `$env:VAR = "..."` |

### `tscope otel disable`

Removes the tscope-managed block from your shell profile. Telemetry stops being collected after you open a new terminal.

```bash
tscope otel disable
```

Like `enable`, `disable` previews the change and asks for confirmation before writing. The telemetry file (`otel.jsonl`) is left untouched so existing data remains available.

### `tscope otel status`

Shows whether OTel export is configured without making any changes.

```bash
tscope otel status
```

Example output:

```
tscope otel status

Shell:           bash
Profile:         /home/user/.bashrc
  managed block: present
Current shell:   COPILOT_OTEL_FILE_EXPORTER_PATH=/home/user/.copilot/tscope/otel.jsonl
Export file:     /home/user/.copilot/tscope/otel.jsonl
  exists:        yes (1.2 MB, modified 2026-06-10T14:35:00.000Z)

OTel export is configured and active in this shell.
```

## How It Works

`tscope otel enable` sets a single environment variable:

```
COPILOT_OTEL_FILE_EXPORTER_PATH=~/.copilot/tscope/otel.jsonl
```

The Copilot CLI reads this variable at startup and routes all telemetry to the file. `tscope` then reads that file when producing reports — no collector, endpoint, or authentication is required.

The managed block is delimited by `# >>> tscope otel (managed) >>>` markers so it can be located and removed precisely by `tscope otel disable`, without touching any surrounding content.

## Coverage and Merging

OTel coverage is **forward-only**: only sessions started after `tscope otel enable` was run (and a new terminal opened) produce OTel data. Sessions before that are still available via the log parser.

In the default `--source auto` mode, `tscope` merges both sources automatically — OTel sessions take priority on overlap, log-parser sessions fill in the historical gaps. See [How It Works](how-it-works.md) for full details on the merge logic.
