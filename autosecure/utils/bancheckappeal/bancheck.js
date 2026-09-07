const mineflayer = require('mineflayer');
const { SocksClient } = require('socks');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const axios = require("axios");
const config = require('../../../config.json');

// Fixed BUG #5: Previously overrode console.log/warn/process.emitWarning GLOBALLY,
// which silently swallowed ALL logs containing 'deprecated' or 'mojang auth' across the entire app.
// Now uses a scoped flag that is only active during mineflayer bot creation.
let _suppressMineflayerWarnings = false;

const originalConsoleWarn = console.warn;
const originalProcessEmitWarning = process.emitWarning;

console.warn = function(...args) {
    if (_suppressMineflayerWarnings) {
        const message = args.join(' ');
        if (message.includes('[deprecated]') || message.includes('mojang auth') || 
            message.includes('https://help.minecraft.net/hc/en-us/articles/')) {
            return;
        }
    }
    originalConsoleWarn.apply(console, args);
};

process.emitWarning = function(warning, ...args) {
    if (_suppressMineflayerWarnings && typeof warning === 'string' && 
        (warning.includes('[deprecated]') || warning.includes('mojang auth'))) {
        return;
    }
    originalProcessEmitWarning.apply(process, [warning, ...args]);
};

function withSuppressedWarnings(fn) {
    _suppressMineflayerWarnings = true;
    try {
        return fn();
    } finally {
        _suppressMineflayerWarnings = false;
    }
}

let proxies = [];

try {
    if (config.useproxy === true || config.useproxy === "true") {
        if (Array.isArray(config.proxy) && config.proxy.length > 0) {
            proxies = config.proxy.map(proxyStr => {
                const [ip, port, username, password] = proxyStr.split(':');
                return { ip, port, username, password };
            });
        } else if (typeof config.proxy === 'string' && config.proxy) {
            const [ip, port, username, password] = config.proxy.split(':');
            proxies = [{ ip, port, username, password }];
        }
    }

    if (proxies.length === 0) {
        console.log('[BANCHECK] No proxy configured, direct connection will be attempted if allowed');
    } else {
        console.log(`[BANCHECK] Loaded ${proxies.length} proxies from config.json`);
    }
} catch (err) {
    console.error('[BANCHECK] Error loading proxies:', err.message);
}

let currentProxyIndex = 0;

function getNextProxy() {
    if (proxies.length === 0) {
        return null;
    }
    const proxy = proxies[currentProxyIndex];
    currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
    return proxy;
}

const SERVERS = {
    hypixel: {
        id: 'hypixel',
        name: 'Hypixel',
        host: 'mc.hypixel.net',
        port: 25565,
        version: '1.8.9'
    },
    donut: {
        id: 'donut',
        name: 'DonutSMP',
        host: 'donutsmp.net',
        port: 25565,
        version: '1.21.4'
    },
    mcpvp: {
        id: 'mcpvp',
        name: 'MCPVP',
        host: 'mc.mcpvp.club',
        port: 25565,
        version: '1.21.4'
    }
};

async function checkIfUserIsOnline(uuid) {
    try {
        const response = await axios({
            method: "GET",
            url: `https://hypixel.paniek.de/player/${uuid}/status`,
            timeout: 3000
        });
        return response?.data?.status?.online === true;
    } catch (error) {
        return false;
    }
}

function parseBanTime(timeStr) {
    let seconds = 0;
    const matches = timeStr.match(/\d+[dhms]/g) || [];

    matches.forEach(match => {
        const value = parseInt(match);
        switch(match.slice(-1)) {
            case 'd': seconds += value * 86400; break;
            case 'h': seconds += value * 3600; break;
            case 'm': seconds += value * 60; break;
            case 's': seconds += value; break;
        }
    });

    return seconds > 0 ? Math.floor(Date.now() / 1000) + seconds : null;
}

function getBanId(text) {
    const fullText = text.toLowerCase();
    let banIdMatch = fullText.match(/ban id: (#[a-z0-9]+)/i);
    if (!banIdMatch) banIdMatch = fullText.match(/block id: (#[a-z0-9]+)/i);
    if (!banIdMatch) banIdMatch = fullText.match(/punishment id: (#[a-z0-9]+)/i);
    if (!banIdMatch) banIdMatch = fullText.match(/#([a-z0-9]{4,16})\b/i);
    return banIdMatch ? (banIdMatch[1].startsWith('#') ? banIdMatch[1] : `#${banIdMatch[1]}`) : null;
}

function extractKickText(reason) {
    if (!reason) return '';
    if (typeof reason === 'string') {
        try {
            const parsed = JSON.parse(reason);
            return extractKickText(parsed);
        } catch {
            return reason.replace(/§[0-9a-fk-or]/gi, '').trim();
        }
    }
    let text = '';
    if (reason.text) text += reason.text;
    if (Array.isArray(reason.extra)) {
        for (const item of reason.extra) {
            text += extractKickText(item);
        }
    }
    if (Array.isArray(reason.with)) {
        for (const item of reason.with) {
            text += extractKickText(item);
        }
    }
    if (reason.translate) text += ' ' + reason.translate;
    return text.replace(/§[0-9a-fk-or]/gi, '').trim();
}

function parseHypixelBanReason(reason, profile) {
    try {
        const rawText = extractKickText(reason);
        const fullText = rawText.toLowerCase();

        if (fullText.includes('failed to authenticate') || fullText.includes('invalid session') || fullText.includes('invalid token') || fullText.includes('not logged into')) {
            return {
                server: 'hypixel',
                serverName: 'Hypixel',
                banId: null,
                banReason: 'Invalid SSID - authentication failed',
                unbanTime: null,
                ban: `Couldn't check ban:`,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        if (fullText.includes('outdated client') || fullText.includes('outdated server') || fullText.includes('use a minecraft version') || fullText.includes('version which is no longer supported')) {
            return {
                server: 'hypixel',
                serverName: 'Hypixel',
                banId: null,
                banReason: 'Server requires a different Minecraft version',
                unbanTime: null,
                ban: `Couldn't check ban:`,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        if (fullText.includes('you logged in from another location') || fullText.includes('disconnected') || fullText.includes('already connected')) {
            return {
                server: 'hypixel',
                serverName: 'Hypixel',
                banId: null,
                banReason: 'online',
                unbanTime: null,
                ban: `Couldn't check ban:`,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        if (fullText.includes('closed') && !fullText.includes('ban') && !fullText.includes('suspicious')) {
            return {
                server: 'hypixel',
                serverName: 'Hypixel',
                banId: null,
                banReason: null,
                unbanTime: null,
                ban: false,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        const banId = getBanId(fullText);
        let banReason = 'unknown';
        let unbanTime = null;

        const timeMatch = fullText.match(/(\d+[dhms]\s*)+/);
        if (timeMatch) {
            unbanTime = parseBanTime(timeMatch[0]);
        }

        if (fullText.includes('blocked') || fullText.includes('permanent') || fullText.includes('permanently')) {
            unbanTime = 'never';
        }

        if (fullText.includes('suspicious activity has been detected on your account') || fullText.includes('security alert')) {
            banReason = 'security';
        } else if (fullText.includes('cheating through the use of unfair game advantages') || fullText.includes('unfair game advantages')) {
            banReason = 'cheating';
        } else if (fullText.includes('boosting detected')) {
            banReason = 'sbboosting';
        } else if (fullText.includes('boosting to')) {
            banReason = 'boosting';
        } else if (fullText.includes('extreme chat infraction') || fullText.includes('chat infraction')) {
            banReason = 'chat';
        } else if (fullText.includes('teaming') || fullText.includes('cross teaming')) {
            banReason = 'teaming';
        } else if (fullText.includes("your account's security appeal was processed and the account has entered a recovery phase")) {
            banReason = 'already appealed';
        } else if (fullText.includes('ban') || fullText.includes('suspended') || fullText.includes('blocked')) {
            banReason = 'banned';
        }

        const isBanned = fullText.includes('ban') || fullText.includes('blocked') || fullText.includes('suspicious activity') || fullText.includes('punishment') || !!banId;

        if (isBanned) {
            return {
                server: 'hypixel',
                serverName: 'Hypixel',
                banId,
                banReason,
                unbanTime,
                ban: true,
                username: profile?.name || null,
                uuid: profile?.id || null,
                banTimeFormatted: unbanTime === 'never' ?
                    'Permanent' :
                    (unbanTime ? new Date(unbanTime * 1000).toLocaleString() : 'Unknown duration')
            };
        }

        return {
            server: 'hypixel',
            serverName: 'Hypixel',
            banId: null,
            banReason: null,
            unbanTime: null,
            ban: false,
            username: profile?.name || null,
            uuid: profile?.id || null
        };
    } catch (e) {
        return {
            server: 'hypixel',
            serverName: 'Hypixel',
            banId: null,
            banReason: 'error',
            unbanTime: null,
            ban: `Couldn't check ban:`,
            username: profile?.name || null,
            uuid: profile?.id || null
        };
    }
}

function parseDonutBanReason(reason, profile) {
    try {
        const rawText = extractKickText(reason);
        const fullText = rawText.toLowerCase();

        if (fullText.includes('failed to authenticate') || fullText.includes('invalid session') || fullText.includes('invalid token') || fullText.includes('not logged into your minecraft account') || fullText.includes('not logged into') || fullText.includes('not logged in')) {
            return {
                server: 'donut',
                serverName: 'DonutSMP',
                banId: null,
                banReason: 'Invalid SSID - authentication failed',
                unbanTime: null,
                ban: `Couldn't check ban:`,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        if (fullText.includes('outdated client') || fullText.includes('outdated server') || fullText.includes('use a minecraft version') || fullText.includes('version which is no longer supported') || fullText.includes('please use at least')) {
            return {
                server: 'donut',
                serverName: 'DonutSMP',
                banId: null,
                banReason: 'Server requires a newer Minecraft version (use 1.21.x)',
                unbanTime: null,
                ban: `Couldn't check ban:`,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        if (fullText.includes('you logged in from another location') || fullText.includes('already connected') || fullText.includes('already playing') || fullText.includes('you are already on this server')) {
            return {
                server: 'donut',
                serverName: 'DonutSMP',
                banId: null,
                banReason: 'online',
                unbanTime: null,
                ban: `Couldn't check ban:`,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        if (fullText.includes('whitelist') || fullText.includes('server is full') || fullText.includes('maintenance')) {
            return {
                server: 'donut',
                serverName: 'DonutSMP',
                banId: null,
                banReason: fullText.includes('whitelist') ? 'whitelisted' : 'server_full',
                unbanTime: null,
                ban: false,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        const timeMatch = fullText.match(/(\d+[dhms]\s*)+/);
        const isBanned = fullText.includes('ban') || fullText.includes('punishment') || fullText.includes('suspended') || fullText.includes('blacklisted') || fullText.includes('appeals') || fullText.includes('support.donutsmp.net') || !!timeMatch;

        if (isBanned) {
            const banId = getBanId(fullText) || (fullText.match(/punishment id: (#[a-z0-9]+)/i)?.[1] || null);
            let unbanTime = null;

            if (timeMatch) {
                unbanTime = parseBanTime(timeMatch[0]);
            }

            if (fullText.includes('permanent') || fullText.includes('permanently') || fullText.includes('never') || fullText.includes('blacklist')) {
                unbanTime = 'never';
            }

            let banReason = 'DonutSMP Ban';
            if (fullText.includes('botting') || fullText.includes('automated')) {
                banReason = 'Botting / Automated Access';
            } else if (fullText.includes('cheat') || fullText.includes('unfair') || fullText.includes('killaura') || fullText.includes('fly')) {
                banReason = 'Cheating / Unfair Advantage';
            } else if (fullText.includes('x-ray') || fullText.includes('xray')) {
                banReason = 'X-Ray';
            } else if (fullText.includes('irl trading') || fullText.includes('rwt') || fullText.includes('cross trading')) {
                banReason = 'IRL Trading';
            } else if (fullText.includes('alt') || fullText.includes('evading') || fullText.includes('ban evasion')) {
                banReason = 'Ban Evasion / Alt Account';
            } else if (fullText.includes('combat log') || fullText.includes('combatlogging')) {
                banReason = 'Combat Logging';
            } else if (fullText.includes('toxicity') || fullText.includes('chat') || fullText.includes('harassment')) {
                banReason = 'Chat Infraction / Toxicity';
            } else if (fullText.includes('security') || fullText.includes('compromised')) {
                banReason = 'Security / Compromised Account';
            } else {
                const reasonMatch = rawText.match(/reason:\s*([^\n\r.]+)/i);
                if (reasonMatch) {
                    banReason = reasonMatch[1].trim();
                }
            }

            return {
                server: 'donut',
                serverName: 'DonutSMP',
                banId,
                banReason,
                unbanTime,
                ban: true,
                username: profile?.name || null,
                uuid: profile?.id || null,
                banTimeFormatted: unbanTime === 'never' ?
                    'Permanent' :
                    (unbanTime ? new Date(unbanTime * 1000).toLocaleString() : 'Unknown duration')
            };
        }

        return {
            server: 'donut',
            serverName: 'DonutSMP',
            banId: null,
            banReason: null,
            unbanTime: null,
            ban: false,
            username: profile?.name || null,
            uuid: profile?.id || null
        };
    } catch (e) {
        return {
            server: 'donut',
            serverName: 'DonutSMP',
            banId: null,
            banReason: 'error',
            unbanTime: null,
            ban: `Couldn't check ban:`,
            username: profile?.name || null,
            uuid: profile?.id || null
        };
    }
}

function parseMcpvpBanReason(reason, profile) {
    try {
        const rawText = extractKickText(reason);
        const fullText = rawText.toLowerCase();

        if (fullText.includes('failed to authenticate') || fullText.includes('invalid session') || fullText.includes('invalid token') || fullText.includes('not logged into') || fullText.includes('not logged in') || fullText.includes('failed to verify username')) {
            return {
                server: 'mcpvp',
                serverName: 'MCPVP',
                banId: null,
                banReason: 'Invalid SSID - authentication failed',
                unbanTime: null,
                ban: `Couldn't check ban:`,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        if (fullText.includes('outdated client') || fullText.includes('outdated server') || fullText.includes('use a minecraft version') || fullText.includes('version which is no longer supported') || fullText.includes('please use at least')) {
            return {
                server: 'mcpvp',
                serverName: 'MCPVP',
                banId: null,
                banReason: 'Server requires Minecraft 1.21.2 - 1.21.11',
                unbanTime: null,
                ban: `Couldn't check ban:`,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        if (fullText.includes('you logged in from another location') || fullText.includes('already connected') || fullText.includes('already playing') || fullText.includes('you are already on this server')) {
            return {
                server: 'mcpvp',
                serverName: 'MCPVP',
                banId: null,
                banReason: 'online',
                unbanTime: null,
                ban: `Couldn't check ban:`,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        if (fullText.includes('whitelist') || fullText.includes('server is full') || fullText.includes('maintenance')) {
            return {
                server: 'mcpvp',
                serverName: 'MCPVP',
                banId: null,
                banReason: fullText.includes('whitelist') ? 'whitelisted' : 'server_full',
                unbanTime: null,
                ban: false,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }

        const isBanned = fullText.includes('ban') || fullText.includes('punishment') || fullText.includes('suspended') || fullText.includes('blacklisted') || fullText.includes('appeals') || fullText.includes('mcpvp.club/appeal');

        if (isBanned) {
            const banId = getBanId(fullText) || (fullText.match(/punishment id: (#[a-z0-9]+)/i)?.[1] || null);
            let unbanTime = null;

            const timeMatch = fullText.match(/(\d+[dhms]\s*)+/);
            if (timeMatch) {
                unbanTime = parseBanTime(timeMatch[0]);
            }

            if (fullText.includes('permanent') || fullText.includes('permanently') || fullText.includes('never') || fullText.includes('blacklist')) {
                unbanTime = 'never';
            }

            let banReason = 'MCPVP Ban';
            if (fullText.includes('cheat') || fullText.includes('unfair') || fullText.includes('killaura') || fullText.includes('fly')) {
                banReason = 'Cheating / Unfair Advantage';
            } else if (fullText.includes('botting') || fullText.includes('automated')) {
                banReason = 'Botting / Automated Access';
            } else if (fullText.includes('alt') || fullText.includes('evading') || fullText.includes('ban evasion')) {
                banReason = 'Ban Evasion / Alt Account';
            } else if (fullText.includes('security') || fullText.includes('compromised')) {
                banReason = 'Security / Compromised Account';
            } else {
                const reasonMatch = rawText.match(/reason:\s*([^\n\r.]+)/i);
                if (reasonMatch) {
                    banReason = reasonMatch[1].trim();
                }
            }

            return {
                server: 'mcpvp',
                serverName: 'MCPVP',
                banId,
                banReason,
                unbanTime,
                ban: true,
                username: profile?.name || null,
                uuid: profile?.id || null,
                banTimeFormatted: unbanTime === 'never' ?
                    'Permanent' :
                    (unbanTime ? new Date(unbanTime * 1000).toLocaleString() : 'Unknown duration')
            };
        }

        return {
            server: 'mcpvp',
            serverName: 'MCPVP',
            banId: null,
            banReason: null,
            unbanTime: null,
            ban: false,
            username: profile?.name || null,
            uuid: profile?.id || null
        };
    } catch (e) {
        return {
            server: 'mcpvp',
            serverName: 'MCPVP',
            banId: null,
            banReason: 'error',
            unbanTime: null,
            ban: `Couldn't check ban:`,
            username: profile?.name || null,
            uuid: profile?.id || null
        };
    }
}

async function attemptConnection(username, uuid, ssid, proxy, serverKey = 'hypixel') {
    const srv = SERVERS[serverKey] || SERVERS.hypixel;

    return new Promise((resolve, reject) => {
        console.log(`[BANCHECK] Connecting ${username} to ${srv.name} (${srv.host}:${srv.port}) ${proxy ? `via proxy ${proxy.ip}:${proxy.port}` : 'direct'}`);

        const botOptions = {
            host: srv.host,
            port: srv.port,
            version: srv.version,
            username: username,
            session: {
                accessToken: ssid,
                clientToken: uuid,
                selectedProfile: {
                    id: uuid,
                    name: username,
                },
            },
            auth: 'mojang',
            skipValidation: true,
            hideErrors: true
        };

        if (proxy && proxy.ip && proxy.port && proxy.username && proxy.password) {
            botOptions.connect = (client) => {
                const options = {
                    proxy: {
                        host: proxy.ip,
                        port: parseInt(proxy.port),
                        type: 5,
                        userId: proxy.username,
                        password: proxy.password
                    },
                    destination: {
                        host: srv.host,
                        port: srv.port
                    },
                    command: 'connect'
                };

                SocksClient.createConnection(options, (err, info) => {
                    if (err) {
                        if (finished) return;
                        finished = true;
                        cleanup();
                        console.log(`[BANCHECK] SOCKS connection failed for ${srv.name}: ${err.message}`);
                        let errmsg = err.message.toLowerCase();
                        if (errmsg.includes('authentication failed')) {
                            resolve({ status: 'proxyauth', username, uuid, server: serverKey });
                        } else if (errmsg.includes('getaddrinfo')) {
                            resolve({ status: 'proxyhost', username, uuid, server: serverKey });
                        } else if (errmsg.includes('invalid socks proxy details')) {
                            resolve({ status: 'proxy', username, uuid, server: serverKey });
                        } else if (errmsg.includes('not allowed') || errmsg.includes('notallowed')) {
                            resolve({ status: 'proxynotallowed', error: 'Proxy ruleset rejected connection (NotAllowed) - this proxy does not allow connecting to Minecraft servers', username, uuid, server: serverKey });
                        } else if (errmsg.includes('hostunreachable') || errmsg.includes('timed out') || errmsg.includes('timeout')) {
                            resolve({ status: 'proxydown', username, uuid, server: serverKey, error: err.message });
                        } else {
                            resolve({ status: 'proxyerror', error: err.message || 'Proxy connection failed', username, uuid, server: serverKey });
                        }
                        return;
                    }
                    client.setSocket(info.socket);
                    client.emit('connect');
                });
            };
        }

        let bot;
        let timeout;
        let finished = false;

        const cleanup = () => {
            if (timeout) clearTimeout(timeout);
            if (bot) {
                try { bot.end(); } catch {}
            }
        };

        try {
            bot = withSuppressedWarnings(() => mineflayer.createBot(botOptions)); // Suppress mineflayer deprecation warnings only during creation
        } catch (botErr) {
            cleanup();
            return reject(botErr);
        }

        // Failsafe timeout in case server doesn't respond.
        // IMPORTANT: resolving 'unbanned' here was a false-negative bug — if the
        // connection hangs (proxy unreachable / server blocked), the bot reported
        // the account as clean without ever verifying it. Report a timeout instead.
        const maxWaitTimeout = setTimeout(() => {
            if (!finished) {
                finished = true;
                cleanup();
                resolve({ status: 'timeout', error: 'Connection timed out (no response from server)', username, uuid, server: serverKey });
            }
        }, 12000);

        bot.once('spawn', () => {
            console.log(`[BANCHECK] ✅ ${username} successfully logged into ${srv.name}!`);
            timeout = setTimeout(() => {
                if (!finished) {
                    finished = true;
                    clearTimeout(maxWaitTimeout);
                    console.log(`[BANCHECK] ✅ ${username} stayed connected to ${srv.name} - UNBANNED`);
                    cleanup();
                    resolve({ status: 'unbanned', username, uuid, server: serverKey });
                }
            }, 500);
        });

        bot.on('kicked', (reason) => {
            if (!finished) {
                finished = true;
                clearTimeout(maxWaitTimeout);
                console.log(`[BANCHECK] ❌ ${username} was KICKED from ${srv.name}:`);
                console.log(`[BANCHECK] Kick reason: ${JSON.stringify(reason)}`);
                cleanup();
                resolve({ status: 'kicked', reason, username, uuid, server: serverKey });
            }
        });

        bot.on('end', () => {
            console.log(`[BANCHECK] Connection ended for ${username} on ${srv.name}`);
        });

        bot.on('error', (error) => {
            if (!finished) {
                finished = true;
                clearTimeout(maxWaitTimeout);
                console.log(`[BANCHECK] ❌ Bot error on ${srv.name} for ${username}: ${error.message}`);
                cleanup();
                reject(error);
            }
        });
    });
}

async function getProfileData(sessionId, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        // node-fetch v2 ignores the `timeout` option, so enforce a real timeout
        // with AbortController to avoid hanging the whole ban check.
        const controller = new AbortController();
        const fetchTimer = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch('https://api.minecraftservices.com/minecraft/profile', {
                headers: {
                    'Authorization': `Bearer ${sessionId}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });

            if (!response.ok) {
                if (response.status === 404) return null;
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 500));
                    continue;
                }
                return null;
            }
            const data = await response.json();
            return data?.id && data?.name ? { id: data.id, name: data.name } : null;
        } catch (error) {
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500));
                continue;
            }
            return null;
        } finally {
            clearTimeout(fetchTimer);
        }
    }
    return null;
}

async function banchecker(username, uuid, ssid, serverKey = 'hypixel', retries = 1) {
    let lastError = null;
    let lastProxyError = null;
    let lastDirectError = null;

    const allowDirect = config.bancheckdirectfallback !== false && config.bancheckdirectfallback !== 'false';

    // Build an ordered list of connection targets:
    // 1. Every configured proxy (one pass, round-robin starting at the shared cursor).
    // 2. A direct connection as the final fallback (when enabled).
    const targets = [];
    if (proxies.length > 0) {
        for (let i = 0; i < proxies.length; i++) {
            targets.push(proxies[(currentProxyIndex + i) % proxies.length]);
        }
        currentProxyIndex = (currentProxyIndex + proxies.length) % proxies.length;
    }
    if (allowDirect) {
        targets.push(null);
    }
    if (targets.length === 0) {
        targets.push(null);
    }

    for (const proxy of targets) {
        console.log(`[BANCHECK] Trying ${serverKey} with ${proxy ? `proxy ${proxy.ip}:${proxy.port}` : 'direct connection'}`);

        try {
            const result = await attemptConnection(username, uuid, ssid, proxy, serverKey);

            if (result.status === 'unbanned') {
                return { status: 'unbanned', username, uuid, server: serverKey };
            }

            if (result.status === 'kicked') {
                return result;
            }

            if (['proxyauth', 'proxyhost', 'proxy', 'proxydown', 'proxyerror', 'proxynotallowed', 'timeout'].includes(result.status)) {
                if (proxy) {
                    lastProxyError = result;
                } else {
                    lastDirectError = result;
                }
                lastError = new Error(result.error || result.status);
                console.log(`[BANCHECK] ${serverKey} attempt via ${proxy ? 'proxy' : 'direct'} failed (${result.status}) - trying next target...`);
                continue;
            }

            lastError = new Error('Unknown connection result');
        } catch (error) {
            lastError = error;

            if (error.message && error.message.toLowerCase().includes('insufficient')) {
                return {
                    status: 'error',
                    error: 'Multiplayer is off',
                    username,
                    uuid,
                    server: serverKey
                };
            }

            // Record a thrown error from the direct attempt so it is reported
            // instead of a stale proxy error further down.
            if (!proxy) {
                lastDirectError = { status: 'error', error: error.message, username, uuid, server: serverKey };
            }

            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    // Prefer the most relevant failure: a direct-connection outcome is more
    // informative than a proxy rejection that happened before the fallback.
    if (lastDirectError) {
        return lastDirectError;
    }

    if (lastProxyError) {
        return lastProxyError;
    }

    throw lastError || new Error(`All connection attempts failed for ${serverKey}`);
}

const { logger } = require("../secure/aliasHelper");

const BAN_STATUSES = Object.freeze({
  BANNED: "BANNED",
  NOT_BANNED: "NOT_BANNED",
  UNKNOWN: "UNKNOWN",
  ERROR: "ERROR"
});

class BanCheckResult {
  constructor(data = {}) {
    this.status = data.status in BAN_STATUSES ? data.status : BAN_STATUSES.UNKNOWN;
    this.reason = data.reason || null;
    this.source = data.source || "unknown_source";
    this.checkedAt = data.checkedAt || new Date().toISOString();
    this.rawStatus = data.rawStatus || null;
    this.banId = data.banId || null;
    this.unbanTime = data.unbanTime || null;
  }

  toJSON() {
    return {
      status: this.status,
      reason: this.reason,
      source: this.source,
      checkedAt: this.checkedAt,
      rawStatus: this.rawStatus,
      banId: this.banId,
      unbanTime: this.unbanTime
    };
  }
}

class BanChecker {
  async check(playerIdentifier) {
    throw new Error("BanChecker.check() must be implemented by subclass");
  }
}

class HypixelBanChecker extends BanChecker {
  constructor(options = {}) {
    super();
    this.cache = new Map();
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
  }

  getCache(key) {
    const entry = this.cache.get(key.toLowerCase());
    if (entry && entry.expiresAt > Date.now()) {
      return entry.result;
    }
    this.cache.delete(key.toLowerCase());
    return null;
  }

  setCache(key, result) {
    if (result.status === BAN_STATUSES.BANNED || result.status === BAN_STATUSES.NOT_BANNED) {
      this.cache.set(key.toLowerCase(), {
        result,
        expiresAt: Date.now() + this.cacheTtlMs
      });
    }
  }

  evaluateKickReason(rawText) {
    if (!rawText || typeof rawText !== "string") {
      return null;
    }

    const text = rawText.toLowerCase();

    const isBan =
      text.includes("banned") ||
      text.includes("permanently blocked") ||
      text.includes("temporarily banned") ||
      text.includes("suspicious activity has been detected") ||
      text.includes("security alert") ||
      text.includes("unfair game advantages") ||
      text.includes("cheating through the use") ||
      text.includes("ban id:") ||
      text.includes("punishment id:");

    if (isBan) {
      const banIdMatch = text.match(/(?:ban|punishment|block)\s*id:\s*(#[a-z0-9]+|[a-z0-9]{8})/i);
      const banId = banIdMatch ? (banIdMatch[1].startsWith("#") ? banIdMatch[1] : `#${banIdMatch[1]}`) : null;

      let reason = "Banned from Hypixel";
      if (text.includes("security alert") || text.includes("suspicious activity")) {
        reason = "Security Alert";
      } else if (text.includes("unfair game advantages") || text.includes("cheating")) {
        reason = "Cheating / Unfair Advantages";
      } else if (text.includes("boosting")) {
        reason = "Boosting";
      }

      return {
        status: BAN_STATUSES.BANNED,
        reason,
        banId,
        rawStatus: rawText
      };
    }

    if (
      text.includes("whitelist") ||
      text.includes("server is full") ||
      text.includes("maintenance") ||
      text.includes("restarting") ||
      text.includes("you are already connected") ||
      text.includes("logged in from another location")
    ) {
      return {
        status: BAN_STATUSES.NOT_BANNED,
        reason: "Clean (server kicked for connection/maintenance reason)",
        rawStatus: rawText
      };
    }

    return null;
  }

  async check(playerIdentifier, options = {}) {
    if (!playerIdentifier || typeof playerIdentifier !== "string") {
      return new BanCheckResult({
        status: BAN_STATUSES.ERROR,
        reason: "Invalid player identifier provided",
        source: "hypixel"
      });
    }

    const cleanIdentifier = playerIdentifier.trim();
    const cached = this.getCache(cleanIdentifier);
    if (cached) {
      return cached;
    }

    try {
      if (options.mockKickReason) {
        const kickEval = this.evaluateKickReason(options.mockKickReason);
        if (kickEval) {
          const res = new BanCheckResult({
            ...kickEval,
            source: "hypixel_protocol"
          });
          this.setCache(cleanIdentifier, res);
          return res;
        }
      }

      // Resolve player via Mojang
      let profile = null;
      try {
        const isUuid = /^[0-9a-f]{32}$/i.test(cleanIdentifier) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanIdentifier);
        const url = isUuid
          ? `https://sessionserver.mojang.com/session/minecraft/profile/${cleanIdentifier.replace(/-/g, "")}`
          : `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(cleanIdentifier)}`;
        const res = await axios.get(url, { timeout: 4000, validateStatus: (s) => s >= 200 && s < 400 });
        if (res?.data?.id && res?.data?.name) {
          profile = { uuid: res.data.id.replace(/-/g, ""), username: res.data.name };
        }
      } catch (_) {}

      if (!profile && !options.mockKickReason) {
        return new BanCheckResult({
          status: BAN_STATUSES.UNKNOWN,
          reason: "Player profile could not be resolved from Mojang",
          source: "mojang_profile_resolver"
        });
      }

      if (profile?.uuid) {
        try {
          const mirror = await axios.get(`https://api.slothpixel.me/api/players/${profile.uuid}`, {
            timeout: 4000,
            validateStatus: (s) => s >= 200 && s < 500
          });
          if (mirror.status === 200 && mirror.data?.username) {
            const result = new BanCheckResult({
              status: BAN_STATUSES.NOT_BANNED,
              reason: "Player active on public Hypixel database",
              source: "hypixel_mirrored_api",
              rawStatus: { username: mirror.data.username, rank: mirror.data.rank }
            });
            this.setCache(cleanIdentifier, result);
            return result;
          }
        } catch (_) {}
      }

      return new BanCheckResult({
        status: BAN_STATUSES.UNKNOWN,
        reason: "Insufficient data from available sources to determine ban status",
        source: "hypixel_multi_source"
      });
    } catch (err) {
      return new BanCheckResult({
        status: BAN_STATUSES.ERROR,
        reason: `Connection/Internal error: ${err.message}`,
        source: "hypixel_error_handler",
        rawStatus: { error: err.message }
      });
    }
  }
}

const hypixelBanChecker = new HypixelBanChecker();
const checkHypixelBan = (player, options) => hypixelBanChecker.check(player, options);

async function bancheckSingle(profile, ssid, serverKey = 'hypixel') {
    const srvName = SERVERS[serverKey]?.name || serverKey;

    if (serverKey === 'hypixel') {
        try {
            let connResult = null;
            try {
                connResult = await banchecker(profile.name, profile.id, ssid, serverKey, 1);
            } catch (connErr) {
                // Connection or network error is NEVER a ban
                return {
                    status: BAN_STATUSES.ERROR,
                    server: serverKey,
                    serverName: srvName,
                    ban: null,
                    banReason: connErr.message,
                    source: "hypixel_connection_error",
                    checkedAt: new Date().toISOString(),
                    rawStatus: { error: connErr.message },
                    username: profile.name,
                    uuid: profile.id
                };
            }

            if (connResult.status === 'unbanned') {
                return {
                    status: BAN_STATUSES.NOT_BANNED,
                    server: serverKey,
                    serverName: srvName,
                    ban: false,
                    banReason: "Verified connected to server (clean)",
                    source: "hypixel_protocol",
                    checkedAt: new Date().toISOString(),
                    rawStatus: "unbanned",
                    username: profile.name,
                    uuid: profile.id
                };
            }

            if (['proxyauth', 'proxyhost', 'proxy', 'proxydown', 'proxyerror', 'proxynotallowed', 'timeout', 'error'].includes(connResult.status)) {
                return {
                    status: BAN_STATUSES.ERROR,
                    server: serverKey,
                    serverName: srvName,
                    ban: null,
                    banReason: connResult.error || `Proxy/Connection error: ${connResult.status}`,
                    source: "hypixel_proxy_handler",
                    checkedAt: new Date().toISOString(),
                    rawStatus: connResult.status,
                    username: profile.name,
                    uuid: profile.id
                };
            }

            // When kicked, use parseHypixelBanReason which has complete ban pattern matching
            if (connResult.status === 'kicked' && connResult.reason) {
                return parseHypixelBanReason(connResult.reason, profile);
            }

            // Fallback: no kick data available, use HypixelBanChecker (API-based check)
            const checkResult = await hypixelBanChecker.check(profile.id || profile.name);

            return {
                status: checkResult.status,
                reason: checkResult.reason,
                source: checkResult.source,
                checkedAt: checkResult.checkedAt,
                rawStatus: checkResult.rawStatus,
                ban: checkResult.status === BAN_STATUSES.BANNED ? true : (checkResult.status === BAN_STATUSES.NOT_BANNED ? false : null),
                banReason: checkResult.reason,
                banId: checkResult.banId,
                unbanTime: checkResult.unbanTime,
                username: profile.name,
                uuid: profile.id,
                server: serverKey,
                serverName: srvName
            };
        } catch (err) {
            return {
                status: BAN_STATUSES.ERROR,
                reason: err.message,
                source: "hypixel_error_handler",
                checkedAt: new Date().toISOString(),
                rawStatus: { error: err.message },
                ban: null,
                banReason: err.message,
                username: profile.name,
                uuid: profile.id,
                server: serverKey,
                serverName: srvName
            };
        }
    }

    try {
        const result = await banchecker(profile.name, profile.id, ssid, serverKey, 1);
        console.log(`[BANCHECK] [${srvName}] Result: ${JSON.stringify(result)}`);

        if (result.status === 'online') {
            return {
                status: BAN_STATUSES.UNKNOWN,
                server: serverKey,
                serverName: srvName,
                banReason: 'User is online!',
                ban: null,
                username: profile.name,
                uuid: profile.id
            };
        } else if (result.status === 'unbanned') {
            return {
                status: BAN_STATUSES.NOT_BANNED,
                server: serverKey,
                serverName: srvName,
                ban: false,
                username: profile.name,
                uuid: profile.id
            };
        } else if (result.status === 'kicked') {
            if (serverKey === 'donut') {
                return parseDonutBanReason(result.reason, profile);
            }
            if (serverKey === 'mcpvp') {
                return parseMcpvpBanReason(result.reason, profile);
            }
            return parseHypixelBanReason(result.reason, profile);
        } else if (result.status === 'proxyauth') {
            return {
                status: BAN_STATUSES.ERROR,
                server: serverKey,
                serverName: srvName,
                banReason: "Invalid proxy authentication (username/password)",
                ban: null,
                username: profile.name,
                uuid: profile.id
            };
        } else if (result.status === 'proxyhost') {
            return {
                status: BAN_STATUSES.ERROR,
                server: serverKey,
                serverName: srvName,
                banReason: "Invalid proxy host (getaddrinfo error)",
                ban: null,
                username: profile.name,
                uuid: profile.id
            };
        } else if (result.status === 'proxy') {
            return {
                status: BAN_STATUSES.ERROR,
                server: serverKey,
                serverName: srvName,
                banReason: "Invalid proxy details",
                ban: null,
                username: profile.name,
                uuid: profile.id
            };
        } else if (result.status === 'proxydown') {
            return {
                status: BAN_STATUSES.ERROR,
                server: serverKey,
                serverName: srvName,
                banReason: "Proxy is down!",
                ban: null,
                username: profile.name,
                uuid: profile.id
            };
        } else if (result.status === 'proxyerror') {
            return {
                status: BAN_STATUSES.ERROR,
                server: serverKey,
                serverName: srvName,
                banReason: result.error || "General proxy error",
                ban: null,
                username: profile.name,
                uuid: profile.id
            };
        } else if (result.status === 'proxynotallowed') {
            return {
                status: BAN_STATUSES.ERROR,
                server: serverKey,
                serverName: srvName,
                banReason: result.error || "Proxy ruleset rejected the connection (NotAllowed)",
                ban: null,
                username: profile.name,
                uuid: profile.id
            };
        } else if (result.status === 'timeout') {
            return {
                status: BAN_STATUSES.ERROR,
                server: serverKey,
                serverName: srvName,
                banReason: result.error || 'Connection timed out',
                ban: null,
                username: profile.name,
                uuid: profile.id
            };
        } else if (result.status === 'error') {
            return {
                status: BAN_STATUSES.ERROR,
                server: serverKey,
                serverName: srvName,
                banReason: result.error || 'error',
                ban: null,
                username: profile.name,
                uuid: profile.id
            };
        }
    } catch (error) {
        return {
            status: BAN_STATUSES.ERROR,
            server: serverKey,
            serverName: srvName,
            ban: null,
            banReason: error.message,
            username: profile.name,
            uuid: profile.id
        };
    }
}

async function bancheck(ssid, targetServer = 'hypixel') {
    console.log(`[BANCHECK] Starting ban check for SSID: ${ssid.substring(0, 10)}... (Server: ${targetServer})`);

    const profile = await getProfileData(ssid);
    if (!profile) {
        console.log(`[BANCHECK] Failed to get profile data - invalid SSID`);
        return {
            banReason: 'invalid_token',
            ban: `Couldn't check ban:`,
            username: null,
            uuid: null
        };
    }

    console.log(`[BANCHECK] Profile found: ${profile.name} (${profile.id})`);

    if (targetServer === 'both' || targetServer === 'all') {
        const hypixelResult = await bancheckSingle(profile, ssid, 'hypixel');
        await new Promise(r => setTimeout(r, 1200));
        const donutResult = await bancheckSingle(profile, ssid, 'donut');
        await new Promise(r => setTimeout(r, 1200));
        const mcpvpResult = await bancheckSingle(profile, ssid, 'mcpvp');

        return {
            username: profile.name,
            uuid: profile.id,
            server: 'all',
            hypixel: hypixelResult,
            donut: donutResult,
            mcpvp: mcpvpResult,
            // Backwards compatibility for Hypixel at top-level
            ban: hypixelResult.ban,
            banReason: hypixelResult.banReason,
            banId: hypixelResult.banId,
            unbanTime: hypixelResult.unbanTime,
            banTimeFormatted: hypixelResult.banTimeFormatted,
            // Donut properties
            donutBan: donutResult.ban,
            donutBanReason: donutResult.banReason,
            donutBanId: donutResult.banId,
            donutUnbanTime: donutResult.unbanTime,
            donutBanTimeFormatted: donutResult.banTimeFormatted,
            // MCPVP properties
            mcpvpBan: mcpvpResult.ban,
            mcpvpBanReason: mcpvpResult.banReason,
            mcpvpBanId: mcpvpResult.banId,
            mcpvpUnbanTime: mcpvpResult.unbanTime,
            mcpvpBanTimeFormatted: mcpvpResult.banTimeFormatted
        };
    }

    if (targetServer === 'donut') {
        const donutResult = await bancheckSingle(profile, ssid, 'donut');
        return {
            ...donutResult,
            donutBan: donutResult.ban,
            donutBanReason: donutResult.banReason,
            donutBanId: donutResult.banId,
            donutUnbanTime: donutResult.unbanTime,
            donutBanTimeFormatted: donutResult.banTimeFormatted
        };
    }

    if (targetServer === 'mcpvp') {
        const mcpvpResult = await bancheckSingle(profile, ssid, 'mcpvp');
        return {
            ...mcpvpResult,
            mcpvpBan: mcpvpResult.ban,
            mcpvpBanReason: mcpvpResult.banReason,
            mcpvpBanId: mcpvpResult.banId,
            mcpvpUnbanTime: mcpvpResult.unbanTime,
            mcpvpBanTimeFormatted: mcpvpResult.banTimeFormatted
        };
    }

    return await bancheckSingle(profile, ssid, 'hypixel');
}

async function bancheckHypixel(ssid) {
    return bancheck(ssid, 'hypixel');
}

async function bancheckDonut(ssid) {
    return bancheck(ssid, 'donut');
}

async function bancheckMcpvp(ssid) {
    return bancheck(ssid, 'mcpvp');
}

async function bancheckAll(ssid) {
    return bancheck(ssid, 'all');
}

module.exports = {
    bancheck,
    bancheckHypixel,
    bancheckDonut,
    bancheckMcpvp,
    bancheckAll,
    SERVERS,
    BAN_STATUSES,
    BanCheckResult,
    BanChecker,
    HypixelBanChecker,
    hypixelBanChecker,
    checkHypixelBan
};