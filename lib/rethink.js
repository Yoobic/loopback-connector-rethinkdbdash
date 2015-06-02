/* jshint undef: true, unused: true, latedef: nofunc*/
/*eslint no-use-before-define:0, no-extra-parens:0, consistent-this:0*/
'use strict';

var r;
var moment = require('moment');
var _ = require('lodash');
var util = require('util');
var debug = require('debug')('connectors:rethinkdb');
var Connector = require('loopback-connector').Connector;
var Promise = require('bluebird');

function RethinkDB(s, dataSource) {
    debug('ctor');
    Connector.call(this, 'rethink', s);
    this.dataSource = dataSource;
    this.database = s.database;
}

util.inherits(RethinkDB, Connector);

exports.initialize = function initializeDataSource(dataSource, callback) {
    debug('initialize');

    var s = dataSource.settings;

    if(dataSource.settings.rs) {

        s.rs = dataSource.settings.rs;
        if(dataSource.settings.url) {
            var uris = dataSource.settings.url.split(',');
            s.hosts = [];
            s.ports = [];
            uris.forEach(function(uri) {
                var url = require('url').parse(uri);
                s.hosts.push(url.hostname || 'localhost');
                s.ports.push(parseInt(url.port || '28015', 10));

                if(!s.database) {
                    s.database = url.pathname.replace(/^\//, '');
                }
                if(!s.username) {
                    s.username = url.auth && url.auth.split(':')[0];
                }
                if(!s.password) {
                    s.password = url.auth && url.auth.split(':')[1];
                }
            });
        }

        s.database = s.database || 'test';

    } else {

        if(dataSource.settings.url) {
            var url = require('url').parse(dataSource.settings.url);

            s.host = url.hostname;
            s.port = url.port;
            s.database = url.pathname.replace(/^\//, '');
            s.username = url.auth && url.auth.split(':')[0];
            s.password = url.auth && url.auth.split(':')[1];
        }

        s.host = s.host || 'localhost';
        s.port = parseInt(s.port || '28015', 10);
        s.database = s.database || 'test';

    }

    s.safe = s.safe || false;

    dataSource.adapter = new RethinkDB(s, dataSource);
    r = require('rethinkdbdash')({
        host: s.host,
        port: s.port
    });
    dataSource.connector = dataSource.adapter;

    process.nextTick(callback);
};

RethinkDB.prototype.connect = function(cb) {
    cb(); // connection pooling handles it
};

RethinkDB.prototype.getTypes = function() {
    return ['db', 'nosql', 'rethinkdb'];
};

RethinkDB.prototype.getDefaultIdType = function() {
    return String;
};

RethinkDB.prototype.table = function(model) {
    return this._models[model].model.tableName;
};

// creates tables if not exists
RethinkDB.prototype.autoupdate = function(models, done) {
    debug('autoupdate');
    var _this = this;

    if((!done) && ('function' === typeof models)) {
        done = models;
        models = undefined;
    }
    // First argument is a model name
    if('string' === typeof models) {
        models = [models];
    }

    models = models || Object.keys(_this._models);

    r.db(_this.database).tableList().run()
        .catch(done)
        .then(function(list) {
            var promises = models.map(function(model) {
                if(list.length === 0 || list.indexOf(model) < 0) {
                    return r.db(_this.database).tableCreate(model).run()
                        .then(function() {
                            createIndices(model);
                        });
                    // .catch(cb);
                } else {
                    return createIndices(model);
                }
            });

            Promise.all(promises).nodeify(done);
        });

    function createIndices(model) {
        var properties = _this._models[model].properties;
        var settings = _this._models[model].settings;
        var indexCollection = _.extend({}, properties, settings);

        function checkAndCreate(list, indexName, indexOption, indexFunction) {
            // Don't attempt to create an index on primary key 'id'
            if(indexName !== 'id' && _hasIndex(_this, model, indexName) && list.indexOf(indexName) < 0) {
                var query = r.db(_this.database).table(model);
                if(indexFunction) {
                    query = query.indexCreate(indexName, indexFunction, indexOption);
                } else {
                    query = query.indexCreate(indexName, indexOption);
                }
                return query.run();
            } else {
                return null;
            }
        }

        if(!_.isEmpty(indexCollection)) {
            return r.db(_this.database).table(model).indexList().run()
                .catch(function(err) {
                    return Promise.reject(err);
                })
                .then(function(list) {
                    var promises = Object.keys(indexCollection).map(function(indexName) {
                        var indexConf = indexCollection[indexName];
                        return checkAndCreate(list, indexName, indexConf.indexOption || {}, indexConf.indexFunction);
                    });
                    return Promise.all(promises);
                });
        } else {
            return null;
        }
    }
};

// drops tables and re-creates them
RethinkDB.prototype.automigrate = function(models, cb) {
    debug('automigrate');
    this.autoupdate(models, cb);
};

// checks if database needs to be actualized
RethinkDB.prototype.isActual = function(cb) {
    debug('isActual');
    var _this = this;

    r.db(_this.database).tableList().run()
        .catch(cb)
        .then(function(list) {
            if(_.isEmpty(list)) {
                cb(null, _.isEmpty(_this._models));
            }
            var actual = true;

            var promises = Object.keys(_this._models).map(function(model) {
                if(!actual) {
                    cb(null, false);
                    return;
                }

                var properties = _this._models[model].properties;
                var settings = _this._models[model].settings;
                var indexCollection = _.extend({}, properties, settings);
                if(list.indexOf(model) < 0) {
                    actual = false;
                    cb(null, false);
                    return;
                } else {
                    r.db(_this.database).table(model).indexList().run()
                        .catch(function(err) {
                            cb(err);
                        })
                        .then(function(list) {
                            if(!actual) {

                                cb(new Error('isActual error'), false);
                            }

                            Object.keys(indexCollection).forEach(function(property) {
                                if(_hasIndex(_this, model, property) && list.indexOf(property) < 0) {
                                    actual = false;
                                }

                            });
                            cb(null, actual);
                        });
                }
            });
            Promise.all(promises).nodeify(function(err) {
                cb(err, actual);
            });
        });
};

RethinkDB.prototype.create = function(model, data, callback) {
    debug('create');
    if(data.id === null || data.id === undefined) {
        delete data.id;
    }

    this.save(model, data, callback, true);
};

RethinkDB.prototype.updateOrCreate = function(model, data, callback) {
    debug('updateOrCreate');
    if(data.id === null || data.id === undefined) {
        delete data.id;
    }

    this.save(model, data, callback, true, true);
};

RethinkDB.prototype.save = function(model, data, callback, strict, returnObject) {
    debug('save');
    var _this = this;

    if(strict === undefined) {
        strict = false;
    }

    Object.keys(data).forEach(function(key) {
        if(data[key] === undefined) {
            data[key] = null;
        }
    });

    r.db(_this.database).table(model).insert(data, {
            conflict: strict ? 'error' : 'update',
            returnChanges: true
        }).run()
        .catch(callback)
        .then(function(m) {
            var err = m.first_error && new Error(m.first_error);
            if(err) {
                throw new Error(err);
            } else {
                var info = {};
                var id = model.id;

                if(m.inserted > 0) {
                    info.isNewInstance = true;
                }
                // if (m.changes) {
                if(m.changes && m.changes.length > 0) {
                    id = m.changes[0].new_val.id;
                }

                // if (returnObject && m.changes) {
                if(returnObject && m.changes && m.changes.length > 0) {
                    return [m.changes[0].new_val, info];
                } else {
                    return [id, info];
                }
            }
        })
        .nodeify(callback, {
            spread: true
        });
};

RethinkDB.prototype.exists = function(model, id, callback) {
    debug('exists');
    var _this = this;

    r.db(_this.database).table(model).get(id).run()
        .catch(callback)
        .then(function(data) {
            return !!(data);
        })
        .nodeify(callback);
};

RethinkDB.prototype.find = function find(model, id, callback) {
    debug('find');
    var _this = this;
    var _keys;

    r.db(_this.database)
        .table(model)
        .get(id)
        .run()
        .catch(callback)
        .then(function(data) {
            _keys = _this._models[model].properties;
            if(data) {
                // Pass to expansion helper
                _expandResult(data, _keys);
            }
            // Done
            // callback(null, data);
            return data;
        })
        .nodeify(callback);
};

RethinkDB.prototype.destroy = function destroy(model, id, callback) {
    debug('destroy');
    var _this = this;

    r.db(_this.database).table(model).get(id).delete().run()
        .catch(callback)
        .nodeify(callback);
};

RethinkDB.prototype.allFeed = function(model, feedId, filter, callback) {
    debug('all');

    var _this = this;

    if(!filter) {
        filter = {};
    }

    var promise = r.db(_this.database).table(model);

    if(filter.order) {
        var keys = filter.order;
        if(typeof keys === 'string') {
            keys = keys.split(',');
        }
        keys.forEach(function(key) {
            var m = key.match(/\s+(A|DE)SC$/);
            key = key.replace(/\s+(A|DE)SC$/, '').trim();
            var hasIndex = _hasIndex(_this, model, key);
            if(m && m[1] === 'DE') {
                if(hasIndex) {
                    promise = promise.orderBy({
                        index: r.desc(key)
                    });
                } else {
                    promise = promise.orderBy(r.desc(key));
                }
            } else {
                if(hasIndex) {
                    promise = promise.orderBy({
                        index: r.asc(key)
                    });
                } else {
                    promise = promise.orderBy(r.asc(key));
                }
            }
        });
    } else {
        // default sort by id
        promise = promise.orderBy(r.asc('id'));
        // promise = promise.orderBy({index:'id'}});
    }

    if(filter.where) {
        promise = buildWhere(_this, model, filter.where, promise); //_processWhere(_this, model, filter.where, promise);
    }

    if(filter.skip) {
        promise = promise.skip(filter.skip);
    } else if(filter.offset) {
        promise = promise.skip(filter.offset);
    }
    if(filter.limit) {
        promise = promise.limit(filter.limit);
    }

    promise
        .merge({
            feedId: feedId
        })
        .changes()
        .run({
            cursor: true
        }, callback);
};

RethinkDB.prototype.all = function all(model, filter, options, callback) {
    debug('all');

    var _this = this;
    var _model;
    var _keys;

    if(!filter) {
        filter = {};
    }

    var promise = r.db(_this.database).table(model);

    if(filter.order) {
        var keys = filter.order;
        if(typeof keys === 'string') {
            keys = keys.split(',');
        }
        keys.forEach(function(key) {
            var m = key.match(/\s+(A|DE)SC$/);
            key = key.replace(/\s+(A|DE)SC$/, '').trim();
            var hasIndex = _hasIndex(_this, model, key);
            if(m && m[1] === 'DE') {
                if(hasIndex) {
                    promise = promise.orderBy({
                        index: r.desc(key)
                    });
                } else {
                    promise = promise.orderBy(r.desc(key));
                }
            } else {
                if(hasIndex) {
                    promise = promise.orderBy({
                        index: r.asc(key)
                    });
                } else {
                    promise = promise.orderBy(r.asc(key));
                }
            }
        });
    } else {
        // default sort by id
        promise = promise.orderBy(r.asc('id'));
        // promise = promise.orderBy({index:'id'}});
    }

    if(filter.where) {
        promise = buildWhere(_this, model, filter.where, promise); //_processWhere(_this, model, filter.where, promise);
    }

    if(filter.skip) {
        promise = promise.skip(filter.skip);
    } else if(filter.offset) {
        promise = promise.skip(filter.offset);
    }
    if(filter.limit) {
        promise = promise.limit(filter.limit);
    }

    promise.run()
        .catch(callback)
        .then(function(data) {
            _keys = _this._models[model].properties;
            _model = _this._models[model].model;

            data.forEach(function(element) {
                _expandResult(element, _keys);
            });

            if(filter && filter.include && filter.include.length > 0) {
                _model.includeAsync = Promise.promisify(_model.include);
                return _model.includeAsync(data, filter.include, options);
            } else {
                return data;
            }
        })
        .nodeify(callback);
};

RethinkDB.prototype.destroyAll = function destroyAll(model, where, callback) {
    debug('destroyAll');
    var _this = this;

    if(!callback && 'function' === typeof where) {
        callback = where;
        where = undefined;
    }

    var promise = r.db(_this.database).table(model);
    if(where !== undefined) {
        promise = buildWhere(_this, model, where, promise);
    }
    promise.delete().run()
        .catch(callback)
        .then(function(result) {
            return {
                count: result.deleted
            };
        })
        .nodeify(callback);
};

RethinkDB.prototype.count = function count(model, callback, where) {
    debug('count');
    var _this = this;

    var promise = r.db(_this.database).table(model);

    if(where && typeof where === 'object') {
        promise = buildWhere(_this, model, where, promise);
    }

    promise.count().run()
        .catch(callback)
        .then(function(count) {
            return count;
        })
        .nodeify(callback);
};

RethinkDB.prototype.updateAttributes = function updateAttrs(model, id, data, cb) {
    debug('updateAttributes');
    var _this = this;

    data.id = id;
    Object.keys(data).forEach(function(key) {
        if(data[key] === undefined) {
            data[key] = null;
        }
    });
    r.db(_this.database).table(model).update(data).run()
        .catch(cb)
        .then(function() {
            return data;
        })
        .nodeify(cb);
};

RethinkDB.prototype.update = RethinkDB.prototype.updateAll = function update(model, where, data, callback) {
    debug('update/updateAll');
    var _this = this;

    var promise = r.db(_this.database).table(model);
    if(where !== undefined) {
        promise = buildWhere(_this, model, where, promise);
    }
    promise.update(data, {
            returnChanges: true
        }).run()
        .catch(callback)
        .then(function(result) {
            return {
                count: result.replaced
            };
        })
        .nodeify(callback);
};

RethinkDB.prototype.disconnect = function() {
    debug('disconnect');
};

/*
    Some values may require post-processing. Do that here.
*/
function _expandResult(result, keys) {

    Object.keys(result).forEach(function(key) {

        if(!keys.hasOwnProperty(key)) {
            return;
        }

        if(keys[key].type &&
            keys[key].type.name === 'Date' &&
            !(result[key] instanceof Date)) {

            // Expand date result data, backward compatible
            result[key] = moment.unix(result[key]).toDate();
        }
    });
}

// TODO : need to rewrite the function as it does not take into account a different name for the index
function _hasIndex(_this, model, key) {

    // Primary key always hasIndex
    if(key === 'id') {
        return true;
    }

    var modelDef = _this._models[model];
    var retval = (_.isObject(modelDef.properties[key]) && modelDef.properties[key].index) || (_.isObject(modelDef.settings[key]) && modelDef.settings[key].index);
    return retval;
}

var operators = {
    between: function(key, value) {
        return r.row(key).gt(value[0]).and(r.row(key).lt(value[1]));
    },
    gt: function(key, value) {
        return r.row(key).gt(value);
    },
    lt: function(key, value) {
        return r.row(key).lt(value);
    },
    gte: function(key, value) {
        return r.row(key).ge(value);
    },
    lte: function(key, value) {
        return r.row(key).le(value);
    },
    inq: function(key, value) {
        var query = [];

        value.forEach(function(v) {
            query.push(r.row(key).eq(v));
        });

        var condition = _.reduce(query, function(sum, qq) {
            return sum.or(qq);
        });

        return condition;
    },
    nin: function(key, value) {
        var query = [];

        value.forEach(function(v) {
            query.push(r.row(key).ne(v));
        });

        var condition = _.reduce(query, function(sum, qq) {
            return sum.and(qq);
        });

        return condition;
    },
    neq: function(key, value) {
        return r.row(key).ne(value);
    },
    like: function(key, value) {
        return r.row(key).match(value);
    },
    nlike: function(key, value) {
        return r.row(key).match(value).not();
    }
};

function buildWhere(self, model, where, promise) {

    if(where === null || (typeof where !== 'object')) {
        return promise;
    }

    var query = buildFilter(where);

    if(query) {
        return promise.filter(query);
    } else {
        return promise;
    }
}

function buildFilter(where) {
    var filter = [];

    Object.keys(where).forEach(function(k) {

        // determine if k is field name or condition name
        var conditions = ['and', 'or', 'between', 'gt', 'lt', 'gte', 'lte', 'inq', 'nin', 'near', 'neq', 'like', 'nlike'];
        var condition = where[k];

        if(k === 'and' || k === 'or') {
            if(_.isArray(condition)) {
                var query = _.map(condition, function(c) {
                    return buildFilter(c);
                });

                if(k === 'and') {
                    filter.push(_.reduce(query, function(s, f) {
                        return s.and(f);
                    }));
                } else {
                    filter.push(_.reduce(query, function(s, f) {
                        return s.or(f);
                    }));
                }
            }
        } else {
            if(_.isObject(condition) && _.intersection(_.keys(condition), conditions).length > 0) {
                // k is condition
                _.keys(condition).forEach(function(operator) {
                    if(conditions.indexOf(operator) >= 0) {
                        filter.push(operators[operator](k, condition[operator]));
                    }
                });
            } else {
                // k is field equality
                filter.push(r.row(k).eq(condition));
            }
        }

    });

    return _.reduce(filter, function(s, f) {
        return s.and(f);
    });
}
