const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, generateWAMessageFromContent, fetchLatestWaWebVersion, proto } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const { sendButtons, sendInteractiveMessage } = require('gifted-btns');
const serializeMessage = require('./handler.js');

global.generateWAMessageFromContent = generateWAMessageFromContent;
global.proto = proto;
require('./config')

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

// ===== STATUS & NEWSLETTER CONFIG ===== //
const STATUS_CONFIG = {
    AUTO_VIEW_STATUS: true,
    AUTO_LIKE_STATUS: true,
    AUTO_RECORDING: true,
    AUTO_LIKE_EMOJIS: [
        '❤️', '🔥', '👍', '😍', '🥰', '😂', '😮', '😢', '👏',
        '🎉', '🤩', '😎', '🤗', '🙏', '💯', '✨', '🌟', '💖'
    ],
    
    // Newsletter configuration - FIXED TO WORK PROPERLY
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
// ========================= //

// ===== COUNTRY CODES FOR PAIRING ===== //
const COUNTRY_CODES = [
    { name: "Afghanistan", code: "93", flag: "🇦🇫" },
    { name: "Albania", code: "355", flag: "🇦🇱" },
    { name: "Algeria", code: "213", flag: "🇩🇿" },
    { name: "Andorra", code: "376", flag: "🇦🇩" },
    { name: "Angola", code: "244", flag: "🇦🇴" },
    { name: "Argentina", code: "54", flag: "🇦🇷" },
    { name: "Australia", code: "61", flag: "🇦🇺" },
    { name: "Austria", code: "43", flag: "🇦🇹" },
    { name: "Bahrain", code: "973", flag: "🇧🇭" },
    { name: "Bangladesh", code: "880", flag: "🇧🇩" },
    { name: "Belgium", code: "32", flag: "🇧🇪" },
    { name: "Brazil", code: "55", flag: "🇧🇷" },
    { name: "Canada", code: "1", flag: "🇨🇦" },
    { name: "China", code: "86", flag: "🇨🇳" },
    { name: "Colombia", code: "57", flag: "🇨🇴" },
    { name: "Egypt", code: "20", flag: "🇪🇬" },
    { name: "Ethiopia", code: "251", flag: "🇪🇹" },
    { name: "France", code: "33", flag: "🇫🇷" },
    { name: "Germany", code: "49", flag: "🇩🇪" },
    { name: "Ghana", code: "233", flag: "🇬🇭" },
    { name: "India", code: "91", flag: "🇮🇳" },
    { name: "Indonesia", code: "62", flag: "🇮🇩" },
    { name: "Iran", code: "98", flag: "🇮🇷" },
    { name: "Iraq", code: "964", flag: "🇮🇶" },
    { name: "Italy", code: "39", flag: "🇮🇹" },
    { name: "Japan", code: "81", flag: "🇯🇵" },
    { name: "Jordan", code: "962", flag: "🇯🇴" },
    { name: "Kenya", code: "254", flag: "🇰🇪" },
    { name: "Kuwait", code: "965", flag: "🇰🇼" },
    { name: "Malaysia", code: "60", flag: "🇲🇾" },
    { name: "Mexico", code: "52", flag: "🇲🇽" },
    { name: "Morocco", code: "212", flag: "🇲🇦" },
    { name: "Netherlands", code: "31", flag: "🇳🇱" },
    { name: "Nigeria", code: "234", flag: "🇳🇬" },
    { name: "Oman", code: "968", flag: "🇴🇲" },
    { name: "Pakistan", code: "92", flag: "🇵🇰" },
    { name: "Philippines", code: "63", flag: "🇵🇭" },
    { name: "Qatar", code: "974", flag: "🇶🇦" },
    { name: "Russia", code: "7", flag: "🇷🇺" },
    { name: "Saudi Arabia", code: "966", flag: "🇸🇦" },
    { name: "Singapore", code: "65", flag: "🇸🇬" },
    { name: "South Africa", code: "27", flag: "🇿🇦" },
    { name: "South Korea", code: "82", flag: "🇰🇷" },
    { name: "Spain", code: "34", flag: "🇪🇸" },
    { name: "Sri Lanka", code: "94", flag: "🇱🇰" },
    { name: "Sweden", code: "46", flag: "🇸🇪" },
    { name: "Switzerland", code: "41", flag: "🇨🇭" },
    { name: "Tanzania", code: "255", flag: "🇹🇿" },
    { name: "Thailand", code: "66", flag: "🇹🇭" },
    { name: "Turkey", code: "90", flag: "🇹🇷" },
    { name: "Uganda", code: "256", flag: "🇺🇬" },
    { name: "Ukraine", code: "380", flag: "🇺🇦" },
    { name: "United Arab Emirates", code: "971", flag: "🇦🇪" },
    { name: "United Kingdom", code: "44", flag: "🇬🇧" },
    { name: "United States", code: "1", flag: "🇺🇸" },
    { name: "Vietnam", code: "84", flag: "🇻🇳" },
    { name: "Yemen", code: "967", flag: "🇾🇪" },
    { name: "Zambia", code: "260", flag: "🇿🇲" },
    { name: "Zimbabwe", code: "263", flag: "🇿🇼" }
];

let latestQR = '';
let botStatus = 'disconnected';
let pairingCodes = new Map();
let presenceInterval = null;
let sock = null;
let isConnecting = false;

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
            
            // ===== 2. NEWSLETTER AUTO-REACTION (FIXED) =====
            if (STATUS_CONFIG.AUTO_REACT_NEWSLETTERS) {
                try {
                    // Check if message is from a newsletter we should react to
                    if (STATUS_CONFIG.NEWSLETTER_JIDS.includes(messageJid)) {
                        console.log(`📰 Newsletter post detected from: ${messageJid}`);
                        
                        // Get message ID - try different possible locations
                        let messageId = null;
                        
                        // Try newsletterServerId first
                        if (message.newsletterServerId) {
                            messageId = message.newsletterServerId;
                        }
                        // Try message key id
                        else if (message.key?.id) {
                            messageId = message.key.id;
                        }
                        // Try in the message object
                        else if (message.message?.newsletterServerId) {
                            messageId = message.message.newsletterServerId;
                        }
                        
                        if (messageId) {
                            // Random emoji for newsletter reaction
                            const randomEmoji = STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS[
                                Math.floor(Math.random() * STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length)
                            ];
                            
                            console.log(`🎯 Attempting to react to newsletter with ${randomEmoji} (Message ID: ${messageId})`);
                            
                            // Try newsletterReactMessage first (official method)
                            try {
                                await socket.newsletterReactMessage(
                                    messageJid,
                                    messageId.toString(),
                                    randomEmoji
                                );
                                console.log(`✅ Newsletter reaction sent via newsletterReactMessage: ${randomEmoji}`);
                            } catch (reactError) {
                                console.log(`❌ newsletterReactMessage failed, trying alternative method: ${reactError.message}`);
                                
                                // Alternative method: Use sendMessage with react
                                try {
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
                                    console.log(`✅ Newsletter reaction sent via sendMessage: ${randomEmoji}`);
                                } catch (altError) {
                                    console.log(`❌ Alternative reaction failed: ${altError.message}`);
                                }
                            }
                        } else {
                            console.log('❌ Could not find message ID for newsletter reaction');
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
                            const randomEmoji = STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS[
                                Math.floor(Math.random() * STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length)
                            ];
                            
                            try {
                                await socket.newsletterReactMessage(
                                    messageJid,
                                    messageId.toString(),
                                    randomEmoji
                                );
                                console.log(`✅ Newsletter event reaction sent: ${randomEmoji}`);
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

// ===== EXTENDED WELCOME MESSAGE ===== //
async function sendEnhancedWelcomeMessage(socket) {
    try {
        const statusFeatures = [];
        if (STATUS_CONFIG.AUTO_VIEW_STATUS) statusFeatures.push('✅ Auto-view status');
        if (STATUS_CONFIG.AUTO_LIKE_STATUS) statusFeatures.push('💖 Auto-react to status');
        if (STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS) statusFeatures.push('📰 Auto-follow newsletters');
        if (STATUS_CONFIG.AUTO_REACT_NEWSLETTERS) statusFeatures.push('🔥 Auto-react to newsletters');
        
        const welcomeText = `*Mercedes WhatsApp Bot Connected!*\n\n` +
                           `📝 *Prefix:* ${global.BOT_PREFIX}\n` +
                           `⏰ *Connected:* ${new Date().toLocaleString()}\n` +
                           `> *made by marisel*`;
        
        await socket.sendMessage(socket.user.id, { text: welcomeText });
    } catch (err) {
        console.error('Could not send enhanced welcome message:', err);
    }
}

// Load prefix from config or use default
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
                browser: ['Mercedes', 'Chrome', '1.0.0']
            });
            
            // ===== SETUP ENHANCED HANDLERS =====
            setupEnhancedHandlers(sock);
            
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    console.log('🔳 Generating QR code for web...');
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
                    console.log('✅ Bot is connected!');

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
                        }, 5000); // Wait 5 seconds after connection
                    }

                    // Send enhanced welcome message
                    try { 
                        await sendEnhancedWelcomeMessage(sock);
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

// ===== ENHANCED WEB DASHBOARD ===== //
const server = http.createServer((req, res) => {
    const url = req.url;
    
    if (url === '/' || url === '/qr') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mercedes WhatsApp Bot</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --mercedes-black: #000000;
            --mercedes-silver: #C0C0C0;
            --mercedes-blue: #00A0E9;
            --mercedes-red: #E4002B;
            --gradient-mercedes: linear-gradient(135deg, #000000, #1a1a1a, #333333);
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: var(--gradient-mercedes);
            color: white;
            min-height: 100vh;
            overflow-x: hidden;
        }
        
        .mercedes-logo {
            font-size: 2.5rem;
            color: var(--mercedes-silver);
            text-align: center;
            margin-bottom: 10px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 30px 20px;
        }
        
        .header {
            text-align: center;
            padding: 40px 20px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 20px;
            margin-bottom: 30px;
            border: 1px solid var(--mercedes-silver);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, var(--mercedes-red), var(--mercedes-silver), var(--mercedes-blue));
        }
        
        .header h1 {
            font-size: 3.5rem;
            margin-bottom: 10px;
            background: linear-gradient(90deg, var(--mercedes-silver), white);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        
        .header .tagline {
            font-size: 1.2rem;
            color: var(--mercedes-silver);
            margin-bottom: 30px;
            font-weight: 300;
        }
        
        .status-container {
            display: flex;
            justify-content: center;
            gap: 30px;
            flex-wrap: wrap;
            margin-bottom: 40px;
        }
        
        .status-card {
            background: rgba(0, 0, 0, 0.8);
            border-radius: 15px;
            padding: 25px;
            width: 300px;
            text-align: center;
            border: 1px solid rgba(192, 192, 192, 0.3);
            transition: transform 0.3s, box-shadow 0.3s;
        }
        
        .status-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 30px rgba(0, 0, 0, 0.7);
        }
        
        .status-icon {
            font-size: 3rem;
            margin-bottom: 15px;
        }
        
        .status-connecting { color: #FFA500; }
        .status-connected { color: #00FF00; }
        .status-disconnected { color: #FF4444; }
        
        .status-card h3 {
            font-size: 1.5rem;
            margin-bottom: 10px;
            color: var(--mercedes-silver);
        }
        
        .status-value {
            font-size: 1.8rem;
            font-weight: bold;
            padding: 8px 20px;
            border-radius: 50px;
            display: inline-block;
        }
        
        .connected { background: rgba(0, 255, 0, 0.1); color: #00FF00; }
        .disconnected { background: rgba(255, 68, 68, 0.1); color: #FF4444; }
        .connecting { background: rgba(255, 165, 0, 0.1); color: #FFA500; }
        
        .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        
        .feature-card {
            background: rgba(0, 0, 0, 0.7);
            border-radius: 15px;
            padding: 20px;
            border-left: 4px solid var(--mercedes-blue);
        }
        
        .feature-card h4 {
            color: var(--mercedes-silver);
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .feature-status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            margin-left: auto;
        }
        
        .enabled { background: rgba(0, 255, 0, 0.2); color: #00FF00; }
        .disabled { background: rgba(255, 68, 68, 0.2); color: #FF4444; }
        
        .feature-list {
            list-style: none;
            padding-left: 0;
        }
        
        .feature-list li {
            padding: 5px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .feature-list i.fa-check {
            color: #00FF00;
        }
        
        .feature-list i.fa-times {
            color: #FF4444;
        }
        
        .newsletter-list {
            background: rgba(0, 0, 0, 0.8);
            border-radius: 15px;
            padding: 20px;
            margin: 20px 0;
            border: 1px solid var(--mercedes-blue);
        }
        
        .newsletter-list h4 {
            color: var(--mercedes-silver);
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .newsletter-item {
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: monospace;
            font-size: 0.9rem;
        }
        
        .newsletter-item i {
            color: var(--mercedes-blue);
        }
        
        .qr-section {
            background: rgba(0, 0, 0, 0.9);
            border-radius: 20px;
            padding: 40px;
            margin: 40px 0;
            text-align: center;
            border: 1px solid var(--mercedes-blue);
            box-shadow: 0 10px 25px rgba(0, 160, 233, 0.2);
        }
        
        .qr-section h2 {
            font-size: 2.2rem;
            margin-bottom: 20px;
            color: var(--mercedes-silver);
        }
        
        .qr-container {
            padding: 25px;
            background: white;
            border-radius: 15px;
            display: inline-block;
            margin: 20px 0;
            box-shadow: 0 5px 15px rgba(255, 255, 255, 0.1);
        }
        
        .qr-container img {
            width: 280px;
            height: 280px;
            border-radius: 10px;
        }
        
        .pair-section {
            background: rgba(0, 0, 0, 0.8);
            border-radius: 20px;
            padding: 40px;
            margin: 40px 0;
            border: 1px solid var(--mercedes-red);
        }
        
        .form-group {
            max-width: 600px;
            margin: 0 auto;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 10px;
            font-size: 1.1rem;
            color: var(--mercedes-silver);
        }
        
        .phone-input-container {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .country-select {
            flex: 0 0 200px;
            position: relative;
        }
        
        .country-select select {
            width: 100%;
            padding: 15px 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid var(--mercedes-silver);
            border-radius: 10px;
            color: white;
            font-size: 1rem;
            cursor: pointer;
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
        }
        
        .country-select::after {
            content: '▼';
            position: absolute;
            right: 15px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--mercedes-silver);
            pointer-events: none;
        }
        
        .phone-input {
            flex: 1;
        }
        
        .phone-input input {
            width: 100%;
            padding: 15px 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid var(--mercedes-silver);
            border-radius: 10px;
            color: white;
            font-size: 1.1rem;
        }
        
        .form-control {
            width: 100%;
            padding: 15px 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid var(--mercedes-silver);
            border-radius: 10px;
            color: white;
            font-size: 1.1rem;
            margin-bottom: 20px;
            transition: all 0.3s;
        }
        
        .form-control:focus {
            outline: none;
            border-color: var(--mercedes-blue);
            box-shadow: 0 0 15px rgba(0, 160, 233, 0.5);
        }
        
        .form-control::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }
        
        .btn {
            padding: 15px 35px;
            border: none;
            border-radius: 10px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, var(--mercedes-blue), #0077B6);
            color: white;
        }
        
        .btn-primary:hover {
            background: linear-gradient(135deg, #0077B6, var(--mercedes-blue));
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(0, 160, 233, 0.4);
        }
        
        .btn-secondary {
            background: linear-gradient(135deg, var(--mercedes-silver), #8a8a8a);
            color: black;
        }
        
        .btn-secondary:hover {
            background: linear-gradient(135deg, #8a8a8a, var(--mercedes-silver));
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(192, 192, 192, 0.4);
        }
        
        .btn-danger {
            background: linear-gradient(135deg, var(--mercedes-red), #B30000);
            color: white;
        }
        
        .btn-danger:hover {
            background: linear-gradient(135deg, #B30000, var(--mercedes-red));
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(228, 0, 43, 0.4);
        }
        
        .btn-group {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 30px;
            flex-wrap: wrap;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 25px;
            margin: 40px 0;
        }
        
        .info-card {
            background: rgba(0, 0, 0, 0.7);
            border-radius: 15px;
            padding: 25px;
            border-left: 5px solid var(--mercedes-blue);
        }
        
        .info-card h3 {
            color: var(--mercedes-silver);
            margin-bottom: 15px;
            font-size: 1.4rem;
        }
        
        .info-card p {
            color: rgba(255, 255, 255, 0.8);
            line-height: 1.6;
        }
        
        .code-display {
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid var(--mercedes-blue);
            border-radius: 15px;
            padding: 30px;
            text-align: center;
            margin: 30px auto;
            max-width: 600px;
        }
        
        .code-display h2 {
            color: var(--mercedes-silver);
            margin-bottom: 20px;
        }
        
        .pairing-code {
            font-family: 'Courier New', monospace;
            font-size: 3rem;
            font-weight: bold;
            color: #00FF00;
            background: rgba(0, 0, 0, 0.9);
            padding: 20px;
            border-radius: 10px;
            letter-spacing: 5px;
            margin: 20px 0;
            border: 1px solid var(--mercedes-blue);
        }
        
        .instructions {
            background: rgba(0, 160, 233, 0.1);
            padding: 20px;
            border-radius: 10px;
            margin-top: 25px;
            text-align: left;
        }
        
        .instructions ol {
            padding-left: 20px;
        }
        
        .instructions li {
            margin-bottom: 10px;
            color: rgba(255, 255, 255, 0.9);
        }
        
        .footer {
            text-align: center;
            margin-top: 60px;
            padding-top: 30px;
            border-top: 1px solid rgba(192, 192, 192, 0.3);
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.9rem;
        }
        
        .footer a {
            color: var(--mercedes-blue);
            text-decoration: none;
        }
        
        .footer a:hover {
            text-decoration: underline;
        }
        
        .hidden {
            display: none;
        }
        
        @media (max-width: 768px) {
            .header h1 {
                font-size: 2.5rem;
            }
            
            .status-container {
                flex-direction: column;
                align-items: center;
            }
            
            .features-grid {
                grid-template-columns: 1fr;
            }
            
            .btn-group {
                flex-direction: column;
                align-items: center;
            }
            
            .btn {
                width: 100%;
                max-width: 300px;
            }
            
            .qr-container img {
                width: 220px;
                height: 220px;
            }
            
            .pairing-code {
                font-size: 2rem;
                letter-spacing: 3px;
            }
            
            .phone-input-container {
                flex-direction: column;
            }
            
            .country-select {
                flex: 0 0 auto;
            }
        }
        
        .pulse {
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
        
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: var(--mercedes-blue);
            animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="mercedes-logo">
                <i class="fas fa-star"></i>
            </div>
            <h1>Mercedes WhatsApp Bot</h1>
            <p class="tagline">Premium Automation with Status & Newsletter Features</p>
            
            <div class="status-container">
                <div class="status-card">
                    <div class="status-icon">
                        <i class="fas fa-signal"></i>
                    </div>
                    <h3>Connection Status</h3>
                    <div class="status-value ${botStatus}">${botStatus.toUpperCase()}</div>
                </div>
                
                <div class="status-card">
                    <div class="status-icon">
                        <i class="fas fa-cogs"></i>
                    </div>
                    <h3>Command Prefix</h3>
                    <div class="status-value" style="color: var(--mercedes-blue);">${global.BOT_PREFIX}</div>
                </div>
                
                <div class="status-card">
                    <div class="status-icon">
                        <i class="fas fa-server"></i>
                    </div>
                    <h3>Server Port</h3>
                    <div class="status-value" style="color: var(--mercedes-silver);">${PORT}</div>
                </div>
            </div>
        </div>
        
        <!-- Status & Newsletter Features Section -->
        <div class="features-grid">
            <div class="feature-card">
                <h4><i class="fas fa-eye"></i> Status Auto-View
                    <span class="feature-status ${STATUS_CONFIG.AUTO_VIEW_STATUS ? 'enabled' : 'disabled'}">
                        ${STATUS_CONFIG.AUTO_VIEW_STATUS ? 'ENABLED' : 'DISABLED'}
                    </span>
                </h4>
                <ul class="feature-list">
                    <li><i class="fas ${STATUS_CONFIG.AUTO_VIEW_STATUS ? 'fa-check' : 'fa-times'}"></i> Automatically views status updates</li>
                    <li><i class="fas ${STATUS_CONFIG.AUTO_RECORDING ? 'fa-check' : 'fa-times'}"></i> Shows "recording" presence</li>
                    <li><i class="fas fa-smile"></i> Marks status as seen instantly</li>
                </ul>
            </div>
            
            <div class="feature-card">
                <h4><i class="fas fa-heart"></i> Status Auto-React
                    <span class="feature-status ${STATUS_CONFIG.AUTO_LIKE_STATUS ? 'enabled' : 'disabled'}">
                        ${STATUS_CONFIG.AUTO_LIKE_STATUS ? 'ENABLED' : 'DISABLED'}
                    </span>
                </h4>
                <ul class="feature-list">
                    <li><i class="fas ${STATUS_CONFIG.AUTO_LIKE_STATUS ? 'fa-check' : 'fa-times'}"></i> Reacts with random emojis</li>
                    <li><i class="fas fa-icons"></i> ${STATUS_CONFIG.AUTO_LIKE_EMOJIS.length} different emojis</li>
                    <li><i class="fas fa-bolt"></i> Instant reaction after viewing</li>
                </ul>
            </div>
            
            <div class="feature-card">
                <h4><i class="fas fa-newspaper"></i> Newsletter Auto-Follow
                    <span class="feature-status ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? 'enabled' : 'disabled'}">
                        ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? 'ENABLED' : 'DISABLED'}
                    </span>
                </h4>
                <ul class="feature-list">
                    <li><i class="fas ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? 'fa-check' : 'fa-times'}"></i> Auto-follows on connect</li>
                    <li><i class="fas fa-list"></i> ${STATUS_CONFIG.NEWSLETTER_JIDS.length} newsletters configured</li>
                    <li><i class="fas fa-check-circle"></i> Follows all newsletters in list</li>
                </ul>
            </div>
            
            <div class="feature-card">
                <h4><i class="fas fa-fire"></i> Newsletter Auto-React
                    <span class="feature-status ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? 'enabled' : 'disabled'}">
                        ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? 'ENABLED' : 'DISABLED'}
                    </span>
                </h4>
                <ul class="feature-list">
                    <li><i class="fas ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? 'fa-check' : 'fa-times'}"></i> Reacts to newsletter posts</li>
                    <li><i class="fas fa-icons"></i> ${STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length} reaction emojis</li>
                    <li><i class="fas fa-robot"></i> Fully automated engagement</li>
                </ul>
            </div>
        </div>
        
        <!-- Newsletter List -->
        <div class="newsletter-list">
            <h4><i class="fas fa-list-check"></i> Newsletter List (${STATUS_CONFIG.NEWSLETTER_JIDS.length})</h4>
            ${STATUS_CONFIG.NEWSLETTER_JIDS.map(jid => `
                <div class="newsletter-item">
                    <i class="fas fa-newspaper"></i>
                    ${jid}
                </div>
            `).join('')}
        </div>
        
        ${botStatus === 'connecting' && latestQR ? `
        <div class="qr-section">
            <h2><i class="fas fa-qrcode"></i> Scan QR Code</h2>
            <p>Scan this QR code with WhatsApp to link your device</p>
            
            <div class="qr-container">
                <img src="${latestQR}" alt="WhatsApp QR Code">
            </div>
            
            <p class="pulse">
                <i class="fas fa-sync-alt"></i> QR will refresh automatically
            </p>
            
            <div class="instructions">
                <h3><i class="fas fa-info-circle"></i> Instructions:</h3>
                <ol>
                    <li>Open WhatsApp on your phone</li>
                    <li>Tap on <strong>Settings</strong> → <strong>Linked Devices</strong></li>
                    <li>Tap on <strong>Link a Device</strong></li>
                    <li>Point your camera at the QR code above</li>
                    <li>Bot will auto-follow newsletters and engage with statuses</li>
                </ol>
            </div>
        </div>
        ` : ''}
        
        <div class="pair-section">
            <h2><i class="fas fa-mobile-alt"></i> Pair with Phone Number</h2>
            <p style="text-align: center; margin-bottom: 30px; color: rgba(255,255,255,0.8);">
                Select your country and enter your phone number to receive a pairing code
            </p>
            
            <form method="POST" action="/pair" id="pairForm">
                <div class="form-group">
                    <div class="phone-input-container">
                        <div class="country-select">
                            <select id="countryCode" name="countryCode" required>
                                <option value="" disabled selected>Select Country</option>
                                ${COUNTRY_CODES.map(country => `
                                    <option value="${country.code}" ${country.code === '254' ? 'selected' : ''}>
                                        ${country.flag} ${country.name} (+${country.code})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="phone-input">
                            <input type="tel" name="phoneNumber" id="phoneNumber" 
                                   class="form-control" placeholder="740007567" required
                                   pattern="[0-9]{9,15}" title="Enter phone number without country code">
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin: 20px 0; color: var(--mercedes-silver);">
                        <i class="fas fa-info-circle"></i> Example: Select Kenya (+254) and enter 740007567
                    </div>
                    
                    <button type="submit" class="btn btn-primary" id="pairBtn" style="width: 100%;">
                        <i class="fas fa-key"></i> Generate Pairing Code
                    </button>
                </div>
            </form>
        </div>
        
        <div class="info-grid">
            <div class="info-card">
                <h3><i class="fas fa-shield-alt"></i> Secure Session</h3>
                <p>Your WhatsApp session is stored locally and encrypted. No data is sent to external servers.</p>
            </div>
            
            <div class="info-card">
                <h3><i class="fas fa-plug"></i> Auto-Reconnect</h3>
                <p>The bot automatically reconnects if the connection drops. No manual intervention needed.</p>
            </div>
            
            <div class="info-card">
                <h3><i class="fas fa-bolt"></i> High Performance</h3>
                <p>Built with Mercedes-grade engineering for reliability and speed. Handles multiple requests seamlessly.</p>
            </div>
        </div>
        
        <div class="btn-group">
            <button class="btn btn-secondary" onclick="location.reload()">
                <i class="fas fa-sync-alt"></i> Refresh Status
            </button>
            
            <button class="btn btn-primary" onclick="window.location.href='/'">
                <i class="fas fa-home"></i> Dashboard
            </button>
            
            ${botStatus === 'connected' ? `
            <button class="btn btn-danger" onclick="alert('Bot is connected and running with status & newsletter features!')">
                <i class="fas fa-play-circle"></i> Bot Active
            </button>
            ` : ''}
        </div>
        
        <div class="footer">
            <p>
                <i class="fas fa-car"></i> Mercedes WhatsApp Bot v2.0 | 
                Premium Status & Newsletter Automation
            </p>
            <p>
                Session Path: <code>${AUTH_FOLDER}</code> | 
                Uptime: <span id="uptime">${Math.floor(process.uptime())}s</span> |
                Newsletters: ${STATUS_CONFIG.NEWSLETTER_JIDS.length} |
                Emojis: ${STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length}
            </p>
            <p>
                &copy; ${new Date().getFullYear()} Mercedes Bot Technologies. 
                All rights reserved.
            </p>
        </div>
    </div>

    <script>
        // Auto-refresh if not connected
        if("${botStatus}" !== "connected") {
            setTimeout(() => location.reload(), 10000);
        }
        
        // Update uptime counter
        let uptime = ${Math.floor(process.uptime())};
        setInterval(() => {
            uptime++;
            document.getElementById('uptime').textContent = uptime + 's';
        }, 1000);
        
        // Form submission handling
        document.getElementById('pairForm')?.addEventListener('submit', function(e) {
            const countryCode = document.getElementById('countryCode').value;
            const phoneNumber = document.getElementById('phoneNumber').value;
            
            if (!countryCode || !phoneNumber) {
                e.preventDefault();
                alert('Please select a country and enter your phone number');
                return;
            }
            
            const btn = document.getElementById('pairBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="loading"></span> Generating Code...';
            btn.disabled = true;
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 10000);
        });
        
        // Status color animation
        const statusValue = document.querySelector('.status-value');
        if(statusValue) {
            if(statusValue.classList.contains('connecting')) {
                statusValue.classList.add('pulse');
            }
        }
        
        // Phone number validation
        document.getElementById('phoneNumber').addEventListener('input', function(e) {
            this.value = this.value.replace(/\D/g, '');
        });
    </script>
</body>
</html>
        `);
    } 
    
    else if (url === '/pair' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial; background: linear-gradient(135deg, #000, #1a1a1a); color: white; padding: 20px; text-align: center; }
        form { margin: 20px; padding: 20px; background: rgba(0,0,0,0.8); display: inline-block; border-radius: 10px; }
        input, button { padding: 10px; margin: 5px; border-radius: 5px; }
        input { background: rgba(255,255,255,0.1); color: white; border: 1px solid #C0C0C0; }
        button { background: #00A0E9; color: white; border: none; cursor: pointer; }
        a { color: #00A0E9; text-decoration: none; }
    </style>
</head>
<body>
    <h1>🔗 Pair WhatsApp</h1>
    <form method="POST">
        Phone: <input type="text" name="phone" placeholder="254740007567" required><br><br>
        <button type="submit">Get Code</button><br><br>
        <a href="/">← Back to Dashboard</a>
    </form>
</body>
</html>
        `);
    }
    
    else if (url === '/pair' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const params = new URLSearchParams(body);
                let phoneNumber = '';
                
                // Check if using new form (with country code) or old form
                if (params.get('countryCode') && params.get('phoneNumber')) {
                    // New form format
                    const countryCode = params.get('countryCode').trim();
                    const userNumber = params.get('phoneNumber').trim().replace(/\D/g, '');
                    phoneNumber = countryCode + userNumber;
                } else if (params.get('phone')) {
                    // Old form format
                    phoneNumber = params.get('phone').trim().replace(/\D/g, '');
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                    <center>
                    <h2>❌ Error: Phone number required</h2>
                    <a href="/pair">Try Again</a>
                    </center>
                    `);
                    return;
                }

                // Clean phone number
                phoneNumber = phoneNumber.replace(/\D/g, '');
                
                // Validate phone number
                if (!phoneNumber || phoneNumber.length < 9) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                    <center>
                    <h2>❌ Error: Invalid phone number</h2>
                    <p>Phone number must be at least 9 digits (excluding country code)</p>
                    <a href="/">← Go Back</a>
                    </center>
                    `);
                    return;
                }

                if (botStatus !== 'connecting' || !sock) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                    <center>
                    <h2>⚠️ Bot not ready</h2>
                    <p>Status: ${botStatus}</p>
                    <p>Please wait for QR code to appear first</p>
                    <a href="/">← Go Back</a>
                    </center>
                    `);
                    return;
                }

                console.log(`📱 Requesting pairing code for: ${phoneNumber}`);
                
                // Request pairing code
                const pairingCode = await sock.requestPairingCode(phoneNumber);
                
                // Store the code
                pairingCodes.set(phoneNumber, {
                    code: pairingCode,
                    timestamp: Date.now()
                });

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #000, #1a1a1a); 
            color: white; 
            padding: 30px; 
            text-align: center; 
            max-width: 800px;
            margin: 0 auto;
        }
        .success-box { 
            background: rgba(0, 0, 0, 0.9); 
            border-radius: 20px; 
            padding: 40px; 
            margin: 20px auto; 
            border: 2px solid #00A0E9;
            box-shadow: 0 10px 30px rgba(0, 160, 233, 0.3);
        }
        h1 { 
            color: #00FF00; 
            margin-bottom: 30px; 
            font-size: 2.5rem;
        }
        h2 {
            color: #C0C0C0;
            margin-bottom: 20px;
        }
        .code-display { 
            font-family: 'Courier New', monospace; 
            font-size: 3.5rem; 
            font-weight: bold; 
            color: #00FF00; 
            background: rgba(0, 0, 0, 0.9); 
            padding: 30px; 
            border-radius: 15px; 
            letter-spacing: 8px; 
            margin: 30px 0; 
            border: 3px solid #E4002B;
            text-shadow: 0 0 10px #00FF00;
        }
        .info-box { 
            background: rgba(0, 160, 233, 0.15); 
            padding: 25px; 
            margin: 30px 0; 
            border-radius: 15px; 
            text-align: left;
            border-left: 5px solid #00A0E9;
        }
        .instructions {
            background: rgba(228, 0, 43, 0.1);
            padding: 20px;
            border-radius: 10px;
            margin: 25px 0;
            text-align: left;
            border-left: 5px solid #E4002B;
        }
        .instructions h3 {
            color: #E4002B;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .instructions ol {
            padding-left: 25px;
        }
        .instructions li {
            margin-bottom: 12px;
            padding-left: 5px;
            line-height: 1.5;
        }
        .btn { 
            padding: 15px 40px; 
            margin: 10px; 
            border: none; 
            border-radius: 10px; 
            font-size: 1.1rem; 
            font-weight: bold; 
            cursor: pointer; 
            transition: all 0.3s; 
            display: inline-flex; 
            align-items: center; 
            justify-content: center; 
            gap: 10px;
            text-decoration: none;
        }
        .btn-primary { 
            background: linear-gradient(135deg, #00A0E9, #0077B6); 
            color: white; 
        }
        .btn-primary:hover { 
            background: linear-gradient(135deg, #0077B6, #00A0E9); 
            transform: translateY(-3px); 
            box-shadow: 0 10px 20px rgba(0, 160, 233, 0.4); 
        }
        .btn-secondary { 
            background: linear-gradient(135deg, #C0C0C0, #8a8a8a); 
            color: black; 
        }
        .btn-secondary:hover { 
            background: linear-gradient(135deg, #8a8a8a, #C0C0C0); 
            transform: translateY(-3px); 
        }
        .btn-group { 
            margin-top: 40px; 
        }
        .pulse {
            animation: pulse 1.5s infinite;
            color: #00FF00;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.6; }
            100% { opacity: 1; }
        }
        @media (max-width: 768px) {
            body { padding: 15px; }
            .code-display { 
                font-size: 2.2rem; 
                letter-spacing: 5px; 
                padding: 20px; 
            }
            h1 { font-size: 2rem; }
        }
    </style>
</head>
<body>
    <div class="success-box">
        <h1><i class="fas fa-check-circle"></i> Pairing Code Generated</h1>
        
        <div style="margin-bottom: 30px;">
            <h2>Phone Number</h2>
            <div style="font-size: 1.5rem; color: #C0C0C0; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px;">
                +${phoneNumber}
            </div>
        </div>
        
        <div>
            <h2>Your Pairing Code</h2>
            <div class="code-display pulse">
                ${pairingCode}
            </div>
        </div>
        
        <div class="info-box">
            <h3><i class="fas fa-info-circle"></i> Code Information</h3>
            <p>✅ This code is valid for <strong>2 minutes</strong></p>
            <p>✅ Generated at: ${new Date().toLocaleTimeString()}</p>
            <p>✅ Expires at: ${new Date(Date.now() + 120000).toLocaleTimeString()}</p>
        </div>
        
        <div class="instructions">
            <h3><i class="fas fa-mobile-alt"></i> How to Use This Code:</h3>
            <ol>
                <li>Open <strong>WhatsApp</strong> on your phone</li>
                <li>Go to <strong>Settings</strong> → <strong>Linked Devices</strong></li>
                <li>Tap on <strong>Link a Device</strong></li>
                <li>Select <strong>Use pairing code</strong> option</li>
                <li>Enter the <strong>6-digit code</strong> shown above</li>
                <li>Tap <strong>Link Device</strong> to connect</li>
                <li>The bot will automatically start after connection</li>
            </ol>
        </div>
        
        <div style="color: #FFA500; margin: 25px 0; padding: 15px; background: rgba(255,165,0,0.1); border-radius: 10px;">
            <i class="fas fa-exclamation-triangle"></i> 
            <strong>Note:</strong> This code works exactly like the QR code. If QR scanning works, this code will also work.
        </div>
        
        <div class="btn-group">
            <a href="/" class="btn btn-primary">
                <i class="fas fa-home"></i> Back to Dashboard
            </a>
            <a href="/pair" class="btn btn-secondary">
                <i class="fas fa-sync-alt"></i> Generate Another Code
            </a>
        </div>
    </div>
    
    <script>
        // Auto-copy code to clipboard on click
        document.querySelector('.code-display').addEventListener('click', function() {
            const code = this.textContent.trim();
            navigator.clipboard.writeText(code).then(() => {
                const originalText = this.textContent;
                this.textContent = '✓ COPIED!';
                this.style.color = '#00FF00';
                setTimeout(() => {
                    this.textContent = originalText;
                    this.style.color = '#00FF00';
                }, 2000);
            });
        });
        
        // Auto-refresh code if expired (after 2 minutes)
        setTimeout(() => {
            document.querySelector('.code-display').innerHTML = '<span style="color:#FF4444">EXPIRED</span>';
            document.querySelector('.code-display').classList.remove('pulse');
        }, 120000);
    </script>
</body>
</html>
                `);

                console.log(`✅ Pairing code generated for ${phoneNumber}: ${pairingCode}`);
                
            } catch (error) {
                console.error('❌ Pair error:', error);
                
                let errorMessage = error.message || 'Unknown error';
                let friendlyMessage = 'Failed to generate pairing code';
                
                if (errorMessage.includes('not ready')) {
                    friendlyMessage = 'Bot is not ready for pairing. Please wait for QR code to appear first.';
                } else if (errorMessage.includes('invalid phone')) {
                    friendlyMessage = 'Invalid phone number format. Please use international format without + sign.';
                } else if (errorMessage.includes('rate limit')) {
                    friendlyMessage = 'Too many attempts. Please wait a few minutes and try again.';
                }
                
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                <center style="padding: 40px;">
                <div style="background: rgba(0,0,0,0.8); padding: 40px; border-radius: 20px; max-width: 600px; border: 2px solid #E4002B;">
                <h1 style="color: #E4002B;"><i class="fas fa-exclamation-triangle"></i> Error</h1>
                <h3>${friendlyMessage}</h3>
                <p style="color: #C0C0C0; margin: 20px 0;">Technical details: ${errorMessage}</p>
                <p style="color: #FFA500; margin: 20px 0;">
                    <i class="fas fa-lightbulb"></i> 
                    Tip: Make sure your phone number is correct and in international format.<br>
                    Example: For Kenya (+254) and number 740007567, enter "254740007567"
                </p>
                <a href="/pair" style="display: inline-block; padding: 12px 30px; background: #00A0E9; color: white; text-decoration: none; border-radius: 10px; margin: 10px;">
                    <i class="fas fa-redo"></i> Try Again
                </a>
                <a href="/" style="display: inline-block; padding: 12px 30px; background: #C0C0C0; color: black; text-decoration: none; border-radius: 10px; margin: 10px;">
                    <i class="fas fa-home"></i> Dashboard
                </a>
                </div>
                </center>
                `);
            }
        });
        return;
    }
    
    else if (url === '/api/status') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ 
            status: botStatus,
            hasQR: !!latestQR,
            qr: latestQR,
            prefix: global.BOT_PREFIX,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            theme: 'mercedes',
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
    }
    
    else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #000000, #1a1a1a);
                    color: white; 
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
                    background: rgba(0,0,0,0.9); 
                    border-radius: 20px; 
                    border: 1px solid #E4002B;
                }
                h1 { 
                    color: #E4002B; 
                    font-size: 4rem; 
                    margin-bottom: 20px; 
                }
                p { 
                    font-size: 1.2rem; 
                    margin-bottom: 30px; 
                    color: #C0C0C0;
                }
                a { 
                    color: #00A0E9; 
                    text-decoration: none; 
                    font-size: 1.1rem; 
                    border: 1px solid #00A0E9; 
                    padding: 12px 30px; 
                    border-radius: 10px; 
                    transition: all 0.3s; 
                    display: inline-flex; 
                    align-items: center; 
                    gap: 10px;
                }
                a:hover { 
                    background: rgba(0,160,233,0.2); 
                    transform: translateY(-3px); 
                }
                .logo { 
                    font-size: 3rem; 
                    color: #C0C0C0; 
                    margin-bottom: 20px; 
                }
            </style>
        </head>
<body>
    <div class="container">
        <div class="logo">
            <i class="fas fa-star"></i>
        </div>
        <h1>404</h1>
        <p>The page you're looking for doesn't exist.</p>
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
    console.log(`\n📊 ===== CONFIGURATION LOADED =====`);
    console.log(`📱 Status auto-view: ${STATUS_CONFIG.AUTO_VIEW_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`💖 Status auto-react: ${STATUS_CONFIG.AUTO_LIKE_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`📰 Newsletter auto-follow: ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`🔥 Newsletter auto-react: ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`📋 Newsletter count: ${STATUS_CONFIG.NEWSLETTER_JIDS.length}`);
    console.log(`🎭 Status emojis: ${STATUS_CONFIG.AUTO_LIKE_EMOJIS.length}`);
    console.log(`🔥 Newsletter emojis: ${STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length}`);
    console.log(`📞 Country codes loaded: ${COUNTRY_CODES.length} countries`);
    console.log(`================================\n`);
    loadPrefix();
});

// Handle process events
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Mercedes Bot gracefully...');
    if (presenceInterval) clearInterval(presenceInterval);
    if (sock) sock.end();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});
