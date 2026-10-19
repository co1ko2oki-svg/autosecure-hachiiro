<div align="center">

# ⚡ Hachiiro

**Enterprise-Grade Account Security, Verification & Automation Platform**

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org/)
[![Express](https://img.shields.io/badge/Express-v5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite / SQLCipher](https://img.shields.io/badge/SQLCipher-AES--256-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.zetetic.net/sqlcipher/)
[![PM2](https://img.shields.io/badge/PM2-Clustering-2B037A?style=for-the-badge&logo=pm2&logoColor=white)](https://pm2.keymetrics.io/)

<p align="center">
  A high-performance, distributed ecosystem integrating multi-bot Discord management, high-throughput REST APIs, web storefront dashboard, Microsoft & Minecraft telemetry/analytics, and zero-leak security architecture.
</p>

</div>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Directory Structure](#-directory-structure)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [Configuration Guide](#-configuration-guide)
  - [Environment Variables (.env)](#environment-variables-env)
  - [Bot & System Configuration (config.json)](#bot--system-configuration-configjson)
- [Database Security & Migration](#-database-security--migration)
- [Running the Application](#-running-the-application)
  - [Single-Process Unified Mode (Recommended)](#single-process-unified-mode-recommended)
  - [Standalone Mode](#standalone-mode)
  - [Production PM2 Process Manager](#production-pm2-process-manager)
- [Available NPM Scripts](#-available-npm-scripts)
- [Security & Compliance](#-security--compliance)
- [Author & Credits](#-author--credits)

---

## 🌟 Overview

**Hachiiro** is a full-stack security and automation suite engineered for high concurrency and hardened resilience. It centralizes:
- **Discord Bot Fleet**: Distributed bot instances managed by a centralized controller bot, delivering real-time interactive menus, OTP confirmations, and telemetry logging.
- **REST Backend & Web Store**: Express-driven API server with integrated Web Application Firewall (WAF), rate limiting, client IP trust forwarding, and responsive web frontend.
- **Microsoft & Minecraft Telemetry**: Full Xbox Live (XBL) authentication handling, Hypixel SkyBlock networth & stats parsing, DonutSMP analytics, cosmetic & cape checking, and automated SSID verification.
- **Zero-Trust Data Protection**: SQLCipher AES-256 database at-rest encryption, AES-256-GCM token storage, and an in-memory logger guard that intercepts and sanitizes sensitive credentials before writing to logs.

---

## 🚀 Key Features

### 🤖 Multi-Bot Discord Architecture
- **Controller & Worker Hierarchy**: Centralized `controllerbot` dynamically spawns, registers, and syncs worker bots across servers.
- **Modern Interactive UI**: Utilizes Discord Components V2, Buttons, String/Role Select Menus, and dynamic Modals.
- **Slash Commands & Permission Guarding**: Role-based access control, licensing system, and owner-only administration suites.
- **Asynchronous OTP Verification**: Non-blocking verification flows with interactive 2FA copy buttons and real-time webhook dispatch.

### 🛡️ Enterprise Security & Cryptography
- **SQLCipher AES-256 Database Encryption**: Full database encryption at rest with automated migration scripts (`npm run db:encrypt` / `npm run db:decrypt`).
- **AES-256-GCM Secret Cipher**: Hardware-accelerated authenticated token encryption with random IV and auth tags.
- **Built-in Web Application Firewall (WAF)**: Filters malicious query strings, path traversal, SQL injection patterns, and invalid payloads.
- **Global Intercept Logger Guard**: Patches `console.log`, `console.error`, and stdout/stderr streams to prevent tokens, passwords, and authorization headers from leaking into terminal outputs or PM2 logs.
- **Network & Proxy Shielding**: Native SOCKS5 and HTTP/HTTPS proxy rotation with IPv4-first DNS prioritization (`dns.setDefaultResultOrder('ipv4first')`).

### 🎮 Minecraft & Microsoft Telemetry
- **XBL & Microsoft OAuth Suite**: Complete authentication pipeline supporting Canary/MS flow tokens, UAID, and session cookies.
- **Hypixel SkyBlock Networth**: Calculates player networth, auction history, and gear evaluation via `skyhelper-networth`.
- **DonutSMP Telemetry**: Real-time player statistics, balancetop inspection, and currency tracking.
- **Cosmetics & Cape Inspection**: Fetches redeemed capes, skins, and cosmetic metadata.
- **Session & SSID Management**: Automated SSID checker, quarantine management, and recovery code generation.

### 🌐 Web Dashboard & E-Commerce
- **Responsive Dashboard**: Web frontend (`public/`) with modern UI components.
- **Integrated Store & Checkout**: Built-in checkout pages with instant webhook order notifications.
- **High Concurrency HTTP Pipeline**: Tuned HTTP parser supporting up to 512KB header allocations (`--max-http-header-size=524288`) for massive cookie payloads.

---

## 🏛 System Architecture

```text
                     +---------------------------------------+
                     |           Internet / Clients          |
                     +---------------------------------------+
                                         |
                                         v
                         +-------------------------------+
                         |   Edge / Cloudflare / Proxy   |
                         +-------------------------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
             [ Port 3667: Frontend ]             [ Port 5000: Backend ]
             - Store & Checkout UI               - REST API & WAF
             - Responsive Pages                  - Rate Limiting
             - Static Assets                     - Healthchecks
                       |                                   |
                       +-----------------+-----------------+
                                         |
                                         v
         +---------------------------------------------------------------+
         |                  Unified Process Runner                       |
         |                      (run_all.js)                             |
         +---------------------------------------------------------------+
                 |                                               |
                 v                                               v
   +---------------------------+                   +---------------------------+
   |    Discord Bot Cluster    |                   |   SQLCipher / SQLite3     |
   | - Controller Bot          |                   | - AES-256 File Encryption |
   | - Worker Fleet Instances  |                   | - Token AES-256-GCM       |
   | - Interactive Components  |                   | - Access & License Store  |
   +---------------------------+                   +---------------------------+
                 |
                 +-----> Telemetry & Services
                         - Microsoft / Xbox Live (XBL)
                         - Hypixel SkyBlock Networth
                         - DonutSMP Analytics
                         - Multi-Domain Email & 2FA Engine
```

---

## 📂 Directory Structure

```text
├── .pm2/                  # PM2 process files, pids, and isolated logs
├── autosecure/            # Core security and business logic
│   ├── Commands/          # Bot user & admin slash commands
│   ├── Handlers/          # Component interaction & event handlers
│   ├── Buttons/           # Dynamic Discord button handlers
│   ├── modals/            # Interactive modal response handlers
│   └── utils/             # Modular utilities (XBL, Hypixel, Donut, WAF, logging)
├── db/                    # Database models, SQLCipher access & schema
│   ├── database.db        # Encrypted SQLite database
│   ├── db.js              # Database connection & SQLCipher key setup
│   └── insertaccount.js   # Account persistence & transaction management
├── debug/                 # Diagnostics and dump logs
├── logs/                  # System, access, and error log outputs
├── mainbot/               # Controller bot and multi-bot dispatcher
│   ├── commands/          # Controller administration and management commands
│   ├── events/            # Discord gateway event listeners
│   └── handlers/          # Dynamic bot loader and session orchestrator
├── public/                # Frontend web dashboard, store, and assets
├── scripts/               # Operational utility scripts
│   ├── encryptDatabase.js # Database migration: Plain SQLite -> SQLCipher AES-256
│   ├── decryptDatabase.js # Database migration: SQLCipher AES-256 -> Plain SQLite
│   ├── migrateDomain.js   # Dynamic domain migration script
│   └── pm2-runner.js      # Robust cross-platform PM2 executor
├── servers/               # HTTP server implementations
│   ├── backendServer.js   # REST API server with WAF and rate limiters
│   └── frontendServer.js  # Static and dynamic web server
├── .env.example           # Template for environment configuration
├── autosecure.js          # Standalone bot process runner
├── config.json            # Centralized application configuration
├── configLoader.js        # Strict config validation and security loader
├── ecosystem.config.js    # Production PM2 cluster definition
├── package.json           # Project dependencies and script definitions
├── run_all.js             # Unified single-process runner (All-in-One)
└── server.js              # Monolithic web & API server entry
```

---

## 📦 Prerequisites

Ensure the following runtimes and packages are installed on your host machine:

- **Node.js**: `v18.0.0` or higher (Recommended: Node.js 20 LTS)
- **NPM**: `v9.0.0` or higher
- **C++ Build Tools**: Required for native bindings (`@journeyapps/sqlcipher` / `canvas` / `tiny-secp256k1`)
  - *Windows*: `npm install --global --production windows-build-tools` or install via Visual Studio Installer (Desktop development with C++)
  - *Linux*: `sudo apt-get install -y build-essential libsecret-1-dev python3`
- **Git**

---

## 🛠 Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/co1ko2oki-svg/Hachiiro.git
cd Hachiiro
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Copy `.env.example` to create your local `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

---

## ⚙️ Configuration Guide

### Environment Variables (.env)

Edit `.env` to configure credentials and cryptographic keys:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `BOT_TOKEN` | Primary Discord Bot Token | `MTAx...` |
| `NOTIFIER_WEBHOOK` | Discord Webhook URL for security & purchase logs | `https://discord.com/api/webhooks/...` |
| `PROXY_1` | Primary HTTP/HTTPS Proxy | `ip:port:user:pass` |
| `SOCKS_PROXY_1` | Primary SOCKS5 Proxy for outbound requests | `host:port:user:pass` |
| `SOCKS_PROXY_2` | Fallback SOCKS5 Proxy | `host:port:user:pass` |
| `VPS_IP` | Public or Binding IP of the host server | `127.0.0.1` |
| `AUTH_KEY` | Master Internal API Key for protected endpoints | `random_32_char_secret` |
| `JWT_SECRET` | Secret key for signing dashboard session tokens | `high_entropy_jwt_key` |
| `TOKEN_ENCRYPTION_KEY`| AES-256-GCM Master key for token encryption | `32_byte_hex_or_passphrase` |
| `DB_ENCRYPTION_KEY` | SQLCipher AES-256 database encryption passphrase | `strong_db_passphrase_here` |
| `ENABLE_DEBUG_DUMPS` | Output verbose debug files to `/debug` | `false` |
| `ALLOW_INSECURE_TLS` | Allow self-signed TLS certificates (Dev only) | `false` |

### Bot & System Configuration (`config.json`)

Configure bot options, server ports, and administrator IDs in `config.json`:

```json
{
  "prefix": "!",
  "owners": ["YOUR_DISCORD_USER_ID"],
  "backendPort": 5000,
  "frontendPort": 3667,
  "trustedProxies": ["127.0.0.1", "loopback", "linklocal", "uniquelocal"]
}
```

---

## 🔐 Database Security & Migration

Hachiiro features built-in tools to encrypt and decrypt the SQLite database at-rest using **SQLCipher AES-256**.

### Encrypt Database
Encrypts an unencrypted `database.db` into an encrypted SQLCipher database using `DB_ENCRYPTION_KEY`:
```bash
npm run db:encrypt
```
*(A plaintext backup is automatically created with timestamp for safety).*

### Decrypt Database
Decrypts an encrypted SQLCipher database back to plain SQLite format:
```bash
npm run db:decrypt
```

---

## 🏃 Running the Application

### Single-Process Unified Mode (Recommended)
Runs **Backend API**, **Frontend Web**, and **Discord Bots** concurrently within a single unified Node process:
```bash
npm start
```
Or with automatic restart during development:
```bash
npm run dev
```

### Standalone Mode
If you prefer running components in isolated processes:

- **Discord Bot only**:
  ```bash
  npm run bot
  ```
- **Backend API only**:
  ```bash
  npm run backend
  ```
- **Frontend Dashboard only**:
  ```bash
  npm run frontend
  ```

### Production PM2 Process Manager
Deploy with PM2 for automated restarts, log rotation, zero-downtime reloads, and memory guard caps:

```bash
# Start all processes via PM2
npm run pm2:start

# Inspect live cluster status
npm run pm2:status

# View live log outputs
npm run pm2:logs

# Restart or stop processes
npm run pm2:restart
npm run pm2:stop
```

---

## 📜 Available NPM Scripts

| Command | Action |
| :--- | :--- |
| `npm start` | Launches full system in unified single-process mode |
| `npm run dev` | Runs application with development settings |
| `npm run bot` | Starts standalone Discord Bot engine |
| `npm run backend` | Starts standalone REST API server (Port `5000`) |
| `npm run frontend` | Starts standalone Web Dashboard (Port `3667`) |
| `npm run pm2:start` | Launches production cluster via `scripts/pm2-runner.js` |
| `npm run pm2:status`| Checks running PM2 instances and resource usage |
| `npm run pm2:logs` | Streams live combined and error logs |
| `npm run pm2:restart` | Gracefully restarts PM2 cluster |
| `npm run pm2:stop` | Stops all PM2 instances |
| `npm run db:encrypt` | Migrates SQLite database to SQLCipher AES-256 |
| `npm run db:decrypt` | Decrypts SQLCipher database back to plain SQLite |
| `npm test` | Runs static syntax and syntax compilation test across all modules |

---

## 🛡 Security & Compliance

- **Graceful Shutdown**: Unified listeners capture `SIGINT`, `SIGTERM`, and unhandled rejections to safely terminate active child processes, close database handles, and cleanly disconnect Discord gateways.
- **Log Sanitation**: Sensitive parameters such as OAuth tokens, passwords, and private session cookies are automatically redacted before console output.
- **Safe Proxy Handling**: Configured with `edge` trust proxy to prevent IP spoofing when running behind Cloudflare or reverse proxies.

---

## 👤 Author & Credits

- **Repository**: [Hachiiro](https://github.com/co1ko2oki-svg/Hachiiro)
- **Author**: Ryuu ([@co1ko2oki-svg](https://github.com/co1ko2oki-svg))
- **Maintainers**: Ryuu & Contributors

---

<div align="center">
  <sub>Built with ❤️ and engineered for security and performance.</sub>
</div>
