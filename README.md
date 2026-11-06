# Book Notes

A simple web application for keeping track of books you've read or want to remember. Add a book using its title, give it a rating, and write down your thoughts or notes.

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
- **Persistent storage:** Stores book information in PostgreSQL.
- **Recently added books:** Displays the newest additions first.

## How It Works

1. Enter the title of a book.
2. The application searches Open Library using the title.
3. If a matching result is found, it retrieves the available author information and cover image.
4. Add your rating and personal notes.
5. Save the book to your collection.

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

Create a `.env` file in the project root and add your PostgreSQL connection string:

```env
DATABASE_URL=your_postgresql_connection_string
```

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

The application automatically initializes the database table using `schema.sql` when the server starts.

## Database

The application uses PostgreSQL to store:

- Book ID
- Title
- Author
- Rating
- Personal notes
- Cover image URL
- Date added

## Deployment

The project includes a `render.yaml` configuration for deployment on [Render](https://render.com), including a web service and PostgreSQL database.

---

Built as a book-notes application to make keeping track of books simple, without requiring users to manually enter every book detail.
