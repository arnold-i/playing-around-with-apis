const color = {
    red: (t) => `\x1b[31m${t}\x1b[0m`,
    green: (t) => `\x1b[32m${t}\x1b[0m`,
    yellow: (t) => `\x1b[33m${t}\x1b[0m`,
    cyan: (t) => `\x1b[36m${t}\x1b[0m`,
    bold: (t) => `\x1b[1m${t}\x1b[0m`,
    dim: (t) => `\x1b[2m${t}\x1b[0m`,
};

function clean(text) {
    return String(text ?? '').replace(/[\x00-\x09\x0b-\x1f\x7h]/g, '')
}

function stripHtml(html) {
    return clean(html)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function shorten(text, max) {
    const t = clean(text).trim();
    return t.length > max ? t.slice(0, max - 3) + '...' : t;
}

function formatDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? 'Unknown' : d.toLocaleDateString('en-GB');
}

function timeAgo(ms) {
    const minutes = Math.floor((Date.now() - ms) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

function prettyType(type) {
    const t = clean(type).replace(/_/g, ' ');
    return t ? t[0].toUpperCase() + t.slice(1) : 'Not stated';
}

module.exports = { color, clean, stripHtml, shorten, formatDate, timeAgo, prettyType }