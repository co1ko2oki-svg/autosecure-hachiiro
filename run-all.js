const { spawn } = require('child_process');
const path = require('path');

const C = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    gray: "\x1b[90m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m"
};

const BADGES = {
    'BACKEND':  `${C.green}[BACKEND ]${C.reset}`,
    'FRONTEND': `${C.cyan}[FRONTEND]${C.reset}`,
    'BOT':      `${C.magenta}[BOT     ]${C.reset}`,
    'BOT ERR':  `${C.yellow}[BOT WARN]${C.reset}`,
    'SYSTEM':   `${C.yellow}[SYSTEM  ]${C.reset}`,
    'ERROR':    `${C.red}[ERROR   ]${C.reset}`
};

const IGNORE_PATTERNS = [
    /\[dotenv@/i,
    /\[SKYHELPER-NETWORTH\]/i,
    /API key expired\. Refreshing\.\.\./i,
    /Getting a new key is deprecated/i,
    /^\s*=+[\s=]*$/,
    /^\s*-+[\s-]*$/,
    /^\s*$/
];

function getTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${C.gray}${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${C.reset}`;
}

function cleanMessage(raw, serviceTag) {
    let msg = raw.trim();
    if (!msg) return null;

    for (const pat of IGNORE_PATTERNS) {
        if (pat.test(msg)) return null;
    }

    msg = msg.replace(/^\[(BACKEND|FRONTEND|DISCORD-BOT|BACKEND-API|FRONTEND-WEB)\]\s*/i, '');
    msg = msg.replace(/^\[BANCHECK\]\s*/i, '🛡️  [Proxy] ');

    return msg;
}

const processes = [];

function startProcess(serviceKey, scriptPath, isErr = false) {
    const proc = spawn(process.execPath, ['--no-deprecation', scriptPath], {
        cwd: __dirname,
        env: {
            ...process.env,
            FORCE_COLOR: '1',
            RUN_ALL_MODE: 'true',
            DOTENV_CONFIG_QUIET: 'true'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const handleOutput = (data, isErrorStream = false) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            const cleaned = cleanMessage(line, serviceKey);
            if (!cleaned) continue;

            const time = getTimestamp();
            let badge = BADGES[serviceKey] || `${C.white}[${serviceKey}]${C.reset}`;

            if (isErrorStream) {
                badge = BADGES[`${serviceKey} ERR`] || BADGES['ERROR'];
            }

            console.log(`${time} ${badge} ${cleaned}`);
        }
    };

    proc.stdout.on('data', (data) => handleOutput(data, false));
    proc.stderr.on('data', (data) => handleOutput(data, true));

    proc.on('close', (code) => {
        if (code !== 0 && code !== null) {
            console.log(`${getTimestamp()} ${BADGES['SYSTEM']} ${serviceKey} stopped (code: ${code})`);
        }
    });

    processes.push({ name: serviceKey, proc });
    return proc;
}

console.clear();
console.log(`${C.bright}${C.cyan}`);
console.log(` ╭────────────────────────────────────────────────────────────────────────╮`);
console.log(` │                     ⚡ AUTOSECURE SYSTEM v2.0                         │`);
console.log(` │                  DDoS-Isolated Engine & Bot Controller                 │`);
console.log(` ├────────────────────────────────────────────────────────────────────────┤`);
console.log(` │  🌐 Frontend Store :  http://localhost:3000   (Static Tebex Pages)     │`);
console.log(` │  🛡️  Backend API   :  http://localhost:5000   (Anti-DDoS & OTP Engine) │`);
console.log(` │  🤖 Discord Bot    :  AutoSecure Controller   (Multi-Bot Gateway)      │`);
console.log(` │                                                                        │`);
console.log(` │  Status: Running   •  Rate-Limit: 10/min  •  Ctrl + C to Stop          │`);
console.log(` ╰────────────────────────────────────────────────────────────────────────╯`);
console.log(`${C.reset}`);

startProcess('BACKEND', path.join(__dirname, 'servers', 'backendServer.js'));
startProcess('FRONTEND', path.join(__dirname, 'servers', 'frontendServer.js'));
startProcess('BOT', path.join(__dirname, 'autosecure.js'));

function cleanup() {
    console.log(`\n${getTimestamp()} ${BADGES['SYSTEM']} Stopping all processes...`);
    for (const { proc } of processes) {
        try {
            proc.kill();
        } catch (e) {}
    }
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
