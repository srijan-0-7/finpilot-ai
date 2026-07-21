# ▲ FinPilot AI

**FinPilot AI** is a natural-language database copilot for financial and business data. Ask questions in plain English, get optimized SQL, live dashboards built from your own data, investor-ready Excel exports with real embedded charts, and AI-written executive reports — all with real user accounts and a security model built for public deployment, not just local demos.

## 🌟 Core Features

### Ask & Explore
- **Natural Language to SQL:** Translates English into optimized, dialect-aware SQL using Groq's free LLM API with structured function calling for strict schema enforcement.
- **Voice Input:** Ask questions by speaking, via the browser's built-in Web Speech API (Chrome/Edge).
- **Follow-up Suggestions, Confidence & Caveats:** Every answer includes clickable follow-up questions, a confidence score, and any caveats about the result.
- **Data Mutations with Confirmation:** Ask it to add, update, or delete data ("delete the customer with ID 3") and it will show you the exact SQL and require an explicit confirmation click before anything changes — nothing mutates silently.
- **Query History:** Every question is saved and can be replayed with one click.
- **Shareable Results:** Generate a read-only public link for any chart/table/insight.

### Your Own Data
- **Multi-file CSV Upload:** Drag and drop one or more CSVs directly into Data Explorer — no schema setup needed, immediately queryable in chat.
- **Dynamic Dashboard Mapping:** Point the dashboard at any table you've uploaded by mapping its date/amount/category/entity columns — the KPIs, charts, forecast, and PDF report all follow whatever you configure, not a hardcoded schema. The included example dataset works the exact same way and can be replaced any time.
- **Table Relationships:** Connect columns across separately-uploaded tables so the AI understands how to join them (uploaded CSVs don't have real foreign keys, so this fills that gap).
- **Unsuitable-file handling:** Files with no numeric columns still upload successfully and stay fully queryable in chat — they're just flagged as not eligible to power the Dashboard, rather than being rejected outright.

### Analysis
- **Live Executive Dashboard:** KPIs, trend chart, category breakdown, and top-entities table — computed directly from your live, configured data source.
- **Anomaly Detection:** Statistically flags any period more than 2 standard deviations from the mean.
- **Correlation Finder:** Real Pearson correlation coefficients between numeric columns — not an LLM guessing at relationships.
- **Simple Forecasting:** A linear-trend projection, clearly labeled as such (not a seasonal/ARIMA model).
- **Executive PDF Reports:** One-click generation of a corporate-style PDF with a KPI summary, real charts, flagged anomalies, and AI-written key insights — fully dynamic to whatever dataset is configured.
- **Excel Export Engine:** Multi-sheet `.xlsx` exports with a styled/currency-formatted data sheet, conditional color-scale formatting, autofilter, frozen headers, and — when the data shape supports it — a **Summary sheet with a real, native, editable Excel chart** (not a pasted image) plus a Trend sheet with a native line chart.

### Accounts & Access
- **Real user accounts:** Email/password signup and login (bcrypt-hashed passwords, session tokens) — replaces any shared password.
- **Demo access key:** Generate a shareable key (`python -m backend.generate_demo_key`) so friends or LinkedIn visitors can try the app instantly without creating an account.
- **Profile & Settings:** View your account, change your password, clear your query history, toggle dark/light mode, all from one Settings page.
- **Per-account data isolation:** every account has its own private business-data database (uploaded tables, dashboard config, relationships, history). Dropping a table, uploading a CSV, or wiping history on one account never touches another account's data. The shared demo key is the one intentional exception — everyone who uses it lands in the same demo sandbox, on purpose, isolated from every real account.
- **Visit & usage tracking:** Every page load is counted (even before login), with an admin-only stats endpoint showing total visits, unique visitors, registered user count, and demo key usage.

### Built for Real Use
- **Fully responsive:** A proper mobile layout (bottom tab bar on phones, sidebar on desktop) — not just a desktop app that happens to load on mobile.
- **Dark/Light Mode.**
- **Military-Grade Safety:** Every mutating SQL statement requires explicit user confirmation before executing; a table/column-name validator rejects AI hallucinations before they reach the database; rate limiting on every endpoint; security headers; hidden API docs in production.

## 🏗️ Architecture

- **Frontend:** React, TypeScript, Vite, TailwindCSS, Zustand, TanStack Table, Chart.js.
- **Backend:** Python, FastAPI, SQLAlchemy, Pandas, NumPy, ReportLab, Matplotlib, bcrypt, slowapi, AsyncOpenAI (pointed at Groq), Pytest.
- **Database:** SQLite (Architected with SQLAlchemy for straightforward PostgreSQL/MySQL migration).

## 🚀 Installation & Quick Start

The frontend is already pre-built (`frontend/dist/`), and the backend
serves it directly — so you never need Node.js or npm. Everything runs
from Python.

```bash
# from the project root
python -m venv venv
source venv/bin/activate       # On Windows: venv\Scripts\activate
pip install -r backend/requirements.txt

cp backend/.env.example backend/.env
# open backend/.env and paste your free Groq API key over the placeholder
# (get one at https://console.groq.com/keys — no credit card needed)

python run.py
```

Then open **http://localhost:8000** in your browser. You'll be prompted to sign up (or use a demo key — see below). That's it — one process serves both the app and the API.

`run.py` also auto-seeds a sample SQLite dataset the first time it runs, so you'll have something to explore immediately.

### Generating a demo access key (for sharing with friends / LinkedIn)

```bash
python -m backend.generate_demo_key
```

This prints a short key. Anyone can use it on the login page (or visit `https://your-url.com/?demo=THEKEY` to auto-fill it) to try the app instantly without creating an account. Run `python -m backend.list_demo_keys` to see all keys and how many times each has been used.

<details>
<summary>If you ever want to edit the frontend code (optional, needs Node.js)</summary>

```bash
cd frontend
npm install
npm run dev        # live dev server at http://localhost:5173
# when you're done editing:
npm run build       # regenerates frontend/dist/ for run.py to serve
```
</details>

## 🧪 Running the Tests

Backend (pytest — covers SQL validation, query execution, Excel export):
```bash
python -m backend.tests.seed_data
pytest backend/tests/test_engines.py
```

Frontend (Vitest + Testing Library — 40 tests covering the dashboard,
chat interface, multi-file upload, dashboard mapping, relationships,
authentication, settings/profile, mutation confirmation, and share links,
including error states and edge cases):
```bash
cd frontend
npm install
npm test
```

## 🛡️ Security Implementation

1. **Real authentication** — bcrypt-hashed passwords, server-side session tokens (`Authorization: Bearer <token>`), no shared secrets.
2. **Data mutations require explicit confirmation** — the AI can generate INSERT/UPDATE/DELETE/DROP statements when you clearly ask for them, but `/ask` never executes them; a separate `/execute-mutation` endpoint does, and only after the UI shows you the exact SQL and you click confirm.
3. The AI is structurally forced (via Pydantic JSON schemas) to classify every query's operation type and safety.
4. A regex-based runtime validator blocks multi-statement SQL injection and schema-altering operations (`ALTER`, `TRUNCATE`, etc.) beyond simple table drops.
5. A table/column-name validator checks every AI-generated query against the real live schema and rejects hallucinated names with a clear error before they ever reach the database.
6. Database connections are restricted to explicit `SELECT` privileges for the default read flow at the SQLAlchemy application layer.
7. Shared result links are read-only snapshots — they don't expose live query access to anyone with the link.
8. **Rate limiting** (per-IP, via `slowapi`) on every endpoint, tighter on the LLM-backed ones so a public link can't silently drain your AI provider's free quota.
9. **Security headers** on every response: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and HSTS in production.
10. **Interactive API docs (`/docs`, `/redoc`) are automatically hidden** when `ENVIRONMENT=production`.
11. **File upload limits**: CSVs are capped at 5MB and 50,000 rows, with encoding fallback (UTF-8 → UTF-8-BOM → Latin-1 → CP1252) for real-world "weird" files.
12. **Admin stats endpoint** is protected by a separate key (`ADMIN_KEY`) unrelated to user accounts, and fails closed (unreachable) if that key isn't set.

## 🚢 Deploying (free, using Render)

Render's free tier is the simplest fit here — it's one Python process, and
the frontend is already pre-built (`frontend/dist/`) so **the host never
needs Node.js at all**, only Python.

### 1. Push this project to GitHub
```bash
cd finpilot-ai
git init
git add .
git commit -m "Initial commit"
```
Create a new repo on GitHub, then:
```bash
git remote add origin https://github.com/YOUR_USERNAME/finpilot-ai.git
git branch -M main
git push -u origin main
```
(`.env` is already git-ignored, so your real API key never gets committed — only `.env.example` does. `frontend/dist/` IS committed on purpose — see the comment in `.gitignore`.)

### 2. Create the Render service
1. Go to [render.com](https://render.com) and sign up (free, no card required).
2. Click **New +** → **Web Service** → connect your GitHub repo.
3. Fill in:
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r backend/requirements.txt`
   - **Start Command:** `python run.py`
   - **Instance Type:** Free
4. **Important:** add a `.python-version` file at the project root containing `3.11.9` (pandas doesn't yet have pre-built packages for very new Python versions, which otherwise forces a slow/fragile source compile during deploy).
5. Under **Environment Variables**, add:
   - `AI_API_KEY` = your real Groq key
   - `ENVIRONMENT` = `production`
   - `ADMIN_KEY` = a private value of your choosing, if you want to use the `/admin/stats` endpoint
   - (Don't set `PORT` — Render injects this automatically, and `run.py` already respects it.)
6. Click **Create Web Service**. First deploy takes a few minutes.

Render will give you a URL like `https://finpilot-ai-xyz.onrender.com` — that's your live app. Generate a demo key (see above) via the Render **Shell** tab if you want to share access without asking people to sign up.

### Important honest caveats about the free tier
- **Free instances spin down after inactivity** and take ~30-50 seconds to wake back up on the next request. Tell people to wait if they visit a cold link.
- **The SQLite database is ephemeral on Render's free tier** — accounts, uploaded data, dashboard configs, and history are all wiped whenever the service restarts/redeploys (free tier has no persistent disk). The example dataset regenerates fine each time; anything you or a user added afterward won't survive a restart. Fine for a demo; would need a real hosted database (e.g. Render's paid Postgres, or Supabase's free Postgres tier) for anything meant to persist long-term.
- If you outgrow the free tier's spin-down behavior, Render's cheapest paid tier removes it.

## ⚠️ Known Limitations (honest, by design)

- **Forecasting is intentionally simple** — a linear trend line (numpy polyfit), not a seasonal or ML-trained model. Labeled as such everywhere it appears.
- **Share links have no authentication** — anyone with the link can view that one snapshot.
- **The relationship builder uses dropdowns, not a visual drag-and-drop canvas.** Fully functional for connecting tables, but not a pixel-dragging ERD diagram.
- **CSV uploads are capped at 50,000 rows / 5MB** — a deliberate limit for a free-tier demo, not a data warehouse.
- **Groq's free tier has rate limits** — if you hit them, wait a bit or check https://console.groq.com for current limits.

## 🔮 Future Improvements
- A visual drag-and-drop relationship canvas instead of dropdown-based connections.
- Scheduled/recurring reports (e.g. emailed weekly).
- Replace the linear-trend forecast with a proper seasonal model (Prophet/ARIMA) once there's enough historical data to justify it.
- Connection pooling for heavy PostgreSQL concurrent usage, if migrating off SQLite.

## ⚠️ Honest Disclaimer
No non-trivial piece of software is ever "flaw-free" — that's true of huge production systems at big companies too, not just personal projects. What this project does have: tested error handling for the failure modes that were actually identified and reproduced (bad AI responses, missing data, oversized uploads, wrong passwords/mutations, rate-limit abuse, malformed dates, dropped tables with foreign keys), rather than an unverified claim that nothing could ever go wrong. If you find something broken after deploying, that's normal for any shipped software — fix it as it comes up rather than treating it as a sign something was missed upfront.
