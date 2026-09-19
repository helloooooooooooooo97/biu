type DatabaseSync = import('node:sqlite').DatabaseSync

export type TableSpec = { columns: string[]; indexes: string[] }

/** Current biu.sqlite shape including editor_content. Stores must not CREATE TABLE themselves. */
export const BIU_TABLES: Record<string, TableSpec> = {
  pages: {
    columns: ['id', 'title', 'parent_id', 'depends_on_json', 'emoji', 'created_at', 'updated_at'],
    indexes: [],
  },
  tasks: {
    columns: [
      'id',
      'title',
      'status',
      'priority',
      'difficulty',
      'assignee',
      'due_at',
      'notes',
      'sort',
      'created_at',
      'updated_at',
      'creator_json',
      'assignee_json',
      'assigned_at',
      'reports_json',
      'start_at',
      'project',
      'tags_json',
      'parent_id',
      'depends_on',
      'depth',
      'trigger_json',
      'report_interval_sec',
      'last_report_prompt_at',
      'report_prompt_count',
      'facet_json',
      'emoji',
    ],
    indexes: ['tasks_status_sort'],
  },
  facets: {
    columns: ['id', 'label', 'fields_json', 'created_at', 'updated_at'],
    indexes: ['facets_label'],
  },
  facet_stamps: {
    columns: ['facet_id', 'collection', 'record_id', 'title'],
    indexes: ['facet_stamps_facet', 'facet_stamps_record'],
  },
  facet_record_values: {
    columns: ['collection', 'record_id', 'facet_json'],
    indexes: [],
  },
  record_meta: {
    columns: ['collection', 'record_id', 'emoji', 'tags_json', 'created_by_json', 'updated_by_json'],
    indexes: [],
  },
  attachments: {
    columns: ['name', 'etag', 'mime', 'bytes', 'kind', 'storage', 'created_at'],
    indexes: [],
  },
  content_refs: {
    columns: ['collection', 'record_id', 'name', 'source'],
    indexes: ['content_refs_record'],
  },
  block_refs: {
    columns: ['collection', 'record_id', 'block_id', 'name', 'source'],
    indexes: ['block_refs_record', 'block_refs_block'],
  },
  record_banners: {
    columns: ['collection', 'record_id', 'kind', 'html'],
    indexes: [],
  },
  banner_gallery: {
    columns: ['id', 'kind', 'style', 'title', 'html', 'created_at'],
    indexes: [],
  },
  editor_content: {
    columns: ['collection', 'record_id', 'body', 'updated_at'],
    indexes: ['editor_content_record'],
  },
  shares: {
    columns: [
      'token',
      'kind',
      'collection',
      'view_id',
      'record_id',
      'password_salt',
      'password_hash',
      'share_plugins',
      'allow_copy',
      'created_at',
      'updated_at',
    ],
    indexes: ['shares_target'],
  },
  saved_views: {
    columns: ['collection', 'view_id', 'payload_json', 'updated_at'],
    indexes: [],
  },
  sessions: {
    columns: ['id', 'version', 'project_json', 'event_count', 'title', 'updated_at', 'mascot_json', 'config_json'],
    indexes: [],
  },
  page_block_index: {
    columns: [
      'collection',
      'page_id',
      'block_id',
      'kind',
      'plugin',
      'title',
      'page_title',
      'data_json',
      'page_created_at',
      'page_updated_at',
    ],
    indexes: ['page_block_index_page'],
  },
  page_block_cover: {
    columns: ['collection', 'page_id', 'page_updated_at'],
    indexes: [],
  },
  page_block_index_meta: {
    columns: ['key', 'value'],
    indexes: [],
  },
  gc_candidates: {
    columns: ['name', 'first_seen', 'last_seen'],
    indexes: [],
  },
}

export const LATEST_BIU_SCHEMA = 14

export const CREATE_CORE_SQL = `
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  depends_on_json TEXT NOT NULL DEFAULT '[]',
  emoji TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'med',
  difficulty TEXT NOT NULL DEFAULT 'med',
  assignee TEXT NOT NULL DEFAULT '',
  due_at INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  sort REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  creator_json TEXT,
  assignee_json TEXT,
  assigned_at INTEGER,
  description TEXT NOT NULL DEFAULT '',
  reports_json TEXT NOT NULL DEFAULT '[]',
  start_at INTEGER,
  project TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  parent_id TEXT DEFAULT '',
  depends_on TEXT NOT NULL DEFAULT '[]',
  depth INTEGER NOT NULL DEFAULT 0,
  trigger_json TEXT NOT NULL DEFAULT '{}',
  report_interval_sec INTEGER NOT NULL DEFAULT 60,
  last_report_prompt_at INTEGER,
  report_prompt_count INTEGER NOT NULL DEFAULT 0,
  facet_json TEXT NOT NULL DEFAULT '{}',
  emoji TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tasks_status_sort ON tasks(status, sort, updated_at DESC);
CREATE TABLE IF NOT EXISTS facets (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  fields_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS facets_label ON facets(label);
CREATE TABLE IF NOT EXISTS facet_stamps (
  facet_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (facet_id, collection, record_id)
);
CREATE INDEX IF NOT EXISTS facet_stamps_facet ON facet_stamps(facet_id);
CREATE INDEX IF NOT EXISTS facet_stamps_record ON facet_stamps(collection, record_id);
CREATE TABLE IF NOT EXISTS facet_record_values (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  facet_json TEXT NOT NULL,
  PRIMARY KEY (collection, record_id)
);
CREATE TABLE IF NOT EXISTS record_meta (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  emoji TEXT,
  tags_json TEXT,
  created_by_json TEXT,
  updated_by_json TEXT,
  PRIMARY KEY (collection, record_id)
);
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
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  collection TEXT NOT NULL,
  view_id TEXT NOT NULL DEFAULT '',
  record_id TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  share_plugins INTEGER NOT NULL DEFAULT 0,
  allow_copy INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS shares_target ON shares(kind, collection, view_id, record_id);
CREATE TABLE IF NOT EXISTS saved_views (
  collection TEXT NOT NULL,
  view_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (collection, view_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  project_json TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0,
  mascot_json TEXT,
  config_json TEXT
);
CREATE TABLE IF NOT EXISTS page_block_index (
  page_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  plugin TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  page_title TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL,
  page_created_at INTEGER NOT NULL DEFAULT 0,
  page_updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page_id, block_id)
);
CREATE INDEX IF NOT EXISTS page_block_index_page ON page_block_index(page_id);
CREATE TABLE IF NOT EXISTS page_block_cover (
  page_id TEXT PRIMARY KEY,
  page_updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS page_block_index_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gc_candidates (
  name TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
`

export const CREATE_EDITOR_SQL = `
CREATE TABLE IF NOT EXISTS editor_content (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (collection, record_id)
);
CREATE INDEX IF NOT EXISTS editor_content_record ON editor_content(collection, record_id);
`

export const CREATE_LATEST_SQL = `${CREATE_CORE_SQL}\n${CREATE_EDITOR_SQL}`

function hasTable(db: DatabaseSync, name: string) {
  return tableNames(db).includes(name)
}

export function dropSqliteColumn(db: DatabaseSync, table: string, name: string) {
  if (!hasTable(db, table)) return
  if (!tableColumnNames(db, table).includes(name)) return
  db.exec(`ALTER TABLE ${table} DROP COLUMN ${name}`)
}

/** Recreate page-block tables with collection in the primary key. Idempotent. */
export function rebuildPageBlockCollectionKeys(db: DatabaseSync) {
  if (!hasTable(db, 'page_block_index')) {
    db.exec(`
      CREATE TABLE page_block_index (
        collection TEXT NOT NULL,
        page_id TEXT NOT NULL,
        block_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        plugin TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        page_title TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL,
        page_created_at INTEGER NOT NULL DEFAULT 0,
        page_updated_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (collection, page_id, block_id)
      );
      CREATE INDEX IF NOT EXISTS page_block_index_page ON page_block_index(collection, page_id);
    `)
  } else if (!tableColumnNames(db, 'page_block_index').includes('collection')) {
    db.exec('DROP INDEX IF EXISTS page_block_index_page')
    db.exec(`
      CREATE TABLE page_block_index_new (
        collection TEXT NOT NULL,
        page_id TEXT NOT NULL,
        block_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        plugin TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        page_title TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL,
        page_created_at INTEGER NOT NULL DEFAULT 0,
        page_updated_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (collection, page_id, block_id)
      );
      INSERT INTO page_block_index_new (
        collection, page_id, block_id, kind, plugin, title, page_title, data_json, page_created_at, page_updated_at
      )
      SELECT '/pages', page_id, block_id, kind, plugin, title, page_title, data_json, page_created_at, page_updated_at
      FROM page_block_index;
      DROP TABLE page_block_index;
      ALTER TABLE page_block_index_new RENAME TO page_block_index;
      CREATE INDEX IF NOT EXISTS page_block_index_page ON page_block_index(collection, page_id);
    `)
  }
  if (!hasTable(db, 'page_block_cover')) {
    db.exec(`
      CREATE TABLE page_block_cover (
        collection TEXT NOT NULL,
        page_id TEXT NOT NULL,
        page_updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, page_id)
      );
    `)
  } else if (!tableColumnNames(db, 'page_block_cover').includes('collection')) {
    db.exec(`
      CREATE TABLE page_block_cover_new (
        collection TEXT NOT NULL,
        page_id TEXT NOT NULL,
        page_updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, page_id)
      );
      INSERT INTO page_block_cover_new (collection, page_id, page_updated_at)
      SELECT '/pages', page_id, page_updated_at FROM page_block_cover;
      DROP TABLE page_block_cover;
      ALTER TABLE page_block_cover_new RENAME TO page_block_cover;
    `)
  }
}

export function dropLegacyEditorColumns(db: DatabaseSync) {
  dropSqliteColumn(db, 'pages', 'notes')
  dropSqliteColumn(db, 'tasks', 'description')
  dropSqliteColumn(db, 'facets', 'notes')
}

export function applyLatestSchemaPatches(db: DatabaseSync) {
  rebuildPageBlockCollectionKeys(db)
  dropLegacyEditorColumns(db)
}

export function createLatestSchema(db: DatabaseSync) {
  db.exec(CREATE_LATEST_SQL)
  applyLatestSchemaPatches(db)
}

export function tableNames(db: DatabaseSync) {
  return (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as Array<{
      name: string
    }>
  ).map((row) => row.name)
}

export function tableColumnNames(db: DatabaseSync, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name)
}

export function indexNames(db: DatabaseSync) {
  return (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`).all() as Array<{
      name: string
    }>
  ).map((row) => row.name)
}

/** Shared tables used by assets. Prefer migrateBiu(); kept for adopt paths that only need refs. */
export function ensureBiuAssetSchema(db: DatabaseSync) {
  db.exec(CREATE_LATEST_SQL)
  try {
    const cols = tableColumnNames(db, 'attachments')
    if (!cols.includes('storage')) {
      db.exec(`ALTER TABLE attachments ADD COLUMN storage TEXT NOT NULL DEFAULT 'hash'`)
    }
    db.exec(`UPDATE attachments SET storage = 'hash' WHERE storage IN ('cas', '')`)
    db.exec(`UPDATE attachments SET storage = 'name' WHERE storage = 'doc'`)
  } catch {
    /* dummy sqlite */
  }
}
