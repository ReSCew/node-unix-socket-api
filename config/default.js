module.exports = {
    sockets: {
        push: '/tmp/rescew-push.sock', // socket which Node app pushes to
        result: '/tmp/rescew-push-result.sock', // socket which Node app listens to
        answerTimeoutSec: 5 // timeout in seconds of answer awaiting
    }
};