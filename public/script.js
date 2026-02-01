console.log('Multi-Session WhatsApp Bot Interface Loaded');

// Global variables
let currentSessionId = null;
let sessionsList = [];

// DOM Elements
const elements = {
    statusBadge: document.getElementById('status-badge'),
    statusText: document.getElementById('status-text'),
    qrContainer: document.getElementById('qr-container'),
    sessionSelect: document.getElementById('session-select'),
    sessionInfo: document.getElementById('session-info'),
    sessionsList: document.getElementById('sessions-list'),
    newSessionForm: document.getElementById('new-session-form'),
    sessionIdInput: document.getElementById('session-id'),
    phoneNumberInput: document.getElementById('phone-number')
};

// Initialize the interface
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing multi-session interface...');
    
    // Load sessions list
    loadSessions();
    
    // Setup event listeners
    setupEventListeners();
    
    // Start auto-refresh
    setInterval(loadSessions, 5000);
});

// Setup event listeners
function setupEventListeners() {
    // Session selection
    if (elements.sessionSelect) {
        elements.sessionSelect.addEventListener('change', function() {
            currentSessionId = this.value;
            if (currentSessionId) {
                loadSessionInfo(currentSessionId);
            }
        });
    }
    
    // New session form
    if (elements.newSessionForm) {
        elements.newSessionForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            await createNewSession();
        });
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadSessions);
    }
}

// Load all sessions
async function loadSessions() {
    try {
        const response = await fetch('/api/sessions');
        const data = await response.json();
        
        if (data.success) {
            sessionsList = data.sessions;
            updateSessionsList(data.sessions);
            
            // Auto-select first session if none selected
            if (!currentSessionId && data.sessions.length > 0) {
                currentSessionId = data.sessions[0].session_id;
                loadSessionInfo(currentSessionId);
            }
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

// Update sessions list display
function updateSessionsList(sessions) {
    if (!elements.sessionsList) return;
    
    let html = '';
    
    sessions.forEach(session => {
        const statusClass = getStatusClass(session.status);
        const isActive = session.isActive;
        
        html += `
            <div class="session-item ${isActive ? 'active' : ''}" data-id="${session.session_id}">
                <div class="session-header">
                    <div class="session-id">${session.session_id}</div>
                    <div class="session-status ${statusClass}">
                        <span class="status-dot"></span>
                        ${session.status}
                    </div>
                </div>
                <div class="session-details">
                    <div class="session-phone">${session.phone_number || 'No number'}</div>
                    <div class="session-actions">
                        <button class="btn-sm" onclick="selectSession('${session.session_id}')">
                            Select
                        </button>
                        <button class="btn-sm btn-danger" onclick="stopSession('${session.session_id}')">
                            Stop
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    elements.sessionsList.innerHTML = html || '<div class="no-sessions">No sessions found</div>';
}

// Get CSS class for status
function getStatusClass(status) {
    const statusMap = {
        'connected': 'status-connected',
        'connecting': 'status-connecting',
        'qr_ready': 'status-qr',
        'disconnected': 'status-disconnected',
        'error': 'status-error'
    };
    return statusMap[status] || 'status-unknown';
}

// Load session info
async function loadSessionInfo(sessionId) {
    try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        const data = await response.json();
        
        if (data.success) {
            updateSessionDisplay(data.session);
            
            // Load QR code if available
            if (data.session.status === 'qr_ready') {
                loadQRCode(sessionId);
            }
        }
    } catch (error) {
        console.error('Error loading session info:', error);
    }
}

// Update session display
function updateSessionDisplay(session) {
    if (!elements.sessionInfo) return;
    
    const statusClass = getStatusClass(session.status);
    
    let html = `
        <div class="session-card">
            <div class="session-header">
                <h3>Session: ${session.sessionId}</h3>
                <div class="session-status ${statusClass}">
                    ${session.status}
                </div>
            </div>
            
            <div class="session-details">
                <div class="detail-row">
                    <strong>Phone Number:</strong>
                    <span>${session.phoneNumber || 'Not connected'}</span>
                </div>
                <div class="detail-row">
                    <strong>Active:</strong>
                    <span>${session.active ? 'Yes' : 'No'}</span>
                </div>
                <div class="detail-row">
                    <strong>Last Active:</strong>
                    <span>${session.lastActive ? new Date(session.lastActive).toLocaleString() : 'Never'}</span>
                </div>
            </div>
            
            <div class="session-actions">
                <button class="btn" onclick="loadQRCode('${session.sessionId}')">
                    <i class="fas fa-qrcode"></i> Show QR
                </button>
                <button class="btn btn-secondary" onclick="refreshSession('${session.sessionId}')">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
                <button class="btn btn-danger" onclick="stopSession('${session.sessionId}')">
                    <i class="fas fa-stop"></i> Stop
                </button>
            </div>
        </div>
    `;
    
    elements.sessionInfo.innerHTML = html;
}

// Load QR code
async function loadQRCode(sessionId) {
    try {
        const response = await fetch(`/api/sessions/${sessionId}/qr`);
        const data = await response.json();
        
        if (data.success && data.qrCode) {
            updateQRDisplay(data.qrCode, sessionId);
        } else {
            updateQRDisplay(null, 'QR code not available');
        }
    } catch (error) {
        console.error('Error loading QR code:', error);
        updateQRDisplay(null, 'Error loading QR code');
    }
}

// Update QR display
function updateQRDisplay(qrCode, sessionId) {
    if (!elements.qrContainer) return;
    
    if (qrCode) {
        elements.qrContainer.innerHTML = `
            <div class="qr-display">
                <h3>QR Code for ${sessionId}</h3>
                <img src="${qrCode}" alt="WhatsApp QR Code" class="qr-image">
                <p class="qr-instruction">
                    <i class="fas fa-info-circle"></i>
                    1. Open WhatsApp → Settings<br>
                    2. Tap "Linked Devices"<br>
                    3. Scan this QR code
                </p>
                <button class="btn" onclick="downloadQR('${qrCode}', '${sessionId}')">
                    <i class="fas fa-download"></i> Download QR
                </button>
            </div>
        `;
    } else {
        elements.qrContainer.innerHTML = `
            <div class="qr-placeholder">
                <i class="fas fa-qrcode"></i>
                <h3>${sessionId || 'No QR Code Available'}</h3>
                <p>Start a session or wait for QR generation</p>
            </div>
        `;
    }
}

// Download QR code
function downloadQR(qrCode, sessionId) {
    const link = document.createElement('a');
    link.href = qrCode;
    link.download = `whatsapp-qr-${sessionId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Create new session
async function createNewSession() {
    const sessionId = elements.sessionIdInput?.value || `session_${Date.now()}`;
    const phoneNumber = elements.phoneNumberInput?.value;
    
    try {
        const response = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, phoneNumber })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Session created: ${data.sessionId}`);
            loadSessions();
            
            // Clear form
            if (elements.newSessionForm) {
                elements.newSessionForm.reset();
            }
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error creating session:', error);
        alert('Error creating session');
    }
}

// Stop session
async function stopSession(sessionId) {
    if (!confirm(`Are you sure you want to stop session: ${sessionId}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Session ${sessionId} stopped`);
            loadSessions();
            
            // Clear current session if it was stopped
            if (currentSessionId === sessionId) {
                currentSessionId = null;
                elements.sessionInfo.innerHTML = '';
                elements.qrContainer.innerHTML = '';
            }
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error stopping session:', error);
        alert('Error stopping session');
    }
}

// Refresh session
function refreshSession(sessionId) {
    loadSessionInfo(sessionId);
}

// Select session
function selectSession(sessionId) {
    currentSessionId = sessionId;
    loadSessionInfo(sessionId);
    
    // Scroll to session info
    const sessionInfo = document.getElementById('session-info');
    if (sessionInfo) {
        sessionInfo.scrollIntoView({ behavior: 'smooth' });
    }
}

// Global functions for buttons
window.selectSession = selectSession;
window.stopSession = stopSession;
window.loadQRCode = loadQRCode;
window.refreshSession = refreshSession;
window.downloadQR = downloadQR;
