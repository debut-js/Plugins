import express from 'express';
import path from 'path';
const app = express();

// @ts-ignore
app.use(function (req, res, next) {
    const origins = ['http://localhost:5000'];

    for (let i = 0; i < origins.length; i++) {
        const origin = origins[i];

        if (req.headers.origin && req.headers.origin.indexOf(origin) > -1) {
            res.header('Access-Control-Allow-Origin', req.headers.origin);
        }
    }

    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/../static/index.html'));
});
