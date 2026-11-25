const fs = require('fs');
const path = require('path');

const API_URL = 'https://remotive.com/api/remote-jobs';
const CACHE_FILE = path.join(__dirname, 'cache.json');
const SIX_HOURS = 6 * 60 * 60 * 1000;

function readCache() {
    try {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        return Array.isArray(data.jobs) ? data : null;
    } catch {
        return null;
    }
}

async function getJobs(forceRefresh = false) {
    const cache = readCache();

    if (!forceRefresh && cache && Date.now() - cache.savedAt < SIX_HOURS) {
        return { jobs: cache.jobs, savedAt: cache.savedAt, fromCache: true};
    }

    try {
        const res = await fetch(API_URL, { signal: AbortSignal.timeout(15000) });
        if (res.status === 429) throw new Error('Too many requests to Remotive');
        if (!res.ok) throw new Error(`Remotive return status ${res.status}`);
        
        const data = await res.json();
        if (!Array.isArray(data.jobs)) throw new Error('Unexpected data from Remotive');

        const saved = { savedAt: Date.now(), jobs: data.jobs };
        try {
            fs.writeFileSync(CACHE_FILE, JSON.stringify(saved));
        } catch {

        }
        return { ...saved, fromCache: false };
    } catch (err) {
        let reason = err.message;
        if (err.name === 'TimeoutError') reason = 'the request timed out';
        if (err.message === 'fetch failed') reason = 'no internet connection or Remotive is unreachable';

        if (cache) {
            return {
                jobs: cache.jobs,
                savedAt: cache.savedAt,
                fromCache: true,
                warning: `Could not refresh (${reason}). Showing saved jobs instead.`,
            };
        }
        throw new Error(`Cannot load jobs (${reason}). Check your internet connection and try again.`);
    }
}

module.exports = { getJobs };