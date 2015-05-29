'use strict';

var _ = require('lodash');
var request = require('supertest-as-promised');

// SINON
global.sinon = require('sinon');

// ASSERTS
global.assert = require('assert');
// mixin chai assert modules
_.extend(global.assert, require('chai').assert);

// EXPECT
global.expect = require('chai').expect;

// json
global.json = function(app, verb, url) {
    return request(app)[verb.toLowerCase()](url)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/);
};