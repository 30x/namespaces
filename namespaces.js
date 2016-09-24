'use strict';
var http = require('http');
var url = require('url');
var lib = require('http-helper-functions');

function verifyNamespace(ns) {
  var name = ns.name
  if (typeof name != 'string')
    return `namespace name must be a string`
  if (name.split().length > 1)
    return `namespace name may not include whitespace` // TODO: check more carefully that name contains only valid URI path segment characters
  if (name.indexOf(':') > -1)
    return `namespace name may not include ':' character`
  return null
}

function createNamespace(req, res, ns) {
  var user = lib.getUser(req);
  if (user == null) {
    lib.unauthorized(req, res);
  } else { 
    var err = verifyNamespace(ns);
    if (err !== null) {
      lib.badRequest(res, err);
    } else {
      var permissions = ns.permissions;
      if (permissions !== undefined) {
        delete ns.permissions;
      }
      var selfURL = makeSelfURL(req, ns.name);
      lib.createPermissonsFor(req, res, selfURL, permissions, function(permissionsURL, permissions){
        addCalculatedNamespaceProperties(req, ns, selfURL)
        lib.created(req, res, ns, selfURL)
      });
        // We are not going to store any information about a namespace, since we can recover its name from its permissions document 
    }
  }
}

function makeSelfURL(req, key) {
  return `//${req.headers.host}/namespaces;${key}`
}

function addCalculatedNamespaceProperties(req, map, selfURL) {
  map.self = selfURL; 
  map._permissions = `protocol://authority/permissions?${map.self}`;
}

function getNamespace(req, res, id) {
  lib.ifAllowedThen(req, res, null, '_resource', 'read', function() {
    var selfURL = makeSelfURL(req, id)
    var namespace = {isA: 'Namespace', name: req.url.split('/').slice(-1)[0]}
    addCalculatedNamespaceProperties(req, namespace, selfURL)
    lib.found(req, res, namespace)
  });
}

function deleteNamespace(req, res, id) {
  console.log('sending permissions delete')
  lib.ifAllowedThen(req, res, null, '_resource', 'delete', function() {
    lib.sendInternalRequest(req, res, `/permissions?/namespaces;${id}`, 'DELETE', null, function (clientRes) {
      if (clientRes.statusCode == 404)
        lib.notFound(req, res)
      else if (clientRes.statusCode == 200){
        var selfURL = makeSelfURL(req, id)
        var namespace = {isA: 'Namespace', name: req.url.split('/').slice(-1)[0]}
        addCalculatedNamespaceProperties(req, namespace, selfURL)
        lib.found(req, res, namespace)
      } else {
        getClientResponseBody(clientRes, function(body) {
          var err = {statusCode: clientRes.statusCode, msg: `failed to create permissions for ${resourceURL} statusCode ${clientRes.statusCode} message ${body}`}
          internalError(serverRes, err)
        })
      }
    })
  })
}

function requestHandler(req, res) {
  if (req.url == '/namespaces') {
    if (req.method == 'POST') {
      lib.getServerPostObject(req, res, createNamespace);
    } else { 
      lib.methodNotAllowed(req, res, ['POST']);
    }
  } else {
    var req_url = url.parse(req.url);
    if (req_url.pathname.lastIndexOf('/namespaces;', 0) > -1 && req_url.search == null) {
      var id = req_url.pathname.substring('/namespaces;'.length);
      if (req.method == 'GET') 
        getNamespace(req, res, id);
      else if (req.method == 'DELETE') 
        deleteNamespace(req, res, id);
      else
        lib.methodNotAllowed(req, res, ['GET', 'DELETE']);
    } else 
      lib.notFound(req, res)
  }
}

var port = process.env.PORT;
http.createServer(requestHandler).listen(port, function() {
  console.log(`server is listening on ${port}`);
});
