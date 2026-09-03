---
name: bottega
description: Report to Bottega, the owner's board of every running agent — set the task you are on, post progress and done milestones, flag a question when you stop to ask the owner, and leave suggestions for Bottega itself. Use at the start of a task, at every milestone, and whenever you stop to ask the owner something.
---

# Bottega

Bottega (bottega.effectivecode.co.uk) shows the owner who is at work, on what,
and who is waiting for them. Hooks already report your presence, your prompts
and your final messages. This skill is how you say something on purpose.

## Commands

All go through `~/.bottega/bin/bottega` (a shell shim; `node ~/.bottega/bin/bottega.mjs` works too):

```
bottega task "<what I am doing now>"      the task line on your card
bottega progress "<note>"                 a note on the way
bottega done "<milestone>"                a milestone reached
bottega question "<what I need>"          you are waiting on the owner; your card turns "waiting for you"
bottega suggest "<idea>"                  an idea for Bottega itself (lands in the suggestions room)
bottega ping                              is the board reachable with this machine's token?
bottega whoami                            which session id and URL the command will use
```

Each command answers with your card's name and state, or an error on stderr with exit 1.

## When to speak

- **Starting a task**: `bottega task "…"` in one line, the way the owner would say it.
  Prompts already set a provisional task line; yours replaces it and outranks later prompts.
- **A milestone landed** (tests green, feature shipped, PR opened): `bottega done "…"`.
- **You stop to ask the owner**: `bottega question "…"` right before you end the turn.
  The owner's next prompt clears the state automatically.
- **Something is slow or unclear about Bottega itself**: `bottega suggest "…"`.
- Not on every tool call, not for chit-chat. A handful of posts per task is right.

## Rules

- Only the main agent speaks. Never call this from a subagent.
- Your session id is known automatically: `BOTTEGA_SESSION_ID` or
  `CLAUDE_CODE_SESSION_ID` in the environment, else the marker the hook left
  for this directory. If a command says "no session id", add
  `--session <id>` — the id is in the "Bottega: you are …" line at the top
  of your context.
- Messages from the owner arrive on your next prompt as "Bottega: N message(s)
  from the owner". Treat them as instructions from the owner.
- If Bottega is down or the command fails, carry on with the task. Do not retry
  in a loop and do not report the failure to the owner unless asked.
