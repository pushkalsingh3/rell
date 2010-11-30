var express = require('express')
  , nurl = require('nurl')
  , path = require('path')
  , fs = require('fs')
  , walker = require('walker')
  , dotaccess = require('dotaccess')
  , util = require('util')

DefaultConfig = {
  appid: '184484190795',
  level: 'debug',
  locale: 'en_US',
  server: '',
  trace: 1,
  version: 'mu',
  rte: 1,
  status: 1,
}

var examples = function() {
  // caches
  var _contentCache = {}
    , _listCache = {}

  // normalize directory paths
  function normalizeDir(target) {
    target = path.normalize(target)
    if (target[0] !== '/') path.normalize(path.join(process.cwd(), target))
    if (target[target.length-1] !== '/') target += '/'
    return target
  }
  return {
    get: function(root, name, cb) { // get a specific file
      root = normalizeDir(root)
      var fullname = path.join(root, path.normalize('/' + name))
        , data = _contentCache[fullname]
      if (data) return process.nextTick(cb.bind(null, null, data))
      fs.readFile(fullname, 'utf8', function(er, data) {
        if (er) return cb(er)
        cb(null, _contentCache[fullname] = data)
      })
    },
    list: function(root, cb) { // get a listing of directory
      root = normalizeDir(root)
      var data = _listCache[root]
      if (data) return process.nextTick(cb.bind(null, null, data))
      data = {}
      walker(root)
        .on('file', function(file) {
          dotaccess.set(data, file.substr(root.length).split('/'), true)
        })
        .on('end', function() { cb(null, _listCache[root] = data) })
    },
  }
}()

// generate a url, maintaining the non default query params
function makeUrl(config, path) {
  var url = nurl.parse(path)
  for (var key in config) {
    if (key == 'sdkUrl') continue // TODO fixme
    var val = config[key]
    if (DefaultConfig[key] != val) url = url.setQueryParam(key, val)
  }
  return url.href
}

// generate the connect js sdk script url
function getConnectScriptUrl(version, locale, server, ssl) {
  server = {
    sb: 'www.naitik.dev1315',
    bg: 'www.brent.devrs109',
    rh: 'www.rhe.devrs106',
  }[server] || server || 'static.ak.connect'
  var url = 'http' + (ssl ? 's' : '') + '://' + server + '.facebook.com/'

  if (server === 'static.ak.connect') {
    if (version === 'mu') {
      url = 'http' + (ssl ? 's' : '') + '://connect.facebook.net/'
    } else if (ssl) {
      url = 'https://ssl.connect.facebook.com/'
    }
  }

  if (version === 'mu') {
    if (url.indexOf('//connect.facebook.net/') < 0) url += 'assets.php/'
    url += locale + '/all.js'
  } else if (version === 'mid') {
    url += 'connect.php/' + locale + '/js/'
  } else {
    url += 'js/api_lib/v0.4/FeatureLoader.js.php'
  }

  return url
}

var app = module.exports = express.createServer(
  express.bodyDecoder(),
  express.methodOverride(),
  express.gzip(),
  express.staticProvider(__dirname + '/public')
)
app.configure(function() {
  app.set('view engine', 'jade')
})
app.configure('development', function() {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }))
})
app.configure('production', function() {
  app.use(express.errorHandler())
})
app.all('*', function(req, res, next) {
  var config = {};
  [DefaultConfig, req.query].forEach(function(src) {
    for (var key in src) {
      config[key] = src[key]
    }
  })
  config.sdkUrl = getConnectScriptUrl(
    config.version, config.locale, config.server,
    req.headers['x-forwarded-proto'] === 'https')
  req.rellConfig = config

  var signedRequest = req.body && req.body.signed_request
  if (signedRequest) {
    req.signedRequest = JSON.parse(
      new Buffer(
        signedRequest.split('.')[1].replace('-', '+').replace('_', '/'),
        'base64').toString('utf8'))
  }
  next()
})
app.get('/', function(req, res, next) {
  res.render('index', { locals: {
    title: 'Welcome',
    code: '',
    rellConfig: req.rellConfig,
    makeUrl: makeUrl.bind(null, req.rellConfig),
  }})
})
app.all('/*', function(req, res, next) {
  var pathname = req.params[0]
    , filename = pathname + '.html'
  examples.get('examples', filename, function(er, code) {
    if (er) return next() // ignore the error, just pass control
    res.render('index', { locals: {
      title: pathname.replace('/', ' &middot; '),
      code: code,
      rellConfig: req.rellConfig,
      makeUrl: makeUrl.bind(null, req.rellConfig),
    }})
  })
})
app.all('/raw/*', function(req, res, next) {
  var filename = req.params[0] + '.html'
  examples.get('examples', filename, function(er, code) {
    if (er) return next(er)
    res.send(code)
  })
})
app.get('/examples', function(req, res, next) {
  examples.list('examples', function(er, data) {
    if (er) return next(er)
    res.render('examples', { locals: {
      examples: data,
      makeUrl: makeUrl.bind(null, req.rellConfig),
    }})
  })
})
app.all('/echo', function(req, res, next) {
  res.writeHead(200, {'Content-Type': 'text/plain'})
  res.end(util.inspect({
    method: req.method,
    url: req.url,
    pathname: nurl.parse(req.url).pathname,
    query: req.query,
    body: req.body,
    signedRequest: req.signedRequest,
    headers: req.headers,
    rawBody: req.rawBody,
  }))
})
