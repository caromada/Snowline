# Official conditions reports: what exists, what was chosen, and why

Surveyed on 2026-09-29. Every page below was fetched once, through
`ingest/http.py`, with Snowline's own User-Agent, three seconds apart on any
one host, after reading that host's `robots.txt`.

Snowline takes reports only from government land and road managers whose
terms allow reuse. Forums, social media, trail-guide sites, clubs,
non-profits and news sites are not sources and were not fetched, not even to
look. Where a government page sends its readers to one of those, the link is
recorded below and nothing more.

## Bottom line

| | Count |
| --- | --- |
| Candidate pages and feeds examined | 46 (two more addresses answered 404) |
| Carrying dated conditions from the last 21 days | 12 |
| Chosen and built | 10 sources in 6 modules |
| Live today | 9 (the tenth waits on a key) |
| Passes with at least one report today | 11 of 1,292 (4 of the 68 featured) |

The National Park Service is where the reports are. Five parks keep trail or
road pages that are dated, specific and current. The Forest Service, which
manages most of the ground Snowline covers, publishes almost nothing of the
kind. Of the 22 forest conditions pages that exist, four hold a road table
with a date on it, last touched between May and early September, one holds
a recreation report for two districts, and the rest are lists of links to
somebody else or descriptions that do not change.

The twelve pages carrying dated conditions from the last 21 days are the
nine live sources below, the Sequoia and Kings Canyon road tables, the North
Cascades climbing notes, and one district's road table at Okanogan-Wenatchee
National Forest. Inyo National Forest's two sentences about roads are dated
September 28 and were not counted.

## Terms of reuse and robots.txt, by host

| Host | robots.txt | Terms |
| --- | --- | --- |
| `www.nps.gov` | Disallows `/ns/`, `/search/`, `/loader.cfm` and any path containing `loader.cfm`. Every page used here is allowed. | [Disclaimer](https://www.nps.gov/aboutus/disclaimer.htm), last updated March 5, 2025. Material created by the National Park Service is "generally considered in the public domain" under 17 U.S.C. 105. A citation is "appreciated". When the material is republished commercially, the copyright notice must refer to the original government work (17 U.S.C. 403). Photographs and other third-party content on the site may be protected; Snowline takes text only. |
| `developer.nps.gov` | Answers 403 for `robots.txt`, as it does for every request without a key. RFC 9309 reads a 4xx answer as no rules. Nothing else on the host was requested. | The official API, published for this use. Registration is free. |
| `www.fs.usda.gov` | Disallows `/admin`, `/node`, `/search`, `/user`, `/contact`, `/logout`, `/comment/reply` and `/media/oembed`. Conditions pages are allowed. | [Disclaimers and Important Notices](https://www.fs.usda.gov/about-agency/disclaimers-important-notices): information on the site "is considered public information and may be distributed or copied", with credit requested. |
| `roads.dot.ca.gov` | No file (404), so no rules. | [Caltrans Conditions of Use](https://dot.ca.gov/conditions-of-use), dated July 19, 2021: information on the site, unless marked otherwise, "is considered in the public domain". |
| `www.blm.gov` | Read; disallows `/core/`, `/profiles/`, `/search/`, `/admin/` and the login paths. | Nothing was fetched beyond `robots.txt`. No page of recurring conditions reports for this terrain was found, and the Bureau manages little of the high country Snowline covers. This was not an exhaustive search. |

One thing for the owner to decide. If Snowline is run commercially, the
Park Service asks that its notice refer to the original government work, in
words such as "No protection is claimed in original U.S. Government works".
The reports section names the agency on every report; whether a line on the
credits page is also wanted is a question for whoever owns that page.

## Chosen sources

Each produces records of one shape: agency, unit, place, the text as
published, the date the agency gave, the link, and the time Snowline fetched
it. A report with no date is dropped. So is a report dated after the day it
was fetched, which on these pages is a typing slip (Sequoia and Kings Canyon
carries one dated 07/27/2027).

| Source | Page | What it reports | How it is dated | Read today | Inside 21 days |
| --- | --- | --- | --- | --- | --- |
| `nps-seki-trails` | [Sequoia and Kings Canyon, Trail Conditions](https://www.nps.gov/seki/planyourvisit/trailcond.htm) | A line for each trail and pass, by district, including the east side passes reached from Inyo National Forest | Each line opens with its date | 110 | 6 |
| `nps-noca-trails` | [North Cascades, Trail Conditions](https://www.nps.gov/noca/planyourvisit/trail-conditions.htm) | Dated notes for each trail, newest first | Each note opens with month and day; the year comes from the date at the top of the page | 53 | 5 |
| `nps-mora-trails` | [Mount Rainier, Trails and Backcountry Camp Conditions](https://www.nps.gov/mora/planyourvisit/trails-and-backcountry-camp-conditions.htm) | A row for each trail: percent snow cover, conditions | A date column | 93 | 6 |
| `nps-olym-trails` | [Olympic, Trail Conditions](https://www.nps.gov/olym/planyourvisit/wilderness-trail-conditions.htm) | A row for each trail, conditions as a list | A date column | 55 | 8 |
| `nps-yose-wilderness` | [Yosemite, Wilderness Conditions Update](https://www.nps.gov/yose/planyourvisit/wildcond.htm) | A few sentences for each part of the park | One date for the whole bulletin | 17 | 0 |
| `nps-yose-roads` | [Yosemite, Current Conditions](https://www.nps.gov/yose/planyourvisit/conditions.htm) | Park roads, Tioga Road among them | The page's date | 8 | 8 |
| `nps-mora-roads` | [Mount Rainier, Road Status](https://www.nps.gov/mora/planyourvisit/road-status.htm) | Park roads, Cayuse and Chinook among them | The date in the heading | 12 | 12 |
| `nps-crla-roads` | [Crater Lake, Current Conditions](https://www.nps.gov/crla/planyourvisit/conditions.htm) | Rim Drive, the entrance roads, Highway 62 | The page's date | 9 | 9 |
| `caltrans-highways` | [Caltrans highway conditions](https://roads.dot.ca.gov/roadscell.php) for 22 mountain highways in one request | Every closure, control and roadwork on each highway | One timestamp for the page | 43 | 43 |
| `nps-alerts` | `https://developer.nps.gov/api/v1/alerts` | Closures, cautions and notices for eight parks | `lastIndexedDate` | waits on a key | |

Why these. They are dated by the agency, they name places, the writing is by
staff who were there or who set the gate, and the pages were all touched
within the last week except Yosemite's bulletin, which is 25 days old and
contributes nothing until the rangers write the next one. It is kept because
it is the only trail report Yosemite publishes and costs one request.

### What each source is weak at

- **North Cascades and the missing year.** A note written "9/5" is read as
  the latest September 5 that is not after the date at the top of the page.
  A note left over from 2025 and never given its year would be misread, if
  its month and day also fell inside the 21 days. The park does write the
  year on notes it carries over ("7/24/25"), which is why the source is used
  at all. Only the dated line itself is taken; paragraphs under it with no
  date of their own are left behind.
- **Road tables take the page's date.** No row has its own. A page edited
  for some other reason gets a new date without anyone looking at the
  roads. The status is put first and the notes after it so that a long
  description cannot push OPEN or CLOSED past the point where the app stops
  quoting; the words are the park's and only that order is Snowline's.
- **Olympic's date is the date the row was reviewed.** Rows marked "No
  recent reports" are dropped whole for that reason. A row can still carry
  an old fact under a new date ("Trail closed as of 8/1/25").
- **Mount Rainier's snow cover** is quoted as the park's own column title
  and value ("% Snow Cover: 0") ahead of the conditions.
- **Caltrans in September is roadwork.** Its worth is in winter, when it is
  the one place a seasonal closure is written down with the pass named.
- **Park alerts are untested against the real service.** No key existed, so
  the parser was written to the documented shape and its fixture is written
  by hand and says so. Whether `lastIndexedDate` is the day a park posted
  the alert or the day the index last touched it is the first thing to
  check once a key is registered.

### The key the owner needs to register

`NPS_API_KEY`, free, from the form at
<https://www.nps.gov/subjects/developer/get-started.htm>. Add it to the
repository's Actions secrets under that name; the workflow step already
passes it through. Without it the module logs one line and the other nine
sources run as usual. Once it exists, save one real response over
`tests/fixtures/official/nps_alerts_documented_shape.json`.

## Examined and not chosen

### National Park Service

| Page | What was found | Why not |
| --- | --- | --- |
| [Sequoia and Kings Canyon, Road Conditions](https://www.nps.gov/seki/planyourvisit/road-conditions.htm) | Tables of road segments, page dated September 28, 2026 | Current and structured, but names no pass, so nothing would link. First to add when routes are known. |
| [North Cascades, Climbing Conditions](https://www.nps.gov/noca/planyourvisit/climbing-conditions.htm) | Dated notes with years, newest September 19, 2026 | Current, but about climbing routes on peaks and glaciers, not passes or trails. |
| [Sequoia and Kings Canyon, Current Conditions](https://www.nps.gov/seki/planyourvisit/conditions.htm) | General notes, dated July 1, 2026 | Its alerts are loaded by script; they come through the API instead. |
| [Yosemite, Tioga and Glacier Point Roads plowing update](https://www.nps.gov/yose/planyourvisit/tioga.htm) | Dated paragraphs, last May 13, 2026 | A spring source. Watch list. |
| [Yosemite, Tuolumne Meadows winter conditions](https://www.nps.gov/yose/blogs/tmconditions.htm) | Weekly in winter; the page as served holds no report text | Loaded by script. Off season now. |
| [North Cascades, Road Conditions](https://www.nps.gov/noca/planyourvisit/road-conditions.htm) | "As of 6/14", "As of 12/29", page dated July 3, 2026 | No year on any line and no fresh page date to take one from. |
| [Olympic, Road Conditions](https://www.nps.gov/olym/planyourvisit/current-road-conditions.htm) | Dated rows, newest July 8, 2026 | Stale. |
| [Lassen Volcanic, Trail Conditions](https://www.nps.gov/lavo/planyourvisit/trail-conditions.htm) | A table by area, last updated July 18, 2026 | The park stops updating once the snow is gone. Watch list for May. |
| [Lassen Volcanic, Alerts and Conditions](https://www.nps.gov/lavo/planyourvisit/conditions.htm) | Snow depth table dated May 7, 2026 | Stale. |
| [Lassen Volcanic, winter road closures and spring clearing](https://www.nps.gov/lavo/planyourvisit/winter-road-closures-and-spring-clearing-update.htm) | Opening and closing dates by year | History, not a report. Watch list for spring. |
| [Crater Lake, Hiking](https://www.nps.gov/crla/planyourvisit/hiking.htm) | Last dated October 24, 2023 | Not a source. |
| [Devils Postpile, Conditions](https://www.nps.gov/depo/planyourvisit/conditions.htm) | Opening dates by year | History, not a report. |

### Forest Service

Every forest has a page at `/conditions`. Twenty-four were tried and 22
exist.

| Forest | Page dated | What is on it |
| --- | --- | --- |
| [Okanogan-Wenatchee](https://www.fs.usda.gov/r06/okanogan-wenatchee/conditions) | September 15, 2026 | The best of them: a road table for each ranger district with its own date. Chelan May 20, 2025; Entiat June 3, 2026; Naches July 1; Methow Valley July 2; Wenatchee River September 3; Cle Elum September 8. Trails: sends readers to the Washington Trails Association and two other partner sites (not fetched). |
| [Deschutes](https://www.fs.usda.gov/r06/deschutes/conditions) | July 9, 2026 | A road table naming Cascade Lakes Highway and the McKenzie Highway, all "Open". |
| [Willamette](https://www.fs.usda.gov/r06/willamette/conditions) | June 15, 2026 | Road tables by district, the McKenzie Highway among them. |
| [Sierra](https://www.fs.usda.gov/r05/sierra/conditions) | May 22, 2026 | A road table with gate dates; Kaiser Pass Road is on it. |
| [Shasta-Trinity](https://www.fs.usda.gov/r05/shasta-trinity/conditions) | September 1, 2026 | Recreation reports for the Mount Shasta and McCloud districts: roads, trailheads and campgrounds as "name: open". Nothing for the Trinity Alps trails. |
| [Inyo](https://www.fs.usda.gov/r05/inyo/conditions) | September 28, 2026 | Two sentences about forest roads and links to the county road departments. |
| [Wallowa-Whitman](https://www.fs.usda.gov/r06/wallowa-whitman/conditions) | January 13, 2026 | Road descriptions that do not change, and a [trail report for the Eagle Cap Wilderness](https://www.fs.usda.gov/r06/wallowa-whitman/recreation/trail-report-wallowa-mtns-and-eagle-cap-wilderness), dated March 2, 2026, whose conditions column is empty. |
| [Mt. Baker-Snoqualmie](https://www.fs.usda.gov/r06/mbs/conditions) | July 20, 2026 | One paragraph sending readers to the Washington Trails Association (not fetched). |
| [Gifford Pinchot](https://www.fs.usda.gov/r06/giffordpinchot/conditions) | February 4, 2026 | A list of road names, each a link to its own page. |
| [Mt. Hood](https://www.fs.usda.gov/r06/mthood/conditions) | April 2, 2026 | Links. "For current trail conditions, contact one of our ranger stations." |
| Sequoia, Stanislaus, Eldorado, Tahoe, Lake Tahoe Basin, Lassen, Humboldt-Toiyabe, Umpqua | April 20 to September 11, 2026 | Links to weather, Caltrans, county roads and avalanche centers. No conditions of their own. |
| Plumas, Six Rivers, Fremont-Winema, Olympic | February 23, 2026 to June 13, 2025 | Judged by the page date alone: stale. |
| Klamath, Rogue River-Siskiyou | | No page at that address (404). |

None was chosen. Only one district table of one forest is inside the 21
days, by a single day, and what it would add is the word "Open" beside
Stampede Pass and Yakima Pass. The four road tables share one template and
could share one parser. That is worth building on the day Deschutes,
Willamette or Sierra updates a table for a seasonal closure, and not before:
a parser for pages that are stale eleven months of the year is a thing to
maintain that shows nothing.

The Inyo [alerts page](https://www.fs.usda.gov/r05/inyo/alerts) lists
closure orders by title with no date on the list. Every forest has one.
They are orders, not conditions, and were left alone.

### State agencies

Caltrans chain controls, the Washington pass reports and Oregon's TripCheck
are already read by the winter layer (`ingest/winter.py`). The Caltrans
highway text chosen here is a different service and says what those do not:
closures and their reasons.

## How a report reaches a pass

`fusion/official.py`. A report belongs to a pass when it names the pass.

1. The pass must lie inside the bounds of the unit that wrote the report.
   The gazetteer has four passes named Granite Pass.
2. Only a whole name counts, written as a name. "Muir Pass" links and "John
   Muir Trail" does not. One-word aliases are never used, nor aliases that
   are the name of some other place ("pine creek" for Pine Creek Pass).
3. A name that two passes inside the bounds share links to neither.
4. A junction, camp, lake, creek or trailhead named after the pass is not
   the pass. A trail or road named after it counts.
5. Nothing dated more than 21 days ago, and nothing dated ahead. The app
   takes the age again on the day the page is read.

At most four reports are shown for a pass: those naming it where the agency
names the place first, then those naming it in the words of the report, the
newest first within each.

### Not linked: the road or trail a pass is on

The brief asked for this, using the trailheads in `gazetteer/access.py`. It
was tried against today's pages and left out. The repo knows trailheads as
points near a pass, and near is not on: matching a report's place to those
trailheads put the one Copper Creek report on more than thirty passes, and
put a Twin Lakes Trail report on Panther Gap, which is 1.7 miles from that
trailhead and on a different trail. `gazetteer/routes.py` was not in this
worktree. When it lands, this is where it pays: Panhandle Gap is on the
Wonderland Trail between Summerland and Indian Bar, Mount Rainier reported
on that stretch yesterday, and nothing in the repo today can say so.

## What a later extraction step would do

Nothing here reads a report for meaning, and no language model is called.
The text is stored and shown. A later step could read each report into
fields the fusion engine already uses: snow on the pass (free, patchy,
continuous, and on which side), whether stock can pass, downed trees, water
at named sources, the depth of named fords, and closures with their reason.
It would run on the raw payloads already kept in the store, carry the
agency's sentence beside every field it fills, and leave the quoted text in
the panel exactly as it is now. Two things it must not do: fill a field the
report does not speak to, and turn "Expect winter conditions", which
Sequoia and Kings Canyon writes once in November for a dozen passes, into
an observation of snow.

## What to expect by season

| Season | What is live |
| --- | --- |
| Late September (now) | Trail pages are winding down. Six of 110 lines at Sequoia and Kings Canyon are inside 21 days; in mid July it would have been most of them. Road tables are all current and all say open. |
| October and November | Road tables and Caltrans carry the closures as they happen: Tioga, Sonora, Ebbetts, Monitor, Chinook, Cayuse, Rim Drive, and the Mount Rainier roads, which already print their closing dates. Trail pages go quiet. Sequoia and Kings Canyon says so on its page: do not rely on updates outside summer. |
| December to April | Road status only. For trail passes there is nothing official to show. |
| May and June | Plowing updates (Yosemite, Lassen, both on the watch list), then the trail pages come back as rangers go out, with snow cover on every line. |
| July and August | The most the sources will ever give. Run against every line on today's pages as if all were current, the linker reaches 61 passes. |

## How far this carries the product

**By range.** Inside Sequoia and Kings Canyon, and on the east side passes
that park reports on, coverage in summer is good: 21 of the featured Sierra
passes are named on that one page, and 38 passes in all. The North Cascades
page names 9 passes and Olympic's 7. Mount Rainier names 2 on its trail
page and 2 on its roads, because its trails are listed by segment and not
by the gaps they cross. Yosemite is thin: one bulletin of prose that named
2 passes, and Tioga Pass on the road table. Crater Lake's road table names
no pass at all; it is read and kept, and reaches nothing until routes are
known. Oregon has no pass with a report at any season.
Everywhere else it is close to nothing: the Sierra outside the parks (Inyo
north of Piute Pass, Sierra, Stanislaus, Eldorado, Tahoe), Lassen, the
Oregon Cascades, the Washington Cascades outside the parks (Alpine Lakes,
Glacier Peak, Goat Rocks), the Wallowas, and the Klamath and Trinity
country have no official trail report to take.

**By the numbers.** Eleven of 1,292 passes today. Sixty-one at the height
of summer, about one in twenty: 42 in California, 19 in Washington, none in
Oregon. Of the 68 featured passes, 4 today and 26 at the height of summer.
The summer figure is every line on today's pages linked as if it were
current, so it is a ceiling and not a forecast.

**What it is good for.** Official reports give a panel something true and
attributed to say where there is a park. They will not make the product
feel alive across three states, and in winter they say nothing about any
pass that is not a road. Reports from visitors are what fills the rest, and
the ground with no ranger reports is most of the ground.
