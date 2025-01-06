import Database from 'better-sqlite3';
import {vars} from './args.js';
console.log(vars);
const db = new Database(vars.db_name, { verbose: console.log });

// Create files table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,                    -- Unique identifier for each file record
    fullname TEXT NOT NULL,                 -- Name with extension (e.g., "example.txt")
    directory TEXT NOT NULL,                -- Directory path (e.g., "C:/Users/Documents")
    hash TEXT NOT NULL                      -- File hash for deduplication checking
  );

  -- Create index on hash for faster duplicate lookups
  CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);
`);

db.addFile = file => {
    db.prepare('INSERT OR IGNORE INTO files (id, fullname, directory, hash) VALUES (?, ?, ?, ?)').run(file.id, file.fullname, file.directory, file.hash);
}


// Export both default and named exports
export const getDb = () => db;
export default db; 