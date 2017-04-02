'use strict';

const Path = require('path');


exports.ONE_FILE_TAR = Path.join(__dirname, 'one-file.tar');
exports.MULTI_FILE_TAR = Path.join(__dirname, 'multi-file.tar');
exports.PAX_TAR = Path.join(__dirname, 'pax.tar');
exports.TYPES_TAR = Path.join(__dirname, 'types.tar');
exports.LONG_NAME_TAR = Path.join(__dirname, 'long-name.tar');
exports.UNICODE_BSD_TAR = Path.join(__dirname, 'unicode-bsd.tar');
exports.UNICODE_TAR = Path.join(__dirname, 'unicode.tar');
exports.NAME_IS_100_TAR = Path.join(__dirname, 'name-is-100.tar');
exports.INVALID_TGZ = Path.join(__dirname, 'invalid.tgz');
exports.SPACE_TAR_GZ = Path.join(__dirname, 'space.tar');
exports.GNU_LONG_PATH = Path.join(__dirname, 'gnu-long-path.tar');
exports.BASE_256_UID_GID = Path.join(__dirname, 'base-256-uid-gid.tar');
exports.LARGE_UID_GID = Path.join(__dirname, 'large-uid-gid.tar');
exports.HIDDEN_FILE = Path.join(__dirname, 'hidden-file.tar');

// Special "files""

exports.UNREADABLE = __dirname;
exports.MISSING = Path.join(__dirname, 'missing.tar');
