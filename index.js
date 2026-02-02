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
// ========================= //

// ===== MODE SYSTEM ===== //
const MODE_CONFIG_PATH = path.join(__dirname, 'mode_config.json');
const MODES = {
    PUBLIC: 'public',
    PRIVATE: 'private'
};

let currentMode = MODES.PRIVATE;
let owner = '254740007567@s.whatsapp.net'; // Default owner

// Load mode config
function loadModeConfig() {
    try {
        if (fs.existsSync(MODE_CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(MODE_CONFIG_PATH, 'utf8'));
            currentMode = config.mode || MODES.PRIVATE;
            owner = config.owner || owner;
            console.log(`✅ Mode loaded: ${currentMode}`);
            console.log(`✅ Owner: ${owner}`);
        } else {
            const defaultConfig = {
                mode: MODES.PRIVATE,
                owner: owner,
                version: '1.0',
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(MODE_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
            console.log('📁 Created default mode config file');
        }
    } catch (err) {
        console.error('❌ Error loading mode config:', err);
    }
}

// Save mode config
function saveModeConfig() {
    try {
        const config = {
            mode: currentMode,
            owner: owner,
            version: '1.0',
            prefix: global.BOT_PREFIX || '.',
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(MODE_CONFIG_PATH, JSON.stringify(config, null, 2));
        return true;
    } catch (err) {
        console.error('❌ Error saving mode config:', err);
        return false;
    }
}

// Check if user is owner
function isOwner(sender) {
    return sender === owner;
}

// Check if command should be allowed based on mode
function shouldAllowCommand(m, isGroup) {
    // Owner can always use commands
    if (isOwner(m.sender)) {
        return true;
    }
    
    // Private mode: only owner can use commands
    if (currentMode === MODES.PRIVATE) {
        return false;
    }
    
    // Public mode: everyone can use commands
    if (currentMode === MODES.PUBLIC) {
        return true;
    }
    
    // Default deny
    return false;
}
// ======================= //

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
                // Try to follow newsletter
                await socket.newsletterFollow(newsletterJid);
                console.log(`✅ Followed newsletter: ${newsletterJid}`);
                followedCount++;
                
                // Wait to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                if (error.message.includes('already subscribed') || 
                    error.message.includes('already following') ||
                    error.message.includes('subscription exists')) {
                    console.log(`📌 Already following: ${newsletterJid}`);
                    alreadyFollowingCount++;
                } else {
                    console.error(`❌ Failed to follow ${newsletterJid}:`, error.message);
                    failedCount++;
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
                    
                    // Auto-set "recording" presence
                    if (STATUS_CONFIG.AUTO_RECORDING) {
                        try {
                            await socket.sendPresenceUpdate("recording", messageJid);
                        } catch (presenceError) {}
                    }
                    
                    // Auto-view status
                    if (STATUS_CONFIG.AUTO_VIEW_STATUS) {
                        try {
                            await socket.readMessages([message.key]);
                        } catch (viewError) {}
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
                            
                        } catch (reactError) {}
                    }
                    
                } catch (error) {}
                continue;
            }
            
            // ===== 2. NEWSLETTER AUTO-REACTION (FIXED VERSION) =====
            if (STATUS_CONFIG.AUTO_REACT_NEWSLETTERS) {
                try {
                    // Check if message is from a newsletter we should react to
                    if (STATUS_CONFIG.NEWSLETTER_JIDS.includes(messageJid)) {
                        // Get message ID
                        let messageId = null;
                        
                        // Try different locations for message ID
                        if (message.newsletterServerId) {
                            messageId = message.newsletterServerId;
                        } else if (message.key?.id) {
                            messageId = message.key.id;
                        } else if (message.message?.newsletterServerId) {
                            messageId = message.message.newsletterServerId;
                        }
                        
                        if (messageId) {
                            // Random emoji
                            const randomEmoji = STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS[
                                Math.floor(Math.random() * STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length)
                            ];
                            
                            // Method 1: Try newsletterReactMessage
                            try {
                                // Convert messageId to string for API
                                const msgIdStr = messageId.toString();
                                
                                // Newsletter reaction
                                await socket.newsletterReactMessage(
                                    messageJid,
                                    msgIdStr,
                                    randomEmoji
                                );
                                
                                console.log(`✅ Newsletter reaction sent: ${randomEmoji} to ${messageJid}`);
                            } catch (reactError) {
                                console.log(`❌ Newsletter reaction failed for ${messageJid}:`, reactError.message);
                            }
                        }
                    }
                } catch (error) {
                    // Silent fail for newsletter reactions
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
        
        const welcomeText = `🌟 *Mercedes WhatsApp Bot Connected!*\n\n` +
                           `📝 *Prefix:* ${global.BOT_PREFIX}\n` +
                           `⏰ *Connected:* ${new Date().toLocaleString()}\n` +
                           `🚗 *Powered by Mercedes Technology*\n\n` +
                           `*🤖 Bot Mode:* ${currentMode.toUpperCase()}\n` +
                           `*👑 Owner:* @${owner.split('@')[0]}\n\n` +
                           `*📱 Status & Newsletter Features:*\n` +
                           `${statusFeatures.join('\n')}\n\n` +
                           `*📰 Following Newsletters:* ${STATUS_CONFIG.NEWSLETTER_JIDS.length}\n` +
                           `*🎭 Status Reactions:* ${STATUS_CONFIG.AUTO_LIKE_EMOJIS.length} emojis\n` +
                           `*🔥 Newsletter Reactions:* ${STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length} emojis`;
        
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
                browser: ['Mercedes Bot', 'Chrome', '1.0.0']
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

                    // Load mode config
                    loadModeConfig();

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

                    // Send enhanced welcome message
                    try { 
                        await sendEnhancedWelcomeMessage(sock);
                    } catch (err) { 
                        console.error('Could not send welcome message:', err); 
                    }
                    
                    console.log('\n📊 ===== FEATURES STATUS =====');
                    console.log(`🤖 Bot Mode: ${currentMode.toUpperCase()}`);
                    console.log(`👑 Owner: ${owner}`);
                    console.log(`📱 Status auto-view: ${STATUS_CONFIG.AUTO_VIEW_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`💖 Status auto-react: ${STATUS_CONFIG.AUTO_LIKE_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`📰 Newsletter auto-follow: ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`🔥 Newsletter auto-react: ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`📋 Newsletter count: ${STATUS_CONFIG.NEWSLETTER_JIDS.length}`);
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
           
            // Handle incoming messages with MODE CHECK
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;
                
                // Status handling is already in setupEnhancedHandlers
                // Keep backward compatibility for status viewing
                for (const rawMsg of messages) {
                    if (rawMsg.key.remoteJid === 'status@broadcast' && rawMsg.key.participant) {
                        try {
                            await sock.readMessages([rawMsg.key]);
                            continue;
                        } catch (err) {}
                    }
                }

                const rawMsg = messages[0];
                if (!rawMsg.message) return;

                const m = await serializeMessage(sock, rawMsg);
                
                // ===== MODE CHECK FOR COMMANDS =====
                if (m.body.startsWith(global.BOT_PREFIX)) {
                    // Check if user has access based on mode
                    if (!shouldAllowCommand(m, m.isGroup)) {
                        // Only reply in private chat
                        if (!m.isGroup) {
                            try {
                                await sock.sendMessage(m.from, { 
                                    text: `⛔ *Access Denied*\n\nBot is in *${currentMode} mode*.\n🔒 Only owner (@${owner.split('@')[0]}) can use commands.\n\nUse ${global.BOT_PREFIX}mode status for details.`
                                });
                            } catch (err) {}
                        }
                        return; // Stop processing
                    }
                    
                    const args = m.body.slice(global.BOT_PREFIX.length).trim().split(/\s+/);
                    const commandName = args.shift().toLowerCase();
                    const plugin = plugins.get(commandName);
                    
                    if (plugin) {
                        try { 
                            await plugin.execute(sock, m, args); 
                        } catch (err) { 
                            console.error(`❌ Plugin error (${commandName}):`, err); 
                            try {
                                await m.reply('❌ Error running command.'); 
                            } catch (replyErr) {}
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

        } catch (error) {
            console.error('❌ Bot startup error:', error);
            isConnecting = false;
            setTimeout(() => startBot(), 10000);
        }
    })();
}

// ===== WEB DASHBOARD ===== //
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
        
        .mode-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            margin: 10px 0;
        }
        
        .mode-public { background: rgba(0, 255, 0, 0.2); color: #00FF00; }
        .mode-private { background: rgba(255, 68, 68, 0.2); color: #FF4444; }
        
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
            max-width: 500px;
            margin: 0 auto;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 10px;
            font-size: 1.1rem;
            color: var(--mercedes-silver);
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
        
        .btn-group {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 30px;
            flex-wrap: wrap;
        }
        
        .footer {
            text-align: center;
            margin-top: 60px;
            padding-top: 30px;
            border-top: 1px solid rgba(192, 192, 192, 0.3);
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.9rem;
        }
        
        @media (max-width: 768px) {
            .header h1 { font-size: 2.5rem; }
            .status-container { flex-direction: column; align-items: center; }
            .features-grid { grid-template-columns: 1fr; }
            .btn-group { flex-direction: column; align-items: center; }
            .btn { width: 100%; max-width: 300px; }
            .qr-container img { width: 220px; height: 220px; }
        }
        
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }
        
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: var(--mercedes-blue);
            animation: spin 1s ease-in-out infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
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
                Enter your phone number in international format to receive a pairing code
            </p>
            
            <form method="POST" action="/pair" id="pairForm">
                <div class="form-group">
                    <label for="phone"><i class="fas fa-phone"></i> Phone Number</label>
                    <input type="text" name="phone" id="phone" class="form-control" 
                           placeholder="911234567890 (without +)" required>
                    <small style="color: rgba(255,255,255,0.6); display: block; margin-top: -15px; margin-bottom: 20px;">
                        Example: 911234567890 for +91-1234567890
                    </small>
                    
                    <button type="submit" class="btn btn-primary" id="pairBtn">
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
        Phone: <input type="text" name="phone" placeholder="911234567890" required><br><br>
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
                let phoneNumber = params.get('phone').trim();
                
                if (!phoneNumber) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                    <center>
                    <h2>❌ Error: Phone number required</h2>
                    <a href="/pair">Try Again</a>
                    </center>
                    `);
                    return;
                }

                phoneNumber = phoneNumber.replace(/\D/g, '');
                
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

                const pairingCode = await sock.requestPairingCode(phoneNumber);
                
                pairingCodes.set(phoneNumber, {
                    code: pairingCode,
                    timestamp: Date.now()
                });

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial; background: linear-gradient(135deg, #000, #1a1a1a); color: white; padding: 20px; text-align: center; }
        .code { font-size: 2em; color: green; font-weight: bold; margin: 20px; background: rgba(0,0,0,0.8); padding: 20px; border-radius: 10px; }
        .info { background: rgba(0,160,233,0.1); padding: 15px; margin: 20px; border-radius: 5px; }
        a { color: #00A0E9; text-decoration: none; margin: 10px; display: inline-block; }
    </style>
</head>
<body>
    <h1>✅ Pairing Code Generated</h1>
    <h2>Phone: ${phoneNumber}</h2>
    
    <div class="code">
        Code: ${pairingCode}
    </div>
    
    <div class="info">
        <p>📱 Go to WhatsApp > Settings > Linked Devices > Link a Device</p>
        <p>🔢 Select "Use pairing code" and enter the code above</p>
    </div>
    
    <br>
    <a href="/">🏠 Home</a> | <a href="/pair">🔄 Pair Another</a>
</body>
</html>
                `);

                console.log(`✅ Pairing code for ${phoneNumber}: ${pairingCode}`);
                
            } catch (error) {
                console.error('❌ Pair error:', error);
                
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                <center>
                <h2>❌ Error</h2>
                <p>${error.message}</p>
                <p>Make sure the phone number is in international format (e.g., 911234567890)</p>
                <a href="/pair">↩️ Try Again</a>
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
