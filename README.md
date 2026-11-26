# RemoteReady – Remote Job Finder (CLI)

RemoteReady is a command-line application that helps job seekers find **remote jobs they can actually apply for**. Many remote job listings are restricted to specific countries (e.g. "USA only"), which wastes the time of applicants in Africa and elsewhere. RemoteReady pulls live remote job listings from the Remotive API and lets users search, filter and sort them — including a filter that shows only jobs open to applicants in Africa or worldwide — then view details and save a shortlist with direct apply links.

## Links

- **Live application (via load balancer):** https://www.arnold-i.tech
- **Demo video:** ADD_YOUTUBE_LINK_HERE
- **API key / credentials:** None required. The Remotive public API needs no API key, and the app has no login.

## Features

| Feature | Description |
|---|---|
| Browse | Jobs shown in a clean table, 10 per page, with next/previous paging |
| Search | Search by keyword across job title, company name and skill tags |
| Filter | By category, job type (full-time, contract…), "Can I apply from Africa?", and "only jobs with salary" — filters can be combined |
| Sort | Newest first, oldest first, company A–Z, job title A–Z |
| Job details | Company, category, type, location, salary, skills, cleaned description and apply link |
| Shortlist | Save jobs while browsing, view saved jobs with their links, remove jobs |
| Caching | Job data is cached in `cache.json` for 6 hours to reduce API calls and load instantly |
| Offline fallback | If the API is down or there is no internet, the app keeps working with the last saved data |
| Error handling | Clear messages for network failures, timeouts, API errors, rate limits, unexpected data and invalid user input — the app never crashes on bad input |
| Security | All input is validated; text from the API is cleaned of terminal control characters and HTML before display |

## Project structure

```
├── cli.js        # Menus, user interaction, search / filter / sort logic
├── api.js        # Fetches jobs from Remotive, caching and error handling
├── utils.js      # Helpers: colours, HTML cleaning, date and text formatting
├── package.json
├── .gitignore    # Excludes node_modules/ and cache.json
└── README.md
```

## Running locally

**Requirements:** Node.js 18 or higher (uses the built-in `fetch`). No other packages are needed.

```bash
git clone https://github.com/YOUR_USERNAME/playing-around-with-apis.git
cd playing-around-with-apis
npm start
```

### How to use

```
1) Browse jobs              → n / p to change page, v to view a job, s to save it, m for menu
2) Search by keyword        → e.g. "support", "design", "python"
3) Filter jobs              → category, job type, Africa-friendly, salary shown
4) Sort jobs                → newest, oldest, company A–Z, title A–Z
5) Clear search and filters
6) View my shortlist
7) Refresh job data
8) Exit
```

## Deployment

The application is deployed on two web servers behind a load balancer:

| Server | Hostname | IP address | Role |
|---|---|---|---|
| Web01 | 7302-web-01 | 3.10.235.43 | Runs the application |
| Web02 | 7302-web-02 | 35.179.115.123 | Runs the application |
| Lb01 | 7302-lb-01 | 13.43.219.47 | HAProxy load balancer (HTTPS, www.arnold-i.tech) |

Because RemoteReady is a terminal application, it is served on the web using **ttyd**, which runs the CLI and displays it in a browser terminal. Each visitor gets their own session of the app. ttyd only runs `node cli.js` — not a shell — so visitors cannot run other commands on the server.

### 1. Web servers (repeated on Web01 and Web02)

```bash
# Install Node.js 20 and Git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Get the application
cd ~
git clone https://github.com/YOUR_USERNAME/playing-around-with-apis.git
cd playing-around-with-apis
node cli.js          # quick test, then exit with 8

# Install ttyd (the servers use ARM processors, so the aarch64 build is required)
sudo wget -O /usr/local/bin/ttyd https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.aarch64
sudo chmod +x /usr/local/bin/ttyd

# Run the app with PM2 so it stays up and restarts on reboot
sudo npm install -g pm2
pm2 start /usr/local/bin/ttyd --name remotejobs --interpreter none -- -p 7681 -W node /home/ubuntu/playing-around-with-apis/cli.js
pm2 save
pm2 startup          # then run the command it prints

# Allow the app port through the firewall (Web01 uses ufw)
sudo ufw allow 7681

# Check
pm2 status                         # remotejobs should be "online"
curl -I http://localhost:7681      # should return HTTP/1.1 200 OK
```

### 2. Load balancer (Lb01)

HAProxy was already configured for HTTPS on the domain `www.arnold-i.tech`. The backend was updated to send traffic to the application on both web servers. The final configuration of the frontend and backend in `/etc/haproxy/haproxy.cfg`:

```
frontend web_frontend
    bind *:80
    bind *:443 ssl crt /etc/haproxy/certs/www.arnold-i.tech.pem
    http-request redirect scheme https code 301 unless { ssl_fc }
    mode http
    default_backend web_backend

backend web_backend
    mode http
    balance roundrobin
    timeout tunnel 1h
    http-response set-header X-Served-By %s
    server 7302-web-01 3.10.235.43:7681 check
    server 7302-web-02 35.179.115.123:7681 check
```

- `balance roundrobin` sends each new request to the next server in turn.
- `check` makes HAProxy health-check each server and stop sending traffic to one that is down.
- `timeout tunnel 1h` keeps the browser terminal (a WebSocket connection) open while the user is using the app.
- `http-response set-header X-Served-By %s` adds a header showing which server handled the request, used to verify load balancing.
- HTTP requests are redirected to HTTPS.

Apply the changes:

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg   # validate the config
sudo systemctl restart haproxy
```

### 3. Testing the load balancer

Open https://www.arnold-i.tech in a browser — the app loads. To confirm traffic is shared between both servers:

```bash
for i in 1 2 3 4 5 6; do curl -sI https://www.arnold-i.tech | grep -i x-served-by; done
```

Result — requests alternate between the two servers:

```
x-served-by: 7302-web-01
x-served-by: 7302-web-02
x-served-by: 7302-web-01
x-served-by: 7302-web-02
x-served-by: 7302-web-01
x-served-by: 7302-web-02
```

<!-- Add your screenshot here, e.g. ![Load balancer test](screenshots/lb-test.png) -->

## API used

**Remotive Remote Jobs API**
- Website: https://remotive.com
- Documentation: https://github.com/remotive-com/remote-jobs-api
- Endpoint: `GET https://remotive.com/api/remote-jobs`
- No API key or authentication is required.
- All jobs shown in RemoteReady are credited to Remotive and link back to the original listing on remotive.com, as requested in Remotive's API terms.

## Challenges and solutions

| Challenge | Solution |
|---|---|
| Remotive asks developers not to request data too often, and its free feed returns a limited number of jobs | Jobs are cached for 6 hours, and all searching, filtering and sorting is done locally in the app instead of making a new API request each time |
| The API could be down or the user could be offline | The app falls back to the last saved data with a warning, or shows a clear error and offers to retry if no data is saved |
| Job descriptions arrive as HTML | A `stripHtml` helper converts them to plain, readable text |
| Data from an external API could contain characters that break the terminal | All API text is cleaned of control characters before it is displayed |
| A CLI app cannot normally be reached through a web load balancer | ttyd serves the CLI in a browser terminal, and HAProxy balances traffic between the two ttyd instances |
| ttyd failed to start on the servers ("Exec format error") | The servers use ARM (aarch64) processors, so the aarch64 build of ttyd was installed instead of the x86_64 one |
| PM2 tried to run the ttyd binary as a JavaScript file | Started it with `--interpreter none` |
| The load balancer was already configured for another project | Updated only the existing backend (ports and WebSocket timeout) and kept the HTTPS frontend |

## Credits

- **[Remotive](https://remotive.com)** – remote job data via its public API
- **[Node.js](https://nodejs.org)** – runtime (built-in `fetch`, `readline`, `fs`)
- **[ttyd](https://github.com/tsl0922/ttyd)** – serves the CLI in a web browser
- **[PM2](https://pm2.keymetrics.io)** – process manager on the web servers
- **[HAProxy](https://www.haproxy.org)** – load balancer

## Author

Arnold Ishimwe