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

let latestQR = '';
let botStatus = 'disconnected';
let pairingCodes = new Map();
let presenceInterval = null;
let sock = null;
let isConnecting = false;

// ===== ACCESS CONTROL SYSTEM ===== //
class AccessControl {
    constructor() {
        this.allowedUsers = new Set(); // Users who have the bot connected
        this.blockedUsers = new Set(); // Users who are blocked
        this.adminUsers = new Set(); // Admin users (optional)
    }
    
    // Check if user can use commands
    canUseCommands(sender, isGroup) {
        // Always allow in groups
        if (isGroup) {
            return true;
        }
        
        // Check if user has the bot connected (is in allowedUsers)
        // This will be populated as people interact with the bot
        if (this.allowedUsers.has(sender)) {
            return true;
        }
        
        // If not in allowedUsers, check if they're in bot's contacts
        // This requires the bot to have their contact info
        return false;
    }
    
    // Add user to allowed list (when they interact with bot)
    addAllowedUser(sender) {
        this.allowedUsers.add(sender);
        console.log(`✅ Added ${sender} to allowed users`);
    }
    
    // Remove user from allowed list
    removeAllowedUser(sender) {
        this.allowedUsers.delete(sender);
        console.log(`❌ Removed ${sender} from allowed users`);
    }
    
    // Block a user
    blockUser(sender) {
        this.blockedUsers.add(sender);
        console.log(`🚫 Blocked user: ${sender}`);
    }
    
    // Unblock a user
    unblockUser(sender) {
        this.blockedUsers.delete(sender);
        console.log(`✅ Unblocked user: ${sender}`);
    }
    
    // Check if user is blocked
    isBlocked(sender) {
        return this.blockedUsers.has(sender);
    }
    
    // Get allowed users count
    getAllowedCount() {
        return this.allowedUsers.size;
    }
    
    // Save to file
    saveToFile() {
        try {
            const data = {
                allowedUsers: Array.from(this.allowedUsers),
                blockedUsers: Array.from(this.blockedUsers),
                adminUsers: Array.from(this.adminUsers),
                timestamp: new Date().toISOString()
            };
            
            fs.writeFileSync(
                path.join(__dirname, 'access_control.json'),
                JSON.stringify(data, null, 2)
            );
            console.log('💾 Access control saved to file');
        } catch (err) {
            console.error('❌ Error saving access control:', err);
        }
    }
    
    // Load from file
    loadFromFile() {
        try {
            const filePath = path.join(__dirname, 'access_control.json');
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                this.allowedUsers = new Set(data.allowedUsers || []);
                this.blockedUsers = new Set(data.blockedUsers || []);
                this.adminUsers = new Set(data.adminUsers || []);
                
                console.log(`📂 Loaded access control: ${this.allowedUsers.size} allowed users, ${this.blockedUsers.size} blocked users`);
            }
        } catch (err) {
            console.error('❌ Error loading access control:', err);
        }
    }
}

// Initialize access control
const accessControl = new AccessControl();

// ===== JID/LID UTILITIES ===== //
class JidUtils {
    // Parse JID to get useful information
    static parseJid(jid) {
        if (!jid) return null;
        
        return {
            raw: jid,
            isGroup: jid.endsWith('@g.us'),
            isBroadcast: jid === 'status@broadcast',
            isNewsletter: jid.endsWith('@newsletter'),
            isUser: jid.endsWith('@s.whatsapp.net'),
            number: jid.split('@')[0]
        };
    }
    
    // Check if JID is valid
    static isValidJid(jid) {
        if (!jid) return false;
        return jid.includes('@') && (
            jid.endsWith('@s.whatsapp.net') ||
            jid.endsWith('@g.us') ||
            jid.endsWith('@newsletter') ||
            jid === 'status@broadcast'
        );
    }
    
    // Get clean number from JID
    static getNumberFromJid(jid) {
        if (!jid) return null;
        const parts = jid.split('@');
        return parts[0];
    }
    
    // Check if message is from status
    static isStatusMessage(message) {
        return message?.key?.remoteJid === 'status@broadcast';
    }
    
    // Check if message is from newsletter
    static isNewsletterMessage(message) {
        return message?.key?.remoteJid?.endsWith('@newsletter');
    }
    
    // Check if message is from group
    static isGroupMessage(message) {
        return message?.key?.remoteJid?.endsWith('@g.us');
    }
    
    // Check if message is from private chat
    static isPrivateMessage(message) {
        return message?.key?.remoteJid?.endsWith('@s.whatsapp.net');
    }
}

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
            const parsedJid = JidUtils.parseJid(messageJid);
            
            // ===== 1. STATUS AUTO-VIEW & REACTION =====
            if (JidUtils.isStatusMessage(message)) {
                try {
                    const participant = message.key.participant;
                    console.log(`📱 Status detected from: ${participant}`);
                    
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
            
            // ===== 2. NEWSLETTER AUTO-REACTION =====
            if (STATUS_CONFIG.AUTO_REACT_NEWSLETTERS && JidUtils.isNewsletterMessage(message)) {
                try {
                    console.log(`📰 Newsletter post detected from: ${messageJid}`);
                    
                    // Get message ID
                    let messageId = message.newsletterServerId || message.key?.id;
                    
                    if (messageId && STATUS_CONFIG.NEWSLETTER_JIDS.includes(messageJid)) {
                        const randomEmoji = STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS[
                            Math.floor(Math.random() * STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length)
                        ];
                        
                        console.log(`🎯 Attempting to react with ${randomEmoji} (Message ID: ${messageId})`);
                        
                        // Try newsletterReactMessage
                        try {
                            await socket.newsletterReactMessage(
                                messageJid,
                                messageId.toString(),
                                randomEmoji
                            );
                            console.log(`✅ Newsletter reaction sent: ${randomEmoji}`);
                        } catch (reactError) {
                            console.log(`❌ Newsletter reaction failed: ${reactError.message}`);
                            
                            // Alternative method
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
                                console.log(`✅ Newsletter reaction sent via alternative: ${randomEmoji}`);
                            } catch (altError) {
                                console.log(`❌ Alternative reaction failed: ${altError.message}`);
                            }
                        }
                    }
                } catch (error) {
                    console.error('❌ Newsletter reaction error:', error.message);
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
                           `*📱 Status & Newsletter Features:*\n` +
                           `${statusFeatures.join('\n')}\n\n` +
                           `*📰 Following Newsletters:* ${STATUS_CONFIG.NEWSLETTER_JIDS.length}\n` +
                           `*🎭 Status Reactions:* ${STATUS_CONFIG.AUTO_LIKE_EMOJIS.length} emojis\n` +
                           `*🔥 Newsletter Reactions:* ${STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length} emojis\n\n` +
                           `*⚙️ Access Mode:*\n` +
                           `• Groups: Everyone can use commands\n` +
                           `• Private: Only users with bot connected\n` +
                           `• Allowed Users: ${accessControl.getAllowedCount()}`;
        
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
            
            // Load access control
            accessControl.loadFromFile();
            
            // Add bot owner to allowed users
            const botOwnerJid = sock.user?.id;
            if (botOwnerJid) {
                accessControl.addAllowedUser(botOwnerJid);
            }
            
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
                        }, 5000);
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
                    console.log(`👤 Allowed users: ${accessControl.getAllowedCount()}`);
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
           
            // ===== ENHANCED MESSAGE HANDLER WITH ACCESS CONTROL =====
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
                const sender = m.sender;
                const isGroup = m.isGroup;
                const parsedJid = JidUtils.parseJid(m.from);
                
                console.log(`📨 Message from: ${sender} | Type: ${parsedJid.isGroup ? 'Group' : 'Private'} | JID: ${m.from}`);
                
                // Check for commands
                if (m.body.startsWith(global.BOT_PREFIX)) {
                    // Check access control
                    if (!accessControl.canUseCommands(sender, isGroup)) {
                        console.log(`⛔ Access denied for ${sender} in ${isGroup ? 'group' : 'private'}`);
                        
                        // If in private chat and not allowed, send warning
                        if (!isGroup) {
                            try {
                                await sock.sendMessage(m.from, { 
                                    text: `⛔ *Access Restricted*\n\nYou need to have the bot connected to use commands in private chat.\n\n✅ *Allowed in groups*\n❌ *Restricted in private*\n\nAdd me to your contacts or use commands in a group where I'm added.`
                                });
                            } catch (err) {
                                console.log('Could not send access denied message');
                            }
                        }
                        return; // Stop processing
                    }
                    
                    // Add user to allowed list if they successfully use a command in private
                    if (!isGroup) {
                        accessControl.addAllowedUser(sender);
                        accessControl.saveToFile();
                    }
                    
                    const args = m.body.slice(global.BOT_PREFIX.length).trim().split(/\s+/);
                    const commandName = args.shift().toLowerCase();
                    const plugin = plugins.get(commandName);
                    
                    if (plugin) {
                        try { 
                            console.log(`✅ Executing command: ${commandName} for ${sender}`);
                            await plugin.execute(sock, m, args); 
                        } catch (err) { 
                            console.error(`❌ Plugin error (${commandName}):`, err); 
                            try {
                                await m.reply('❌ Error running command.'); 
                            } catch (replyErr) {}
                        }
                    } else {
                        // Command not found
                        console.log(`❓ Unknown command: ${commandName}`);
                        try {
                            await m.reply(`❌ Command not found: ${commandName}\nUse ${global.BOT_PREFIX}help for available commands.`);
                        } catch (replyErr) {}
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

            // Handle contacts update to automatically add to allowed users
            sock.ev.on('contacts.update', async (updates) => {
                for (const update of updates) {
                    if (update.id) {
                        accessControl.addAllowedUser(update.id);
                        console.log(`👥 Added contact to allowed users: ${update.id}`);
                    }
                }
                accessControl.saveToFile();
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

            // Periodically save access control
            setInterval(() => {
                accessControl.saveToFile();
            }, 300000); // Save every 5 minutes

        } catch (error) {
            console.error('❌ Bot startup error:', error);
            isConnecting = false;
            setTimeout(() => startBot(), 10000);
        }
    })();
}

// ===== ENHANCED WEB DASHBOARD ===== //
// (Keep the same web dashboard HTML as before, just updating the status display)
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
        /* (Keep all the CSS styles from your original code) */
        :root {
            --mercedes-black: #000000;
            --mercedes-silver: #C0C0C0;
            --mercedes-blue: #00A0E9;
            --mercedes-red: #E4002B;
            --gradient-mercedes: linear-gradient(135deg, #000000, #1a1a1a, #333333);
        }
        
        /* ... (All your CSS styles remain exactly the same) ... */
        
        .access-info {
            background: rgba(0, 0, 0, 0.8);
            border-radius: 15px;
            padding: 20px;
            margin: 20px 0;
            border-left: 4px solid var(--mercedes-blue);
        }
        
        .access-info h4 {
            color: var(--mercedes-silver);
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .access-rule {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 8px 0;
            padding: 8px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
        }
        
        .access-rule i {
            width: 20px;
            text-align: center;
        }
        
        .rule-group { color: #00FF00; }
        .rule-private { color: #FFA500; }
        .rule-blocked { color: #FF4444; }
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
                        <i class="fas fa-users"></i>
                    </div>
                    <h3>Allowed Users</h3>
                    <div class="status-value" style="color: var(--mercedes-silver);">${accessControl.getAllowedCount()}</div>
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
        
        <!-- Access Control Information -->
        <div class="access-info">
            <h4><i class="fas fa-shield-alt"></i> Access Control Rules</h4>
            <div class="access-rule">
                <i class="fas fa-users rule-group"></i>
                <span><strong>Group Chats:</strong> Everyone can use commands</span>
            </div>
            <div class="access-rule">
                <i class="fas fa-user rule-private"></i>
                <span><strong>Private Chats:</strong> Only users with bot connected</span>
            </div>
            <div class="access-rule">
                <i class="fas fa-ban rule-blocked"></i>
                <span><strong>Blocked Users:</strong> ${accessControl.blockedUsers.size} users blocked</span>
            </div>
        </div>
        
        <!-- Status & Newsletter Features Section -->
        <div class="features-grid">
            <!-- (Keep all feature cards exactly the same) -->
            ${/* ... Your feature cards HTML remains the same ... */}
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
        
        <!-- (Rest of your HTML remains exactly the same) -->
        ${/* ... Rest of your HTML dashboard ... */}
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
    
    // (Keep all other routes exactly the same: /pair, /api/status, etc.)
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
            access_control: {
                allowed_users: accessControl.getAllowedCount(),
                blocked_users: accessControl.blockedUsers.size,
                rules: {
                    groups: "Everyone can use commands",
                    private: "Only users with bot connected"
                }
            },
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
    console.log(`\n📊 ===== ACCESS CONTROL SYSTEM =====`);
    console.log(`👥 Groups: Everyone can use commands`);
    console.log(`🔒 Private: Only users with bot connected`);
    console.log(`✅ Allowed users will be auto-added when they use commands`);
    console.log(`================================\n`);
    
    console.log(`\n📊 ===== FEATURES STATUS =====`);
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
    // Save access control before exit
    accessControl.saveToFile();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});
