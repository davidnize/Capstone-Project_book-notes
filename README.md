# Book Notes

A simple web application for keeping track of books you've read or want to remember. Add a book using its title, give it a rating, and write down your thoughts or notes. Sign in so each account keeps its own list.

## Live Demo

Try the application here:

[Book Notes – Live Application](https://book-notes-lqwi.onrender.com/)

## Features

- **Add books by title:** Simply enter a book title. You don't need to provide the author's name or upload a cover.
- **Automatic book lookup:** Uses the Open Library API to retrieve available author information and book cover images.
- **Book ratings:** Rate books on a scale of 0 to 10.
- **Personal notes:** Save your thoughts and observations about each book.
- **Edit books:** Update existing book information, ratings, and notes.
- **Delete books:** Remove books from your collection.
- **Private accounts:** Sign up and log in with an email and password. Each person only sees their own books.
- **Persistent storage:** Stores book information in PostgreSQL.
- **Recently added books:** Displays the newest additions first.

## How It Works

1. Create an account or log in.
2. Enter the title of a book.
3. The application searches Open Library using the title.
4. If a matching result is found, it retrieves the available author information and cover image.
5. Add your rating and personal notes.
6. Save the book to your collection.

You don't have to know the author's name beforehand. The title alone is enough to start the lookup.

## Technologies Used

- **Node.js** – JavaScript runtime.
- **Express.js** – Backend web framework.
- **EJS** – Server-side rendering and HTML templating.
- **PostgreSQL** – Database for storing book information.
- **Axios** – Making HTTP requests to the Open Library API.
- **Open Library API** – Retrieving book information and cover images.
- **CSS** – Styling the application.

## Getting Started

### Requirements

- Node.js 20 or later
- PostgreSQL database
- npm

### Installation

Clone the repository:

```bash
git clone https://github.com/davidnize/Capstone-Project_book-notes.git
```

Navigate into the project directory:

```bash
cd Capstone-Project_book-notes
```

Install dependencies:

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root and add your PostgreSQL connection string and a long random string for the login cookie:

```env
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=a-long-random-string
```

`SESSION_SECRET` signs the login cookie. Do not commit `.env`. On Render, `render.yaml` generates `SESSION_SECRET` for you.

### Running the Application

Start the server using Node.js:

```bash
node index.js
```

Or use Nodemon during development so the server restarts automatically when you make changes:

```bash
nodemon index.js
```

Open your browser and visit:

```text
http://localhost:3000
```

The application automatically initializes the database tables using `schema.sql` when the server starts.

## Accounts

Sign up and log in with an email and a password of at least 8 characters. Passwords are stored as bcrypt hashes. The book list, and add, edit, and delete, require a signed-in user and only change that user’s books. Signed-out visitors are redirected to the login page.

## Database

The application uses PostgreSQL to store:

- Book ID
- Title
- Author
- Rating
- Personal notes
- Cover image URL
- Date added
- The user who owns the book

## Deployment

The project includes a `render.yaml` configuration for deployment on [Render](https://render.com), including a web service and PostgreSQL database. The Blueprint sets `DATABASE_URL` from that database and generates `SESSION_SECRET`.

---

Built as a book-notes application to make keeping track of books simple, without requiring users to manually enter every book detail.
