# MaxMetrics

The daily morning dashboard for Max Solutions plants — Mississauga, Guelph, Pickering,
Owen Sound and Markham.

It replaces `Daily_Morning_Dashboard_Vr 22.html`, a single HTML file on the `Z:` share
that saved to one browser's local storage. That file worked, and its design is the
specification this rebuild follows. What it could not do is let more than one person work
at a time, which is the reason for the rebuild.

## Stage 1 of 5 — Foundation

Signed-in, multi-user, live.

- email and password sign-in, password reset, per-person accounts
- a plant's numbers visible only to people granted that plant
- all five sections: Safety & Quality, Production, Shipping, Maintenance & Staffing, Financials
- four chart styles — number, bar, ring, gauge — chosen by the reader and applied to every card
- every card drawn against its target and its last seven mornings, and a one-line verdict
  at the top of each section saying what the section comes to
- a Configure Departments screen, so a plant adds windowing or foil stamping itself, with
  its own words for volume, rate and hours
- presence: who else is on this morning, and which reading they are in
- Present mode, fitted to a 16:9 screen at 1920×1080
- collapsible menu, light and dark

Still to come: hot-folder import from the daily Excel exports, a user admin screen, and
history beyond the seven days behind today.

## The rule the whole thing is built on

Three people work a morning at the same time, so **nothing locks a day**. Every reading a
person can type is its own column. Two people editing two readings are two independent
writes; neither waits for the other and neither overwrites the other. "Enter data" shows
the input fields and is a preference belonging to whoever pressed it — it claims nothing.

This is why the rebuild did not go to SharePoint. A SharePoint list holding one JSON blob
per day would have had all three people overwriting each other's blob, which is the
problem being solved, not a step toward solving it.

## Architecture

- static HTML, CSS and JavaScript; no framework, no bundler, no build step
- one stylesheet: `assets/maxmetrics.css`
- one network module: `js/db.js`
- judgement lives only in `band()` in `js/readings.js`, so a card and the status dot
  beside its section can never disagree about the same number
- database policies are authoritative; the client cannot grant itself anything
- built by `scripts/publish.sh` and served by Netlify from the `gh-pages` branch

Structure and spacing come from MaxDock so the two products feel like one system. The
identity colour does not: MaxDock owns the corporate blue and status owns green, amber and
red, so MaxMetrics takes violet. A brand element wearing a status colour would read as a
verdict on the number beside it.

## Layout

```
index.html              sign in
app/dashboard.html      the dashboard
app/departments.html    the departments a plant runs
assets/maxmetrics.css   the one stylesheet
js/db.js                the one network module
js/readings.js          judgement, the four drawings, the target bar and the trend line
js/assess.js            one verdict per reading, and one line per section
js/pages/               one file per page
supabase/migrations/    the database, rebuildable from here
scripts/                the architecture rules, the build, and publishing
```

## Database

Supabase project `maxmetrics-development` (ca-central-1).
`supabase/migrations/0001_maxmetrics_schema.sql` is the whole database; applying it to an
empty project reproduces it exactly.

The publishable key in `js/db.js` is meant to ship in the page. It grants nothing on its
own — every table is behind row-level security, so what it can read depends entirely on
who is signed in.

## Running it locally

No install step.

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. The Supabase library loads from a CDN, so the machine
needs internet access.

## Publishing

There is no build step in the ordinary sense — the file in the repository is the file the
browser runs. Publishing copies the tree to `_site/`, stamps every asset URL with the
commit so a reload cannot serve last week's stylesheet, and pushes the result to
`gh-pages`, which is the branch Netlify deploys from.

```
scripts/publish.sh --dry-run    build and check, push nothing
scripts/publish.sh              publish
```

It refuses to publish anything that fails `scripts/verify-maxmetrics.mjs` or that does not
parse. This used to be a GitHub Actions workflow; the organisation has no runners, so the
workflow never ran and neither did the checks inside it. A script that runs on the machine
of whoever is publishing is honest about when it happened.

## Before anyone can sign in

Accounts are created in the Supabase dashboard, and each person needs a row in
`profile_locations` granting them a plant. A person with no grant sees a message telling
them to ask an administrator, rather than an empty dashboard.
