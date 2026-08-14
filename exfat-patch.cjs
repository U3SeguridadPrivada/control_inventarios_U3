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

// Safeguard for Next.js file watcher on Windows/exFAT when encountering deleted or locked paths
const _rd = fs.readdir.bind(fs);
fs.readdir = (path, options, cb) => {
  if (typeof options === 'function') { cb = options; options = {}; }
  _rd(path, options, (err, files) => {
    if (err && (err.code === 'EPERM' || err.code === 'ENOENT')) {
      if (!fs.existsSync(path)) return cb(null, []);
    }
    cb(err, files);
  });
};

const _rds = fs.readdirSync.bind(fs);
fs.readdirSync = (path, options) => {
  try { return _rds(path, options); }
  catch (e) {
    if (e && (e.code === 'EPERM' || e.code === 'ENOENT')) {
      if (!fs.existsSync(path)) return [];
    }
    throw e;
  }
};

const _rdp = fs.promises.readdir.bind(fs.promises);
fs.promises.readdir = async (path, options) => {
  try { return await _rdp(path, options); }
  catch (e) {
    if (e && (e.code === 'EPERM' || e.code === 'ENOENT')) {
      if (!fs.existsSync(path)) return [];
    }
    throw e;
  }
};

