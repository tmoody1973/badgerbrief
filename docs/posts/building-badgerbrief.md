# How I'm building Wisconsin's most comprehensive voting guide for 2026

The Wisconsin partisan primary is August 11. The general is November 3. Between now and then, most voters will get their information from a mix of TV ads, a few news stories, and whatever shows up in their feeds. I think we can do better than that, so I'm building BadgerBrief, a free, non-partisan voter guide that puts every race, every candidate, and every dollar in one place.

I work in public radio, not political data. My background is architecture, and I came to software sideways. That turns out to matter here: the whole project is really a structure problem. Where does the data live, who's allowed to change it, and how does a voter in Wausau or Sherman Park actually use it?

## What's in it

Right now the guide covers 16 races: governor, lieutenant governor, attorney general, secretary of state, treasurer, a state Supreme Court seat, and all eight U.S. House districts. State Assembly and Senate districts come next, all 99 Assembly seats and the 17 Senate seats on the ballot. Every candidate gets a page with their background, their positions with sources attached, and their money.

The money is where it gets interesting.

## Follow the money, from two directions

Federal candidates file with the FEC, so BadgerBrief syncs the OpenFEC API daily for all eight House races. State candidates file with the Wisconsin Ethics Commission, whose "Sunshine" database publishes every individual transaction. I import those filings directly, transaction by transaction, 83,000 rows so far.

The July filings just dropped, covering January through June, and they already tell a story you won't get from a press release. Tom Tiffany reports $8.7 million raised for governor, but $6.15 million of that is a single transfer from the Republican Party of Wisconsin. Mandela Barnes raised $841,000 and spent over a million. Francesca Hong raised $715,000 across more than 15,000 mostly small contributions. The guide shows raised, spent, top contributors, and a separate list of organization and PAC donors, so you can see the credit unions, the police association PACs, and yes, KOCHPAC, by name. Every number links back to the official filing.

## Ads are data too

Campaigns tell you who they are in their ads, and both Meta and Google publish political ad archives. BadgerBrief will track both. Meta's Ad Library API gives near-real-time creative and spend once their identity verification clears (I'm in that queue now). Google publishes political ads as a free public BigQuery dataset, which needs no approval at all, so that adapter is coming first. On top of the raw ads, I'm building message clustering: group the ad creatives by theme so a voter can see what the campaigns in a race are actually arguing about, not just how much they spent saying it.

Polling gets a module too, with the methodology printed right next to the numbers: who ran the poll, when, sample size, margin of error, likely or registered voters. A topline without those labels is closer to vibes than data.

## The AI part, with a leash on it

I'm using Claude agents to draft candidate briefs and monitor for changes, because this race moves fast. In one week, one candidate dropped out, another suspended her campaign, and a third dropped out and then got back in. No hand-maintained spreadsheet survives that.

But the agents have a hard rule built into the database itself: they can write drafts and file review tasks. They cannot publish. A human (me, for now) approves everything voters see. Every agent run is traced in Arize, so I can inspect exactly what the model read, which tool it called, and what it wrote. There's also a growing set of golden questions ("Is David Crowley still running?" "Who should I vote for?") that every agent has to handle correctly, including refusing to answer that second one. The guide is non-partisan or it's nothing.

## The plumbing

For anyone who cares about the stack: Next.js on Vercel, Convex as the database and backend, Clerk for auth, Claude through the AI SDK. Plus the Census geocoder, so you can type your address and see your actual ballot instead of every race in the state.

## What I've learned so far

Official data is messy in ways you only find by using it. The state's transaction search didn't show the new July filings at first; they were sitting under a different section of the site. One candidate's committee raised money under a name I'd never have guessed. My original seed data missed the Democratic frontrunner entirely. The fix every time was the same: go back to the source, verify against the actual filing, never guess.

BadgerBrief is live at badgerbrief.vercel.app, with more landing every week between now and August 11. If you're a Wisconsin voter, I'm building this for you. If you spot something wrong, tell me. Every fact has a source attached, and I'd like to keep it that way.
