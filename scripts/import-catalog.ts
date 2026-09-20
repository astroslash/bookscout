import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CuratedCatalogService } from "../connectors/book-scout/curation/service";
import { stageImportSeeds, submitImport, validateProposedCatalog } from "../connectors/book-scout/curation/import";

const sourcePath = resolve("data/books/catalog.source.json");

async function main() {
  const [mode, inputPath, ...rest] = process.argv.slice(2).filter((arg) => arg !== "--");
  if (!["check", "stage", "submit"].includes(mode ?? "") || !inputPath || rest.length) {
    throw new Error("Usage: npm run catalog:check-import -- <dataset.json> (or catalog:stage-import / catalog:submit-import)");
  }
  const dataset = JSON.parse(await readFile(resolve(inputPath), "utf8")) as unknown;
  const parsed = validateProposedCatalog(dataset);
  if (mode === "check") {
    process.stdout.write(`Import valid: ${parsed.books.length} proposed books, ${parsed.books.reduce((sum, item) => sum + item.relationships.length, 0)} relationships. No files changed.\n`);
    return;
  }
  const source = JSON.parse(await readFile(sourcePath, "utf8")) as unknown;
  const service = new CuratedCatalogService();
  if (mode === "stage") {
    const result = stageImportSeeds(source, parsed, service);
    await writeFile(sourcePath, `${JSON.stringify(result.source, null, 2)}\n`, "utf8");
    process.stdout.write(`Staged ${result.added} seeds; ${result.existing} already present. No proposals approved.\n`);
    return;
  }
  const result = submitImport(source, parsed, service);
  await writeFile(sourcePath, `${JSON.stringify(result.source, null, 2)}\n`, "utf8");
  process.stdout.write(`Submitted ${result.submitted} proposals for review. ${result.skippedUnenriched.length} books lack selected provider metadata; ${result.deferredRelationships} relationships await approved targets. No proposals approved.\n`);
  if (result.skippedUnenriched.length) {
    process.stdout.write(`Unenriched refs: ${result.skippedUnenriched.join(", ")}\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Import command failed."}\n`);
  process.exitCode = 1;
});
