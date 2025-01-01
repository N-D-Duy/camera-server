const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const app = express();
const WS_PORT  = 8888;
const HTTP_PORT = 8000;

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

const wsServer = new WebSocket.Server({port: WS_PORT}, ()=> console.log(`WS Server is listening at ${WS_PORT}`));

let connectedClients = [];

wsServer.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`Client connected from ${clientIp}`);
    connectedClients.push(ws);

    ws.on('message', (data) => {
        console.log(`Received ${data.length} bytes from ${clientIp}`);
        connectedClients.forEach((client, i) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            } else {
                connectedClients.splice(i, 1);
            }
        });
    });

    ws.on('error', (error) => {
        console.error(`Client error: ${error.message}`);
    });

    ws.on('close', () => {
        console.log(`Client ${clientIp} disconnected`);
        connectedClients = connectedClients.filter(client => client !== ws);
    });
});

app.get('/client',(req,res)=>res.sendFile(path.resolve(__dirname, './client.html')));
app.listen(HTTP_PORT, ()=> console.log(`HTTP server listening at ${HTTP_PORT}`));