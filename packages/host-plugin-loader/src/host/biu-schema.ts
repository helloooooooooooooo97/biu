type DatabaseSync = import('node:sqlite').DatabaseSync

/** Shared tables in biu.sqlite. Call from every opener so CREATE IF NOT EXISTS is one definition. */
export function ensureBiuAssetSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      name TEXT PRIMARY KEY,
      etag TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'asset',
      storage TEXT NOT NULL DEFAULT 'hash',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS content_refs (
      collection TEXT NOT NULL,
      record_id TEXT NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (collection, record_id, name, source)
    );
    CREATE TABLE IF NOT EXISTS block_refs (
      collection TEXT NOT NULL,
      record_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (collection, record_id, block_id, name, source)
    );
    CREATE INDEX IF NOT EXISTS content_refs_record ON content_refs(collection, record_id);
    CREATE INDEX IF NOT EXISTS block_refs_record ON block_refs(collection, record_id);
    CREATE INDEX IF NOT EXISTS block_refs_block ON block_refs(collection, record_id, block_id);
    CREATE TABLE IF NOT EXISTS record_banners (
      collection TEXT NOT NULL,
      record_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      html TEXT NOT NULL,
      PRIMARY KEY (collection, record_id)
    );
    CREATE TABLE IF NOT EXISTS banner_gallery (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      style TEXT NOT NULL DEFAULT 'mine',
      title TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
  try {
    const cols = db.prepare('PRAGMA table_info(attachments)').all() as Array<{ name: string }>
    if (!cols.some((col) => col.name === 'storage')) {
      db.exec(`ALTER TABLE attachments ADD COLUMN storage TEXT NOT NULL DEFAULT 'hash'`)
    }
    db.exec(`UPDATE attachments SET storage = 'hash' WHERE storage IN ('cas', '')`)
    db.exec(`UPDATE attachments SET storage = 'name' WHERE storage = 'doc'`)
  } catch {
    /* dummy sqlite or missing table */
  }
}
