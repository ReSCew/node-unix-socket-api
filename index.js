const ipc = require('node-ipc');
const socketConfig = require('config').get('sockets');
const chalk = require('chalk');
const uuid = require('uuid');

const MAX_TIMEOUT = socketConfig.get('answerTimeoutSec') * 1000;

let pool = {};
let resolveTimeout = null;

function getUnresolved() {
    return Object.values(pool).filter(it => !it.status.resolved);
}

function resolveAll() {
    getUnresolved().forEach(job => {
        job.status.resolved = true;
        job.status.message = 'Timeout, no answer';
    });
    print();
    send();
}

function send() {
    pool = {};
    for (let i = 0; i < Math.random() * 4 + 2; i++) {
        const msg = {
            payload: {
                id: uuid.v4(),
                name: Date.now() + ' ' + i
            },
            status: {
                resolved: false,
                code: -1,
                message: ''
            }
        };
        pool[msg.payload.id] = msg;
    }

    sendMessage(Object.values(pool).map(it => it.payload));
    setTimeout(resolveAll, MAX_TIMEOUT);
    print();
}

function print() {
    console.log('\n');
    console.log('Current Jobs:');
    Object.values(pool).forEach(job => {
        const status = job.status.resolved ?
            (job.status.code === 0 ? chalk.green(`OK ${job.status.message}`) : chalk.red(`Error ${job.status.message}`))
            : chalk.blue('Pending...');
        console.log(`\t${job.payload.name}: ${status}`);
    });
    console.log('\n');
}

function handleMessage(msg) {

    console.log('Got socket message: ', msg);

    if (!msg.id || !msg.result || !msg.result.hasOwnProperty('code')) {
        return console.error('Unexpected message format');
    }

    const {id, result} = msg;

    const job = pool[id];
    if (!job) {
        return console.error(`Job ${id} not found`)
    }

    job.status = {
        ...job.status,
        ...result,
        resolved: true
    };

    print();

    if (getUnresolved().length === 0) {
        clearTimeout(resolveTimeout);
        send();
    }
}

ipc.config.rawBuffer = true;

ipc.connectTo('push', socketConfig.get('push'), function () {
    ipc.of.push.on(
        'connect',
        function () {
            console.log('Connected to the GoSocket, sending first packet...');
            send();
        }
    );
});

ipc.serve(socketConfig.get('result'), function () {
    ipc.server.on(
        'data',
        function (data, socket) {
            const json = String(data);
            console.log('Got message: ', json);

            try {
                handleMessage(JSON.parse(json));
            } catch (e) {
                console.error(e);
            }
        }
    );
});
ipc.server.start();


function sendMessage(data) {
    ipc.of.push.emit(JSON.stringify(data))
}