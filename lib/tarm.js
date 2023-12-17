'use strict';

// Load modules

const Fs = require('node:fs/promises');
const Path = require('node:path');

const Boom = require('@hapi/boom');
const Bounce = require('@hapi/bounce');
const File = require('@hapi/inert/lib/file');
const Hoek = require('@hapi/hoek');
const Joi = require('@hapi/joi');
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

    const handler = async (request, h) => {

        let paths = normalized;
        if (typeof settings.path === 'function') {
            const result = settings.path.call(null, request);
            if (Array.isArray(result)) {
                paths = normalize(result);
            }
            else if (typeof result === 'string') {
                paths = normalize([result]);
            }
            else {
                throw Boom.badImplementation('Invalid path function response');
            }
        }

        // Append parameter

        const selection = request.params[paramName];
        if (selection &&
            !settings.showHidden &&
            internals.isFileHidden(selection)) {

            throw Boom.notFound();
        }

        if (!selection) {
            throw Boom.forbidden();
        }

        // Generate response

        for (let i = 0; i < paths.length; ++i) {
            const result = await internals.findInTarFile(selection, paths[i]);

            if (!result) {
                continue;
            }

            if (result.header.type === 'directory') {
                throw Boom.forbidden(null, 'EISDIR');
            }

            if (result.header.type !== 'file') {
                throw Boom.internal('Unknown file type: ' + result.header.type);
            }

            // Success - now serve the file

            const fileOptions = {
                confine: false,
                etagMethod: settings.etagMethod,
                start: result.header.data,
                end: result.header.data + result.header.size - 1
            };

            const response = await File.load(result.path, request, fileOptions);

            response.type(response.request.server.mime.path(selection).type ?? 'application/octet-stream');
            response.header('last-modified', result.header.mtime.toUTCString());

            return response;
        }

        throw Boom.notFound();
    };

    return handler;
};


internals.HeaderEmptyError = class extends Error { };
internals.FileEndError = class extends Error {};


internals.findInTarFile = async function (selection, tarFile) {

    try {
        var fileHandle = await Fs.open(tarFile, 'r');
    }
    catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }

        return;
    }

    const processNextHeader = async (offset) => {

        const header = await internals.readTarHeader(fileHandle, offset);

        if (header.path === selection) {
            return { path: tarFile, header };
        }

        return processNextHeader(header.data + header.bytes);
    };

    try {
        return await processNextHeader(0);
    }
    catch (err) {
        Bounce.ignore(err, [internals.HeaderEmptyError, internals.FileEndError]);
        return null;
    }
    finally {
        fileHandle.close();         // TODO: extend inert to take over the file when used
    }
};


internals.safeDecodeHeader = function (buffer) {

    try {
        const header = TarStreamHeaders.decode(buffer);
        if (!header) {
            throw new internals.HeaderEmptyError('No header data');
        }

        return header;
    }
    catch (err) {
        Bounce.rethrow(err, [internals.HeaderEmptyError, 'system']);
        throw Boom.internal('Decode failed', err);
    }
};


internals.decodePathMap = new Map([
    ['pax-header', (buf) => TarStreamHeaders.decodePax(buf).path],
    ['gnu-long-path', TarStreamHeaders.decodeLongPath]
]);


internals.fillBuffer = async function (fileHandle, buf, start) {

    const result = await fileHandle.read(buf, 0, buf.length, start);
    if (result.bytesRead !== buf.length) {
        throw new internals.FileEndError('Missing file data');
    }
};


internals.readTarHeader = function (fileHandle, offset) {

    const buffer = Buffer.allocUnsafe(512);

    const readHeader = async (start, longName) => {

        await internals.fillBuffer(fileHandle, buffer, start);
        const header = internals.safeDecodeHeader(buffer);

        header.data = start + 512;
        header.bytes = Math.ceil(header.size / 512) * 512;

        const decodePath = internals.decodePathMap.get(header.type);
        if (decodePath) {
            const dataBuf = Buffer.allocUnsafe(header.size);

            await internals.fillBuffer(fileHandle, dataBuf, header.data);

            return readHeader(header.data + header.bytes, decodePath(dataBuf));
        }

        header.path = longName ?? header.name;

        return header;
    };

    return readHeader(offset);
};


internals.isFileHidden = function (path) {

    return /(^|[\\\/])\.([^.\\\/]|\.[^\\\/])/.test(path);           // Starts with a '.' or contains '/.' or '\.', which is not followed by a '/' or '\' or '.'
};
