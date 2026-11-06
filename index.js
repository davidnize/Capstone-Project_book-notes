import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example and point it at PostgreSQL.");
  process.exit(1);
}

const pool = new pg.Pool(poolConfig(connectionString));

pool.on("error", (error) => {
  console.error("Unexpected database pool error:", error.message);
});

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", async (req, res) => {
  const error = queryText(req.query.error);
  const message = queryText(req.query.message);

  try {
    const result = await pool.query(
      "SELECT * FROM books ORDER BY created_at DESC",
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

app.post("/add", async (req, res) => {
  const title = textOrEmpty(req.body.title);
  const notes = textOrEmpty(req.body.notes);
  const fallbackAuthor = textOrEmpty(req.body.author);
  const rating = parseRating(req.body.rating);

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
      "INSERT INTO books (title, author, rating, notes, cover_url) VALUES ($1, $2, $3, $4, $5)",
      [
        lookup.book.title,
        lookup.book.author || fallbackAuthor || null,
        rating,
        notes || null,
        lookup.book.cover_url,
      ],
    );
    return redirectWith(res, { message: `Added “${lookup.book.title}”.` });
  } catch (error) {
    console.error(error);
    return redirectWith(res, { error: "Could not save that book." });
  }
});

app.post("/edit", async (req, res) => {
  const bookId = parseId(req.body.bookId);
  const title = textOrEmpty(req.body.title);
  const notes = textOrEmpty(req.body.notes);
  const fallbackAuthor = textOrEmpty(req.body.author);
  const rating = parseRating(req.body.rating);

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
      "UPDATE books SET title=$1, author=$2, rating=$3, notes=$4, cover_url=$5 WHERE id=$6",
      [
        lookup.book.title,
        lookup.book.author || fallbackAuthor || null,
        rating,
        notes || null,
        lookup.book.cover_url,
        bookId,
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

app.post("/delete", async (req, res) => {
  const bookId = parseId(req.body.deleteBookId);
  if (!bookId) {
    return redirectWith(res, { error: "That book could not be found." });
  }

  try {
    const result = await pool.query("DELETE FROM books WHERE id=$1", [bookId]);
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
