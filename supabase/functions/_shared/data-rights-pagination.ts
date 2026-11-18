type QueryError = { message: string };
type Page<T> = { data: T[] | null; error: QueryError | null };

const EXPORT_PAGE_SIZE = 500;

export async function readOrderedPages<T>(
  readPage: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<Page<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await readPage(from, from + EXPORT_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) return { data: rows, error: null };
  }
}

export async function removeExportFiles(
  folder: string,
  readFirstPage: () => PromiseLike<Page<{ id: string | null; name: string }>>,
  remove: (paths: string[]) => PromiseLike<{ error: QueryError | null }>,
): Promise<number> {
  let removed = 0;
  let previousNames: string[] = [];
  while (true) {
    // After removal, the remaining objects move to the start of the listing.
    const { data, error } = await readFirstPage();
    if (error) throw new Error(error.message);
    const entries = data ?? [];
    if (!entries.length) return removed;
    if (entries.some(entry => !entry.id || !entry.name || entry.name.includes("/"))) {
      throw new Error("unexpected_export_storage_entry");
    }
    const names = entries.map(entry => entry.name);
    if (names.length === previousNames.length && names.every((name, index) => name === previousNames[index])) {
      throw new Error("export_storage_removal_made_no_progress");
    }
    const removal = await remove(names.map(name => `${folder}/${name}`));
    if (removal.error) throw new Error(removal.error.message);
    previousNames = names;
    removed += names.length;
  }
}
