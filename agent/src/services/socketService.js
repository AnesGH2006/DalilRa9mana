'use strict';

const { io } = require('socket.io-client');
const config  = require('../config.js');

let socket         = null;
let heartbeatTimer = null;
let callbacks      = {};

/**
 * Connect to the server using the stored agent token.
 * @param {string} token
 * @param {{ onStatus, onCommand }} cbs
 */
function connect(token, cbs = {}) {
  if (socket?.connected) return;
  callbacks = cbs;

  socket = io(config.SERVER_URL, {
    path:               config.SOCKET_PATH,
    auth:               { token },
    transports:         ['websocket'],
    reconnection:       true,
    reconnectionDelay:  config.RECONNECT_MS,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    callbacks.onStatus?.('connected');
    _startHeartbeat();
  });

  socket.on('connect_error', (err) => {
    callbacks.onStatus?.('error', err.message);
  });

  socket.on('disconnect', (reason) => {
    callbacks.onStatus?.('disconnected', reason);
    _stopHeartbeat();
  });

  socket.on('agent:command', (payload) => {
    callbacks.onCommand?.(payload);
  });
}

function disconnect() {
  _stopHeartbeat();
  socket?.disconnect();
  socket = null;
}

function isConnected() {
  return socket?.connected ?? false;
}

/**
 * Report the result of an executed task back to the server.
 */
function reportResult(action, status, details) {
  if (!socket?.connected) return;
  socket.emit('agent:taskResult', { action, status, details, taskId: String(Date.now()) });
}

function _startHeartbeat() {
  _stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    socket?.emit('agent:ping', (res) => {
      if (!res?.ok) _stopHeartbeat();
    });
  }, config.HEARTBEAT_MS);
}

function _stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

module.exports = { connect, disconnect, isConnected, reportResult };
