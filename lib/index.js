'use strict';

// Load modules

const Tarm = require('./tarm');
const Hoek = require('@hapi/hoek');


exports.plugin = {
    pkg: require('../package.json'),
    dependencies: 'inert',
    once: true,

    register(server, options) {

        Hoek.assert(Object.keys(options).length === 0, 'Options are not supported');

        server.decorate('handler', 'tarmount', Tarm.handler);
    }
};
