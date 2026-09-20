import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CuratedCatalogService } from "../connectors/book-scout/curation/service";
import { createGoogleBooksProviderFromEnv } from "../providers/google-books/provider";
import { RateLimitError } from "../platform/errors";

const sourcePath = resolve("data/books/catalog.source.json");
const service = new CuratedCatalogService();

async function readSource(): Promise<unknown> {
  return JSON.parse(await readFile(sourcePath, "utf8")) as unknown;
}

async function saveSource(value: unknown): Promise<void> {
  await writeFile(sourcePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const [command, ...args] = process.argv.slice(2).filter((arg) => arg !== "--");
  const source = await readSource();
  if (command === "add") {
    if (args.length !== 2) throw new Error("Usage: npm run catalog:add -- \"Title\" \"Author\"");
    const updated = service.addSeed(source, args[0], args[1]);
    await saveSource(updated);
    process.stdout.write(`Added seed ${updated.seeds.at(-1)?.id}: ${args[0]} by ${args[1]}\n`);
  } else if (command === "enrich") {
    const seededOnly = args.includes("--seeded-only");
    const limitIndex = args.indexOf("--limit");
    const delayIndex = args.indexOf("--delay-ms");
    const limit = limitIndex < 0 ? Number.POSITIVE_INFINITY : Number(args[limitIndex + 1]);
    const delayMs = delayIndex < 0 ? 0 : Number(args[delayIndex + 1]);
    const valueIndexes = new Set([limitIndex < 0 ? -1 : limitIndex + 1,
      delayIndex < 0 ? -1 : delayIndex + 1]);
    if ((!Number.isInteger(limit) && limit !== Number.POSITIVE_INFINITY) || limit <= 0 ||
      !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 10_000 ||
      args.some((arg, index) => !["--seeded-only", "--limit", "--delay-ms"].includes(arg) &&
        !valueIndexes.has(index))) {
      throw new Error("Usage: npm run catalog:enrich -- [--seeded-only] [--limit N] [--delay-ms N]");
    }
    const provider = createGoogleBooksProviderFromEnv();
    let updated = service.validate(source);
    let searched = 0;
    let rateLimited = false;
    for (const seed of updated.seeds.filter((item) => item.state === "seeded" ||
      (!seededOnly && item.state === "needs_review")).slice(0, limit)) {
      if (searched && delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        updated = await service.enrichSeed(updated, seed.id, provider);
        searched += 1;
        const result = updated.seeds.find((item) => item.id === seed.id)!;
        process.stdout.write(`${result.state}: ${result.title} by ${result.author} (${result.match?.status}, ${result.match?.confidence})\n`);
      } catch (error) {
        process.stderr.write(`Failed to enrich ${seed.title}: ${error instanceof Error ? error.message : "unknown error"}\n`);
        if (error instanceof RateLimitError) {
          rateLimited = true;
          break;
        }
      }
    }
    await saveSource(updated);
    process.stdout.write(`Searched ${searched} seeds${rateLimited ? "; stopped at provider rate limit" : ""}.\n`);
  } else if (command === "select-edition") {
    if (args.length !== 2) throw new Error("Usage: npm run catalog:select-edition -- <seed-id> <listed-google-books-id>");
    const updated = await service.selectSeedEdition(source, args[0], args[1], createGoogleBooksProviderFromEnv());
    await saveSource(updated);
    process.stdout.write(`Selected normalized Google Books edition ${args[1]} for seed ${args[0]}; still unapproved.\n`);
  } else if (command === "validate") {
    const catalog = service.validate(source);
    process.stdout.write(`Catalog valid: ${catalog.seeds.length} seeds, ${catalog.approved.length} approved books.\n`);
  } else if (command === "stats") {
    process.stdout.write(`${JSON.stringify(service.stats(source), null, 2)}\n`);
  } else if (command === "approve") {
    if (args.length !== 1) throw new Error("Usage: npm run catalog:approve -- <seed-id>");
    const catalog = service.validate(source);
    const seed = catalog.seeds.find((item) => item.id === args[0]);
    if (!seed?.book || seed.match?.status !== "matched" || seed.state !== "enriched") {
      throw new Error("Only a reviewed high-confidence enriched seed can be approved with this command.");
    }
    const draft = service.createDraft(seed.book, "system:developer", new Date(), seed.id);
    const submitted = service.submit(catalog, draft, "system:developer");
    const approved = service.approve(submitted, submitted.submissions.at(-1)!.id, "ai:book-scout-curator");
    await saveSource(approved);
    process.stdout.write(`Approved factual catalog record ${seed.id}. Run npm run catalog:build.\n`);
  } else if (command === "approve-submission") {
    if (args.length !== 2) throw new Error("Usage: npm run catalog:approve-submission -- <submission-id> <ai:actor|human:actor>");
    const approved = service.approve(source, args[0], args[1]);
    await saveSource(approved);
    process.stdout.write(`Approved submission ${args[0]} by ${args[1]}. Run npm run catalog:build.\n`);
  } else if (command === "mark-human-reviewed") {
    if (args.length !== 2) throw new Error("Usage: npm run catalog:mark-human-reviewed -- <catalog-id> <human:actor>");
    const reviewed = service.markHumanReviewed(source, args[0], args[1]);
    await saveSource(reviewed);
    process.stdout.write(`Recorded human review of ${args[0]} by ${args[1]}. Run npm run catalog:build.\n`);
  } else {
    throw new Error("Commands: add, enrich, select-edition, validate, stats, approve, approve-submission, mark-human-reviewed.");
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Catalog command failed."}\n`);
  process.exitCode = 1;
});
