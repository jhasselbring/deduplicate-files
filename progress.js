export class ProgressTracker {
    constructor(totalBytes) {
        this.totalBytes = totalBytes;
        this.startTime = process.hrtime.bigint();
    }

    createFileProgress(fileName, fileSize) {
        return new FileProgress(fileName, fileSize);
    }

    updateTotal(processedBytes) {
        const stats = this.calculateStats(processedBytes, this.totalBytes, this.startTime);
        this.display(stats, 0);
    }

    complete() {
        process.stdout.cursorTo(0, 0);
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0, 1);
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0, 0);
    }

    calculateStats(processed, total, startTime) {
        const elapsedNanos = Number(process.hrtime.bigint() - startTime);
        const elapsedSeconds = elapsedNanos / 1e9;
        const bytesPerSecond = processed / elapsedSeconds;
        const remainingBytes = total - processed;
        const estimatedSecondsLeft = remainingBytes / bytesPerSecond;
        const percentComplete = Math.round((processed / total) * 100);

        return {
            processed,
            total,
            percentComplete,
            bytesPerSecond,
            estimatedSecondsLeft
        };
    }

    display(stats, line) {
        process.stdout.cursorTo(0, line);
        process.stdout.clearLine(0);
        process.stdout.write(
            `Progress: ${formatBytes(stats.processed)}/${formatBytes(stats.total)} ` +
            `(${stats.percentComplete}%) - ${formatBytes(Math.round(stats.bytesPerSecond))}/s ` +
            `- Est. ${formatTimeRemaining(stats.estimatedSecondsLeft)} remaining`
        );
    }
}

class FileProgress {
    constructor(fileName, fileSize) {
        this.fileName = fileName;
        this.fileSize = fileSize;
        this.startTime = process.hrtime.bigint();
    }

    update(bytesRead) {
        const stats = this.calculateStats(bytesRead);
        this.display(stats);
    }

    complete() {
        process.stdout.cursorTo(0, 1);
        process.stdout.clearLine(0);
    }

    calculateStats(bytesRead) {
        const elapsedNanos = Number(process.hrtime.bigint() - this.startTime);
        const elapsedSeconds = elapsedNanos / 1e9;
        const bytesPerSecond = bytesRead / elapsedSeconds;
        const remainingBytes = this.fileSize - bytesRead;
        const estimatedSecondsLeft = remainingBytes / bytesPerSecond;
        const percentComplete = Math.round((bytesRead / this.fileSize) * 100);

        return {
            fileName: this.fileName,
            bytesRead,
            fileSize: this.fileSize,
            percentComplete,
            bytesPerSecond,
            estimatedSecondsLeft
        };
    }

    display(stats) {
        process.stdout.cursorTo(0, 1);
        process.stdout.clearLine(0);
        process.stdout.write(
            `Hashing: ${stats.fileName} ${formatBytes(stats.bytesRead)}/${formatBytes(stats.fileSize)} ` +
            `(${stats.percentComplete}%) - ${formatBytes(Math.round(stats.bytesPerSecond))}/s ` +
            `- Est. ${formatTimeRemaining(stats.estimatedSecondsLeft)} remaining`
        );
    }
}

function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${Math.round(size * 10) / 10} ${units[unitIndex]}`;
}

function formatTimeRemaining(estimatedSecondsLeft) {
    if (estimatedSecondsLeft < 60) {
        return `${Math.round(estimatedSecondsLeft)} seconds`;
    } else if (estimatedSecondsLeft < 3600) {
        const minutes = Math.round(estimatedSecondsLeft / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
        const hours = Math.round(estimatedSecondsLeft / 3600 * 10) / 10;
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
} 