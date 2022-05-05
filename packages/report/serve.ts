#!/usr/bin/env node
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

const staticPath = path.resolve(path.join(__dirname + '/../static/'));

app.use('/', express.static(staticPath));
app.listen(5000, () => console.log('Report is here http://localhost:5000'));
