import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseEnv } from "node:util";
import express from "express";
import bodyParser from "body-parser";
import cookieSession from "cookie-session";
import bcrypt from "bcryptjs";
import pg from "pg";
import axios from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadLocalEnv();

const port = Number(process.env.PORT) || 3000;
const connectionString = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;

if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example and point it at PostgreSQL.");
  process.exit(1);
}

if (!sessionSecret) {
  console.error("SESSION_SECRET is not set. Copy .env.example and set a long random string.");
  process.exit(1);
}

const pool = new pg.Pool(poolConfig(connectionString));
const dummyPasswordHash = bcrypt.hashSync("not-a-real-password", 10);

pool.on("error", (error) => {
  console.error("Unexpected database pool error:", error.message);
});

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
// Render terminates TLS at the proxy. Trust it so the secure login cookie is set.
app.set("trust proxy", 1);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieSession({
  name: "session",
  keys: [sessionSecret],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
}));
app.use((req, res, next) => {
  res.locals.user = signedInUser(req);
  next();
});

app.get("/login", redirectIfSignedIn, (req, res) => {
  res.render("login.ejs", { error: null, email: "" });
});

app.post("/login", redirectIfSignedIn, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = passwordText(req.body.password);

  if (!isEmail(email) || !password) {
    return res.status(400).render("login.ejs", {
      error: "Email or password is incorrect.",
      email,
    });
  }

  try {
    const result = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email],
    );
    const user = result.rows[0];
    const matches = await bcrypt.compare(
      password,
      user ? user.password_hash : dummyPasswordHash,
    );
    if (!user || !matches) {
      return res.status(401).render("login.ejs", {
        error: "Email or password is incorrect.",
        email,
      });
    }

    req.session = { user: { id: user.id, email: user.email } };
    return res.redirect("/");
  } catch (error) {
    console.error(error);
    return res.status(500).render("login.ejs", {
      error: "Could not log you in. Try again.",
      email,
    });
  }
});

app.get("/signup", redirectIfSignedIn, (req, res) => {
  res.render("signup.ejs", { error: null, email: "" });
});

app.post("/signup", redirectIfSignedIn, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = passwordText(req.body.password);

  if (!isEmail(email)) {
    return res.status(400).render("signup.ejs", {
      error: "Enter a valid email address.",
      email,
    });
  }
  if (password.length < 8 || password.length > 72) {
    return res.status(400).render("signup.ejs", {
      error: "Password must be 8 to 72 characters.",
      email,
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash],
    );
    const user = result.rows[0];
    req.session = { user: { id: user.id, email: user.email } };
    return res.redirect("/");
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).render("signup.ejs", {
        error: "An account with that email already exists.",
        email,
      });
    }
    console.error(error);
    return res.status(500).render("signup.ejs", {
      error: "Could not create your account. Try again.",
      email,
    });
  }
});

app.post("/logout", (req, res) => {
  req.session = null;
  res.redirect("/login");
});

app.get("/", requireUser, async (req, res) => {
  const error = queryText(req.query.error);
  const message = queryText(req.query.message);
  const userId = signedInUser(req).id;

  try {
    const result = await pool.query(
      "SELECT * FROM books WHERE user_id = $1 ORDER BY created_at DESC",
      [userId],
    );
    res.render("index.ejs", {
      books: result.rows.map(normalizeBook),
      error,
      message,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("index.ejs", {
      books: [],
      error: "Could not load your books. Check the database connection and try again.",
      message: null,
    });
  }
});

app.post("/add", requireUser, async (req, res) => {
  const title = textOrEmpty(req.body.title);
  const notes = textOrEmpty(req.body.notes);
  const fallbackAuthor = textOrEmpty(req.body.author);
  const rating = parseRating(req.body.rating);
  const userId = signedInUser(req).id;

  if (!title) {
    return redirectWith(res, { error: "A book title is required." });
  }
  if (rating === null) {
    return redirectWith(res, { error: "Rating must be a whole number from 0 to 10." });
  }

  const lookup = await findBook(title);
  if (lookup.error) {
    return redirectWith(res, { error: lookup.error });
  }

  try {
    await pool.query(
      "INSERT INTO books (title, author, rating, notes, cover_url, user_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        lookup.book.title,
        lookup.book.author || fallbackAuthor || null,
        rating,
        notes || null,
        lookup.book.cover_url,
        userId,
      ],
    );
    return redirectWith(res, { message: `Added “${lookup.book.title}”.` });
  } catch (error) {
    console.error(error);
    return redirectWith(res, { error: "Could not save that book." });
  }
});

app.post("/edit", requireUser, async (req, res) => {
  const bookId = parseId(req.body.bookId);
  const title = textOrEmpty(req.body.title);
  const notes = textOrEmpty(req.body.notes);
  const fallbackAuthor = textOrEmpty(req.body.author);
  const rating = parseRating(req.body.rating);
  const userId = signedInUser(req).id;

  if (!bookId) {
    return redirectWith(res, { error: "That book could not be found." });
  }
  if (!title) {
    return redirectWith(res, { error: "A book title is required." });
  }
  if (rating === null) {
    return redirectWith(res, { error: "Rating must be a whole number from 0 to 10." });
  }

  const lookup = await findBook(title);
  if (lookup.error) {
    return redirectWith(res, { error: lookup.error });
  }

  try {
    const result = await pool.query(
      "UPDATE books SET title=$1, author=$2, rating=$3, notes=$4, cover_url=$5 WHERE id=$6 AND user_id=$7",
      [
        lookup.book.title,
        lookup.book.author || fallbackAuthor || null,
        rating,
        notes || null,
        lookup.book.cover_url,
        bookId,
        userId,
      ],
    );
    if (result.rowCount === 0) {
      return redirectWith(res, { error: "That book could not be found." });
    }
    return redirectWith(res, { message: `Updated “${lookup.book.title}”.` });
  } catch (error) {
    console.error(error);
    return redirectWith(res, { error: "Could not update that book." });
  }
});

app.post("/delete", requireUser, async (req, res) => {
  const bookId = parseId(req.body.deleteBookId);
  const userId = signedInUser(req).id;
  if (!bookId) {
    return redirectWith(res, { error: "That book could not be found." });
  }

  try {
    const result = await pool.query(
      "DELETE FROM books WHERE id=$1 AND user_id=$2",
      [bookId, userId],
    );
    if (result.rowCount === 0) {
      return redirectWith(res, { error: "That book could not be found." });
    }
    return redirectWith(res, { message: "Book deleted." });
  } catch (error) {
    console.error(error);
    return redirectWith(res, { error: "Could not delete that book." });
  }
});

async function start() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await pool.query(schema);
    app.listen(port, "0.0.0.0", () => {
      const sslOn = Boolean(pool.options.ssl);
      console.log(
        `Book Notes listening on http://0.0.0.0:${port} (database ssl: ${sslOn ? "on" : "off"})`,
      );
    });
  } catch (error) {
    console.error("Failed to start:", error.message);
    process.exit(1);
  }
}

start();

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const parsed = parseEnv(fs.readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function poolConfig(url) {
  return {
    connectionString: stripSslMode(url),
    ssl: sslForDatabaseUrl(url),
  };
}

// Render's internal connection string does not speak TLS. External URLs
// (a *.render.com host, or sslmode=require) do. Enable SSL only for those.
function sslForDatabaseUrl(url) {
  const { hostname, sslmode } = readDatabaseUrl(url);
  if (sslmode === "disable") return false;
  if (["require", "verify-full", "verify-ca", "prefer", "no-verify"].includes(sslmode)) {
    return { rejectUnauthorized: false };
  }
  if (hostname.endsWith(".render.com")) {
    return { rejectUnauthorized: false };
  }
  return false;
}

function stripSslMode(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return url.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
  }
}

function readDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      hostname: parsed.hostname || "",
      sslmode: (parsed.searchParams.get("sslmode") || "").toLowerCase(),
    };
  } catch {
    const hostMatch = url.match(/@([^/:?]+)/);
    const sslMatch = url.match(/sslmode=([^&]+)/i);
    return {
      hostname: hostMatch ? hostMatch[1] : "",
      sslmode: sslMatch ? sslMatch[1].toLowerCase() : "",
    };
  }
}

async function findBook(title) {
  try {
    const response = await axios.get("https://openlibrary.org/search.json", {
      params: { title, limit: 1 },
      timeout: 10000,
    });
    const doc = response.data?.docs?.[0];
    if (!doc || !doc.title) {
      return {
        error: `No Open Library match for “${title}”. Nothing was saved.`,
      };
    }

    const author = Array.isArray(doc.author_name) ? doc.author_name[0] : null;
    const cover_url = doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : null;

    return {
      book: {
        title: doc.title,
        author: author || null,
        cover_url,
      },
    };
  } catch (error) {
    console.error(error);
    return {
      error: "Open Library could not be reached. Nothing was saved.",
    };
  }
}

function normalizeBook(book) {
  return {
    ...book,
    created_at: book.created_at ? new Date(book.created_at) : null,
  };
}

function redirectWith(res, { error, message } = {}) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (message) params.set("message", message);
  const query = params.toString();
  res.redirect(query ? `/?${query}` : "/");
}

function queryText(value) {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" && text.trim() ? text : null;
}

function textOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseRating(value) {
  const rating = Number.parseInt(value, 10);
  if (!Number.isInteger(rating) || rating < 0 || rating > 10) return null;
  return rating;
}

function parseId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

function signedInUser(req) {
  const id = Number.parseInt(req.session?.user?.id, 10);
  const email = typeof req.session?.user?.email === "string" ? req.session.user.email : "";
  if (!Number.isInteger(id) || id < 1 || !email) return null;
  return { id, email };
}

function requireUser(req, res, next) {
  if (!signedInUser(req)) {
    return res.redirect("/login");
  }
  next();
}

function redirectIfSignedIn(req, res, next) {
  if (signedInUser(req)) return res.redirect("/");
  next();
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordText(value) {
  return typeof value === "string" ? value : "";
}
