#!/usr/bin/env node

import { vars } from './args.js';
import { getFiles, captureFileData } from './helpers.js';


const files = await getFiles(vars.target);
const count = files.length;
let progress = 0;
const startTime = process.hrtime.bigint();

files.forEach(file => {
    captureFileData(file);
    progress++;
    
    const elapsedNanos = Number(process.hrtime.bigint() - startTime);
    const elapsedSeconds = elapsedNanos / 1e9;
    const avgSecondsPerFile = elapsedSeconds / progress;
    const remainingFiles = count - progress;
    const estimatedSecondsLeft = avgSecondsPerFile * remainingFiles;
    
    // Convert to appropriate time unit for better readability
    let timeLeftStr;
    if (estimatedSecondsLeft < 60) {
        timeLeftStr = `${Math.round(estimatedSecondsLeft)} seconds`;
    } else if (estimatedSecondsLeft < 3600) {
        const minutes = Math.round(estimatedSecondsLeft / 60);
        timeLeftStr = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
        const hours = Math.round(estimatedSecondsLeft / 3600 * 10) / 10;
        timeLeftStr = `${hours} hour${hours !== 1 ? 's' : ''}`;
    }

    const percentComplete = Math.round((progress / count) * 100);
    console.clear();
    console.log(`Progress: ${progress}/${count} files processed (${percentComplete}%) - Est. ${timeLeftStr} remaining`);
});

console.log('done');