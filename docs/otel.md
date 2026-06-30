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
  exists:        yes (18.5 MB, modified 2026-06-10T14:35:00.000Z)

Rotation/Pruning:
  threshold:     20.0 MB
  archives:      2 file(s)
  archive sizes: otel.jsonl.1 (20.0 MB), otel.jsonl.2 (15.3 MB)
  total size:    53.8 MB
  keep archives: 5
  last rotated:  2026-06-05T10:22:00.000Z
  auto-rotate:   enabled

OTel export is configured and active in this shell.
```

### `tscope otel prune`

Manually rotates and prunes the OTel export file to bound its growth. Archives are created, old ones are deleted, and rotation threshold/retention can be customized.

```bash
tscope otel prune                           # Prune with defaults (20MB, keep 5)
tscope otel prune --max-size 50MB --keep 3  # Custom size/retention
tscope otel prune --force                   # Force rotation regardless of size
tscope otel prune --dry-run                 # Preview what would be done
tscope otel prune -y                        # Skip confirmation prompt
```

The `prune` command:
1. **Previews** current file size, archives, and what will happen
2. **Confirms** before making changes (unless `-y` is passed)
3. **Executes** the rotation and pruning, reporting results

Example:

```
tscope otel prune

OTel export file: /home/user/.copilot/tscope/otel.jsonl
Current size:     18.5 MB
Threshold:        20.0 MB
Archives:         2 file(s)
Archive sizes:    otel.jsonl.1 (20.0 MB), otel.jsonl.2 (15.3 MB)

Result: File is under threshold — no rotation needed.
```

## Rotation & Pruning

The OTel export file grows continuously as Copilot sessions are tracked. To bound disk usage and keep reports responsive, `tscope` can automatically rotate the file to numbered archives (`.1`, `.2`, …) and delete old ones.

### How It Works

When the file exceeds the size threshold:
1. Current file is renamed to `.1` (or existing `.1` is renamed to `.2`, etc.)
2. A fresh empty file is created for new sessions
3. Archives older than the retention count are deleted

The reader seamlessly accesses both the current file and all archives, so historical reports continue to work.

### Default Configuration

- **Rotation threshold:** 20 MB (configurable via `TSCOPE_OTEL_MAX_SIZE`)
- **Archive retention:** 5 files (configurable via `TSCOPE_OTEL_KEEP`)
- **Auto-rotation:** Enabled by default during `tscope` reads
  - Disable with `TSCOPE_OTEL_AUTOROTATE=0` if you prefer manual control
  - View status with `tscope otel status`
  - Manually trigger with `tscope otel prune`

### Environment Variables

```bash
TSCOPE_OTEL_MAX_SIZE    # Rotation size threshold: "20MB", "1GB", or bare bytes
TSCOPE_OTEL_KEEP        # Archive retention count: integer (e.g., 5)
TSCOPE_OTEL_AUTOROTATE  # Enable auto-rotation: 1/true (default) or 0/false
```

Example:

```bash
export TSCOPE_OTEL_MAX_SIZE=50MB
export TSCOPE_OTEL_KEEP=10
export TSCOPE_OTEL_AUTOROTATE=0  # Disable auto-rotation
```

### Concurrency & Safety

**POSIX systems (Linux, macOS):**
- Renaming the live file while Copilot CLI holds it open is atomic and safe
- Copilot's file descriptor keeps writing to the renamed inode (archive)
- New sessions write to the fresh file with no data loss

**Windows:**
- Rename may fail if a Copilot session is actively writing (file locked)
- `tscope` catches this, leaves files untouched, and reports the error gracefully
- Explicit `tscope otel prune` exits with guidance; auto-rotation stays silent

## How OTel Export Works

`tscope otel enable` sets a single environment variable:

```
COPILOT_OTEL_FILE_EXPORTER_PATH=~/.copilot/tscope/otel.jsonl
```

The Copilot CLI reads this variable at startup and routes all telemetry to the file. `tscope` then reads that file when producing reports — no collector, endpoint, or authentication is required.

The managed block is delimited by `# >>> tscope otel (managed) >>>` markers so it can be located and removed precisely by `tscope otel disable`, without touching any surrounding content.

## Coverage and Merging

OTel coverage is **forward-only**: only sessions started after `tscope otel enable` was run (and a new terminal opened) produce OTel data. Sessions before that are still available via the log parser.

In the default `--source auto` mode, `tscope` merges both sources automatically — OTel sessions take priority on overlap, log-parser sessions fill in the historical gaps. See [How It Works](how-it-works.md) for full details on the merge logic.
