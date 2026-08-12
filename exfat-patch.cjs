// Pre-loaded via NODE_OPTIONS=--require ./exfat-patch.cjs
// On exFAT volumes, libuv maps FSCTL_GET_REPARSE_POINT failure to EISDIR.
// For a non-symlink file, readlink should return EINVAL (invalid argument).
// Returning the path itself causes enhanced-resolve to think it's a self-referencing
// symlink, creating infinite recursion. We remap to EINVAL instead.
const fs = require('fs');

const _rl = fs.readlink.bind(fs);
fs.readlink = (path, options, cb) => {
  if (typeof options === 'function') { cb = options; options = {}; }
  _rl(path, options, (err, link) => {
    if (err && err.code === 'EISDIR') {
      const e = Object.assign(new Error(`EINVAL: invalid argument, readlink '${path}'`), { code: 'EINVAL', syscall: 'readlink', path });
      return cb(e);
    }
    cb(err, link);
  });
};

const _rls = fs.readlinkSync.bind(fs);
fs.readlinkSync = (path, options) => {
  try { return _rls(path, options); }
  catch (e) {
    if (e && e.code === 'EISDIR') {
      const e2 = Object.assign(new Error(`EINVAL: invalid argument, readlink '${path}'`), { code: 'EINVAL', syscall: 'readlink', path });
      throw e2;
    }
    throw e;
  }
};

// Next collects page data through fs.promises, which is a separate implementation
// from the callback API above and needs the same EISDIR -> EINVAL remap.
const _rlp = fs.promises.readlink.bind(fs.promises);
fs.promises.readlink = async (path, options) => {
  try { return await _rlp(path, options); }
  catch (e) {
    if (e && e.code === 'EISDIR') {
      throw Object.assign(new Error(`EINVAL: invalid argument, readlink '${path}'`), { code: 'EINVAL', syscall: 'readlink', path });
    }
    throw e;
  }
};
