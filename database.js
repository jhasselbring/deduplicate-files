import Database from 'better-sqlite3';

export class FileDatabase {
    constructor(dbPath) {
        console.log('Initializing database at:', dbPath);
        this.db = new Database(dbPath);
        this.initializeDatabase();
        this.insertStmt = this.db.prepare('INSERT OR IGNORE INTO files (id, fullname, directory, hash) VALUES (?, ?, ?, ?)');
    }

    initializeDatabase() {
        console.log('Setting up database tables...');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,                    -- Unique identifier for each file record
                fullname TEXT NOT NULL,                 -- Name with extension (e.g., "example.txt")
                directory TEXT NOT NULL,                -- Directory path (e.g., "C:/Users/Documents")
                hash TEXT NOT NULL,                     -- File hash for deduplication checking
                original TEXT,                          -- Original file path
                uptodate BOOLEAN DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);
        `);
    }

    addFile(file) {
        this.insertStmt.run(file.id, file.fullname, file.directory, file.hash);
    }

    beginTransaction() {
        this.db.prepare('BEGIN').run();
    }

    commitTransaction() {
        this.db.prepare('COMMIT').run();
    }

    rollbackTransaction() {
        this.db.prepare('ROLLBACK').run();
    }

    close() {
        this.db.close();
    }

    hasScannedFiles() {
        const result = this.db.prepare('SELECT id FROM files').get();
        return result ? true : false;
    }

    getDuplicateFiles() {
        return this.db.prepare(`
            SELECT *
            FROM files
            WHERE hash IN (
            SELECT hash
            FROM files
            GROUP BY hash
            HAVING COUNT(*) > 1
            )
            ORDER BY hash`).all();
    }
} 