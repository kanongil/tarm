'use strict';

// Load modules

const ChildProcess = require('child_process');
const Fs = require('fs');
const Os = require('os');
const Path = require('path');
const Zlib = require('zlib');
const Boom = require('boom');
const Code = require('code');
const Hapi = require('hapi');
const Hoek = require('hoek');
const Inert = require('inert');
const Lab = require('lab');
const Tarm = require('..');
const Fixures = require('./fixtures');

// Declare internals

const internals = {};


// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


describe('tarmount', () => {

    describe('registration', () => {

        it('throws when options are passed', (done) => {

            const register = () => {

                const server = new Hapi.Server();
                server.register([Inert, {
                    register: Tarm,
                    options: { test: undefined }
                }], Hoek.ignore);
            };

            expect(register).to.throw('Options are not supported');
            done();
        });

        it('errors on start when inert is not registered', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register(Tarm, Hoek.ignore);

            server.start((err) => {

                expect(err).to.exist();
                expect(err.message).to.contain('missing dependency inert');
                done();
            });
        });
    });

    describe('handler()', () => {

        const provisionServer = (connection, debug) => {

            const server = new Hapi.Server({ debug });
            server.connection(connection || { routes: { files: { relativeTo: __dirname } }, router: { stripTrailingSlash: false } });
            server.register([Inert, Tarm], Hoek.ignore);
            return server;
        };

        it('returns an embedded file', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.MULTI_FILE_TAR } } });

            server.inject('/directory/file-2.txt', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(12);
                expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
                expect(res.headers.vary).to.contain('accept-encoding');
                expect(res.payload).to.equal('i am file-2\n');
                done();
            });
        });

        it('handles relative reference to tar file', (done) => {

            const server = provisionServer();
            const path = Path.relative(__dirname, Fixures.MULTI_FILE_TAR);
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path } } });

            server.inject('/directory/file-1.txt', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(12);
                expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
                expect(res.headers.vary).to.contain('accept-encoding');
                expect(res.payload).to.equal('i am file-1\n');
                done();
            });
        });

        it('handles unicode encoded file paths', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.UNICODE_TAR } } });

            server.inject('/directory/h%C3%B8st%C3%A5l.txt', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(8);
                expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
                expect(res.payload).to.equal('høllø\n');
                done();
            });
        });

        it('handles unicode encoded file paths (BSD)', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.UNICODE_BSD_TAR } } });

            server.inject('/directory/h%C3%B8ll%C3%B8.txt', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(4);
                expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
                expect(res.payload).to.equal('hej\n');
                done();
            });
        });

        it('handles long file paths', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.LONG_NAME_TAR } } });

            server.inject('/directory/my/file/is/longer/than/100/characters/and/should/use/the/prefix/header/foobarbaz/foobarbaz/foobarbaz/foobarbaz/foobarbaz/foobarbaz/filename.txt', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(16);
                expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
                done();
            });
        });

        it('handles longpath encoded file paths', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.GNU_LONG_PATH } } });

            server.inject('/directory/node-v0.11.14/deps/npm/node_modules/init-package-json/node_modules/promzard/example/npm-init/init-input.js', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(6058);
                expect(res.headers['content-type']).to.equal('application/javascript; charset=utf-8');
                done();
            });
        });

        it('returns an embedded file with gzip encoding', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.MULTI_FILE_TAR } } });

            server.inject({ url: '/directory/file-1.txt', headers: { 'accept-encoding': 'gzip' } }, (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-encoding']).to.equal('gzip');
                expect(res.headers['content-length']).to.not.exist();
                expect(Zlib.gunzipSync(res.rawPayload).toString()).to.equal('i am file-1\n');
                done();
            });
        });

        it('returns a file when requesting a file from multi directory setup', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/multiple/{path*}', handler: { tarmount: { path: [Fixures.ONE_FILE_TAR, Fixures.MULTI_FILE_TAR] } } });

            server.inject('/multiple/test.txt', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(12);
                expect(res.payload).to.equal('hello world\n');
                done();
            });
        });

        it('returns a file when requesting a file from a function response', (done) => {

            const server = provisionServer();
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

            server.inject('/single/test.txt', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(12);
                expect(res.payload).to.equal('hello world\n');
                done();
            });
        });

        it('returns a file when requesting a file from multi directory function response', (done) => {

            const server = provisionServer();
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

            server.inject('/multiple/test.txt', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(12);
                expect(res.payload).to.equal('hello world\n');
                done();
            });
        });

        it('returns a 404 when requesting an unknown file', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.MULTI_FILE_TAR } } });

            server.inject('/directory/xyz', (res) => {

                expect(res.statusCode).to.equal(404);
                done();
            });
        });

        it('returns a 403 when requesting an empty path', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.ONE_FILE_TAR } } });

            server.inject('/directory/', (res) => {

                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('returns a 403 when requesting a directory', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.TYPES_TAR } } });

            server.inject('/directory/directory', (res) => {

                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('returns a 404 when tar file is not found', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.MISSING } } });

            server.inject('/directory/file', (res) => {

                expect(res.statusCode).to.equal(404);
                done();
            });
        });

        it('returns error when tar file can not be opened', (done) => {

            const path = Hoek.uniqueFilename(Os.tmpdir()) + '-inaccessible.tar';
            Fs.closeSync(Fs.openSync(path, 'w'));
            Fs.chmodSync(path, 0);

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path } } });

            server.inject('/directory/file', (res) => {

                Fs.unlinkSync(path);
                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns error when tar file can not be read', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.UNREADABLE } } });

            server.inject('/directory/file', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns error when tar file data can not be read', (done) => {

            const path = Hoek.uniqueFilename(Os.tmpdir()) + '-file.tar';
            Fs.writeFileSync(path, Fs.readFileSync(Fixures.ONE_FILE_TAR));

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path } } });

            let opens = 0;

            const orig = Fs.open;
            Fs.open = function (openPath) {        // can return EMFILE error

                if (openPath === path) {
                    if (++opens === 2) {
                        const callback = arguments[arguments.length - 1];
                        return callback(new Error('failed'));
                    }
                }

                return orig.apply(Fs, arguments);
            };

            server.inject('/directory/test.txt', (res) => {

                Fs.open = orig;
                Fs.unlinkSync(path);
                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns a 404 when requesting a hidden file', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.HIDDEN_FILE } } });

            server.inject('/directory/.hidden', (res) => {

                expect(res.statusCode).to.equal(404);
                done();
            });
        });

        it('returns a file when requesting a hidden file with showHidden', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.HIDDEN_FILE, showHidden: true } } });

            server.inject('/directory/.hidden', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(12);
                expect(res.payload).to.equal('very secret\n');
                done();
            });
        });

        it('does not error on tar files that end without proper padding', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.GNU_LONG_PATH } } });

            server.inject('/directory/xyz', (res) => {

                expect(res.statusCode).to.equal(404);
                done();
            });
        });

        it('returns error when requesting an unhandled file type', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.TYPES_TAR } } });

            server.inject('/directory/directory-link', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns error when reading from a non-tar file', (done) => {

            const server = provisionServer(null, false);
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { tarmount: { path: Fixures.INVALID_TGZ } } });

            server.inject('/directory/file', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('respects the etagMethod simple option', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/{p*}', handler: { tarmount: { path: Fixures.ONE_FILE_TAR, etagMethod: 'simple' } } });

            server.inject('/test.txt', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers.etag).to.match(/^".+-.+"$/);
                done();
            });
        });

        it('respects the etagMethod false option', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/{p*}', handler: { tarmount: { path: Fixures.ONE_FILE_TAR, etagMethod: false } } });

            server.inject('/test.txt', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers.etag).to.not.exist();
                done();
            });
        });

        it('returns error when path function returns error', (done) => {

            const path = () => {

                return Boom.badRequest('Really?!');
            };

            const server = provisionServer();
            server.route({ method: 'GET', path: '/test/{path*}', handler: { tarmount: { path } } });

            server.inject('/test/index.html', (res) => {

                expect(res.statusCode).to.equal(400);
                expect(res.result.message).to.equal('Really?!');
                done();
            });
        });

        it('returns error when path function returns invalid response', (done) => {

            const path = () => {

                return 5;
            };

            const server = provisionServer(null, false);
            server.route({ method: 'GET', path: '/test/{path*}', handler: { tarmount: { path } } });

            server.inject('/test/index.html', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('has not leaked file descriptors', { skip: process.platform === 'win32' }, (done) => {

            // validate that all descriptors has been closed
            const cmd = ChildProcess.spawn('lsof', ['-p', process.pid]);
            let lsof = '';
            cmd.stdout.on('data', (buffer) => {

                lsof += buffer.toString();
            });

            cmd.stdout.on('end', () => {

                let count = 0;
                const lines = lsof.split('\n');
                for (let i = 0; i < lines.length; ++i) {
                    count += !!lines[i].match(/\.tar$/);
                }

                expect(count).to.equal(0);
                done();
            });

            cmd.stdin.end();
        });
    });
});
