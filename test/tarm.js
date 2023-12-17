'use strict';

// Load modules

const ChildProcess = require('child_process');
const Fs = require('fs');
const Os = require('os');
const Path = require('path');
const Zlib = require('zlib');
const Boom = require('@hapi/boom');
const Code = require('@hapi/code');
const File = require('@hapi/file');
const Hapi = require('@hapi/hapi');
const Inert = require('@hapi/inert');
const Lab = require('@hapi/lab');
const Tarm = require('..');
const InertFs = require('@hapi/inert/lib/fs');
const Fixures = require('./fixtures');

// Declare internals

const internals = {};


// Test shortcuts

const { describe, it } = exports.lab = Lab.script();
const { expect } = Code;


describe('tarmount', () => {

    describe('registration', () => {

        it('throws when options are passed', async () => {

            const server = new Hapi.Server();

            await expect(server.register([Inert, {
                plugin: Tarm,
                options: { test: undefined }
            }])).to.reject('Options are not supported');
        });

        it('errors on start when inert is not registered', async () => {

            const server = new Hapi.Server();
            await server.register(Tarm);

            await expect(server.start()).to.reject(/missing dependency inert/);
        });
    });

    describe('handler()', () => {

        const provisionServer = async (options, debug) => {

            const server = new Hapi.Server(Object.assign(options || { routes: { files: { relativeTo: __dirname } }, router: { stripTrailingSlash: false } }, { debug }));
            await server.register([Inert, Tarm]);
            return server;
        };

        it('returns an embedded file', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.MULTI_FILE_TAR } } });

            const res = await server.inject('/directory/file-2.txt');

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(12);
            expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
            expect(res.payload).to.equal('i am file-2\n');
        });

        it('handles relative reference to tar file', async () => {

            const server = await provisionServer();
            const path = Path.relative(__dirname, Fixures.MULTI_FILE_TAR);
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path } } });

            const res = await server.inject('/directory/file-1.txt');

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(12);
            expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
            expect(res.payload).to.equal('i am file-1\n');
        });

        it('handles unicode encoded file paths', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.UNICODE_TAR } } });

            const res = await server.inject('/directory/h%C3%B8st%C3%A5l.txt');

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(8);
            expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
            expect(res.payload).to.equal('høllø\n');
        });

        it('handles unicode encoded file paths (BSD)', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.UNICODE_BSD_TAR } } });

            const res = await server.inject('/directory/h%C3%B8ll%C3%B8.txt');

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(4);
            expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
            expect(res.payload).to.equal('hej\n');
        });

        it('handles long file paths', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.LONG_NAME_TAR } } });

            const res = await server.inject('/directory/my/file/is/longer/than/100/characters/and/should/use/the/prefix/header/foobarbaz/foobarbaz/foobarbaz/foobarbaz/foobarbaz/foobarbaz/filename.txt');

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(16);
            expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
        });

        it('handles longpath encoded file paths', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.GNU_LONG_PATH } } });

            const res = await server.inject('/directory/node-v0.11.14/deps/npm/node_modules/init-package-json/node_modules/promzard/example/npm-init/init-input.js');

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(6058);
            expect(res.headers['content-type']).to.equal('application/javascript; charset=utf-8');
        });

        it('handles base-256 encoded file sizes', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.BASE_256_SIZE } } });

            const res = await server.inject('/directory/test.txt');

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(12);
            expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
            expect(res.payload).to.equal('hello world\n');
        });

        it('returns an embedded file with gzip encoding', async () => {

            const server = await provisionServer({ compression: { minBytes: 1 } });
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.MULTI_FILE_TAR } } });

            const res = await server.inject({ url: '/directory/file-1.txt', headers: { 'accept-encoding': 'gzip' } });

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-encoding']).to.equal('gzip');
            expect(res.headers['content-length']).to.not.exist();
            expect(Zlib.gunzipSync(res.rawPayload).toString()).to.equal('i am file-1\n');
        });

        it('returns a file when requesting a file from multi directory setup', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/multiple/{path*}', handler: { tarmount: { path: [Fixures.ONE_FILE_TAR, Fixures.MULTI_FILE_TAR] } } });

            const res = await server.inject('/multiple/test.txt');

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(12);
            expect(res.payload).to.equal('hello world\n');
        });

        it('returns a file when requesting a file from a function response', async () => {

            const server = await provisionServer();
            server.route({
                method: 'GET',
                path: '/single/{path*}',
                handler: {
                    tarmount: {
                        path: () => {

                            return Fixures.ONE_FILE_TAR;
                        }
                    }
                }
            });

            const res = await server.inject('/single/test.txt');

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(12);
            expect(res.payload).to.equal('hello world\n');
        });

        it('returns a file when requesting a file from multi directory function response', async () => {

            const server = await provisionServer();
            server.route({
                method: 'GET',
                path: '/multiple/{path*}',
                handler: {
                    tarmount: {
                        path: () => {

                            return [Fixures.MULTI_FILE_TAR, Fixures.ONE_FILE_TAR];
                        }
                    }
                }
            });

            const res = await server.inject('/multiple/test.txt');

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(12);
            expect(res.payload).to.equal('hello world\n');
        });

        it('returns a 404 when requesting an unknown file', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.MULTI_FILE_TAR } } });

            const res = await server.inject('/directory/xyz');

            expect(res.statusCode).to.equal(404);
        });

        it('returns a 403 when requesting an empty path', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.ONE_FILE_TAR } } });

            const res = await server.inject('/directory/');

            expect(res.statusCode).to.equal(403);
        });

        it('returns a 403 when requesting a directory', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.TYPES_TAR } } });

            const res = await server.inject('/directory/directory');

            expect(res.statusCode).to.equal(403);
        });

        it('returns a 404 when tar file is not found', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.MISSING } } });

            const res = await server.inject('/directory/file');

            expect(res.statusCode).to.equal(404);
        });

        it('returns error when tar file can not be opened', async () => {

            const path = File.uniqueFilename(Os.tmpdir()) + '-inaccessible.tar';
            Fs.closeSync(Fs.openSync(path, 'w'));
            Fs.chmodSync(path, 0);

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path } } });

            const res = await server.inject('/directory/file');

            Fs.unlinkSync(path);
            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error.code).to.equal('EACCES');
        });

        it('returns error when tar file can not be read', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.UNREADABLE } } });

            const res = await server.inject('/directory/file');

            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error.code).to.equal('EISDIR');
        });

        it('returns error when tar file data can not be read', async () => {

            const path = File.uniqueFilename(Os.tmpdir()) + '-file.tar';
            Fs.writeFileSync(path, Fs.readFileSync(Fixures.ONE_FILE_TAR));

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path } } });

            const orig = InertFs.open;
            InertFs.open = function (openPath, ...args) {        // can return EMFILE error

                if (openPath === path) {
                    throw new Error('oh noes');
                }

                return orig.call(InertFs, openPath, ...args);
            };

            const res = await server.inject('/directory/test.txt');

            InertFs.open = orig;
            Fs.unlinkSync(path);

            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error.message).to.contain('oh noes');
        });

        it('returns a 404 when requesting a hidden file', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.HIDDEN_FILE } } });

            const res = await server.inject('/directory/.hidden');

            expect(res.statusCode).to.equal(404);
        });

        it('returns a file when requesting a hidden file with showHidden', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.HIDDEN_FILE, showHidden: true } } });

            const res = await server.inject('/directory/.hidden');

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(12);
            expect(res.payload).to.equal('very secret\n');
        });

        it('does not error on tar files that end without proper padding', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.GNU_LONG_PATH } } });

            const res = await server.inject('/directory/xyz');

            expect(res.statusCode).to.equal(404);
        });

        it('returns error when requesting an unhandled file type', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.TYPES_TAR } } });

            const res = await server.inject('/directory/directory-link');

            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error.message).to.equal('Unknown file type: symlink');
        });

        it('returns error when reading from a non-tar file', async () => {

            const server = await provisionServer(null, false);
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.INVALID_TGZ } } });

            const res = await server.inject('/directory/file');

            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error.message).to.contain('Decode failed: Invalid tar header');
        });

        it('respects the etagMethod simple option', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/{p*}', handler: { tarmount: { path: Fixures.ONE_FILE_TAR, etagMethod: 'simple' } } });

            const res = await server.inject('/test.txt');

            expect(res.statusCode).to.equal(200);
            expect(res.headers.etag).to.match(/^".+-.+"$/);
        });

        it('respects the etagMethod false option', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/{p*}', handler: { tarmount: { path: Fixures.ONE_FILE_TAR, etagMethod: false } } });

            const res = await server.inject('/test.txt');

            expect(res.statusCode).to.equal(200);
            expect(res.headers.etag).to.not.exist();
        });

        it('returns error when path function returns error', async () => {

            const path = () => {

                return Boom.badRequest('Really?!');
            };

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/test/{path*}', handler: { tarmount: { path } } });

            const res = await server.inject('/test/index.html');

            expect(res.statusCode).to.equal(400);
            expect(res.result.message).to.equal('Really?!');
        });

        it('returns error when path function returns invalid response', async () => {

            const path = () => {

                return 5;
            };

            const server = await provisionServer(null, false);
            server.route({ method: 'GET', path: '/test/{path*}', handler: { tarmount: { path } } });

            const res = await server.inject('/test/index.html');

            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error.message).to.contain('Invalid path function');
        });

        it('has not leaked file descriptors', { skip: process.platform === 'win32' }, async () => {

            // validate that all descriptors has been closed
            const cmd = ChildProcess.spawn('lsof', ['-p', process.pid]);
            let lsof = '';
            cmd.stdout.on('data', (buffer) => {

                lsof += buffer.toString();
            });

            const end = new Promise((resolve, reject) => {

                cmd.stdout.on('end', () => {

                    let count = 0;
                    const lines = lsof.split('\n');
                    for (let i = 0; i < lines.length; ++i) {
                        count += !!lines[i].match(/\.tar$/);
                    }

                    resolve(count);
                });

                cmd.stdout.on('error', reject);
            });

            cmd.stdin.end();

            expect(await end).to.equal(0);
        });
    });
});
