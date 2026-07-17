# Wisconsin 2026 Campaign Finance Integration Guide

**For App Developers — Data as of July 17, 2026**

---

## Overview: Two Systems, Two Levels of Government

Wisconsin candidates file campaign finance reports in two completely separate systems depending on the office they are seeking. Your app must query **both** to get complete coverage.

| Office Type | Data Source | API Available? | Cost |
|---|---|---|---|
| U.S. House & Senate | FEC — OpenFEC API | **Yes — full REST API** | Free |
| Governor, AG, SOS, Treasurer, Lt. Gov., State Senate, State Assembly, Supreme Court | Wisconsin Ethics Commission — Sunshine | **No public API** — CSV export only | Free |

---

## Part 1: Federal Candidates — OpenFEC API

### Overview

The [OpenFEC API](https://api.open.fec.gov/developers/) is a free, well-documented REST API maintained by the Federal Election Commission. It covers all U.S. House and Senate candidates, their committees, contributions, disbursements, and independent expenditures.

### Getting an API Key

Register for a free key at **https://api.data.gov/signup/**. The `DEMO_KEY` works for testing but is rate-limited to 30 requests/minute and 1,000/day. A registered key allows 1,000 requests/hour.

### Base URL

```
https://api.open.fec.gov/v1/
```

---

### Key Endpoints for Wisconsin 2026

#### 1. List All Wisconsin House Candidates

```http
GET https://api.open.fec.gov/v1/candidates/?state=WI&office=H&election_year=2026&api_key=YOUR_KEY&per_page=50
```

**Response fields of interest:**
- `candidate_id` — unique FEC ID (e.g., `H8WI01088` for Bryan Steil)
- `name` — candidate name
- `party` — party abbreviation (`DEM`, `REP`, `IND`, etc.)
- `district` — 2-digit district number
- `incumbent_challenge` — `I` (incumbent), `C` (challenger), `O` (open seat)
- `principal_committees` — list of committee objects with `committee_id`

---

#### 2. Get Candidate Financial Totals

```http
GET https://api.open.fec.gov/v1/candidates/totals/?state=WI&office=H&election_year=2026&api_key=YOUR_KEY
```

Returns one row per candidate with:
- `receipts` — total money raised
- `disbursements` — total money spent
- `cash_on_hand_end_period` — cash on hand
- `debts_owed_by_committee` — debt
- `coverage_end_date` — date of last report

**Or for a single candidate:**
```http
GET https://api.open.fec.gov/v1/candidate/{candidate_id}/totals/?cycle=2026&api_key=YOUR_KEY
```

---

#### 3. Get Individual Contributions (Schedule A)

```http
GET https://api.open.fec.gov/v1/schedules/schedule_a/?committee_id={committee_id}&two_year_transaction_period=2026&api_key=YOUR_KEY&per_page=100
```

Returns individual donor records with:
- `contributor_name`, `contributor_city`, `contributor_state`, `contributor_zip`
- `contributor_employer`, `contributor_occupation`
- `contribution_receipt_amount`, `contribution_receipt_date`

---

#### 4. Get Disbursements (Schedule B)

```http
GET https://api.open.fec.gov/v1/schedules/schedule_b/?committee_id={committee_id}&two_year_transaction_period=2026&api_key=YOUR_KEY&per_page=100
```

Returns spending records with:
- `recipient_name`, `recipient_city`, `recipient_state`
- `disbursement_amount`, `disbursement_date`, `disbursement_description`

---

#### 5. Independent Expenditures (Schedule E) — Outside Spending

```http
GET https://api.open.fec.gov/v1/schedules/schedule_e/?candidate_id={candidate_id}&cycle=2026&api_key=YOUR_KEY
```

Returns outside spending for or against a candidate with:
- `committee_name` — name of PAC/Super PAC
- `expenditure_amount`
- `support_oppose_indicator` — `S` (support) or `O` (oppose)
- `expenditure_date`

---

#### 6. Get Candidate Filings

```http
GET https://api.open.fec.gov/v1/filings/?candidate_id={candidate_id}&form_type=F3&api_key=YOUR_KEY
```

Returns all filed reports (F3 = House/Senate campaign finance reports).

---

### Wisconsin 2026 House Candidate FEC IDs

Use these `candidate_id` values to query finance data directly:

| Candidate | District | Party | FEC Candidate ID | FEC Profile URL |
|---|---|---|---|---|
| Bryan Steil | 1 | REP | H8WI01088 | https://www.fec.gov/data/candidate/H8WI01088/ |
| Mark Pocan | 2 | DEM | H2WI02124 | https://www.fec.gov/data/candidate/H2WI02124/ |
| Douglas Alexander | 2 | DEM | H2WI02199 | https://www.fec.gov/data/candidate/H2WI02199/ |
| Derrick Van Orden | 3 | REP | H0WI03175 | https://www.fec.gov/data/candidate/H0WI03175/ |
| Gwen Moore | 4 | DEM | H4WI04183 | https://www.fec.gov/data/candidate/H4WI04183/ |
| Amy Donahue | 4 | DEM | H6WI04071 | https://www.fec.gov/data/candidate/H6WI04071/ |
| Scott Fitzgerald | 5 | REP | H0WI05113 | https://www.fec.gov/data/candidate/H0WI05113/ |
| Glenn Grothman | 6 | REP | H4WI06048 | https://www.fec.gov/data/candidate/H4WI06048/ |
| Michael Alfonso | 7 | REP | H6WI07223 | https://www.fec.gov/data/candidate/H6WI07223/ |
| Jessi Ebben | 7 | REP | H0WI03159 | https://www.fec.gov/data/candidate/H0WI03159/ |
| Kevin Hermening | 7 | REP | H6WI07249 | https://www.fec.gov/data/candidate/H6WI07249/ |
| Niina Threlfall-Baum | 7 | REP | H6WI07256 | https://www.fec.gov/data/candidate/H6WI07256/ |
| Tom Tiffany (running for Gov.) | 7 | REP | H0WI07101 | https://www.fec.gov/data/candidate/H0WI07101/ |
| Tony Wied | 8 | REP | H4WI08119 | https://www.fec.gov/data/candidate/H4WI08119/ |

---

### Python Code Example — Fetch All WI House Candidate Totals

```python
import requests

API_KEY = "YOUR_API_KEY"  # Register at https://api.data.gov/signup/
BASE_URL = "https://api.open.fec.gov/v1"

def get_wi_house_totals(cycle=2026):
    """Fetch campaign finance totals for all Wisconsin House candidates."""
    url = f"{BASE_URL}/candidates/totals/"
    params = {
        "state": "WI",
        "office": "H",
        "election_year": cycle,
        "api_key": API_KEY,
        "per_page": 100,
        "sort": "-receipts"  # Sort by most raised
    }
    response = requests.get(url, params=params)
    data = response.json()
    
    results = []
    for c in data.get("results", []):
        results.append({
            "candidate_id": c["candidate_id"],
            "name": c["candidate_name"],
            "party": c["party"],
            "district": c["district"],
            "receipts": c["receipts"],
            "disbursements": c["disbursements"],
            "cash_on_hand": c["cash_on_hand_end_period"],
            "coverage_end": c["coverage_end_date"]
        })
    return results

totals = get_wi_house_totals()
for c in totals:
    print(f"{c['name']} (D-{c['district']}, {c['party']}): "
          f"Raised ${c['receipts']:,.0f} | CoH ${c['cash_on_hand']:,.0f}")
```

---

### JavaScript/Node.js Code Example — Fetch Candidate Totals

```javascript
const API_KEY = 'YOUR_API_KEY';
const BASE_URL = 'https://api.open.fec.gov/v1';

async function getWIHouseTotals(cycle = 2026) {
  const params = new URLSearchParams({
    state: 'WI',
    office: 'H',
    election_year: cycle,
    api_key: API_KEY,
    per_page: 100,
    sort: '-receipts'
  });

  const res = await fetch(`${BASE_URL}/candidates/totals/?${params}`);
  const data = await res.json();

  return data.results.map(c => ({
    candidateId: c.candidate_id,
    name: c.candidate_name,
    party: c.party,
    district: c.district,
    receipts: c.receipts,
    disbursements: c.disbursements,
    cashOnHand: c.cash_on_hand_end_period,
    coverageEnd: c.coverage_end_date
  }));
}

getWIHouseTotals().then(totals => {
  totals.forEach(c => {
    console.log(`${c.name} (WI-${c.district}, ${c.party}): Raised $${c.receipts?.toLocaleString()}`);
  });
});
```

---

## Part 2: State Candidates — Wisconsin Ethics Commission (Sunshine)

### Overview

All Wisconsin state-level candidates (Governor, Lieutenant Governor, Attorney General, Secretary of State, State Treasurer, State Senate, State Assembly, and Supreme Court) report to the **Wisconsin Ethics Commission** via the [Sunshine Campaign Finance platform](https://campaignfinance.wi.gov).

**Important:** There is no public REST API. Data is accessed via:
1. The web portal at https://campaignfinance.wi.gov
2. CSV bulk downloads (up to 100,000 rows per export)

### Legal Note

> Per **Wis. Stat. § 11.1304(12)**, campaign finance information obtained from the Wisconsin Ethics Commission **may not be used for commercial purposes**. Non-commercial research, journalism, voter education, and app development for civic/informational purposes is permitted.

---

### Web Portal — How to Search

**Step 1:** Go to https://campaignfinance.wi.gov/browse-data/registrants

**Step 2:** Search by candidate name or committee name. Filter by:
- **Registrant Type:** `State Candidate` (for individual candidates)
- **Office Sought:** Governor, State Senate, State Assembly, etc.
- **Election Year:** 2026

**Step 3:** Click on the registrant to view their committee, then navigate to:
- **Reports** — filed finance reports (pre-primary, pre-general, annual)
- **Transactions** — individual contributions and expenditures
- **Summary** — totals by report period

**Step 4:** Use the **"Download Results"** button on any search page to export up to 100,000 rows as CSV.

---

### Key Report Filing Deadlines for 2026 Primary

| Report | Covers Period | Due Date |
|---|---|---|
| January Continuing | Jan 1 – Jun 30, 2026 | July 15, 2026 |
| Pre-Primary | Jul 1 – Jul 27, 2026 | July 29, 2026 |
| Post-Primary | Jul 28 – Aug 11, 2026 | August 26, 2026 |
| Pre-General | Aug 12 – Oct 20, 2026 | October 22, 2026 |
| Post-General | Oct 21 – Nov 3, 2026 | November 18, 2026 |

---

### CSV Download Strategy for Your App

Since there is no API, the recommended approach for your app is to **schedule periodic CSV downloads** and import them into your own database.

**Recommended download URLs (apply filters on the portal, then export):**

```
# All 2026 state candidate transactions
https://campaignfinance.wi.gov/browse-data/transactions
  Filter: Election Year = 2026, Registrant Type = State Candidate
  Export: CSV (up to 100,000 rows)

# All 2026 registrants (candidates + committees)
https://campaignfinance.wi.gov/browse-data/registrants
  Filter: Election Year = 2026
  Export: CSV
```

**Python CSV parsing example:**

```python
import pandas as pd
import requests
from io import StringIO

# After manually downloading the CSV from Sunshine portal:
df = pd.read_csv('wi_sunshine_transactions_2026.csv')

# Filter for a specific candidate's committee
candidate_committee = "Friends of Kelda Roys"
candidate_df = df[df['Registrant Name'].str.contains(candidate_committee, case=False, na=False)]

# Summarize contributions
contributions = candidate_df[candidate_df['Transaction Type'] == 'Contribution']
total_raised = contributions['Amount'].sum()
print(f"Total raised by {candidate_committee}: ${total_raised:,.2f}")

# Top donors
top_donors = (contributions
    .groupby(['Contributor Name', 'Contributor City'])['Amount']
    .sum()
    .sort_values(ascending=False)
    .head(10))
print(top_donors)
```

---

### Scraping Strategy (Advanced — Use Responsibly)

If you need automated data pulls for civic/non-commercial purposes, you can use Python `requests` + `BeautifulSoup` to scrape the Sunshine portal. The site is a Next.js app that fetches data from an internal backend at `wi.elstats2.civera.com`.

**Example — find a candidate's registrant ID:**

```python
import requests
from bs4 import BeautifulSoup

def search_sunshine_registrant(name: str):
    """Search Wisconsin Sunshine for a candidate registrant."""
    url = "https://campaignfinance.wi.gov/browse-data/registrants"
    params = {"q": name, "registrantType": "StateCandidate"}
    headers = {"User-Agent": "Mozilla/5.0 (civic research app)"}
    
    resp = requests.get(url, params=params, headers=headers)
    soup = BeautifulSoup(resp.text, 'html.parser')
    
    # Parse result table
    rows = soup.select('table tbody tr')
    results = []
    for row in rows:
        cells = row.find_all('td')
        if cells:
            results.append({
                "name": cells[0].get_text(strip=True),
                "office": cells[1].get_text(strip=True) if len(cells) > 1 else "",
                "party": cells[2].get_text(strip=True) if len(cells) > 2 else "",
                "profile_url": "https://campaignfinance.wi.gov" + row.find('a')['href'] if row.find('a') else ""
            })
    return results
```

> **Note:** Always add delays between requests (`time.sleep(1)`) and respect the site's `robots.txt`. Do not use scraped data for commercial purposes.

---

## Part 3: Recommended Architecture for Your App

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR APP DATABASE                        │
│                                                                 │
│  candidates table    finance_totals table    contributions table│
│  ─────────────────   ─────────────────────   ─────────────────  │
│  id, name, party,    candidate_id, raised,   donor_name, amt,  │
│  office, district,   spent, cash_on_hand,    date, committee   │
│  fec_id, sunshine_id coverage_date           _id               │
└──────────┬──────────────────────┬───────────────────────────────┘
           │                      │
     ┌─────▼──────┐         ┌─────▼──────────────────┐
     │  OpenFEC   │         │  Wisconsin Sunshine     │
     │  REST API  │         │  (CSV download/scrape)  │
     │            │         │                         │
     │ /candidates│         │ campaignfinance.wi.gov  │
     │ /totals    │         │ Browse → Export CSV     │
     │ /schedule_a│         │ (scheduled weekly pull) │
     └────────────┘         └─────────────────────────┘
     Federal candidates      State candidates
     (WI-1 through WI-8)    (Gov, AG, SOS, Treas,
                             State Senate/Assembly)
```

### Recommended Refresh Schedule

| Data Type | Source | Recommended Refresh |
|---|---|---|
| Candidate list | JSON file (this file) + FEC | Weekly |
| Federal finance totals | OpenFEC API `/candidates/totals/` | Daily during campaign season |
| Federal individual contributions | OpenFEC API `/schedules/schedule_a/` | Weekly |
| State finance totals | Wisconsin Sunshine CSV export | Weekly (after report deadlines) |
| State individual contributions | Wisconsin Sunshine CSV export | Weekly |
| Race ratings | Ballotpedia / Cook Political | Manual update |

---

## Part 4: Third-Party Aggregators (Optional)

If you want pre-aggregated, cleaned data without building your own pipeline, these services may help:

| Service | Coverage | Cost | URL |
|---|---|---|---|
| **OpenSecrets** | Federal + some state; PAC data; donor industries | Free tier + paid | https://www.opensecrets.org/api |
| **FollowTheMoney.org** | All 50 states including Wisconsin state races | Free (non-commercial) | https://www.followthemoney.org/our-data/apis/ |
| **Ballotpedia** | Candidate profiles, race ratings | Free web; paid API | https://ballotpedia.org/Ballotpedia:API |
| **ProPublica Campaign Finance API** | Federal only (FEC wrapper) | Free | https://projects.propublica.org/api-docs/campaign-finance/ |

### FollowTheMoney.org — Best for Wisconsin State Races

FollowTheMoney aggregates Wisconsin Ethics Commission data and provides a free API for non-commercial use:

```
# Get contributions to a Wisconsin candidate
GET https://api.followthemoney.org/candidates/?eid={entity_id}&y=2026&s=WI&APIKey=YOUR_KEY

# Search for a candidate by name
GET https://api.followthemoney.org/candidates/?name=Kelda+Roys&s=WI&y=2026&APIKey=YOUR_KEY
```

Register for a free API key at: https://www.followthemoney.org/our-data/apis/

---

## Part 5: Quick Reference

### Important URLs

| Resource | URL |
|---|---|
| OpenFEC API Docs | https://api.open.fec.gov/developers/ |
| OpenFEC API Key Signup | https://api.data.gov/signup/ |
| FEC Wisconsin Candidates | https://www.fec.gov/data/candidates/house/?state=WI&election_year=2026 |
| Wisconsin Sunshine Portal | https://campaignfinance.wi.gov |
| Wisconsin Sunshine Registrants | https://campaignfinance.wi.gov/browse-data/registrants |
| Wisconsin Sunshine Transactions | https://campaignfinance.wi.gov/browse-data/transactions |
| Wisconsin Sunshine Reports | https://campaignfinance.wi.gov/browse-data/reports |
| Wisconsin Ethics Commission | https://ethics.wi.gov |
| FollowTheMoney API | https://www.followthemoney.org/our-data/apis/ |
| OpenSecrets API | https://www.opensecrets.org/api |
| WUWM Voter Guide | https://www.wuwm.com/voterguide |
| Ballotpedia WI 2026 | https://ballotpedia.org/Wisconsin_elections,_2026 |
| MyVote Wisconsin | https://myvote.wi.gov |

### OpenFEC Office Codes

| Code | Office |
|---|---|
| `H` | U.S. House of Representatives |
| `S` | U.S. Senate |
| `P` | U.S. President |

### OpenFEC Party Codes

| Code | Party |
|---|---|
| `DEM` | Democratic |
| `REP` | Republican |
| `IND` | Independent |
| `GRE` | Green |
| `LIB` | Libertarian |
| `NNE` | No Party Affiliation |

---

*Guide prepared July 17, 2026. Campaign finance reporting deadlines and API endpoints are subject to change. Always verify with the official FEC and Wisconsin Ethics Commission websites.*
