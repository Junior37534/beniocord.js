function formatUrl(url) {
    const base = 'https://api.beniocord.site';
    if (!url) return null;
    if (url.startsWith(base) || url.startsWith('http')) return url;
    return base + (url.startsWith('/') ? url : '/' + url);
}

module.exports = { formatUrl }