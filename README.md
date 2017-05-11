# tarm

Tarmount handler plugin for hapi.js.

[![Build Status](https://travis-ci.org/kanongil/tarm.svg?branch=master)](https://travis-ci.org/kanongil/tarm)

**tarm** provides a new `tarmount` [handler](https://github.com/hapijs/hapi/blob/master/API.md#serverhandlername-method)
method for serving the contents of tar files using `inert`.

## Examples

**tarm** enables a number of common use cases for serving static assets.

### Static file server

The following creates a basic static file server that can be used to serve content from the
`site.tar` file on port 3000:

```js
const Path = require('path');
const Hapi = require('hapi');
const Inert = require('inert');
const Tarm = require('tarm');

const server = new Hapi.Server();
server.connection({ port: 3000 });

server.register([Inert, Tarm], () => {});

server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
        tarmount: {
            path: Path.join(__dirname, 'site.tar')
        }
    }
});

server.start((err) => {

    if (err) {
        throw err;
    }

    console.log('Server running at:', server.info.uri);
});
```

## Usage

After registration, this plugin enables the `'tarmount'` route handler.
Note that inert is required to be registered as well. Eg:

```js
server.register([Inert, Tarm], () => {});
```

### The `tarmount` handler

Generates a directory endpoint for serving static content from a tar file.
Routes using the directory handler must include a path parameter at the end of the path
string (e.g. `/path/to/somewhere/{param}` where the parameter name does not matter). The
path parameter can use any of the parameter options (e.g. `{param}` for one level files
only, `{param?}` for one level files or the directory root, `{param*}` for any level, or
`{param*3}` for a specific level). If additional path parameters are present, they are
ignored for the purpose of selecting the tar file resource. The tarmount handler is an
object with the following options:
  - `path` - (required) the tar file path (relative paths are resolved based on the
    route [`files`](https://github.com/hapijs/hapi/blob/master/API.md#route.config.files)
    configuration). Value can be:
      - a single path string pointing to the tar file.
      - an array of path strings. Each path will be attempted in order until a match is
        found (by following the same process as the single path string).
      - a function with the signature `function(request)` which returns the path string or
        an array of path strings. If the function returns an error, the error is passed back
        to the client in the response.
  - `showHidden` - optional boolean, determines if hidden files will be shown and served.
    Defaults to `false`.
  - `etagMethod` - specifies the method used to calculate the `ETag` header response.
    Available values:
      - `'hash'` - SHA1 sum of the file contents, suitable for distributed deployments.
        Default value.
      - `'simple'` - Hex encoded size and modification date, suitable when files are stored
        on a single server.
      - `false` - Disable ETag computation.
