-- Junction schema (D1 / SQLite). Validated in sqlite before commit.
-- Amounts are integer cents. Booleans are 0/1. Timestamps are epoch seconds.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  role       TEXT NOT NULL CHECK (role IN ('client','pro')),
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pros (
  user_id           TEXT PRIMARY KEY REFERENCES users(id),
  category          TEXT NOT NULL,
  bio               TEXT,
  stripe_account_id TEXT,
  payouts_enabled   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS listings (
  id          TEXT PRIMARY KEY,
  pro_user_id TEXT NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  includes    TEXT,              -- one deliverable per line
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id                    TEXT PRIMARY KEY,
  listing_id            TEXT NOT NULL REFERENCES listings(id),
  client_user_id        TEXT NOT NULL REFERENCES users(id),
  pro_user_id           TEXT NOT NULL REFERENCES users(id),
  amount_cents          INTEGER NOT NULL,
  fee_cents             INTEGER NOT NULL,   -- 10% platform fee
  status                TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created','held','delivered','released','refunded')),
  stripe_session_id     TEXT,
  stripe_payment_intent TEXT,
  stripe_transfer_id    TEXT,
  delivered_at          INTEGER,
  released_at           INTEGER,
  auto_release_at       INTEGER,            -- delivered_at + 5 days
  created_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  pro_user_id TEXT NOT NULL REFERENCES users(id),
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(active, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_pro       ON orders(pro_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_client    ON orders(client_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_pro      ON reviews(pro_user_id);

-- Seed a few pros + listings so a fresh deploy isn't empty (test data only).
INSERT OR IGNORE INTO users (id,role,name,email,created_at) VALUES
 ('u_maya','pro','Maya R.','maya@example.com',1700000000),
 ('u_jonas','pro','Jonas P.','jonas@example.com',1700000000),
 ('u_priya','pro','Priya S.','priya@example.com',1700000000),
 ('u_dan','pro','Dan M.','dan@example.com',1700000000);
INSERT OR IGNORE INTO pros (user_id,category,bio,stripe_account_id,payouts_enabled) VALUES
 ('u_maya','Development','Landing pages in React',NULL,0),
 ('u_jonas','Video editing','Short-form vertical edits',NULL,0),
 ('u_priya','Design','Brand identity',NULL,0),
 ('u_dan','Copywriting','Conversion copy',NULL,0);
INSERT OR IGNORE INTO listings (id,pro_user_id,title,category,price_cents,includes,active,created_at) VALUES
 ('l_maya','u_maya','Production-ready landing page in React','Development',25000,'One responsive landing page (up to 5 sections)
Mobile + desktop, accessibility pass
2 rounds of revisions
Deployed + source handoff',1,1700000000),
 ('l_jonas','u_jonas','Short-form vertical edit (up to 60s)','Video editing',12000,'One 60s vertical edit
Captions + music
1 revision',1,1700000001),
 ('l_priya','u_priya','Brand identity starter kit','Design',50000,'Logo + wordmark
Color + type system
Usage one-pager',1,1700000002),
 ('l_dan','u_dan','Landing page copy that converts','Copywriting',9000,'Headline + subhead
Full page body copy
1 revision',1,1700000003);
