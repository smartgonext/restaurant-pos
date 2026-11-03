import dgram from 'dgram';
import os from 'os';

const DISCOVERY_PORT = parseInt(process.env.LAN_DISCOVERY_PORT || '3002', 10);
const BROADCAST_ADDR = '255.255.255.255';
const BEACON_MAGIC = 'RESTAURANT_POS_BEACON';
const PROBE_MAGIC = 'DISCOVER_POS_SERVER';

/**
 * Get the local IPv4 address (non-internal, typically 192.168.x.x or 10.x.x.x)
 */
export function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * LanPeerDiscovery:
 * Manages UDP beaconing for Floating Master (C1/C2) and Client Terminal auto-discovery (C3/C4).
 */
export class LanPeerDiscovery {
  constructor(options = {}) {
    this.role = options.role || (process.env.POS_NODE_ROLE || 'STANDBY'); // 'LEADER', 'STANDBY', 'CLIENT'
    this.nodeId = options.nodeId || process.env.POS_NODE_ID || `NODE_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    this.httpPort = options.httpPort || parseInt(process.env.PORT || '3001', 10);
    this.socket = null;
    this.beaconTimer = null;
    this.activeLeader = null; // { ip, port, nodeId, lastSeen }
    if (process.env.POS_MASTER_IP && process.env.POS_MASTER_IP.trim()) {
      this.activeLeader = {
        ip: process.env.POS_MASTER_IP.trim(),
        port: parseInt(process.env.POS_MASTER_PORT || '3001', 10),
        nodeId: 'C1',
        lastSeen: Date.now()
      };
      console.log(`[LAN-Discovery] Pre-configured master IP set to: ${this.activeLeader.ip}:${this.activeLeader.port}`);
    }
    this.lastOrderId = 0;
    this.lastTxTime = Date.now();
    this.onLeaderChangeCallback = null;
    this.localIp = getLocalIpAddress();
  }

  setTransactionMetadata(lastOrderId, lastTxTime) {
    if (lastOrderId) this.lastOrderId = lastOrderId;
    if (lastTxTime) this.lastTxTime = lastTxTime;
  }

  onLeaderChange(callback) {
    this.onLeaderChangeCallback = callback;
  }

  async start() {
    return new Promise((resolve) => {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        console.warn('[LAN-Discovery] UDP socket error:', err.message);
      });

      this.socket.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo);
      });

      this.socket.bind(DISCOVERY_PORT, () => {
        try {
          this.socket.setBroadcast(true);
        } catch (e) {
          console.warn('[LAN-Discovery] Failed to set broadcast flag:', e.message);
        }
        console.log(`[LAN-Discovery] Listening on UDP port ${DISCOVERY_PORT}, Node=${this.nodeId}, Local IP=${this.localIp}`);
        
        // Start beacon broadcast & heartbeat monitor
        this.startBeacon();
        this.startHeartbeatMonitor();
        resolve(true);
      });
    });
  }

  handleMessage(msgBuffer, rinfo) {
    // Ignore messages sent by self
    if (rinfo.address === this.localIp && rinfo.port === DISCOVERY_PORT) {
      return;
    }

    try {
      const text = msgBuffer.toString('utf8');

      // 1. Client Terminal Discovery Probe (e.g. C3/C4 asking: "Where is active POS server?")
      if (text.startsWith(PROBE_MAGIC)) {
        if (this.role === 'LEADER') {
          const response = JSON.stringify({
            magic: BEACON_MAGIC,
            role: 'LEADER',
            nodeId: this.nodeId,
            ip: this.localIp,
            httpPort: this.httpPort,
            lastTxTime: this.lastTxTime,
            lastOrderId: this.lastOrderId
          });
          const respBuf = Buffer.from(response);
          this.socket.send(respBuf, 0, respBuf.length, rinfo.port, rinfo.address);
        }
        return;
      }

      // 2. Peer Beacon Message
      const data = JSON.parse(text);
      if (data.magic !== BEACON_MAGIC || data.nodeId === this.nodeId) {
        return;
      }

      if (data.role === 'LEADER') {
        this.lastPeerHeartbeat = Date.now();
        const prevLeader = this.activeLeader;
        this.activeLeader = {
          ip: data.ip || rinfo.address,
          httpPort: data.httpPort || 3001,
          nodeId: data.nodeId,
          lastOrderId: data.lastOrderId || 0,
          lastTxTime: data.lastTxTime || 0,
          lastSeen: Date.now()
        };

        // If we were also LEADER and detect another leader, resolve split-brain
        if (this.role === 'LEADER') {
          console.warn(`[LAN-Discovery] Conflict detected: Peer ${data.nodeId} (${data.ip || rinfo.address}) also claims LEADER.`);
          const isPeerConfiguredMaster = Boolean(process.env.POS_MASTER_IP && process.env.POS_MASTER_IP.trim() === (data.ip || rinfo.address));
          const isPeerC1 = (data.nodeId === 'C1' && this.nodeId !== 'C1');
          const peerHasMoreData = (data.lastOrderId > this.lastOrderId) || 
              (data.lastOrderId === this.lastOrderId && data.lastTxTime > this.lastTxTime);

          if (isPeerConfiguredMaster || isPeerC1 || peerHasMoreData) {
            console.log(`[LAN-Discovery] Demoting self to STANDBY. Peer ${data.nodeId} is primary master.`);
            this.role = 'STANDBY';
            if (this.onLeaderChangeCallback) this.onLeaderChangeCallback(this.activeLeader, 'DEMOTED');
          }
        } else if (!prevLeader || prevLeader.nodeId !== data.nodeId) {
          console.log(`[LAN-Discovery] Active LEADER recognized: ${data.nodeId} at ${this.activeLeader.ip}:${this.activeLeader.httpPort}`);
          if (this.onLeaderChangeCallback) this.onLeaderChangeCallback(this.activeLeader, 'DETECTED');
        }
      }
    } catch (err) {
      // Non-JSON or corrupt packet, ignore
    }
  }

  startBeacon() {
    this.beaconTimer = setInterval(() => {
      if (!this.socket) return;
      try {
        const payload = JSON.stringify({
          magic: BEACON_MAGIC,
          role: this.role,
          nodeId: this.nodeId,
          ip: this.localIp,
          httpPort: this.httpPort,
          lastOrderId: this.lastOrderId,
          lastTxTime: this.lastTxTime
        });
        const msg = Buffer.from(payload);
        this.socket.send(msg, 0, msg.length, DISCOVERY_PORT, BROADCAST_ADDR);
      } catch (err) {
        // Broadcast send error
      }
    }, 2000);
  }

  startHeartbeatMonitor() {
    // Check every 3 seconds: If Standby and no Leader heartbeat for 7 seconds, promote to LEADER
    setInterval(() => {
      if (this.role === 'STANDBY') {
        const elapsed = Date.now() - this.lastPeerHeartbeat;
        if (this.lastPeerHeartbeat > 0 && elapsed > 7000) {
          console.warn(`[LAN-Discovery] Peer leader lost (No heartbeat for ${Math.round(elapsed / 1000)}s). Promoting self to LEADER!`);
          this.role = 'LEADER';
          this.activeLeader = {
            ip: this.localIp,
            httpPort: this.httpPort,
            nodeId: this.nodeId,
            lastOrderId: this.lastOrderId,
            lastTxTime: this.lastTxTime,
            lastSeen: Date.now()
          };
          if (this.onLeaderChangeCallback) this.onLeaderChangeCallback(this.activeLeader, 'PROMOTED');
        }
      }
    }, 3000);
  }

  promoteToLeader() {
    console.log(`[LAN-Discovery] Manually promoting Node ${this.nodeId} to LEADER`);
    this.role = 'LEADER';
    this.activeLeader = {
      ip: this.localIp,
      httpPort: this.httpPort,
      nodeId: this.nodeId,
      lastOrderId: this.lastOrderId,
      lastTxTime: this.lastTxTime,
      lastSeen: Date.now()
    };
    if (this.onLeaderChangeCallback) this.onLeaderChangeCallback(this.activeLeader, 'MANUAL_PROMOTED');
  }

  stop() {
    if (this.beaconTimer) clearInterval(this.beaconTimer);
    if (this.socket) {
      try { this.socket.close(); } catch (e) { /**/ }
      this.socket = null;
    }
  }
}
