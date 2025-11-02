import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// ==================== PASSWORD CONFIGURATION ====================
// Change this to your desired password
const CORRECT_PASSWORD = "Jason123!";

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware for authentication
app.use(session({
  secret: 'your-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// ==================== AUTHENTICATION MIDDLEWARE ====================
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// ==================== PASSWORD ENDPOINT ====================
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  
  if (password === CORRECT_PASSWORD) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Incorrect password' });
  }
});

// Check authentication status
app.get('/api/auth-status', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ==================== DATABASE ====================
async function openDb() {
  return open({
    filename: path.join(__dirname, 'JasonBetLog.db'),
    driver: sqlite3.Database
  });
}

// ==================== UTILITY FUNCTIONS ====================
function toDecimal(odds) {
  if (!odds) return 1;
  const o = odds.toString().trim();
  if (o.startsWith('+')) return 1 + parseFloat(o.slice(1)) / 100;
  if (o.startsWith('-')) return 1 + 100 / parseFloat(o.slice(1));
  return 1 + parseFloat(o) / 100;
}

function formatOdds(dec) {
  return dec < 2 ? Math.round(-100 / (dec - 1)).toString() : '+' + Math.round((dec - 1) * 100);
}

function expectedPct(dec) {
  return dec > 0 ? (100 / dec).toFixed(2) + '%' : '0%';
}

// ==================== PROTECTED API ENDPOINTS ====================
// All data endpoints require authentication
app.get('/api/balance', requireAuth, async (req, res) => {
  const db = await openDb();
  const row = await db.get(`SELECT SUM(CAST(REPLACE(Balance,'$','') AS REAL)) AS total FROM bets`);
  res.json({ balance: row?.total != null ? '$' + parseFloat(row.total).toFixed(2) : '$0.00' });
});

app.get('/api/singles', requireAuth, async (req, res) => {
  const db = await openDb();
  const row = await db.get(`
    SELECT
      SUM(CASE WHEN LOWER(Result)='win' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN LOWER(Result)='loss' THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN LOWER(Result) IN ('win','loss') THEN 1 ELSE 0 END) AS total,
      AVG(CASE
        WHEN SUBSTR(TRIM(Odds),1,1)='+' THEN 1+CAST(SUBSTR(TRIM(Odds),2) AS REAL)/100
        WHEN SUBSTR(TRIM(Odds),1,1)='-' THEN 1+100/CAST(SUBSTR(TRIM(Odds),2) AS REAL)
        ELSE 1+CAST(TRIM(Odds) AS REAL)/100
      END) AS avg_dec,
      SUM(CASE WHEN LOWER(Result) IN ('win','loss') THEN CAST(REPLACE(Balance,'$','') AS REAL) ELSE 0 END) AS totals
    FROM bets
    WHERE LOWER(Type)!='parlay' AND LOWER(Result) IN ('win','loss')
  `);

  const wins = row.wins || 0;
  const losses = row.losses || 0;
  const total = row.total || 0;
  const avgDec = row.avg_dec || 1;
  const totals = row.totals || 0;

  res.json([
    total > 0 ? (wins/total*100).toFixed(1)+'%' : '0%',
    wins,
    losses,
    formatOdds(avgDec),
    expectedPct(avgDec),
    '$'+totals.toFixed(2)
  ]);
});

app.get('/api/parlays', requireAuth, async (req, res) => {
  const db = await openDb();
  const row = await db.get(`
    SELECT
      SUM(CASE WHEN LOWER(Result)='win' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN LOWER(Result)='loss' THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN LOWER(Result) IN ('win','loss') THEN 1 ELSE 0 END) AS total,
      AVG(CASE
        WHEN SUBSTR(TRIM(Odds),1,1)='+' THEN 1+CAST(SUBSTR(TRIM(Odds),2) AS REAL)/100
        WHEN SUBSTR(TRIM(Odds),1,1)='-' THEN 1+100/CAST(SUBSTR(TRIM(Odds),2) AS REAL)
        ELSE 1+CAST(TRIM(Odds) AS REAL)/100
      END) AS avg_dec,
      SUM(CASE WHEN LOWER(Result) IN ('win','loss') THEN CAST(REPLACE(Balance,'$','') AS REAL) ELSE 0 END) AS totals
    FROM bets
    WHERE LOWER(Type)='parlay' AND LOWER(Result) IN ('win','loss')
  `);

  const wins = row.wins || 0;
  const losses = row.losses || 0;
  const total = row.total || 0;
  const avgDec = row.avg_dec || 1;
  const totals = row.totals || 0;

  res.json([
    total > 0 ? (wins/total*100).toFixed(1)+'%' : '0%',
    wins,
    losses,
    formatOdds(avgDec),
    expectedPct(avgDec),
    '$'+totals.toFixed(2)
  ]);
});

app.get('/api/parlay_bets', requireAuth, async (req, res) => {
  const { parlay_name } = req.query;
  if (!parlay_name) return res.json([]);
  const db = await openDb();
  const rows = await db.all(
    "SELECT date, individual_bet, odds, type, result FROM parlay_bets WHERE parlay_name=? ORDER BY id",
    [parlay_name]
  );
  res.json(rows);
});

app.get('/api/bettypes', requireAuth, async (req, res) => {
  const db = await openDb();
  const singles = await db.all("SELECT Type, Odds, Result, Balance FROM bets WHERE LOWER(Type)!='parlay' AND LOWER(Result) IN ('win','loss')");
  const parlayBets = await db.all("SELECT type AS Type, odds AS Odds, result AS Result, 0 AS Balance FROM parlay_bets");
  
  const typeMap = new Map();
  [...singles, ...parlayBets].forEach(b => {
    const t = b.Type || 'Unknown';
    if (!typeMap.has(t)) typeMap.set(t, {wins:0, losses:0, total:0, oddsSum:0, oddsCount:0, totalsSum:0});
    const e = typeMap.get(t);
    const r = (b.Result || '').toLowerCase();
    if (r === 'win') e.wins++;
    if (r === 'loss') e.losses++;
    if (r === 'win' || r === 'loss') e.total++;
    if (b.Odds) {
      e.oddsSum += toDecimal(b.Odds);
      e.oddsCount++;
    }
    if (b.Balance != null) {
      e.totalsSum += parseFloat(String(b.Balance).replace(/\$|,/g,'')) || 0;
    }
  });

  const output = [];
  for (const [type, v] of typeMap) {
    const avgDec = v.oddsCount > 0 ? v.oddsSum / v.oddsCount : 1;
    output.push({
      type,
      win_pct: v.total > 0 ? (v.wins/v.total*100).toFixed(1)+'%' : '0%',
      wins: v.wins,
      losses: v.losses,
      avg_odds: formatOdds(avgDec),
      expected_pct: expectedPct(avgDec),
      totals: '$' + v.totalsSum.toFixed(2)
    });
  }
  res.json(output);
});

app.get('/api/bets', requireAuth, async (req, res) => {
  const db = await openDb();
  const rows = await db.all("SELECT * FROM bets ORDER BY Date, id");
  res.json(rows);
});

// ==================== STATIC FILES ====================
// Serve static files (HTML, CSS, JS) - no auth required for initial page load
app.use(express.static(__dirname));

// ==================== START SERVER ====================
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));