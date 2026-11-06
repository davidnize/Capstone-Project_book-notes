# Book Notes

A small Express app for keeping notes on books. Search a title, and [Open Library](https://openlibrary.org/) fills in the author and cover. Notes, ratings, and covers are stored in PostgreSQL.

The UI is the EJS book-notes capstone from [davidnize/Backend](https://github.com/davidnize/Backend/tree/main/5.0%20PostgreSQL/Capstone-Project_book-notes), adapted to run on Render with Managed PostgreSQL.

## Run locally

You need Node.js 20+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to your database, for example:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/book_notes
```

Create the database if it does not exist (`createdb book_notes`), then start the app:

```bash
npm start
```

The server listens on `0.0.0.0` and `PORT` (default `3000`). On startup it runs `schema.sql`, which creates the `books` table if it is missing.

Open [http://localhost:3000](http://localhost:3000). Adding or editing a book looks the title up on Open Library. If nothing matches, or Open Library cannot be reached, the app redirects back with a message and does not write a row.

Do not commit `.env`. It is listed in `.gitignore`.

## Deploy on Render

`render.yaml` is a Blueprint that creates:

- a Node **web service** named `book-notes` (`plan: free`, `npm install`, `npm start`)
- a **PostgreSQL** database named `book-notes-db` (`plan: free`, database `book_notes`)
- `DATABASE_URL` from that database’s internal `connectionString`
- `NODE_ENV=production`

Both resources are in `oregon` so the web service uses the private-network connection string.

After this repo is on GitHub, GitLab, or Bitbucket:

1. Open the [Render Blueprint dashboard](https://dashboard.render.com/blueprint/new).
2. Point it at the repository.
3. Review the web service and database, then apply the Blueprint.

Render injects `PORT`. The app binds `0.0.0.0` and creates the `books` table on boot, so a fresh database works without a manual migration.

### Connection and SSL

`fromDatabase.connectionString` is the **internal** URL. Internal Render Postgres does not use TLS, so the app leaves SSL off for that URL.

SSL is turned on (`rejectUnauthorized: false`) only when the URL needs it:

- the host ends with `.render.com` (external connection string), or
- the URL sets `sslmode` to `require`, `verify-full`, `verify-ca`, or `prefer`.

Use the internal URL for the Render web service. Use an external URL, with SSL, only from your laptop or CI.

### Free plan limits

Verified against Render’s current free-plan docs:

- **Free web services** spin down after about 15 minutes without traffic. The next request cold-starts the service. The filesystem is ephemeral.
- **Free Postgres** is limited to one database per workspace, 1 GB of storage, and **expires 30 days after creation**. After that, you have 14 days to upgrade before Render deletes it. Free databases have no backups and no managed connection pooling, and Render may restart them at any time.
- A workspace can have only one free Postgres instance and one free Key Value instance.
- The web service and database must stay in the **same region**. The internal connection string only works that way.

Paid plans remove the 30-day database expiry. `free` is a current plan id; `basic-256mb` is the legacy name for the paid `0.1c-256mb` plan, not an alias of free.
