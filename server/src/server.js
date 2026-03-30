import http from 'http';
import { createApp } from './app.js';
import { config } from './config.js';
import { createSocketServer } from './socket.js';

const app = createApp();
const server = http.createServer(app);

createSocketServer(server);

server.listen(config.port, () => {
  console.log(`Quiz backend listening on port ${config.port}`);
});
