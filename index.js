#!/usr/bin/env node

import { ArgumentParser } from './args.js';
import { FileScanner } from './scanner.js';
import { FileDatabase } from './database.js';

async function main() {
    let db;
    try {
        const args = new ArgumentParser();
        db = new FileDatabase(args.vars.db_name);
        const scanner = new FileScanner(args.vars.target, db, args.vars);

        if (!db.hasScannedFiles()) {
            console.clear();
            console.log('Scanning for all files...');
            await scanner.scan();
            console.log('Processing complete');
            
        } 
        await scanner.moveDuplicates();
    } catch (error) {
        console.error('\nError:', error.message);
        process.exit(1);
    } finally {
        if (db) {
            db.close();
        }
    }
}

main().catch(error => {
    console.error('\nUnexpected error:', error.message);
    process.exit(1);
});
