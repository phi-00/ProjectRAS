const http = require("http");
const socketIo = require('socket.io');
const jwt = require("jsonwebtoken");

const { read_rabbit_msg } = require("./utils/rabbit_mq.js");
const httpServer = http.createServer();
httpServer.listen(4000);

const io = socketIo(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
    // options
});

io.on("connection", (socket) => {
    console.log("a user connected");

    const token = socket.handshake.auth.token;
    if (token != null) {
        jwt.verify(token, process.env.JWT_SECRET_KEY, (e, payload) => {
            if (e) {
                socket.emit('authError', e);
                return;
            }

            console.log("[wsGateway] User connected to room:", payload.id);
            socket.join(payload.id);
        });
    }

    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
});

// id do user como room id

function process_msg() {
    read_rabbit_msg('ws_queue', (msg) => {
        const msg_content = JSON.parse(msg.content.toString());
        const msg_id = msg_content.messageId;
        const timestamp = msg_content.timestamp
        const status = msg_content.status;
        const user = msg_content.user;

        console.log('[wsGateway] Received msg:', JSON.stringify(msg_content));

        if (/update-client-preview/.test(msg_id)) {
            if (status == "error") {
                const error_code = msg_content.errorCode;
                const error_msg = msg_content.errorMsg;

                console.log('[wsGateway] Emitting preview-error to user:', user);
                io.to(user).emit("preview-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));

                return;
            }

            const img_url = msg_content.img_url;

            console.log('[wsGateway] Emitting preview-ready to user:', user);
            io.to(user).emit("preview-ready", img_url);
        }
        else if (/update-client-process/.test(msg_id)) {
            if (status == "error") {
                const error_code = msg_content.errorCode;
                const error_msg = msg_content.errorMsg;

                console.log('[wsGateway] Emitting process-error to user:', user);
                io.to(user).emit("process-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));

                return;
            }

            console.log('[wsGateway] Emitting process-update to user:', user, 'msg_id:', msg_id);
            io.to(user).emit("process-update", msg_id);
        }
            // share created/deleted events
            if (msg_content.messageId.indexOf("share-created-") === 0) {
                io.to(user).emit("share-created", msg_content.data || {});
            }

            if (msg_content.messageId.indexOf("share-deleted-") === 0) {
                io.to(user).emit("share-deleted", msg_content.data || {});
            }
    })
}

process_msg();
