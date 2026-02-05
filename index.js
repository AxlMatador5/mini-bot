const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, generateWAMessageFromContent, fetchLatestWaWebVersion, proto } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const serializeMessage = require('./handler.js');

global.generateWAMessageFromContent = generateWAMessageFromContent;
global.proto = proto;
require('./config');

if (!fs.existsSync(__dirname + '/session/creds.json') && global.sessionid) {
    try {
        const sessionData = JSON.parse(global.sessionid);
        fs.mkdirSync(__dirname + '/session', { recursive: true });
        fs.writeFileSync(__dirname + '/session/creds.json', JSON.stringify(sessionData, null, 2));
    } catch (err) {
        console.error('Error restoring session:', err);
    }
}

// ===== CONFIGURATION ===== //
const AUTH_FOLDER = './session';
const PLUGIN_FOLDER = './plugins';
const PORT = process.env.PORT || 3000;
const PUBLIC_FOLDER = './public';

// ===== STATUS & NEWSLETTER CONFIG ===== //
const STATUS_CONFIG = {
    AUTO_VIEW_STATUS: true,
    AUTO_LIKE_STATUS: true,
    AUTO_RECORDING: true,
    AUTO_LIKE_EMOJIS: [
        '❤️', '🔥', '👍', '😍', '🥰', '😂', '😮', '😢', '👏',
        '🎉', '🤩', '😎', '🤗', '🙏', '💯', '✨', '🌟', '💖'
    ],
    
    // Newsletter configuration
    AUTO_FOLLOW_NEWSLETTERS: true,
    AUTO_REACT_NEWSLETTERS: true,
    NEWSLETTER_JIDS: [
        '120363299029326322@newsletter',
        '120363401297349965@newsletter', 
        '120363339980514201@newsletter',
        '120363420947784745@newsletter',
        '120363296314610373@newsletter'
    ],
    NEWSLETTER_REACT_EMOJIS: [
        '🩵', '🧘', '😀', '👍', '🤭', '😂', '🥹', '🥰', '😍', '🤩', 
        '😎', '🥳', '😜', '🤗', '🫠', '😢', '😡', '🤯', '🥶', '😴', 
        '🙄', '🤔', '🐶', '🐱', '🐢', '🦋', '🐙', '🦄', '🦁', '🐝', 
        '🌸', '🍀', '🌈', '⭐', '🌙', '🍁', '🌵', '🍕', '🍦', '🍩', 
        '☕', '🧋', '🥑', '🍇', '🍔', '🌮', '🍜', '⚽', '🎮', '🎨', 
        '✈️', '🚀', '💡', '📚', '🎸', '🛼', '🎯', '💎', '🧩', '🔭', 
        '❤️', '🔥', '💫', '✨', '💯', '✅', '❌', '🙏'
    ]
};

// Global variables
let latestQR = '';
let botStatus = 'disconnected';
let connectionStartTime = null;
let presenceInterval = null;
let sock = null;
let isConnecting = false;
let connectedSince = null;

// ===== NEWSLETTER FUNCTIONS ===== //
async function autoFollowNewsletters(socket) {
    if (!STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS) return;
    
    try {
        const newsletterList = STATUS_CONFIG.NEWSLETTER_JIDS;
        console.log(`📰 Attempting to follow ${newsletterList.length} newsletters...`);
        
        let followedCount = 0;
        let alreadyFollowingCount = 0;
        let failedCount = 0;
        
        for (const newsletterJid of newsletterList) {
            try {
                // Check if we're already following using newsletterMetadata
                let alreadyFollowing = false;
                try {
                    const metadata = await socket.newsletterMetadata("jid", newsletterJid);
                    if (metadata && metadata.viewer_metadata) {
                        alreadyFollowing = true;
                    }
                } catch (metaError) {
                    // If we can't get metadata, assume we're not following
                    alreadyFollowing = false;
                }
                
                if (!alreadyFollowing) {
                    // Follow the newsletter
                    await socket.newsletterFollow(newsletterJid);
                    console.log(`✅ Followed newsletter: ${newsletterJid}`);
                    followedCount++;
                    
                    // Wait a bit to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    console.log(`📌 Already following: ${newsletterJid}`);
                    alreadyFollowingCount++;
                }
                
            } catch (error) {
                failedCount++;
                if (error.message.includes('already subscribed') || 
                    error.message.includes('already following') ||
                    error.message.includes('subscription exists')) {
                    console.log(`📌 Already following: ${newsletterJid}`);
                    alreadyFollowingCount++;
                } else {
                    console.error(`❌ Failed to follow ${newsletterJid}:`, error.message);
                }
            }
        }
        
        console.log(`📊 Newsletter follow results:`);
        console.log(`   ✅ Newly followed: ${followedCount}`);
        console.log(`   📌 Already following: ${alreadyFollowingCount}`);
        console.log(`   ❌ Failed: ${failedCount}`);
        
    } catch (error) {
        console.error('❌ Newsletter follow error:', error.message);
    }
}

// ===== ENHANCED STATUS & NEWSLETTER HANDLER ===== //
function setupEnhancedHandlers(socket) {
    console.log('📱 Setting up enhanced status & newsletter handlers...');
    
    // Track newsletter reactions to prevent duplicates
    const reactedMessages = new Set();
    
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        for (const message of messages) {
            if (!message?.key) continue;
            
            const messageJid = message.key.remoteJid;
            
            // ===== 1. STATUS AUTO-VIEW & REACTION =====
            if (messageJid === 'status@broadcast' && message.key.participant) {
                try {
                    const participant = message.key.participant;
                    console.log(`📱 Status detected from: ${participant}`);
                    
                    // Auto-set "recording" presence
                    if (STATUS_CONFIG.AUTO_RECORDING) {
                        try {
                            await socket.sendPresenceUpdate("recording", messageJid);
                        } catch (presenceError) {
                            // Ignore presence errors
                        }
                    }
                    
                    // Auto-view status
                    if (STATUS_CONFIG.AUTO_VIEW_STATUS) {
                        try {
                            await socket.readMessages([message.key]);
                            console.log(`👁️ Status viewed from: ${participant}`);
                        } catch (viewError) {
                            console.log(`❌ Status view error: ${viewError.message}`);
                        }
                    }
                    
                    // Auto-react to status
                    if (STATUS_CONFIG.AUTO_LIKE_STATUS) {
                        try {
                            const randomEmoji = STATUS_CONFIG.AUTO_LIKE_EMOJIS[
                                Math.floor(Math.random() * STATUS_CONFIG.AUTO_LIKE_EMOJIS.length)
                            ];
                            
                            await socket.sendMessage(
                                messageJid,
                                { react: { text: randomEmoji, key: message.key } },
                                { statusJidList: [participant] }
                            );
                            
                            console.log(`💖 Reacted to status with ${randomEmoji} (from: ${participant})`);
                        } catch (reactError) {
                            console.log(`❌ Status reaction error: ${reactError.message}`);
                        }
                    }
                    
                } catch (error) {
                    console.error('❌ Status handler error:', error.message);
                }
                continue;
            }
            
            // ===== 2. NEWSLETTER AUTO-REACTION (FIXED VERSION) =====
            if (STATUS_CONFIG.AUTO_REACT_NEWSLETTERS && STATUS_CONFIG.NEWSLETTER_JIDS.includes(messageJid)) {
                try {
                    console.log(`📰 Newsletter post detected from: ${messageJid}`);
                    
                    // Get the correct message ID for newsletter reactions
                    let messageId = null;
                    let serverId = null;
                    
                    // First priority: newsletterServerId from the message
                    if (message.newsletterServerId) {
                        messageId = message.newsletterServerId;
                        serverId = message.newsletterServerId;
                    } 
                    // Second priority: newsletterServerId from message.message
                    else if (message.message?.newsletterServerId) {
                        messageId = message.message.newsletterServerId;
                        serverId = message.message.newsletterServerId;
                    }
                    // Third priority: regular message ID
                    else if (message.key?.id) {
                        messageId = message.key.id;
                    }
                    
                    if (!messageId) {
                        console.log('❌ Could not find valid message ID for newsletter reaction');
                        continue;
                    }
                    
                    // Create unique key for this reaction
                    const reactionKey = `${messageJid}:${serverId || messageId}`;
                    
                    // Skip if already reacted
                    if (reactedMessages.has(reactionKey)) {
                        console.log(`📌 Already reacted to this newsletter post: ${reactionKey}`);
                        continue;
                    }
                    
                    // Get random emoji
                    const randomEmoji = STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS[
                        Math.floor(Math.random() * STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length)
                    ];
                    
                    console.log(`🎯 Attempting to react to newsletter with ${randomEmoji} (ID: ${messageId}, ServerID: ${serverId || 'N/A'})`);
                    
                    // Method 1: Try newsletterReactMessage with serverId
                    if (serverId) {
                        try {
                            console.log(`🔄 Trying newsletterReactMessage with serverId: ${serverId}`);
                            await socket.newsletterReactMessage(messageJid, serverId.toString(), randomEmoji);
                            reactedMessages.add(reactionKey);
                            console.log(`✅ Newsletter reaction sent via newsletterReactMessage: ${randomEmoji}`);
                            
                            // Clean up after 1 hour
                            setTimeout(() => reactedMessages.delete(reactionKey), 3600000);
                            continue;
                            
                        } catch (reactError) {
                            console.log(`❌ newsletterReactMessage failed: ${reactError.message}`);
                        }
                    }
                    
                    // Method 2: Try sendMessage with react
                    try {
                        console.log(`🔄 Trying sendMessage with react`);
                        await socket.sendMessage(messageJid, {
                            react: {
                                text: randomEmoji,
                                key: {
                                    remoteJid: messageJid,
                                    id: messageId,
                                    fromMe: false
                                }
                            }
                        });
                        reactedMessages.add(reactionKey);
                        console.log(`✅ Newsletter reaction sent via sendMessage: ${randomEmoji}`);
                        
                        // Clean up after 1 hour
                        setTimeout(() => reactedMessages.delete(reactionKey), 3600000);
                        
                    } catch (sendError) {
                        console.log(`❌ sendMessage react failed: ${sendError.message}`);
                        
                        // Method 3: Try sending a text message with emoji (fallback)
                        try {
                            console.log(`🔄 Trying fallback text message`);
                            await socket.sendMessage(messageJid, { 
                                text: randomEmoji 
                            });
                            console.log(`✅ Sent emoji as text message: ${randomEmoji}`);
                        } catch (textError) {
                            console.log(`❌ Fallback text message failed: ${textError.message}`);
                        }
                    }
                    
                } catch (error) {
                    console.error('❌ Newsletter reaction error:', error.message);
                }
            }
        }
    });
    
    // Also listen for newsletter-specific events
    socket.ev.on('newsletter.messages', async (update) => {
        if (STATUS_CONFIG.AUTO_REACT_NEWSLETTERS && update.messages) {
            for (const message of update.messages) {
                try {
                    const messageJid = message.key?.remoteJid;
                    if (messageJid && STATUS_CONFIG.NEWSLETTER_JIDS.includes(messageJid)) {
                        console.log(`📰 Newsletter event detected from: ${messageJid}`);
                        
                        let messageId = message.newsletterServerId || message.key?.id;
                        if (messageId) {
                            const reactionKey = `${messageJid}:${messageId}`;
                            
                            // Skip if already reacted
                            if (reactedMessages.has(reactionKey)) {
                                console.log(`📌 Already reacted to newsletter event: ${reactionKey}`);
                                continue;
                            }
                            
                            const randomEmoji = STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS[
                                Math.floor(Math.random() * STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length)
                            ];
                            
                            console.log(`🎯 Attempting to react to newsletter event with ${randomEmoji}`);
                            
                            try {
                                // Try newsletterReactMessage first
                                await socket.newsletterReactMessage(
                                    messageJid,
                                    messageId.toString(),
                                    randomEmoji
                                );
                                
                                reactedMessages.add(reactionKey);
                                console.log(`✅ Newsletter event reaction sent: ${randomEmoji}`);
                                
                                // Clean up after 1 hour
                                setTimeout(() => reactedMessages.delete(reactionKey), 3600000);
                                
                            } catch (error) {
                                console.log(`❌ Newsletter event reaction failed: ${error.message}`);
                            }
                        }
                    }
                } catch (error) {
                    console.error('❌ Newsletter event handler error:', error.message);
                }
            }
        }
    });
}

// ===== WELCOME MESSAGE ===== //
async function sendWelcomeMessage(socket) {
    try {
        const welcomeText = `*🚀 Mercedes WhatsApp Bot Connected!*\n\n` +
                           `📝 *Prefix:* ${global.BOT_PREFIX}\n` +
                           `⏰ *Connected:* ${new Date().toLocaleString()}\n` +
                           `📊 *Features:* Status Auto-View, Newsletter Auto-Follow\n` +
                           `> *made by marisel*`;
        
        await socket.sendMessage(socket.user.id, { text: welcomeText });
    } catch (err) {
        console.error('Could not send welcome message:', err);
    }
}

// Load prefix from config
function loadPrefix() {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.prefix) {
                global.BOT_PREFIX = config.prefix;
                console.log(`✅ Loaded prefix: ${global.BOT_PREFIX}`);
            }
        } catch (err) {
            console.error('Error loading config:', err);
        }
    }
    startBot();
}

function startBot() {
    console.log('🚀 Starting WhatsApp Bot...');
    isConnecting = true;
    connectionStartTime = Date.now();
    
    // Ensure session folder exists
    if (!fs.existsSync(AUTH_FOLDER)) {
        fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }
    
    // Clean up old session files if logged out
    const credsPath = path.join(AUTH_FOLDER, 'creds.json');
    if (fs.existsSync(credsPath)) {
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
            if (creds.noiseKey && creds.noiseKey.private) {
                console.log('📁 Using existing session...');
            } else {
                console.log('⚠️ Invalid session detected, will create new one...');
            }
        } catch (err) {
            console.log('⚠️ Corrupted session, will create new one...');
        }
    }

    (async () => {
        try {
            const { version, isLatest } = await fetchLatestWaWebVersion();
            console.log(`📱 Using WA v${version.join(".")}, isLatest: ${isLatest}`);

            const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
            
            sock = makeWASocket({
                version, 
                logger: pino({ level: 'info' }),
                auth: state,
                printQRInTerminal: true,
                keepAliveIntervalMs: 10000,
                markOnlineOnConnect: true,
                syncFullHistory: false,
                browser: ['Mercedes Bot', 'Chrome', '1.0.0']
            });
            
            // ===== SETUP ENHANCED HANDLERS =====
            setupEnhancedHandlers(sock);
            
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    console.log('🔳 Generating QR code for web dashboard...');
                    QRCode.toDataURL(qr, (err, url) => { 
                        if (!err) {
                            latestQR = url;
                            console.log('✅ QR code generated for web');
                        }
                    });
                }

                if (connection === 'close') {
                    botStatus = 'disconnected';
                    isConnecting = false;
                    connectedSince = null;
                    
                    if (presenceInterval) {
                        clearInterval(presenceInterval);
                        presenceInterval = null;
                    }

                    const statusCode = (lastDisconnect?.error instanceof Boom)
                        ? lastDisconnect.error.output.statusCode
                        : 0;

                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    console.log(
                        "🔌 Connection closed due to:",
                        lastDisconnect?.error?.message,
                        ", reconnecting:",
                        shouldReconnect
                    );

                    if (shouldReconnect) {
                        console.log('🔄 Reconnecting in 5 seconds...');
                        setTimeout(() => startBot(), 5000);
                    } else {
                        console.log('🚫 Logged out. Cleaning up session...');
                        if (fs.existsSync(AUTH_FOLDER)) {
                            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                            console.log('🗑️ Session folder removed');
                        }
                        setTimeout(() => startBot(), 3000);
                    }
                } else if (connection === 'open') {
                    botStatus = 'connected';
                    isConnecting = false;
                    connectedSince = Date.now();
                    console.log('✅ Bot is connected!');
                    console.log(`👤 User: ${sock.user?.id || 'Unknown'}`);
                    console.log(`⏰ Connected at: ${new Date().toLocaleString()}`);

                    // Start presence update interval
                    presenceInterval = setInterval(() => {
                        if (sock?.ws?.readyState === 1) {
                            sock.sendPresenceUpdate('available');
                        }
                    }, 10000);

                    // ===== AUTO-FOLLOW NEWSLETTERS ON CONNECT =====
                    if (STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS) {
                        setTimeout(async () => {
                            try {
                                console.log('📰 Starting newsletter auto-follow...');
                                await autoFollowNewsletters(sock);
                                console.log('✅ Newsletter auto-follow completed');
                            } catch (error) {
                                console.error('❌ Newsletter auto-follow failed:', error.message);
                            }
                        }, 5000);
                    }

                    // Send welcome message
                    try { 
                        await sendWelcomeMessage(sock);
                    } catch (err) { 
                        console.error('Could not send welcome message:', err); 
                    }
                    
                    console.log('\n📊 ===== FEATURES STATUS =====');
                    console.log(`📱 Status auto-view: ${STATUS_CONFIG.AUTO_VIEW_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`💖 Status auto-react: ${STATUS_CONFIG.AUTO_LIKE_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`📰 Newsletter auto-follow: ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`🔥 Newsletter auto-react: ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`📋 Newsletter count: ${STATUS_CONFIG.NEWSLETTER_JIDS.length}`);
                    console.log(`🎭 Status emojis: ${STATUS_CONFIG.AUTO_LIKE_EMOJIS.length}`);
                    console.log(`🔥 Newsletter emojis: ${STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length}`);
                    console.log('================================\n');
                } else if (connection === 'connecting') {
                    botStatus = 'connecting';
                    isConnecting = true;
                    console.log('🔄 Bot is connecting...');
                }
            });

            // Save credentials whenever they update
            sock.ev.on('creds.update', async () => {
                await saveCreds();
                console.log('💾 Credentials updated');
            });

            // Load plugins
            const plugins = new Map();
            const pluginPath = path.join(__dirname, PLUGIN_FOLDER);
            
            if (fs.existsSync(pluginPath)) {
                try {
                    const pluginFiles = fs.readdirSync(pluginPath).filter(file => file.endsWith('.js'));
                    
                    for (const file of pluginFiles) {
                        try {
                            const plugin = require(path.join(pluginPath, file));
                            if (plugin.name && typeof plugin.execute === 'function') {
                                plugins.set(plugin.name.toLowerCase(), plugin);
                                if (Array.isArray(plugin.aliases)) {
                                    plugin.aliases.forEach(alias => {
                                        plugins.set(alias.toLowerCase(), plugin);
                                    });
                                }
                                console.log(`✅ Loaded plugin: ${plugin.name}`);
                            } else {
                                console.warn(`⚠️ Invalid plugin structure in ${file}`);
                            }
                        } catch (error) {
                            console.error(`❌ Failed to load plugin ${file}:`, error.message);
                        }
                    }
                    console.log(`📦 Total plugins loaded: ${plugins.size}`);
                } catch (error) {
                    console.error('❌ Error loading plugins:', error);
                }
            } else {
                console.log('📁 No plugins folder found');
            }
           
            // Handle incoming messages
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;
                
                // Status handling is already in setupEnhancedHandlers
                // Keep backward compatibility for status viewing
                for (const rawMsg of messages) {
                    if (rawMsg.key.remoteJid === 'status@broadcast' && rawMsg.key.participant) {
                        try {
                            console.log(`📱 Status detected from: ${rawMsg.key.participant}`);
                            await sock.readMessages([rawMsg.key]);
                            continue;
                        } catch (err) {
                            console.log('❌ Status viewer error:', err.message);
                        }
                    }
                }

                const rawMsg = messages[0];
                if (!rawMsg.message) return;

                const m = await serializeMessage(sock, rawMsg);
                
                // Check for commands
                if (m.body.startsWith(global.BOT_PREFIX)) {
                    const args = m.body.slice(global.BOT_PREFIX.length).trim().split(/\s+/);
                    const commandName = args.shift().toLowerCase();
                    const plugin = plugins.get(commandName);
                    
                    if (plugin) {
                        try { 
                            await plugin.execute(sock, m, args); 
                        } catch (err) { 
                            console.error(`❌ Plugin error (${commandName}):`, err); 
                            await m.reply('❌ Error running command.'); 
                        }
                    }
                }
                
                // Run onMessage handlers for all plugins
                for (const plugin of plugins.values()) {
                    if (typeof plugin.onMessage === 'function') {
                        try { 
                            await plugin.onMessage(sock, m); 
                        } catch (err) { 
                            console.error(`❌ onMessage error (${plugin.name}):`, err); 
                        }
                    }
                }
            });

            // Handle group participants update
            sock.ev.on('group-participants.update', async (update) => {
                console.log('👥 Group update:', update);
            });

            // Handle message reactions
            sock.ev.on('messages.reaction', async (reactions) => {
                console.log('💖 Reaction update:', reactions);
            });

            // Handle newsletter events
            sock.ev.on('newsletter.metadata', async (update) => {
                console.log('📰 Newsletter metadata update:', update);
            });

        } catch (error) {
            console.error('❌ Bot startup error:', error);
            isConnecting = false;
            setTimeout(() => startBot(), 10000);
        }
    })();
}

// ===== HTTP SERVER ===== //
const server = http.createServer((req, res) => {
    const url = req.url;
    
    // Serve static files from public directory
    if (url === '/' || url === '/index.html') {
        const filePath = path.join(__dirname, PUBLIC_FOLDER, 'index.html');
        
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                // If file doesn't exist, serve fallback
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Mercedes Bot Dashboard</title>
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; background: #0a0a0f; color: #e6e6ff; }
                        h1 { color: #00f3ff; }
                        .status { padding: 20px; margin: 20px; border-radius: 10px; }
                        .connected { background: rgba(0, 255, 157, 0.2); border: 2px solid #00ff9d; }
                        .connecting { background: rgba(255, 165, 0, 0.2); border: 2px solid orange; }
                        .disconnected { background: rgba(255, 0, 0, 0.2); border: 2px solid red; }
                    </style>
                </head>
                <body>
                    <h1>🚀 Mercedes Bot Dashboard</h1>
                    <p>Please create public/index.html for the full dashboard</p>
                    <div class="status ${botStatus}">
                        <h2>Status: ${botStatus.toUpperCase()}</h2>
                        <p>Prefix: ${global.BOT_PREFIX || '!'}</p>
                        <p>Uptime: ${Math.floor(process.uptime())}s</p>
                    </div>
                </body>
                </html>
                `);
                return;
            }
            
            // Read and serve the file
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error loading HTML file');
                    return;
                }
                
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            });
        });
        return;
    }
    
    // API endpoint for bot status
    else if (url === '/api/status') {
        const uptime = connectedSince ? Math.floor((Date.now() - connectedSince) / 1000) : 0;
        
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
        });
        res.end(JSON.stringify({ 
            success: true,
            status: botStatus,
            hasQR: !!latestQR && botStatus === 'connecting',
            qr: latestQR,
            prefix: global.BOT_PREFIX || '!',
            timestamp: new Date().toISOString(),
            uptime: uptime,
            processUptime: Math.floor(process.uptime()),
            connectedSince: connectedSince,
            version: '2.0',
            features: {
                status_auto_view: STATUS_CONFIG.AUTO_VIEW_STATUS,
                status_auto_react: STATUS_CONFIG.AUTO_LIKE_STATUS,
                newsletter_auto_follow: STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS,
                newsletter_auto_react: STATUS_CONFIG.AUTO_REACT_NEWSLETTERS,
                newsletter_count: STATUS_CONFIG.NEWSLETTER_JIDS.length,
                status_emojis: STATUS_CONFIG.AUTO_LIKE_EMOJIS.length,
                newsletter_emojis: STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length,
                newsletter_list: STATUS_CONFIG.NEWSLETTER_JIDS
            }
        }));
        return;
    }
    
    // Simple health check
    else if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok',
            bot: botStatus,
            timestamp: new Date().toISOString()
        }));
        return;
    }
    
    // Serve other static files (CSS, JS, images)
    else if (url.startsWith('/public/')) {
        const filePath = path.join(__dirname, url);
        const extname = path.extname(filePath).toLowerCase();
        const contentType = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'text/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.json': 'application/json',
            '.ico': 'image/x-icon'
        }[extname] || 'application/octet-stream';
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found');
                return;
            }
            
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600'
            });
            res.end(data);
        });
        return;
    }
    
    // 404 handler
    else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #0a0a0f, #1a1a2e);
                    color: #e6e6ff; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    min-height: 100vh; 
                    margin: 0; 
                    padding: 20px; 
                    text-align: center;
                }
                .container { 
                    max-width: 500px; 
                    padding: 40px; 
                    background: rgba(26, 26, 46, 0.9); 
                    border-radius: 20px; 
                    border: 1px solid #00f3ff;
                    box-shadow: 0 0 20px rgba(0, 243, 255, 0.3);
                }
                h1 { 
                    color: #00f3ff; 
                    font-size: 3rem; 
                    margin-bottom: 20px; 
                }
                p { 
                    font-size: 1.2rem; 
                    margin-bottom: 30px; 
                    color: #c0c0ff;
                }
                a { 
                    color: #00f3ff; 
                    text-decoration: none; 
                    font-size: 1.1rem; 
                    border: 1px solid #00f3ff; 
                    padding: 12px 30px; 
                    border-radius: 10px; 
                    transition: all 0.3s; 
                    display: inline-flex; 
                    align-items: center; 
                    gap: 10px;
                }
                a:hover { 
                    background: rgba(0, 243, 255, 0.2); 
                    transform: translateY(-3px); 
                    box-shadow: 0 5px 15px rgba(0, 243, 255, 0.3);
                }
                .logo { 
                    font-size: 3rem; 
                    color: #00f3ff; 
                    margin-bottom: 20px; 
                    text-shadow: 0 0 10px #00f3ff;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">
                    <i class="fas fa-robot"></i>
                </div>
                <h1>404</h1>
                <p>The requested resource was not found.</p>
                <a href="/">
                    <i class="fas fa-home"></i> Return to Dashboard
                </a>
            </div>
        </body>
        </html>
        `);
    }
});

// Start the server
server.listen(PORT, () => {
    console.log(`🌐 Mercedes Bot Dashboard: http://localhost:${PORT}`);
    console.log(`📁 Session folder: ${path.resolve(AUTH_FOLDER)}`);
    console.log(`📁 Public folder: ${path.resolve(__dirname, PUBLIC_FOLDER)}`);
    console.log(`\n📊 ===== CONFIGURATION LOADED =====`);
    console.log(`📱 Status auto-view: ${STATUS_CONFIG.AUTO_VIEW_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`💖 Status auto-react: ${STATUS_CONFIG.AUTO_LIKE_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`📰 Newsletter auto-follow: ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`🔥 Newsletter auto-react: ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`📋 Newsletter count: ${STATUS_CONFIG.NEWSLETTER_JIDS.length}`);
    console.log(`🎭 Status emojis: ${STATUS_CONFIG.AUTO_LIKE_EMOJIS.length}`);
    console.log(`🔥 Newsletter emojis: ${STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length}`);
    console.log(`================================\n`);
    
    // Ensure public directory exists
    if (!fs.existsSync(PUBLIC_FOLDER)) {
        fs.mkdirSync(PUBLIC_FOLDER, { recursive: true });
        console.log(`📁 Created public directory at: ${path.resolve(PUBLIC_FOLDER)}`);
        console.log(`📝 Please add your index.html file to the public directory`);
    }
    
    loadPrefix();
});

// Handle process events
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Mercedes Bot gracefully...');
    if (presenceInterval) clearInterval(presenceInterval);
    if (sock) sock.end();
    console.log('✅ Clean shutdown complete');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n⚠️ Received SIGTERM, shutting down...');
    if (presenceInterval) clearInterval(presenceInterval);
    if (sock) sock.end();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});
