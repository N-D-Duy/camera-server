const path = require('path');
const express = require('express');
const https = require('https');
const WebSocket = require('ws');
const fs = require('fs');
const app = express();

const WS_PORT = 8888;
const HTTP_PORT = 8000;

const server = https.createServer({
    cert: fs.readFileSync('./certificates/cert.pem'),
    key: fs.readFileSync('./certificates/key.pem')
}, app);

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

const wsServer = new WebSocket.Server({ server });

let connectedClients = [];
wsServer.on('connection', (ws, req) => {
    console.log('Connected');
    connectedClients.push(ws);

    ws.on('message', data => {
        connectedClients.forEach((ws,i) => {
            if(ws.readyState === ws.OPEN){
                ws.send(data);
            } else {
                connectedClients.splice(i ,1);
            }
        })
    });
});

app.get('/client',(req,res) => res.sendFile(path.resolve(__dirname, './client.html')));
server.listen(HTTP_PORT, () => console.log(`HTTPS server listening at ${HTTP_PORT}`));