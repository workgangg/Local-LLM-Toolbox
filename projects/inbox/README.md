# inbox/

This is one side of the agent-writable sandbox the Telegram bridge
uses. The other side is `../reports/`.

The sandboxed `telegram-assistant` preset can only write files into
`inbox/` and `reports/` — the realpath check in
`sandboxed_write_file` rejects anything that resolves outside those
two directories, including symlink tricks.

## What goes where

- **`inbox/`** is for quick captures you hand the agent over
  Telegram: "save this snippet as `class_notes_2026-04-22.md`",
  "here's my outline — save as `outline.md`".
- **`reports/`** is for the agent's own output: summaries, study
  guides, generated flashcards, scored job listings, synthesis
  documents.

The split exists so you can tell at a glance whether a file is
*something you told the agent* or *something the agent produced*.
Nothing enforces the distinction in code — it's a convention. If
you prefer a single folder, delete one and edit the system prompt
in `localagent/presets/telegram-assistant.json` to match.

## Safe to delete

Files here are created by you or by the agent during normal use.
Nothing in the rest of the stack reads them, so you can clear the
folder any time. Keep the `.md` files you care about; delete the
rest.
