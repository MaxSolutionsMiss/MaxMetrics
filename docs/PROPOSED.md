# What is left, drafted

Everything below is a proposal. Nothing here is built. Each item says what the problem is,
what I would do, what it costs and what it risks — so it can be approved, changed or dropped
one at a time rather than as a block.

Ordered by what I would do first. The estimates are working sessions of the size we have been
having, not calendar time.

**Already decided and not in this document:** partial-shift verdict suppression (dropped —
the plant does not need it), leaked-password protection (not a concern), backups and restore
(covered elsewhere).

---

## A. Things that are broken

### A1 · The Supabase client comes from a CDN
**½ session · low risk**

Both pages load `supabase-js` from `cdn.jsdelivr.net`. If jsDelivr is slow, blocked by the
plant's network, or down at 07:40, the dashboard does not open at all — no cards, no cached
copy, no explanation. A morning meeting depends on a host nobody at Max Solutions has a
relationship with.

**Do:** vendor the pinned build into `assets/`, load it from the same origin as everything
else, and delete the CDN reference. It is a 40 KB file that changes when we decide it does.

**Cost:** one file added, two `<script>` lines changed.
**Risk:** none worth naming. Upgrading later becomes a deliberate act, which is the point.

### A2 · A phone that locks mid-sentence loses the sentence
**½ session · low risk**

Fields write when they are left, on Enter, or on Save. A supervisor typing a comment on the
floor who is interrupted — pockets the phone, screen locks — never leaves the field, so
nothing is written.

**Do:** flush the pending write on `visibilitychange` and on `pagehide`, the two events a
browser guarantees before it suspends a tab.

**Cost:** about ten lines beside the existing save machinery.
**Risk:** none. It writes what would have been written anyway, earlier.

### A3 · An unrecognised workbook becomes an enabled source
**½ session · low risk**

`ingest` accepts a file from the Power Automate folder, fails to match it to a configured
source, and creates a new `location_sources` row with `enabled: true`. A renamed, duplicated
or unrelated workbook enters the production ingestion path without anybody deciding what it
represents. It is filed as `other` so nothing reads it *as* a DOR — but the parsers sort files
by what is inside them, not by what the source row says, so a file that looks like a DOR
would be read like one.

**Do:** create it disabled, as "Needs mapping", and say so on the Data screen. An
administrator names it before it can affect a morning.

**Cost:** one flag, one line of UI.
**Risk:** a plant that relies on auto-adding would notice. Nobody does.

### A4 · The parsers do not fail closed
**1 session · medium risk**

Columns are found by label, which is right. But if a label is renamed, duplicated, or its
units change, the reader either picks the wrong column or silently omits the field — and a
plausible wrong number is worse than a visible failure. There is no statement anywhere of
what a workbook *must* contain to be readable.

**Do:** a schema contract per workbook — required labels, accepted aliases, a uniqueness
check, expected type and plausible range, and the date range it must cover. When a contract
is not met the import stops with a screen naming the missing label and showing the header row
it actually found, instead of importing what it could.

**Cost:** the contracts are mostly a rewrite of knowledge already in `FIELDS`; the screen is
new. Fixture tests per workbook version.
**Risk:** the real one — a contract that is too strict turns a readable file into a blocked
morning. Mitigated by making every check name what it wants and by keeping "read it anyway"
available to an administrator.

**I would not do the fuzzy header matching one reviewer suggested.** Normalising already
strips case and punctuation, and both spellings of the plant's typos are in the alias list.
Fuzzy matching means silently choosing a nearly-right column, which is the failure this is
meant to prevent.

### A5 · There is no degraded mode
**1 session · medium risk**

If Supabase is unreachable when the page opens, the dashboard shows an error and nothing
else. At 07:44 that removes the only view of the morning.

**Do:** keep the last successfully loaded published morning in the browser, open it read-only
when the network fails, and say plainly what it is — "Offline copy, loaded 07:32" across the
top, with editing disabled. Not an offline queue: queuing edits means resolving conflicts
against a database nobody could see, and A1 plus the held-write machinery already cover the
common case.

**Cost:** a snapshot on successful load, a fallback path on failure, a banner.
**Risk:** the honest one — somebody reads an offline copy without noticing the banner. That
is why editing is off and the banner is not dismissible.

---

## B. Things that would make the meeting better

### B1 · One way to enter a number
**1–2 sessions · high risk of disruption**

There are three: the Enter screen, edit mode on the cards, and now the open fields on a
section's own screen. You have said this feels redundant and you are right.

**Do:** keep the section screen as the only place a number is typed. Enter becomes what it is
actually good for — a checklist of what is still missing, with a link to the section that
holds each one — rather than a second form. Edit mode disappears entirely.

**Cost:** touches every section and the whole entry layer. This is the biggest item here.
**Risk:** genuinely disruptive. Everybody who fills in the morning learns a new route on the
day it ships. I would want to do it on a quiet week and walk the coordinator through it
first, not the night before a Monday.

### B2 · The board becomes a list of commitments
**1 session · low risk**

"Needs watching today" is a note board: anyone can add a line and nothing ever closes. The
room can discuss the same press issue four mornings running without anybody knowing who
accepted it.

**Do:** each item gets an owner, a next check and a status. Open items carry forward to the
next morning automatically and are shown before anybody adds new ones. Closing takes a
sentence saying what happened.

**Cost:** a small schema change and a rebuild of one card.
**Risk:** it makes the board heavier to write on, and the board's value is that anybody will
write on it. I would keep the owner optional at first and see whether it gets used.

### B3 · Day-over-day context on the cards
**½ session · low risk**

A card says today against target. It does not say whether today is better or worse than
yesterday, so the room cannot tell a bad Tuesday from the fourth bad Tuesday running.

**Do:** a small delta beside the reading — `▲ 4.2% on yesterday` — using the history already
loaded for the trend lines. No new queries.

**Cost:** small.
**Risk:** more ink on a card that is already dense. Would need looking at on the wall before
it stays.

### B4 · The walk skips what has nothing to say
**½ session · low risk**

Present mode has up to ten slides and gives each the same weight, so fifteen minutes is spent
reading the dashboard rather than resolving what is wrong with it.

**Do:** always show Safety, Quality, Production, Shipping and the board. Include the rest only
when they carry an exception, a new comment, or a scheduled Monday review. The full walk stays
available on a key.

**Cost:** small — the rule sits where `wallPages()` already decides what to show.
**Risk:** somebody looks for a section and it is not there. The count of slides on screen
would have to make that obvious.

### B5 · Shift rows are kept
**1 session · low risk, high value later**

The DOR carries one row per machine per shift per operator and thirteen years of history. We
roll it up to a department day and throw the rest away. Every question beyond the morning
meeting — which machine, which crew, which operator, over what period — needs those rows.

**Do:** persist them on import, backfill the history that is already in the workbook, and
show a per-shift breakdown on the production cards. This is also the groundwork for the
analytics module we discussed.

**Cost:** one table, one write path, a backfill.
**Risk:** none to the morning. It is additive.

---

## C. Structural

### C1 · Split the two large files
**1 session · medium risk**

`dashboard.js` is about 4,400 lines and the stylesheet about 2,600. A non-specialist
inheriting this cannot change Shipping without wondering what else they have touched. The
no-build choice is right and is not the problem.

**Do:** keep native modules and no build step, and split by responsibility — state, saving,
cards, entry, present mode, imports — with one module per section. Same for the CSS: tokens,
shell, cards, entry, present, phone.

**Cost:** mechanical but large, and it makes the history harder to read across the split.
**Risk:** the diff is enormous and reviewing it properly is hard, which is exactly when
things get lost. I would do it in several passes with the conformance check and the harness
run between each.

### C2 · An import manifest
**1 session · low risk**

When a figure is challenged there is no way to prove which bytes produced it. The staging
bucket is overwritten each pull and the database keeps no record of what was read.

**Do:** an `import_runs` row per pull — file hash, size, arrival time, parser version, sheets
matched, rows per department and shift, and every warning. Each written value carries its run
id. The workbook itself need not be kept.

**Cost:** one table, one write, a panel on the Data screen.
**Risk:** none. It only adds a record.

### C3 · Card semantics for assistive technology
**½ session · low risk**

Cards are `<div>`s with spans. A screen reader gets disconnected numbers rather than
"Printing, 3,218 sheets per hour, below target".

**Do:** render cards as `<article>` with a heading, tie the reading to its label and status
with `aria-describedby`, hide the decorative chart from the reader when the same value is
spoken, and give present mode a live region so slide changes are announced.

**Cost:** small, and confined to `readings.js`.
**Risk:** none.

---

## D. Yours, not mine

These cannot be done from here and all three reviewers called the first one a release
blocker.

- A co-owner on the Power Automate flow, so it does not stop when the account does.
- A second Metriq administrator.
- Transfer of the Supabase project and the GitHub repository to accounts that outlive you.
- `ANTHROPIC_API_KEY` in Supabase settings if the Clean up button is to work — a company key,
  not a personal one.

---

## One thing I would push back on

Two reviewers proposed replacing `fitCards()` with CSS `clamp()` and container queries. It
cannot work. The point of `fitCards()` is that one scale factor is settled for a whole screen
by measuring the fullest card on it — CSS cannot measure across sibling elements, so every
card would size itself independently and a row of eight would draw at eight sizes. Both
reviewers were working from the brief rather than the code.
