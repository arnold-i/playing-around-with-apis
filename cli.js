const readline = require('readline/promises');
const { getJobs } = require('./api');
const { color, clean, stripHtml, shorten, formatDate, timeAgo, prettyType} = require('./utils');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('close', () => {
    console.log(color.cyan('\nGoodbye, and good luck with your job search!'));
});

const PAGE_SIZE = 10;

let alljobs = [];
let results = [];
let lastUpdated = null;
const shortlist = [];

const state = {
    keyword: '',
    category: '',
    jobType: '',
    africaOnly: false,
    salaryOnly: false,
    sort: 'newest',
};

const SORTS = {
    newest: { label: 'Newest first', fn: (a, b) => new Date(b.publication_date) - new Date(a.publication_date)},
    oldest: { label: 'Oldest first', fn: (a, b) => new Date(a.publication_date) - new Date(b.publication_date)},
    company: { label: 'Company A-Z', fn: (a, b) => clean(a.company_name).localeCompare(clean(b.company_name))},
    title: { label: 'Job title A-Z', fn: (a, b) => clean(a.title).localeCompare(clean(b.title))},
};

async function ask(question) {
    return (await rl.question(question)).trim();
}

async function askNumber(question, min, max) {
    const answer = await ask(question);
    const n = Number(answer);
    if (answer === '' || !Number.isInteger(n) || n < min || n > max) {
        console.log(color.red(`Please enter a number from ${min} to ${max}.`));
        return null;
    }
    return n;
}

function canApplyFromAfrica(job) {
    const loc = clean(job.candidate_required_location).toLowerCase();
    return ['worldwide', 'anywhere', 'africa', 'rwanda'].some((word) => loc.includes(word));
}

function hasSalary(job) {
    return clean(job.salary).trim() !== '';
}

function applyAll() {
    results = alljobs.filter((job) => {
        if (state.keyword) {
            const text = `${job.title} ${job.company_name} ${(job.tags || []).join('')}`.toLowerCase();
            if (!text.includes(state.keyword)) return false;
        }
        if (state.category && job.category !== state.category) return false;
        if (state.jobType && job.job_type !== state.jobType) return false;
        if (state.africaOnly && !canApplyFromAfrica(job)) return false;
        if (state.salaryOnly && !hasSalary(job)) return false;
        return true;
    });
    results.sort(SORTS[state.sort].fn);
}

function activeFilters() {
    const parts = [];
    if (state.keyword) parts.push(`keyword "${state.keyword}"`);
    if (state.category) parts.push(`category: ${state.category}`);
    if (state.jobType) parts.push(`type: ${prettyType(state.jobType)}`);
    if (state.africaOnly) parts.push('can apply from Africa');
    if (state.salaryOnly) parts.push('salary shown');
    return parts.length ? parts.join(' | ') : 'none';
}

async function loadJobs(force = false) {
    console.log(color.dim(force ? 'Refreshing jobs from Remotive...' : 'Loading jobs...'));
    try {
        const data = await getJobs(force);
        alljobs = data.jobs;
        lastUpdated = data.savedAt;
        if (data.warning) {
            console.log(color.yellow('! ' + data.warning));
        } else {
            console.log(color.green(`Loaded ${alljobs.length} jobs ${data.fromCache ? '(saved copy)' : 'from Remotive'}.`));
        }
        applyAll();
        return true;
    } catch (err) {
        console.log(color.red('X ' + err.message));
        return false;
    }
}

function showHeader() {
    console.log('\n' + color.bold(color.cyan('=== REMOTEREADY: Remote Job Finder ===')));
    console.log(color.dim(`Jobs from Remotive.com | ${alljobs.length} jobs | updated ${timeAgo(lastUpdated)}`));
    console.log(`Showing ${color.bold(results.length)} jobs | Filters: ${activeFilters()} | Sort: ${SORTS[state.sort].label}`);
    console.log(`Shortlist: ${shortlist.length} saved\n`);
    console.log('1) Browse jobs');
    console.log('2) Search by keyword');
    console.log('3) Filter jobs');
    console.log('4) Sort jobs');
    console.log('5) Clear search and filters');
    console.log('6) View my shortlist');
    console.log('7) Refresh job data');
    console.log('8) Exit');
}

function printPage(page) {
    const start = page * PAGE_SIZE;
    const rows = {};
    results.slice(start, start + PAGE_SIZE).forEach((job, i) => {
        rows[start + i + 1] = {
            Title: shorten(job.title, 36),
            Company: shorten(job.company_name, 20),
            Type: prettyType(job.job_type),
            Location: shorten(job.candidate_required_location || 'Not stated', 20),
            Posted: formatDate(job.publication_date),
        };
    });
    console.table(rows);
}

function showJobDetails(job) {
    console.log('\n' + color.bold(color.cyan(clean(job.title))));
  console.log(`${color.bold('Company:')}   ${clean(job.company_name)}`);
  console.log(`${color.bold('Category:')}  ${clean(job.category)}`);
  console.log(`${color.bold('Type:')}      ${prettyType(job.job_type)}`);
  console.log(`${color.bold('Location:')}  ${clean(job.candidate_required_location) || 'Not stated'}`);
  console.log(`${color.bold('Salary:')}    ${hasSalary(job) ? clean(job.salary) : 'Not stated'}`);
  console.log(`${color.bold('Posted:')}    ${formatDate(job.publication_date)}`);
  if (job.tags && job.tags.length) console.log(`${color.bold('Skills:')}    ${job.tags.map(clean).join(', ')}`);
  console.log(color.bold(canApplyFromAfrica(job) ? color.green('You can apply from Africa') : color.yellow('May be limited to certain regions')));
  console.log('\n' + shorten(stripHtml(job.description), 600));
  console.log(`\n${color.bold('Apply here:')} ${color.cyan(clean(job.url))}`);
}

function saveToShortlist(job) {
    if (shortlist.some((j) => j.id === job.id)) {
        console.log(color.yellow('This job is already in your shortlist.'));
    } else {
        shortlist.push(job);
        console.log(color.green(`Saved "${shorten(job.title, 40)}" to your shortlist.`));
    }
}

async function browse() {
    if (results.length === 0) {
        console.log(color.yellow('No jobs match your search and filters. Try option 5 to clear them'));
        return;
    }
    const pages = Math.ceil(results.length / PAGE_SIZE);
    let page = 0;

    while (true) {
        printPage(page);
        console.log(`Page ${page + 1} of ${pages}`);
        const choice = (await ask('[n] next [p] previous [v] view job [s] save job [m] menu: ')).toLowerCase();

        if (choice === 'n') {
            if (page < pages - 1) page++;
            else console.log(color.yellow('You are on the last page.'));
        } else if (choice === 'p') {
            if (page > 0) page--;
            else console.log(color.yellow('You are on the first page.'));
        } else if (choice === 'v' || choice === 's') {
            const n = await askNumber(`Job number (1-${results.length}): `, 1, results.length);
            if (n !== null) {
                if (choice === 'v') {
                    showJobDetails(results[n - 1]);
                    await ask('\nPress Enter to go back to the list...');
                } else {
                    saveToShortlist(results[n - 1]);
                }
            }
        } else if (choice === 'm') {
            return;
        } else {
            console.log(color.red('Please type n, p, v, s or m.'));
        }
    }
}

async function search() {
    const keyword = await ask('Search (job title, company or skill, or press Enter to clear: ');
    if (keyword.length > 50) {
        console.log(color.red('That search is too long. Please use 50 characters or fewer.'));
        return;
    }
    state.keyword = keyword.toLowerCase();
    applyAll();
    if (keyword && results.length === 0) {
        console.log(color.yellow(`No jobs found for "${keyword}". Try a broader word, like "support" or "design".`));
    } else {
        console.log(color.green(`${results.length} jobs found.`));
    }
}

async function chooseFromList(title, values, current) {
    console.log(`\n${title}`);
    console.log(`0) All${current ? '' : ' (current)'}`);
    values.forEach((v, i) => {
        const count = alljobs.filter((j) => j.category === v || j.job_type === v).length;
        console.log(`${i + 1}) ${v === current ? color.bold(v + ' (current)') : v} (${count})`);
    });
    const n = await askNumber('Choose a number: ', 0, values.length);
    if (n === null) return current;
    return n === 0 ? '' : values[n - 1];
}

async function filterMenu() {
    while (true) {
        console.log('\n' + color.bold('Filter jobs'));
        console.log(`1) Category            [${state.category || 'All'}]`);
        console.log(`2) Job type            [${state.jobType ? prettyType(state.jobType) : 'All'}]`);
        console.log(`3) Can I apply from Africa?  [${state.africaOnly ? 'ON' : 'OFF'}]`);
        console.log(`4) Only jobs with salary     [${state.salaryOnly ? 'ON' : 'OFF'}]`);
        console.log('5) Back to menu');
        const n = await askNumber('Choose an option: ', 1, 5);
        if (n === null) continue;

        if (n === 1) {
            const categories = [...new Set(alljobs.map((j) => j.category).filter(Boolean))].sort();
            state.category = await chooseFromList('Categories:', categories, state.category);
        } else if (n === 2) {
            const types = [...new Set(alljobs.map((j) => j.job_type).filter(Boolean))].sort();
            state.job_type = await chooseFromList('Job types:', types, state.jobType);
        } else if (n === 3) {
            state.africaOnly = !state.africaOnly;
        } else if (n === 4) {
            state.salaryOnly = !state.salaryOnly;
        } else {
            return;
        }
        applyAll();
        console.log(color.green(`${results.length} jobs match your filters.`));
    }
}

async function sortMenu() {
    const keys = Object.keys(SORTS);
    console.log('\n' + color.bold('Sort jobs by:'));
    keys.forEach((k, i) => console.log(`${i + 1}) ${SORTS[k].label}${k === state.sort ? ' (current)' : ''}`));
    const n = await askNumber('Choose a number: ', 1, keys.length);
    if (n === null) return;
    state.sort = keys[n - 1];
    applyAll();
    console.log(color.green(`Sorted: ${SORTS[state.sort].label}.`));
}

function clearAll() {
    Object.assign(state, { keyword: '', category: '', jobType: '', africaOnly: false, salaryOnly: false});
    applyAll();
    console.log(color.green(`Search and filters cleared. Showing all ${results.length} jobs.`));
}

async function viewShortList() {
    if (shortlist.length === 0) {
        console.log(color.yellow('Your shortlist is empty. Save jobs while browsing with [s].'));
        return;
    }
    console.log('\n' + color.bold('My shortlist'));
    shortlist.forEach((job, i) => {
        console.log(`${i + 1}) ${clean(job.title)} - ${clean(job.company_name)}`);
        console.log(`   ${color.cyan(clean(job.url))}`);
    });
    const answer = await ask('\nType a number to remove it, or press Enter to go back: ');
    if (answer === '') return;
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= shortlist.length) {
        const [removed] = shortlist.splice(n - 1, 1);
        console.log(color.green(`Removed "${shorten(removed.title, 40)}".`));
    } else {
        console.log(color.red(`Please enter a number from 1 to ${shortlist.length}.`));
    }
}

async function main() {
    console.log(color.bold(color.cyan('\nWelcome to RemoteReady - find remote jobs you can actually apply for.')));

    while (!(await loadJobs())) {
        const retry = (await ask('Try again? (y/n): ')).toLowerCase();
        if (retry !== 'y') return rl.close();
    }

    while (true) {
        try {
            showHeader();
            const choice = await askNumber('\nChoose an option (1-8): ', 1, 8);
            if (choice === 1) await browse();
            else if (choice === 2) await search();
            else if (choice === 3) await filterMenu();
            else if (choice === 4) await sortMenu();
            else if (choice === 5) clearAll();
            else if (choice === 6) await viewShortList();
            else if (choice === 7) await loadJobs(true);
            else if (choice === 8) return rl.close();
        } catch (err) {
            console.log(color.red('Something went wrong: ' + err.message));
        }
    }
}

main();