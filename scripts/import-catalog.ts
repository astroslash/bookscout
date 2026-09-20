import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CuratedCatalogService } from "../connectors/book-scout/curation/service";
import { approveReadyAiImport, stageImportSeeds, submitImport, validateProposedCatalog } from "../connectors/book-scout/curation/import";

const sourcePath = resolve("data/books/catalog.source.json");

async function main() {
  const [mode, inputPath, ...rest] = process.argv.slice(2).filter((arg) => arg !== "--");
  if (!["check", "stage", "submit", "approve-ai"].includes(mode ?? "") || !inputPath ||
    (mode === "approve-ai" ? (rest.length < 1 || rest.length > 2 ||
      (rest.length === 2 && rest[1] !== "--apply")) : rest.length > 0)) {
    throw new Error("Usage: npm run catalog:check-import -- <dataset.json> (or stage-import / submit-import / approve-ready-ai -- <dataset.json> <ai:actor> [--apply])");
  }
  const dataset = JSON.parse(await readFile(resolve(inputPath), "utf8")) as unknown;
  const parsed = validateProposedCatalog(dataset);
  if (mode === "check") {
    process.stdout.write(`Import valid: ${parsed.books.length} proposed books, ${parsed.books.reduce((sum, item) => sum + item.relationships.length, 0)} relationships. No files changed.\n`);
    return;
  }
  const source = JSON.parse(await readFile(sourcePath, "utf8")) as unknown;
  const service = new CuratedCatalogService();
  if (mode === "approve-ai") {
    const result = approveReadyAiImport(source, parsed, rest[0], service);
    const apply = rest[1] === "--apply";
    if (apply) await writeFile(sourcePath, `${JSON.stringify(result.source, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ mode: apply ? "applied" : "preview", approved: result.approved,
      skipped: result.skipped }, null, 2)}\n`);
    return;
  }
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
