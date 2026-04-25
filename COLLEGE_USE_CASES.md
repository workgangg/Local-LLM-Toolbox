# College Student Use Cases — Local LLM Toolbox

A grab-bag of ways a college student can put this toolbox to work. Everything here runs on your own machine — no cloud bills, no data leaving your laptop, no "you've hit your free tier" popups mid-exam-week. The only exception is the `job-scanner` agent, which fetches pages you point it at.

Each use case lists the **best interface** (Open WebUI for chat, OpenCode for terminal work, or the LocalAgent CLI/API for scripted runs), which **agent preset** to use, and a realistic **example prompt**.

> New-user tip: drop your own files into `projects/` on your host. Everything inside that folder is visible to every agent at `/workspace/projects`. Files you create or edit inside the container appear back on your host in the same place.

---

## 1. Turn lecture notes into study guides

Class notes are messy. Hand them to `doc-processor` and ask for a clean study guide, a list of definitions, or a set of practice questions.

- **Interface:** Open WebUI (conversational) or LocalAgent CLI
- **Preset:** `doc-processor`
- **Setup:** paste or save your notes as `projects/notes/econ_week7.md`
- **Prompt:**
  > Read `notes/econ_week7.md` and produce (1) a one-page summary, (2) a glossary of the key terms with one-sentence definitions, and (3) five practice questions with answers. Save the result to `study/econ_week7_guide.md`.

Because the agent can `read_file` and `write_file`, the study guide lands right back in `projects/` where you can open it in VS Code or paste it into Notion.

## 2. Draft, outline, and revise essays

Use the `assistant` agent (OpenCode) or Open WebUI for essay work — brainstorming thesis statements, critiquing a draft, tightening word counts, checking argument structure. Unlike cloud chatbots, every word of your draft stays on your machine.

- **Interface:** OpenCode with the `assistant` prompt, or Open WebUI
- **Preset / agent:** `assistant` (OpenCode) or custom
- **Prompt:**
  > Read `essays/climate_draft.md`. Give me three specific structural problems in the argument, suggest two counter-arguments I should address, and propose a revised thesis sentence. Don't rewrite the essay.

Follow-up: ask it to write a one-paragraph abstract, or to tighten a rambling section to 250 words.

## 3. Programming homework help — with the whole project in scope

Cloud coding tools often only see the snippet you paste. `coder` can read your whole assignment folder, run tests, check git diffs, and explain what it changed.

- **Interface:** OpenCode (`build` prompt) or LocalAgent CLI
- **Preset:** `coder`
- **Setup:** drop your assignment into `projects/cs101_hw3/`
- **Prompt:**
  > Open `cs101_hw3/`. There's a failing test in `test_graph.py` (function `test_bfs_cycle`). Read the code, figure out why it fails, fix it in `graph.py`, and run the tests to confirm. Make the smallest possible change.

Bonus: use `git-commit` afterward to auto-generate a tidy commit message for your submission.

## 4. Internship and job hunting

`job-scanner` is the one agent that's allowed to reach the internet. Give it listing URLs and a `criteria.md` describing what you're looking for, and it ranks and scores them for you.

- **Interface:** LocalAgent CLI
- **Preset:** `job-scanner`
- **Setup:** save this as `projects/criteria.md`:
  ```markdown
  # What I'm looking for
  - Role: SWE intern, data analyst intern
  - Skills: Python, SQL, a little React
  - Location: remote or Pacific NW
  - Duration: Summer 2026, ~12 weeks
  - Avoid: unpaid, customer-facing sales, on-call
  ```
- **Prompt:**
  > Read `criteria.md`. Then fetch these three listings, extract the details, score each one 1-10 against my criteria, and save a ranked report to `reports/jobs_2026-04-23.md`.

The output lands in `projects/reports/`, so you can read it later or diff new runs against old ones.

## 5. Read and synthesize a stack of papers

Dense academic reading is where offline LLMs earn their keep: you can throw 20 papers into a folder and have the model produce a theme map without worrying about paywalls, copyright flagging, or rate limits.

- **Interface:** LocalAgent CLI (or Open WebUI for Q&A)
- **Preset:** `doc-processor`
- **Setup:** save paper PDFs converted to text/markdown into `projects/lit_review/` (use any PDF-to-text tool or paste abstracts)
- **Prompt:**
  > Read everything in `lit_review/`. Produce (1) a one-paragraph summary of each paper with its main claim and method, (2) a table of which papers disagree with each other and on what point, and (3) three open questions the field hasn't settled. Save to `lit_review/synthesis.md`.

For a big literature folder, run `graphify update lit_review/` first — the resulting GRAPH_REPORT.md shows which papers are most central, which themes form clusters, and which outliers you might have missed.

## 6. Organize your own notes and past coursework

Over four years of school, your `Documents` folder turns into a graveyard of half-remembered notes. Point Graphify at it and you get a clickable knowledge graph showing how everything connects.

- **Interface:** Graphify CLI (via Docker)
- **Command:**
  ```
  docker compose run --rm graphify update notes/
  docker compose run --rm graphify query "where did I write about OOP design patterns?"
  ```
- Graphify is AST-based and offline, so it works fine on code *or* markdown notes.

Then use `assistant` to cross-reference:
  > The graph in `notes/graphify-out/` says my strongest cluster is around databases and my weakest is around networking. Read the networking notes and make a one-week study plan to shore them up.

## 7. Personal tutor that lives in your pocket (Telegram bridge)

Turn on the optional Telegram bridge and you can ping your local LLM from your phone during the bus ride home — "what does this term mean?", "summarize this paragraph I'm copying in". The bridge forces a sandboxed preset: the model can read your `projects/` notes and write to `inbox/` or `reports/`, but it can't run shell or touch configs, so prompt-injection from forwarded messages can't escape the sandbox.

- **Interface:** Telegram (your phone)
- **Preset:** `telegram-assistant` (hardcoded in the bridge)
- **Setup:** follow `telegram-bridge/README.md` — create a bot via @BotFather, drop its token and your user ID into `.env`, and flip the `telegram` profile on.
- **Prompt (sent as a normal Telegram message):**
  > Look at `inbox/` for the note I saved "psych_q2.md" — turn it into 10 flashcard-style Q&A pairs and save to `reports/psych_q2_flashcards.md`.

Read the SECURITY section in `SETUP.txt` first — the bridge is hardened, but the general advice still applies.

## 8. Resume and cover-letter tailoring

Pair your base resume with each job description; have the model produce a targeted cover letter and a highlighted-skills summary. Your resume never leaves your laptop.

- **Interface:** Open WebUI or LocalAgent CLI
- **Preset:** `doc-processor`
- **Setup:** save your resume as `projects/resume/master.md` and the job ad text as `projects/resume/target_job.txt`
- **Prompt:**
  > Read `resume/master.md` and `resume/target_job.txt`. Write a one-page cover letter tailored to this role, quoting two specific things from the listing that line up with projects on my resume. Then list any gaps I should address in the interview. Save the letter to `resume/cover_letter_{company}.md`.

---

## Quick reference — which preset fits which task?

| If you want to...                                   | Use preset          | Notes                         |
|-----------------------------------------------------|---------------------|-------------------------------|
| Summarize / analyze notes, papers, PDFs, markdown   | `doc-processor`     | Offline                       |
| Generate a commit message for your homework repo    | `git-commit`        | Run from a git repo with changes |
| Debug code, add features, run tests                 | `coder`             | Has shell access              |
| Rank job listings against your criteria             | `job-scanner`       | Only preset that reaches internet |
| Chat from your phone via Telegram                   | `telegram-assistant`| Sandboxed; setup required     |
| Open-ended chat / brainstorming                     | Open WebUI          | Just visit `http://localhost:3000` |
| Multi-step personal workflow inside your editor     | OpenCode `assistant`| Terminal UI                   |

## Tips that save frustration

- **Be specific.** "Fix the bug" is worse than "The `calculate_gpa` function in `grades.py` returns `None` for transfer students; figure out why and fix it."
- **Keep files small per prompt.** Small local models (4B-class) do best with focused context. Ask the agent to read one file at a time.
- **Use `--turns 30`** on the `coder` preset if it stops mid-task — the default is 25.
- **Everything you save to `projects/`** shows up back on your host machine in the same folder. Use that to move drafts into Word/Google Docs when you're done.
- **If the GPU doesn't kick in**, check `SETUP.txt` → "GPU override is running but models still show 100% CPU". Silent CPU fallback is the single most common gotcha.
