# Book Beacon V1 coverage curation

This focused expansion addresses the Percy Jackson, interest-only, and dinosaur gaps reported by Muse. It uses educator and child-reader recommendations as leads, then resolves each production book record against Google Books. Child reviews are individual opinions, not a measured popularity signal. Editorial topics, traits, and relationships are AI-assisted classifications approved by `ai:book-scout-curator`; they remain `reviewed: false` and make no human-review claim.

| Curated work | Recommendation evidence | Selected Google Books edition |
| --- | --- | --- |
| *The Lightning Thief* (liked-book anchor) | [Reading Rockets](https://www.readingrockets.org/books-and-authors/books/lightning-thief), [BookTrust](https://www.booktrust.org.uk/book-recommendations/bookfinder/percy-jackson-and-the-lightning-thief/) | `google-books:dzr9jwEACAAJ`, ISBN `9780141381480` |
| *The Lost Hero* | [Child review of its adventure and long chapter format](https://www.spaghettibookclub.org/review.php?reviewId=13349), [publisher series page](https://www.readriordan.com/book/the-lost-hero/) | `google-books:JeiGsRd4mywC`, ISBN `9780141965550` |
| *The Red Pyramid* | [Toppsta Percy read-alikes](https://toppsta.com/blog/view/books-like-percy-jackson) | `google-books:4zjrLRwM3mAC`, ISBN `9780141331584` |
| *The Storm Runner* | [BookTrust read-next list](https://www.booktrust.org.uk/book-recommendations/what-to-read-next/percy-jackson/), [publisher](https://books.disney.com/book/the-storm-runner/) | `google-books:jUicuAEACAAJ`, ISBN `9781432856199` |
| *Who Let the Gods Out?* | [BookTrust read-next list](https://www.booktrust.org.uk/book-recommendations/what-to-read-next/percy-jackson/) | `google-books:WI7FDAAAQBAJ`, ISBN `9781338065626` |
| *Tristan Strong Punches a Hole in the Sky* | [WeAreTeachers Percy read-alikes](https://www.weareteachers.com/books-like-percy-jackson/) | `google-books:IHy6vwEACAAJ`, ISBN `9781368039932` |
| *The Hidden Oracle* | [WeAreTeachers Percy read-alikes](https://www.weareteachers.com/books-like-percy-jackson/) | `google-books:4No_jgEACAAJ`, ISBN `9780141363936` |
| *Mythologica* | [BookTrust Greek mythology nonfiction recommendation](https://www.booktrust.org.uk/book-recommendations/what-to-read-next/percy-jackson/) | `google-books:IWyoDwAAQBAJ`, ISBN `9781786031938` |
| *The Age of Dinosaurs* | [Reading Rockets, age 9–12](https://www.readingrockets.org/books-and-authors/books/age-dinosaurs-rise-and-fall-worlds-most-remarkable-animals) | `google-books:uYnoDwAAQBAJ`, ISBN `9780062930194` |
| *Raising Rufus* | [Reading Rockets, age 9–12](https://www.readingrockets.org/books-and-authors/books/raising-rufus), [teacher review](https://janatheteacher.blogspot.com/2015/11/book-review-raising-rufus-by-david-fulk.html) | `google-books:YD2JBAAAQBAJ`, ISBN `9780385390729` |
| *Dinosaur Empire!* | [Kirkus review, age 9–11](https://www.kirkusreviews.com/book-reviews/abby-howard/dinosaur-empire/), [parent report of a child reader's enthusiasm](https://www.reddit.com/r/Paleontology/comments/1dp9iid) | `google-books:AGRgDgAAQBAJ`, ISBN `9781683351139` |

The approved *Aru Shah and the End of Time* profile kept its stable `bs_` ID and was revised from a sparse graphic-novel record to the original novel edition (`google-books:stTdtAEACAAJ`, ISBN `9781368012355`). [Disney Books](https://books.disney.com/book/aru-shah-end-time/) identifies the novel, and [Read Riordan](https://www.readriordan.com/2017/10/17/rick-riordan-announces-new-books-releasing-2018/) describes its mythology and adventure. Its topic remains broad `mythology`, not Greek mythology.

The Percy anchor has six AI-approved `similar_to` or `read_next` relationships to curated works. Those relationships express editorial similarity; they do not imply a publisher-sanctioned series order. The `coverage.proposal.json` and `percy-anchor.proposal.json` files retain the import classifications, while `catalog.source.json` records selected editions, submissions, approval actors, and revisions.

Google Books is still the bibliographic source, not a recommendation fallback. Amazon links remain paid search links and do not verify stock or a matching listing.
