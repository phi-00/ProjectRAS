const amqp = require('amqplib');

const rabbit_host = process.env.RABBITMQ_HOST || 'localhost';
const rabbit_port = process.env.RABBITMQ_PORT || 5672;
const rabbit_username = process.env.RABBITMQ_USER || 'guest';
const rabbit_password = process.env.RABBITMQ_PASS || 'guest';
const exchange = "picturas";

const rabbit_mq_sv = `amqp://${rabbit_username}:${rabbit_password}@${rabbit_host}:${rabbit_port}`;

let channel = null;

// Função interna que gere a ligação
async function getChannel() {
    if (channel) return channel;
    try {
        const connection = await amqp.connect(rabbit_mq_sv);
        channel = await connection.createChannel();
        await channel.assertExchange(exchange, 'direct', { durable: true });
        console.log("RabbitMQ: Ligação estabelecida.");
        return channel;
    } catch (error) {
        console.error("Erro na ligação RabbitMQ:", error.message);
        throw error;
    }
}

// Funções exportadas - Repara que são funções normais que chamam o async internamente
module.exports = {
    send_rabbit_msg: function(msg, queue) {
        getChannel().then(ch => {
            ch.publish(exchange, queue, Buffer.from(JSON.stringify(msg)), { persistent: true });
        }).catch(err => console.error("Falha ao enviar mensagem:", err));
    },
    
    read_rabbit_msg: function(queue, callback) {
        getChannel().then(ch => {
            ch.assertQueue(queue, { durable: true }).then(q => {
                ch.consume(q.queue, (msg) => {
                    if (msg !== null) {
                        callback(msg);
                        ch.ack(msg);
                    }
                }, { noAck: false });
            });
        }).catch(err => console.error("Falha ao ler mensagem:", err));
    }
};

function send_msg_tool(msg_id, timestamp, og_img_uri, new_img_uri, tool, params) {
    const queue = queues[tool];
    const msg = {
        "messageId": msg_id,
        "timestamp": timestamp,
        "procedure": tool,
        "parameters": {
            "inputImageURI": og_img_uri, // URI dinâmico (original ou temporário)
            "outputImageURI": new_img_uri, // URI de destino
            ...params
        }
    };
    send_rabbit_msg(msg, queue);
}