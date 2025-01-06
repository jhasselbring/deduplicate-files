import { readdir } from 'fs/promises';
import { join } from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ProgressTracker } from './progress.js';
import path from 'path';

export class FileScanner {
    constructor(targetDir, database, args) {
        this.targetDir = targetDir;
        this.database = database;
        this.args = args;
        this.totalBytes = 0;
        this.processedBytes = 0;
        this.progress = null;
        console.log('Scanner initialized with target directory:', targetDir);
    }

    async scan() {
        console.log('Starting scan...');
        // First pass: count total bytes and get file list
        const files = await this.getFiles(this.targetDir);
        console.log('Found files:', files.length);
        this.progress = new ProgressTracker(this.totalBytes);

        // Second pass: process files
        try {
            this.database.beginTransaction();
            for (const file of files) {
                const fileInfo = await this.processFile(file);
                this.database.addFile(fileInfo);
            }
            this.database.commitTransaction();
            console.log('Scan completed successfully');
        } catch (error) {
            console.error('Error during scan:', error);
            this.database.rollbackTransaction();
            throw error;
        }

        this.progress.complete();
    }

    async getFiles(dir) {
        const dirents = await readdir(dir, { withFileTypes: true });
        const files = await Promise.all(dirents.map(async (dirent) => {
            const res = join(dir, dirent.name);
            if (dirent.isDirectory()) {
                return this.getFiles(res);
            } else {
                const size = fs.statSync(res).size;
                this.totalBytes += size;
                return res;
            }
        }));
        return files.flat();
    }

    async processFile(filePath) {
        const fileInfo = this.parseFilePath(filePath);
        fileInfo.hash = await this.hashFile(filePath);
        return fileInfo;
    }

    parseFilePath(filePath) {
        const normalizedPath = filePath.split('\\').join('/');
        const fileName = normalizedPath.split('/').pop();
        const directory = normalizedPath.split('/').slice(0, -1).join('/');

        return {
            id: this.hashPath(directory + '/' + fileName),
            fullname: fileName,
            directory: directory
        };
    }

    hashPath(path) {
        return crypto.createHash('md5').update(path).digest('hex');
    }

    hashFile(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash("md5");
            const fileSize = fs.statSync(filePath).size;
            const fileName = filePath.split(/[/\\]/).pop();
            let bytesRead = 0;

            const stream = fs.createReadStream(filePath);
            const fileProgress = this.progress.createFileProgress(fileName, fileSize);

            stream.on("data", (chunk) => {
                bytesRead += chunk.length;
                hash.update(chunk);
                this.processedBytes += chunk.length;
                fileProgress.update(bytesRead);
                this.progress.updateTotal(this.processedBytes);
            });

            stream.on("end", () => {
                fileProgress.complete();
                resolve(hash.digest("hex"));
            });

            stream.on("error", reject);
        });
    }

    async moveDuplicates() {
        const duplicates = this.database.getDuplicateFiles();
        let currentHash = null;
        let keepFile = null;
        const duplicateGroups = new Map(); // Store duplicate groups for reporting

        for (const { hash, fullname, directory } of duplicates) {
            const originalPath = path.join(directory, fullname);

            if (hash !== currentHash) {
                currentHash = hash;
                keepFile = originalPath;
                duplicateGroups.set(keepFile, []); // Initialize array for this group
                continue;
            }

            // Calculate relative path from base directory
            const relativePath = path.relative(this.targetDir, originalPath);
            
            // Move duplicates while maintaining directory structure
            const duplicatePath = path.join(this.args.duplicate_dir, relativePath);
            try {
                await fs.promises.mkdir(path.dirname(duplicatePath), { recursive: true });
                await fs.promises.rename(originalPath, duplicatePath);
                duplicateGroups.get(keepFile).push(duplicatePath); // Store for reporting
            } catch (error) {
                console.error(`Error moving file ${originalPath}:`, error);
            }
        }

        console.clear();
        await this.generateHtmlReport(duplicateGroups);
    }

    async generateHtmlReport(duplicateGroups) {
        const reportPath = path.join(this.targetDir, '..', `duplicate_report_${this.args.name}.html`);
        const express = await import('express');
        const app = express.default();
        const port = 3456;

        // Enable CORS
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            next();
        });

        // Serve files from original and duplicate directories
        app.use('/kept', express.static(this.targetDir));
        app.use('/duplicate', express.static(this.args.duplicate_dir));
        
        // Start server
        const server = app.listen(port, () => {
            console.log(`File server running at http://localhost:${port}`);
        });
        
        // Prepare file metadata
        const fileContents = {};
        
        // Save file metadata
        for (const [kept, duplicates] of duplicateGroups.entries()) {
            try {
                // Handle original file
                const keptRelative = path.relative(this.targetDir, kept);
                const keptSafePath = keptRelative.replace(/\\/g, '/');
                const keptExt = path.extname(kept).toLowerCase();
                
                fileContents[keptSafePath] = {
                    type: this.getFileType(keptExt),
                    extension: keptExt,
                    path: keptSafePath,
                    isKept: true
                };
                
                // Handle duplicate files
                for (const duplicate of duplicates) {
                    const dupRelative = path.relative(this.args.duplicate_dir, duplicate);
                    const dupSafePath = dupRelative.replace(/\\/g, '/');
                    const dupExt = path.extname(duplicate).toLowerCase();
                    
                    fileContents[dupSafePath] = {
                        type: this.getFileType(dupExt),
                        extension: dupExt,
                        path: dupSafePath,
                        isKept: false
                    };
                }
            } catch (error) {
                console.error('Error processing files:', error);
            }
        }

        // Read the template
        const templatePath = new URL('./report-template.html', import.meta.url);
        let template = await fs.promises.readFile(templatePath, 'utf8');

        // Add additional styles for media content
        const additionalStyles = `
            .file-content {
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .file-content img {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
            }
            .file-content video {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
            }
            .file-content.text-content {
                justify-content: flex-start;
                align-items: flex-start;
                font-family: 'Consolas', 'Monaco', monospace;
                white-space: pre-wrap;
            }
            .error-content {
                color: #dc3545;
                font-style: italic;
                text-align: center;
                padding: 20px;
            }
            .loading {
                color: #0d6efd;
                font-style: italic;
                text-align: center;
                padding: 20px;
            }
        `;

        // Generate HTML for files
        const originalFilesHtml = Array.from(duplicateGroups.entries()).map(([kept], index) => {
            const fileName = path.basename(kept);
            const dirName = path.dirname(kept);
            const relativePath = path.relative(this.targetDir, kept);
            return `
                <div class="kept-file" onclick="showDuplicates(${index})" data-path="${relativePath.replace(/\\/g, '/')}">
                    <div class="file-path">
                        <div class="file-name">${fileName}</div>
                        <div class="file-dir">${dirName}</div>
                    </div>
                </div>
            `;
        }).join('');

        const duplicatesHtml = Array.from(duplicateGroups.entries()).map(([kept, duplicates], index) => `
            <div class="duplicate-list" id="duplicates-${index}">
                ${duplicates.length ? duplicates.map(dup => {
                    const fileName = path.basename(dup);
                    const dirName = path.dirname(dup);
                    const relativePath = path.relative(this.args.duplicate_dir, dup);
                    const safePath = relativePath.replace(/\\/g, '/');
                    return `
                        <div class="duplicate" onclick="showDuplicateContent(this, '${safePath}')" data-path="${safePath}">
                            <div class="file-path">
                                <div class="file-name">${fileName}</div>
                                <div class="file-dir">${dirName}</div>
                            </div>
                        </div>
                    `;
                }).join('') : '<div class="no-duplicates">No duplicates found</div>'}
            </div>
        `).join('');

        // Add the script with file metadata and functions
        const scriptContent = `
            <script>
                const SERVER_URL = 'http://localhost:${port}';
                window.fileContents = ${JSON.stringify(fileContents)};

                async function showContent(path, element) {
                    const fileData = window.fileContents[path];
                    if (!fileData) {
                        element.innerHTML = '<div class="content-placeholder">File content not available</div>';
                        return;
                    }

                    element.className = 'file-content'; // Reset classes
                    element.innerHTML = '<div class="loading">Loading content...</div>';
                    
                    try {
                        const fileUrl = \`\${SERVER_URL}/\${fileData.isKept ? 'kept' : 'duplicate'}/\${fileData.path}\`;
                        
                        switch (fileData.type) {
                            case 'image':
                                element.innerHTML = \`<img src="\${fileUrl}" alt="Image preview" />\`;
                                break;
                                
                            case 'video':
                                element.innerHTML = \`
                                    <video controls>
                                        <source src="\${fileUrl}" type="video/\${fileData.extension.slice(1)}">
                                        Your browser does not support the video tag.
                                    </video>\`;
                                break;
                                
                            case 'text':
                                const response = await fetch(fileUrl);
                                if (!response.ok) throw new Error('Failed to load file content');
                                const text = await response.text();
                                element.className = 'file-content text-content';
                                element.innerHTML = \`<div>\${text.replace(/&/g, '&amp;')
                                                            .replace(/</g, '&lt;')
                                                            .replace(/>/g, '&gt;')
                                                            .replace(/"/g, '&quot;')
                                                            .replace(/'/g, '&#039;')}</div>\`;
                                break;
                                
                            case 'binary':
                                element.innerHTML = '<div class="binary-content">Binary file content cannot be displayed</div>';
                                break;
                                
                            default:
                                element.innerHTML = '<div class="content-placeholder">Unknown file type</div>';
                        }
                    } catch (error) {
                        console.error('Error loading content:', error);
                        element.innerHTML = \`<div class="error-content">Error loading file content: \${error.message}</div>\`;
                    }
                }

                function showDuplicateContent(element, path) {
                    // Remove active state from all duplicates
                    document.querySelectorAll('.duplicate').forEach(el => el.classList.remove('active'));
                    
                    // Add active state to selected duplicate
                    element.classList.add('active');
                    
                    // Show duplicate file content
                    showContent(path, document.getElementById('duplicate-content'));
                }

                function showDuplicates(index) {
                    // Hide all duplicate lists and remove active states
                    document.querySelectorAll('.duplicate-list').forEach(el => el.classList.remove('active'));
                    document.querySelectorAll('.kept-file').forEach(el => el.classList.remove('active'));
                    document.querySelectorAll('.duplicate').forEach(el => el.classList.remove('active'));
                    
                    // Show selected duplicate list
                    const duplicateList = document.getElementById('duplicates-' + index);
                    duplicateList.classList.add('active');
                    const selectedOriginal = document.querySelectorAll('.kept-file')[index];
                    selectedOriginal.classList.add('active');

                    // Show original file content
                    const path = selectedOriginal.dataset.path;
                    showContent(path, document.getElementById('original-content'));
                    
                    // Automatically highlight and show content of first duplicate if it exists
                    const firstDuplicate = duplicateList.querySelector('.duplicate');
                    if (firstDuplicate) {
                        firstDuplicate.classList.add('active');
                        showContent(firstDuplicate.dataset.path, document.getElementById('duplicate-content'));
                    } else {
                        // Reset duplicate content if no duplicates exist
                        document.getElementById('duplicate-content').innerHTML = '<div class="content-placeholder">No duplicates found</div>';
                    }
                }

                // Add keyboard navigation
                document.addEventListener('keydown', (e) => {
                    const activeFile = document.querySelector('.kept-file.active');
                    if (!activeFile) return;
                    
                    const files = Array.from(document.querySelectorAll('.kept-file'));
                    const currentIndex = files.indexOf(activeFile);
                    
                    if (e.key === 'ArrowDown' && currentIndex < files.length - 1) {
                        showDuplicates(currentIndex + 1);
                    } else if (e.key === 'ArrowUp' && currentIndex > 0) {
                        showDuplicates(currentIndex - 1);
                    }
                });

                // Show first group by default if it exists
                if (document.querySelector('.kept-file')) {
                    showDuplicates(0);
                }

                // Clean up when the window is closed
                window.addEventListener('beforeunload', () => {
                    fetch(\`\${SERVER_URL}/shutdown\`).catch(() => {});
                });
            </script>
        `;

        // Replace placeholders and add styles
        template = template.replace('</style>', additionalStyles + '\n    </style>');
        template = template.replace('<!-- ORIGINAL_FILES_PLACEHOLDER -->', originalFilesHtml);
        template = template.replace('<!-- DUPLICATES_PLACEHOLDER -->', duplicatesHtml);
        template = template.replace('<!-- FILE_CONTENTS_PLACEHOLDER -->', '{}'); // Empty object as placeholder
        template = template.replace('</body>', scriptContent + '\n</body>');

        await fs.promises.writeFile(reportPath, template);
        console.log(`HTML report generated at: ${reportPath}`);

        // Add shutdown endpoint
        app.get('/shutdown', (req, res) => {
            res.send('Server shutting down');
            server.close(() => {
                console.log('File server stopped');
                process.exit(0);
            });
        });
    }

    getMimeType(extension) {
        const mimeTypes = {
            // Images
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.svg': 'image/svg+xml',
            // Videos
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.ogg': 'video/ogg',
            '.mov': 'video/quicktime'
        };
        return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }

    getFileType(extension) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
        const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
        const binaryExtensions = ['.exe', '.dll', '.bin', '.dat', '.mpg', '.mpeg'];

        extension = extension.toLowerCase();
        if (imageExtensions.includes(extension)) return 'image';
        if (videoExtensions.includes(extension)) return 'video';
        if (binaryExtensions.includes(extension)) return 'binary';
        return 'text';
    }
} 