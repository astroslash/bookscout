# Curated Book Scout catalog

Book Scout has a small, file-backed curated catalog foundation. It starts with **zero approved records**; Google Books still supplies the live catalog and recommendations. Developers maintain `data/books/catalog.source.json` in Git and run `npm run catalog:build` to generate `data/books/catalog.json`. Run `npm run catalog:check` to confirm the generated file is current. The build validates records through `CuratedCatalogService`, then includes only approved profiles in the runtime catalog. The recommendation service reads approved classifications through `CuratedCatalogRepository`; it never reads JSON directly. `FileCuratedCatalogRepository` is the current adapter, and a database adapter could implement the same narrow interface later.

Each curated profile has a stable opaque `bs_` UUID independent of title, ISBN, filename, and Google Books ID. The profile stores normalized provider book facts separately from Book Scout topics, optional series information, and relationships. Classification provenance can hold opaque contributor and reviewer IDs. Unknown fields stay absent. Audit metadata tracks creation, update, and review using opaque IDs, with no names, emails, ages, schools, or locations.

Source records separate `approved` profiles from `submissions`. Submissions have `seeded`, `enriched`, `needs_review`, `approved`, or `rejected` state. `CuratedCatalogService.createDraft`, `submit`, `approve`, and `reject` provide reusable domain rules. A submission does not change approved production data until explicit approval. A proposed revision keeps the same stable catalog ID, loses any old approval stamp, and can replace the approved profile only through `approve`. Full revision history is deferred; Git records changes to the source file in the meantime. The runtime catalog never includes pending or rejected submissions.

The intended future curator flow is:

1. Search Google Books for a title such as *The False Prince*.
2. Select the correct volume and normalize it into the Book model.
3. Create a draft with a stable Book Scout ID, add topics, series data, and relationships, then validate with the existing schemas.
4. Submit for review. An authorized reviewer approves or rejects the proposal.
5. Build the runtime catalog. Approved topics then enrich matching Google Books candidates before the existing recommendation scorer runs.

A future browser curator interface should call these same domain operations and a repository implementation. Authentication, permissions, accounts, user interface, and database storage are deliberately outside this foundation. A browseable public catalog of recommendation collections is also a separate future feature; this foundation does not invent editorial picks.
