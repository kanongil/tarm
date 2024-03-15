import { Server } from '@hapi/hapi';
import * as Lab from '@hapi/lab';
import * as Inert from '@hapi/inert';
import * as Tarm from '..';

const { expect } = Lab.types;

const server = new Server();
await server.register([Inert, Tarm]);

await new Server().register(Tarm);
await new Server().register({ plugin: Tarm });
expect.error(await new Server().register({ plugin: Tarm, options: {} }));

server.route({
    method: 'GET',
    path: '/tarmount/{param*}',
    handler: {
        tarmount: {
            path: 'file.tar'
        }
    }
});

server.route({
    method: 'GET',
    path: '/file/{param*}',
    handler: {
        file: {
            path: 'file.tar'
        }
    }
});
