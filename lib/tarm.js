'use strict';

// Load modules

const Fs = require('fs');
const Path = require('path');
const Boom = require('boom');
const Hoek = require('hoek');
const Items = require('items');
const Joi = require('joi');
const File = require('inert/lib/file');
const TarStreamHeaders = require('tar-stream/headers');


// Declare internals

const internals = {};


internals.schema = Joi.object({
    path: Joi.alternatives(Joi.array().items(Joi.string()).single(), Joi.func()).required(),
    showHidden: Joi.boolean(),
    etagMethod: Joi.string().valid('hash', 'simple').allow(false)
});


exports.handler = function (route, options) {

    const settings = Joi.attempt(options, internals.schema, 'Invalid tarmount handler options (' + route.path + ')');
    Hoek.assert(route.path[route.path.length - 1] === '}', 'The route path for a tarmount handler must end with a parameter:', route.path);

    const paramName = /\w+/.exec(route.path.slice(route.path.lastIndexOf('{')))[0];

    const normalize = (paths) => {

        const normalized = [];
        for (let i = 0; i < paths.length; ++i) {
            let path = paths[i];

            if (!Path.isAbsolute(path)) {
                path = Path.join(route.settings.files.relativeTo, path);
            }

            normalized.push(path);
        }

        return normalized;
    };

    const normalized = (Array.isArray(settings.path) ? normalize(settings.path) : []);            // Array or function

    // Declare handler

    const handler = (request, reply) => {

        let paths = normalized;
        if (typeof settings.path === 'function') {
            const result = settings.path.call(null, request);
            if (result instanceof Error) {
                return reply(result);
            }

            if (Array.isArray(result)) {
                paths = normalize(result);
            }
            else if (typeof result === 'string') {
                paths = normalize([result]);
            }
            else {
                return reply(Boom.badImplementation('Invalid path function'));
            }
        }

        // Append parameter

        const selection = request.params[paramName] || '';
        if (selection &&
            !settings.showHidden &&
            internals.isFileHidden(selection)) {

            return reply(Boom.notFound());
        }

        if (!selection) {
            return reply(Boom.forbidden());
        }

        // Generate response

        Items.serial(paths, internals.findInTarFile.bind(this, selection), (result) => {

            if (!result) {
                result = Boom.notFound();
            }

            if (result instanceof Error) {
                return reply(result);
            }

            if (result.header.type === 'directory') {
                return reply(Boom.forbidden(null, 'EISDIR'));
            }

            if (result.header.type !== 'file') {
                return reply(Boom.internal('Unknown file type: ' + result.header.type));
            }

            // Success - now serve the file

            const fileOptions = {
                confine: false,
                etagMethod: settings.etagMethod,
                start: result.header.data,
                end: result.header.data + result.header.size - 1
            };

            File.load(result.path, request, fileOptions, (response) => {

                if (response.isBoom) {
                    return reply(response);
                }

                response.type(response.request.server.mime.path(selection).type || 'application/octet-stream');
                response.header('last-modified', result.header.mtime.toUTCString());

                return reply(response);
            });
        });
    };

    return handler;
};


internals.findInTarFile = function (selection, tarFile, next) {

    Fs.open(tarFile, 'r', (err, fd) => {

        if (err) {
            return next(err.code === 'ENOENT' ? undefined : err);
        }

        const processNextHeader = (offset) => {

            internals.readTarHeader(fd, offset, (err, header) => {

                if (err || !header) {
                    Fs.close(fd, Hoek.ignore);
                    return next(err);
                }

                if (header.path === selection) {
                    Fs.close(fd, Hoek.ignore);         // TODO: extend inert to take over the file
                    return next({ path: tarFile, header });
                }

                return processNextHeader(header.data + header.bytes);
            });
        };

        return processNextHeader(0);
    });
};


internals.safeDecodeHeader = function (buffer) {

    try {
        return TarStreamHeaders.decode(buffer);
    }
    catch (e) {
        return Boom.internal('Decode failed', e);
    }
};


internals.readTarHeader = function (fd, offset, callback) {

    const buffer = Buffer.allocUnsafe(512);

    const maybeReadBuffer = (buf, start, successCb) => {

        const size = buf.length;
        Fs.read(fd, buf, 0, size, start, (err, bytesRead) => {

            if (err) {
                return callback(err);
            }

            if (bytesRead !== size) {
                return callback(null, null);
            }

            return successCb();
        });
    };

    const readHeader = (start, longName) => {

        maybeReadBuffer(buffer, start, () => {

            const header = internals.safeDecodeHeader(buffer);
            if (!header || header.isBoom) {
                return callback(header, null);
            }

            header.data = start + 512;
            header.bytes = Math.ceil(header.size / 512) * 512;

            if (header.type === 'pax-header' || header.type === 'gnu-long-path') {
                const dataBuf = Buffer.allocUnsafe(header.size);
                return maybeReadBuffer(dataBuf, header.data, () => {

                    let path;
                    if (header.type === 'pax-header') {
                        const pax = TarStreamHeaders.decodePax(dataBuf);
                        path = pax.path;
                    }
                    if (header.type === 'gnu-long-path') {
                        path = TarStreamHeaders.decodeLongPath(dataBuf);
                    }

                    return readHeader(header.data + header.bytes, path);
                });
            }

            header.path = longName || header.name;

            return callback(null, header);
        });
    };

    return readHeader(offset);
};


internals.isFileHidden = function (path) {

    return /(^|[\\\/])\.([^.\\\/]|\.[^\\\/])/.test(path);           // Starts with a '.' or contains '/.' or '\.', which is not followed by a '/' or '\' or '.'
};
