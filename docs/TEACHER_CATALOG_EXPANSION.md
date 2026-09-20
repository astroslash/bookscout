# Teacher-led catalog expansion

The Book Beacon approved catalog grew from **85 to 175 distinct works**. This release adds 90 AI-curator-approved profiles. It broadens the catalog beyond its earlier adventure and fantasy concentration, particularly in music, sports, mysteries, science fiction, history, climate, coding, and engineering.

## Research and selection

The 132-book candidate proposal records the recommendation source on each editorial topic. Most leads came from teacher-curated [fourth-grade](https://www.weareteachers.com/fourth-grade-chapter-books/), [fifth-grade](https://www.weareteachers.com/fifth-grade-chapter-books/), [sixth-grade](https://www.weareteachers.com/books-for-6th-graders/), and [middle-school](https://www.weareteachers.com/best-middle-school-books/) lists. Topic-specific teacher lists supplied [sports](https://www.weareteachers.com/best-sports-books-kids/), [mysteries](https://www.weareteachers.com/mystery-books-for-kids/), [STEM](https://www.weareteachers.com/stem-books-classroom-library/), [science fiction](https://www.weareteachers.com/science-fiction-books-for-teens/), and [art](https://www.weareteachers.com/art-books-for-kids/) candidates. [BookTrust's music list](https://www.booktrust.org.uk/book-recommendations/booklists/books-about-music-for-8/) supplemented the teacher lists for an especially thin topic.

Teacher and BookTrust lists are recommendation leads, not claims of individual human review of Book Beacon's classifications. Google Books supplied the selected edition's bibliographic facts. Ambiguous editions were selected explicitly only after inspecting title, author, language, format, ISBN, length, and available descriptions. The 90 selected production records are in [`teacher-expansion.approval.json`](../data/books/teacher-expansion.approval.json); the larger candidate pool is in [`teacher-expansion.proposal.json`](../data/books/teacher-expansion.proposal.json).

**42 candidates remain out of production.** Thirty-five lack a resolved Google Books edition. Seven were deferred for thin or misleading provider metadata, age fit, or a weak edition. They remain candidates; their open submissions, if any, are not approved. The original catalog's unresolved seeds remain unresolved as well.

## Provenance and scope

Every new editorial topic has `sourceType: "book_scout_classification"`, `assistance: "ai_assisted"`, `reviewed: false`, and a source URL. Production approval uses `audit.approvedBy: "ai:book-scout-curator"`; it does not add a human `reviewedBy` or change field `reviewed` to `true`. Existing stable `bs_` IDs were reused for 19 matching seeds. The Maker Lab seed retained its ID when its title was shortened to match the verified Google Books volume.

Unknown reading age, Lexile, content ratings, popularity, and preferences remain absent. The new profiles use a few defensible topics per book and do not manufacture age or content metadata. Google Books categories can be imperfect; questionable records were deferred when they would damage recommendation quality.

## Checks

For a reader aged 11 in grade 6, interest-only queries now produce approved recommendations for `music`, `art`, `soccer`, `track and field`, `swimming`, `coding`, `engineering`, `climate change`, `ocean`, `science fiction`, `modern history`, `immigration`, `math`, `civil rights`, and `entrepreneurship`. Coverage varies by topic: some have one strong match rather than five. The connector returns available matches without padding and still reports `insufficient_curated_match` for unsupported interests.

Run `npm run catalog:validate`, `npm run catalog:check`, and `npm run catalog:stats` to inspect the release. The runtime artifact remains generated from approved profiles only.
