CREATE TABLE IF NOT EXISTS books (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  rating INTEGER,
  notes TEXT,
  cover_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
