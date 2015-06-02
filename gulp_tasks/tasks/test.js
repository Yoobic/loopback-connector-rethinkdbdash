'use strict';
var gulp = require('gulp');
var runSequence = require('run-sequence');
var $ = require('gulp-load-plugins')();
var mocha = $.mocha;
var istanbul = $.istanbul;
var gutil = require('gulp-util');
var constants = require('../common/constants')();

gulp.task('mocha', 'Runs mocha unit tests.', function() {
    process.env.NODE_ENV = 'mocha';

    return gulp.src(constants.mocha.libs)
        .pipe(istanbul({
            includeUntested: true
        }))
        .pipe(istanbul.hookRequire()) // Force `require` to return covered files
        .on('finish', function() {
            gulp.src(constants.mocha.tests)
                .pipe(mocha({
                    reporter: 'spec',
                    globals: constants.mocha.globals,
                    timeout: constants.mocha.timeout
                }))
                .on('error', function(err) {
                    gutil.log(err.toString());
                })
                .pipe(istanbul.writeReports({
                    reporters: ['lcov', 'json', 'text', 'text-summary', 'cobertura']
                }))
                .once('end', function() {
                    process.exit();
                });
        });
});

gulp.task('test', 'Runs all the tests.', function(done) {
    runSequence(
        'lint',
        'mocha',
        done
    );
});
