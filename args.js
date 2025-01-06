import minimist from 'minimist';
import { resolve } from 'path';
import fs from 'fs';

export class ArgumentParser {
    constructor() {
        this.argv = minimist(process.argv.slice(2), {
            string: ['target'],
            boolean: ['help'],
            alias: {
                h: 'help',     
                d: 'dir',
                t: 'target',
            },
            default: {
                help: false
            }
        });

        if (this.argv.help) {
            this.showHelp();
        }

        this.vars = this.processArgs();
    }

    showHelp() {
        console.log(`
Usage: deduplicator -t <directory>

Options:
    -h, --help              Show this help message
    -t, --target <path>     Directory to scan (required)
    -d, --dir <path>        Alias for --target
`);
        process.exit(0);
    }

    validateTarget(path) {
        if (!path) {
            throw new Error('No target directory specified. Use -t or --target to specify a directory to scan.');
        }

        try {
            const stats = fs.statSync(path);
            
            if (!stats.isDirectory()) {
                throw new Error(`Target path is not a directory: ${path}`);
            }
            
            try {
                fs.accessSync(path, fs.constants.R_OK);
            } catch (e) {
                throw new Error(`No read permission for directory: ${path}`);
            }
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Directory does not exist: ${path}`);
            }
            throw error;
        }
    }

    processArgs() {
        const vars = { ...this.argv };
        
        // Validate target exists
        this.validateTarget(vars.target);
        
        vars.target = resolve(vars.target);
        vars.base_dir = vars.target.split(/[/\\]/).slice(0,-1).join('/');
        vars.name = vars.target.split(/[/\\]/).pop();
        vars.duplicate_dir = `${vars.base_dir}/@${vars.name}_duplicates`;
        vars.db_name = `${vars.base_dir}/@deduplicate-files-${vars.name}.db`;
        
        return vars;
    }
} 