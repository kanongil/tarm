import { Plugin, Request } from '@hapi/hapi';

export const plugin: Plugin<void> & {
    pkg: {
        name: 'tarm',
        version: string
    };
};

interface TarmountHandlerOptions {
    /**
     * Path to tar file.
     */
    path: string | string[] | ((request: Request) => string | string[]);

    /**
     * Determines if hidden files will be shown and served. Defaults to false.
     */
    showHidden?: boolean;

    /**
     * Specifies the method used to calculate the ETag header response. Available values:
     *  * `'hash'` - SHA1 sum of the file contents, suitable for distributed deployments. Default value.
     *  * `'simple'` - Hex encoded size and modification date, suitable when files are stored on a single server.
     *  * `false` - Disable ETag computation.
     */
    etagMethod?: 'hash' | 'simple' | false;
}

// Extend hapi typings

declare module '@hapi/hapi' {
    interface HandlerDecorations {
        /**
         * The tarmount handler.
         * 
         * Similar to a directory handler, but serves static content from a tar file.
         */
        tarmount?: TarmountHandlerOptions;
    }
}
