'use strict';

module.exports = {
  // Change this to your production server URL before distributing
  SERVER_URL: process.env.AGENT_SERVER_URL || 'https://dalilra9mana.onrender.com',
  SOCKET_PATH: '/agent-socket',

  ENDPOINTS: {
    createToken: '/api/agent/token',
    status:      '/api/agent/status',
    uploadExcel: '/api/agent/upload-excel',
    folders:     '/api/agent/folders',
    logs:        '/api/agent/logs',
  },

  HEARTBEAT_MS:   30_000,  // ping every 30 s
  RECONNECT_MS:    5_000,  // base reconnect delay
  TOKEN_FILE:     '.agent_token',
  SETTINGS_FILE:  'settings.json',
  LOG_FILE:       'agent.log',
  MAX_LOG_LINES:  500,
};
