import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CuratedCatalogService } from "../connectors/book-scout/curation/service";

async function main() {
  const sourcePath = resolve("data/books/catalog.source.json");
  const runtimePath = resolve("data/books/catalog.json");
  const source = JSON.parse(await readFile(sourcePath, "utf8")) as unknown;
  const runtime = new CuratedCatalogService().build(source);
  const serialized = `${JSON.stringify(runtime, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    if (await readFile(runtimePath, "utf8") !== serialized) {
      throw new Error("Generated catalog is stale. Run npm run catalog:build.");
    }
    process.stdout.write(`Catalog is current (${runtime.books.length} approved books).\n`);
    return;
  }
  await writeFile(runtimePath, serialized, "utf8");
  process.stdout.write(`Built catalog with ${runtime.books.length} approved books.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Catalog build failed."}\n`);
  process.exitCode = 1;
});
