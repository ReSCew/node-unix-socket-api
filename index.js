const ipc = require('node-ipc');
const socketConfig = require('config').get('sockets');
const chalk = require('chalk');
const uuid = require('uuid');

const MAX_TIMEOUT = socketConfig.get('answerTimeoutSec') * 1000;
const NEXT_SEND_TIMEOUT = 2000;
const ITEMS_QTY = 1;
const DELIMITER = '\n';

let theFirstSend = true;
let connected = false;

let pool = {};
let resolveTimeout = null;
let nextSendTimeout = null;

function getUnresolved() {
    return Object.values(pool).filter(it => !it.status.resolved);
}

function resolveAll() {
    resolveTimeout = null;

    getUnresolved().forEach(job => {
        job.status.resolved = true;
        job.status.message = 'Timeout, no answer';
    });
    print();
    pool = {};


    if (connected) {
        nextSendTimeout = setTimeout(send, NEXT_SEND_TIMEOUT);
    }
}

function send() {
    nextSendTimeout = null;
    pool = {};
    for (let i = 0; i < ITEMS_QTY; i++) {
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
    resolveTimeout = setTimeout(resolveAll, MAX_TIMEOUT);
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
    console.log(chalk.blue('Got socket message: '), msg);

    if (!msg.id || !msg.result || !msg.result.hasOwnProperty('code')) {
        return console.error(chalk.red('Unexpected message format'));
    }

    const {id, result} = msg;

    const job = pool[id];
    if (!job) {
        return console.error(chalk.red(`Job ${id} not found`));
    }

    job.status = {
        ...job.status,
        ...result,
        resolved: true
    };

    if (getUnresolved().length === 0) {
        clearTimeout(resolveTimeout);
        resolveAll();
    } else {
        print();
    }
}

// general IPC config
ipc.config.rawBuffer = true;

// Init client
function handleClientError() {
    connected = false;
    if (nextSendTimeout) {
        clearTimeout(nextSendTimeout);
        nextSendTimeout = null;
    }

    if (resolveTimeout) {
        resolveAll();
    }
}

ipc.connectTo('push', socketConfig.get('push'), function () {
    ipc.of.push.on('connect', () => {
            console.log(chalk.green('Connected to the GoSocket'));
            if (!connected) {
                if (theFirstSend) {
                    theFirstSend = false;
                    send();
                } else {
                    console.log(chalk.yellow('Not the first time, sending delayed'));
                    setTimeout(send, NEXT_SEND_TIMEOUT);
                }

            }

            connected = true;
        }
    );

    ipc.of.push.on('disconnect', () => {
            console.log(chalk.red('Disconnected from Go Socket :('));
            handleClientError();
        }
    );

    ipc.of.push.on('error', err => {
            console.log(chalk.red('Got socket error'), err);
            handleClientError();
        }
    );
});

function sendMessage(data) {
    ipc.of.push.emit(`${JSON.stringify(data)}${DELIMITER}`)
}

// Init server
ipc.serve(socketConfig.get('result'), () => {
    console.log(chalk.green('Result socket listener started'));

    ipc.server.on('data', (data, socket) => {
            const json = String(data);
            console.log(chalk.green('Got message: '), json);

            try {
                handleMessage(JSON.parse(json));
            } catch (e) {
                console.error(e);
            }
        }
    );
});
ipc.server.start();