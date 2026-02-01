const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { Boom } = require('@hapi/boom');

// ===== CONFIGURATION ===== //
const SUPABASE_URL = process.env.SUPABASE_URL || 'your-supabase-url';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-supabase-anon-key';
const PORT = process.env.PORT || 3000;

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Global storage for active sessions
const activeSessions = new Map(); // session_id -> { socket, authFolder, status, etc }

// App setup
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// ===== SESSION MANAGEMENT FUNCTIONS ===== //

/**
 * Get or create session in database
 */
async function getOrCreateSession(sessionId, phoneNumber = null) {
    try {
        // Check if session exists
        const { data: existingSession, error } = await supabase
            .from('whatsapp_sessions')
            .select('*')
            .eq('session_id', sessionId)
            .single();

        if (!existingSession) {
            // Create new session
            const { data: newSession, error: createError } = await supabase
                .from('whatsapp_sessions')
                .insert({
                    session_id: sessionId,
                    phone_number: phoneNumber,
                    status: 'initializing',
                    config_data: { prefix: '.', mode: 'public' },
                    auth_data: {}
                })
                .select()
                .single();

            if (createError) throw createError;
            return newSession;
        }

        return existingSession;
    } catch (error) {
        console.error('Error in getOrCreateSession:', error);
        throw error;
    }
}

/**
 * Update session status
 */
async function updateSessionStatus(sessionId, status, qrCode = null) {
    try {
        const updates = {
            status: status,
            updated_at: new Date().toISOString()
        };

        if (qrCode) {
            updates.qr_code = qrCode;
        }

        if (status === 'connected') {
            updates.last_active = new Date().toISOString();
        }

        const { error } = await supabase
            .from('whatsapp_sessions')
            .update(updates)
            .eq('session_id', sessionId);

        if (error) throw error;
        console.log(`Session ${sessionId} status updated to: ${status}`);
    } catch (error) {
        console.error('Error updating session status:', error);
    }
}

/**
 * Save auth data to Supabase
 */
async function saveAuthData(sessionId, authData) {
    try {
        const { error } = await supabase
            .from('whatsapp_sessions')
            .update({
                auth_data: authData,
                updated_at: new Date().toISOString()
            })
            .eq('session_id', sessionId);

        if (error) throw error;
        console.log(`Auth data saved for session: ${sessionId}`);
    } catch (error) {
        console.error('Error saving auth data:', error);
    }
}

/**
 * Load auth data from Supabase
 */
async function loadAuthData(sessionId) {
    try {
        const { data, error } = await supabase
            .from('whatsapp_sessions')
            .select('auth_data')
            .eq('session_id', sessionId)
            .single();

        if (error) throw error;
        return data?.auth_data || null;
    } catch (error) {
        console.error('Error loading auth data:', error);
        return null;
    }
}

/**
 * Create local auth folder for session
 */
function createAuthFolder(sessionId) {
    const authFolder = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(authFolder)) {
        fs.mkdirSync(authFolder, { recursive: true });
    }
    return authFolder;
}

/**
 * Clean up session folder
 */
function cleanupSessionFolder(sessionId) {
    try {
        const authFolder = path.join(__dirname, 'sessions', sessionId);
        if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
            console.log(`Cleaned up folder for session: ${sessionId}`);
        }
    } catch (error) {
        console.error('Error cleaning up session folder:', error);
    }
}

// ===== BOT FUNCTIONS ===== //

/**
 * Start a WhatsApp session
 */
async function startSession(sessionId, phoneNumber = null) {
    try {
        // Check if session already active
        if (activeSessions.has(sessionId)) {
            console.log(`Session ${sessionId} is already active`);
            return { success: false, message: 'Session already active' };
        }

        // Get or create session in database
        const sessionData = await getOrCreateSession(sessionId, phoneNumber);
        
        // Update status
        await updateSessionStatus(sessionId, 'initializing');

        // Create local auth folder
        const authFolder = createAuthFolder(sessionId);

        // Start the bot
        const bot = await initializeBot(sessionId, authFolder, phoneNumber);
        
        // Store in active sessions
        activeSessions.set(sessionId, {
            socket: bot.socket,
            authFolder: authFolder,
            status: 'connecting',
            phoneNumber: phoneNumber,
            qrCode: null
        });

        console.log(`Session ${sessionId} started successfully`);
        return { 
            success: true, 
            sessionId: sessionId,
            message: 'Session started successfully' 
        };

    } catch (error) {
        console.error('Error starting session:', error);
        await updateSessionStatus(sessionId, 'error');
        return { success: false, message: error.message };
    }
}

/**
 * Initialize WhatsApp bot for a session
 */
async function initializeBot(sessionId, authFolder, phoneNumber) {
    const logger = pino({ level: 'info' });
    
    // Load auth state
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    
    // Get latest WhatsApp version
    const { version } = await fetchLatestWaWebVersion();
    
    // Create socket
    const socket = makeWASocket({
        version,
        logger,
        auth: state,
        printQRInTerminal: false,
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: true,
        syncFullHistory: false
    });

    // Event: Connection updates
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const session = activeSessions.get(sessionId);

        if (qr) {
            // Generate QR code
            QRCode.toDataURL(qr, async (err, qrCode) => {
                if (!err && session) {
                    session.qrCode = qrCode;
                    await updateSessionStatus(sessionId, 'qr_ready', qrCode);
                }
            });
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error instanceof Boom) 
                ? lastDisconnect.error.output.statusCode 
                : 0;

            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            await updateSessionStatus(sessionId, 'disconnected');

            if (shouldReconnect) {
                console.log(`Session ${sessionId} disconnected, reconnecting...`);
                setTimeout(() => {
                    if (activeSessions.has(sessionId)) {
                        activeSessions.delete(sessionId);
                        startSession(sessionId, phoneNumber);
                    }
                }, 10000);
            } else {
                console.log(`Session ${sessionId} logged out`);
                activeSessions.delete(sessionId);
                cleanupSessionFolder(sessionId);
                await updateSessionStatus(sessionId, 'logged_out');
            }
        } else if (connection === 'open') {
            console.log(`Session ${sessionId} connected successfully`);
            await updateSessionStatus(sessionId, 'connected');
            
            if (session) {
                session.status = 'connected';
                
                // Save session data
                await supabase
                    .from('whatsapp_sessions')
                    .update({
                        phone_number: socket.user?.id?.split(':')[0],
                        last_active: new Date().toISOString()
                    })
                    .eq('session_id', sessionId);
            }
        }
    });

    // Event: Credentials update
    socket.ev.on('creds.update', async () => {
        await saveCreds();
        
        // Read and save auth data to Supabase
        try {
            const authFiles = {};
            const files = fs.readdirSync(authFolder);
            
            for (const file of files) {
                const filePath = path.join(authFolder, file);
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    authFiles[file] = content;
                } catch (err) {
                    console.error(`Failed to read ${file}:`, err);
                }
            }
            
            await saveAuthData(sessionId, authFiles);
        } catch (error) {
            console.error('Error saving auth files to Supabase:', error);
        }
    });

    // Event: Messages
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        // Log messages to database (optional)
        for (const msg of messages) {
            if (msg.message) {
                await supabase
                    .from('session_messages')
                    .insert({
                        session_id: sessionId,
                        sender: msg.key.remoteJid,
                        message: JSON.stringify(msg.message),
                        type: Object.keys(msg.message)[0]
                    });
            }
        }

        // Auto-view status
        const statusMsg = messages.find(m => 
            m.key.remoteJid === 'status@broadcast' && m.key.participant
        );
        
        if (statusMsg) {
            try {
                await socket.readMessages([statusMsg.key]);
                console.log(`Session ${sessionId}: Status viewed`);
            } catch (err) {
                console.log(`Session ${sessionId}: Status view error:`, err.message);
            }
        }
    });

    // Request pairing code if phone number provided
    if (phoneNumber) {
        setTimeout(async () => {
            try {
                const pairingCode = await socket.requestPairingCode(phoneNumber);
                console.log(`Session ${sessionId}: Pairing code for ${phoneNumber}: ${pairingCode}`);
                
                // Store pairing code in session
                const session = activeSessions.get(sessionId);
                if (session) {
                    session.pairingCode = pairingCode;
                }
            } catch (error) {
                console.error(`Session ${sessionId}: Failed to get pairing code:`, error.message);
            }
        }, 3000);
    }

    return { socket, saveCreds };
}

/**
 * Stop a session
 */
async function stopSession(sessionId) {
    try {
        const session = activeSessions.get(sessionId);
        if (session) {
            if (session.socket) {
                session.socket.ws.close();
            }
            activeSessions.delete(sessionId);
            await updateSessionStatus(sessionId, 'stopped');
            cleanupSessionFolder(sessionId);
            return { success: true, message: 'Session stopped' };
        }
        return { success: false, message: 'Session not found' };
    } catch (error) {
        console.error('Error stopping session:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Get session info
 */
async function getSessionInfo(sessionId) {
    try {
        const session = activeSessions.get(sessionId);
        const { data: dbData } = await supabase
            .from('whatsapp_sessions')
            .select('*')
            .eq('session_id', sessionId)
            .single();

        return {
            sessionId,
            active: !!session,
            status: dbData?.status || 'unknown',
            phoneNumber: dbData?.phone_number,
            qrCode: dbData?.qr_code,
            lastActive: dbData?.last_active,
            config: dbData?.config_data,
            connectionInfo: session ? {
                hasSocket: !!session.socket,
                authFolder: session.authFolder,
                pairingCode: session.pairingCode
            } : null
        };
    } catch (error) {
        console.error('Error getting session info:', error);
        return { sessionId, error: error.message };
    }
}

// ===== API ROUTES ===== //

// Get all sessions
app.get('/api/sessions', async (req, res) => {
    try {
        const { data: sessions, error } = await supabase
            .from('whatsapp_sessions')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        const sessionsWithStatus = sessions.map(session => ({
            ...session,
            isActive: activeSessions.has(session.session_id),
            activeInfo: activeSessions.get(session.session_id) || null
        }));

        res.json({ success: true, sessions: sessionsWithStatus });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create/Start a new session
app.post('/api/sessions', async (req, res) => {
    try {
        const { sessionId, phoneNumber } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                message: 'sessionId is required' 
            });
        }

        const result = await startSession(sessionId, phoneNumber);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get session details
app.get('/api/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const sessionInfo = await getSessionInfo(sessionId);
        res.json({ success: true, session: sessionInfo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop a session
app.delete('/api/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = await stopSession(sessionId);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get QR code for session
app.get('/api/sessions/:sessionId/qr', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = activeSessions.get(sessionId);
        
        if (session && session.qrCode) {
            res.json({ success: true, qrCode: session.qrCode });
        } else {
            // Check database for QR
            const { data: dbData } = await supabase
                .from('whatsapp_sessions')
                .select('qr_code')
                .eq('session_id', sessionId)
                .single();

            if (dbData?.qr_code) {
                res.json({ success: true, qrCode: dbData.qr_code });
            } else {
                res.status(404).json({ 
                    success: false, 
                    message: 'QR code not available' 
                });
            }
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update session config
app.put('/api/sessions/:sessionId/config', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { config } = req.body;

        const { error } = await supabase
            .from('whatsapp_sessions')
            .update({ 
                config_data: config,
                updated_at: new Date().toISOString()
            })
            .eq('session_id', sessionId);

        if (error) throw error;
        
        res.json({ 
            success: true, 
            message: 'Config updated successfully' 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get active sessions count
app.get('/api/active-count', (req, res) => {
    res.json({ 
        success: true, 
        count: activeSessions.size,
        sessions: Array.from(activeSessions.keys())
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'online',
        timestamp: new Date().toISOString(),
        activeSessions: activeSessions.size,
        memory: process.memoryUsage()
    });
});

// Auto-reconnect existing sessions on startup
async function reconnectSessions() {
    try {
        const { data: sessions, error } = await supabase
            .from('whatsapp_sessions')
            .select('session_id, phone_number, status')
            .in('status', ['connected', 'qr_ready', 'initializing'])
            .order('updated_at', { ascending: false });

        if (error) throw error;

        console.log(`Found ${sessions?.length || 0} sessions to reconnect`);

        for (const session of sessions || []) {
            if (!activeSessions.has(session.session_id)) {
                console.log(`Reconnecting session: ${session.session_id}`);
                await startSession(session.session_id, session.phone_number);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Delay between reconnects
            }
        }
    } catch (error) {
        console.error('Error reconnecting sessions:', error);
    }
}

// ===== START SERVER ===== //
app.listen(PORT, async () => {
    console.log(`🚀 Multi-session WhatsApp Bot running on port ${PORT}`);
    console.log(`📊 Using Supabase for session storage`);
    console.log(`📁 Sessions folder: ${path.join(__dirname, 'sessions')}`);
    
    // Create sessions directory if it doesn't exist
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
    }
    
    // Reconnect existing sessions
    await reconnectSessions();
    
    console.log(`✅ Ready to accept new sessions!`);
    console.log(`📝 API Endpoints:`);
    console.log(`   GET  /api/sessions           - List all sessions`);
    console.log(`   POST /api/sessions           - Create new session`);
    console.log(`   GET  /api/sessions/:id       - Get session info`);
    console.log(`   GET  /api/sessions/:id/qr    - Get QR code`);
    console.log(`   PUT  /api/sessions/:id/config - Update config`);
    console.log(`   DELETE /api/sessions/:id     - Stop session`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    
    // Stop all active sessions
    for (const [sessionId, session] of activeSessions) {
        if (session.socket) {
            session.socket.ws.close();
        }
        await updateSessionStatus(sessionId, 'stopped');
    }
    
    process.exit(0);
});
