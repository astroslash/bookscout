/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createBookScoutDetailsService } from "@/connectors/book-scout";
import styles from "./page.module.css";

export const runtime = "nodejs";

type Props = { params: Promise<{ isbn: string }> };

async function loadBook(params: Props["params"]) {
  const { isbn } = await params;
  return createBookScoutDetailsService().getBySlug(isbn);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const book = await loadBook(params);
  if (!book) return { title: "Book not found | Book Scout" };
  return {
    title: `${book.title} | Book Scout`,
    description: book.description?.slice(0, 160) ?? `Book details for ${book.title}.`,
  };
}

export default async function BookPage({ params }: Props) {
  const book = await loadBook(params);
  if (!book) notFound();

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>← Book Scout</Link>
      <article className={styles.card}>
        <div className={styles.cover}>
          {book.coverUrl ? <img src={book.coverUrl} alt={`Cover of ${book.title}`} /> : <span>Cover unavailable</span>}
        </div>
        <div className={styles.details}>
          <p className={styles.eyebrow}>Book Scout · Book details</p>
          <h1>{book.title}</h1>
          {book.subtitle && <p className={styles.subtitle}>{book.subtitle}</p>}
          {book.authors.length > 0 && <p className={styles.authors}>By {book.authors.join(", ")}</p>}
          <dl className={styles.facts}>
            {book.publicationYear && <><dt>Published</dt><dd>{book.publicationYear}</dd></>}
            {book.pageCount && <><dt>Pages</dt><dd>{book.pageCount}</dd></>}
            {book.language && <><dt>Language</dt><dd>{book.language.toUpperCase()}</dd></>}
            {(book.isbn13 ?? book.isbn10) && <><dt>ISBN</dt><dd>{book.isbn13 ?? book.isbn10}</dd></>}
          </dl>
          {book.description && <section><h2>About this book</h2><p className={styles.description}>{book.description}</p></section>}
          {book.subjects.length > 0 && <section><h2>Subjects</h2><p>{book.subjects.join(" · ")}</p></section>}
        </div>
      </article>
    </main>
  );
}
