# Decisions Log

## 2026-06-13T00:52:07.174-04:00 — Filter Redesign

The dashboard filters were redesigned to address a visually chaotic UI:
- Native <select> inputs for Models and Sources were replaced with custom JS-driven dropdowns containing checkboxes, allowing for simpler multiselection without holding Ctrl/Cmd.
- Threshold operators (<, >) were removed from the Token, Credit, and API Time filters. We now default to '≥' (minimum value) and use a minimal inline 'Gemini-style' pill input to reduce visual clutter.
