'use strict';

// Load modules

const Tarm = require('./tarm');
const Hoek = require('hoek');


exports.register = function (server, options, next) {

    Hoek.assert(Object.keys(options).length === 0, 'Options are not supported');

    server.handler('tarmount', Tarm.handler);

    return next();
};


exports.register.attributes = {
    pkg: require('../package.json'),
    dependencies: 'inert',
    connections: false,
    once: true
};
