'use strict';
const async = require('async');
const semver = require('semver');

module.exports = function(agenda, options) {
    options = options || {};

    agenda.on('ready', () => {
        const collection = agenda._collection.collection || agenda._collection;
        collection.createIndexes([
            {key: {nextRunAt: -1, lastRunAt: -1, lastFinishedAt: -1}},
            {key: {name: 1, nextRunAt: -1, lastRunAt: -1, lastFinishedAt: -1}}
        ], err => {
            if (err) {
                console.warn('Agendash indexes might not exist. Performance may decrease.');
            }
        });
        agenda._mdb.admin().serverInfo((err, serverInfo) => {
            if (err) {
                throw err;
            }
            if (!semver.satisfies(serverInfo.version, '>=2.6.0')) {
                console.warn('Agendash requires mongodb version >=2.6.0.');
            }
        });
    });

    const getJobs = (job, state, callback) => {
        const preMatch = {};
        if (job) {
            preMatch.name = job;
        }

        const postMatch = {};
        if (state) {
            postMatch[state] = true;
        }

        const limit = 200; // @TODO: UI param
        const skip = 0; // @TODO: UI param

        const collection = agenda._collection.collection || agenda._collection;
        collection.aggregate([
            {$match: preMatch},
            {$sort: {
                nextRunAt: 1,
                lastFinishedAt: 1,
                lastRunAt: 1
            }},
            {$project: {
                _id: 0,
                job: '$$ROOT',
                nextRunAt: {$ifNull: ['$nextRunAt', 0]},
                lockedAt: {$ifNull: ['$lockedAt', 0]},
                lastRunAt: {$ifNull: ['$lastRunAt', 0]},
                lastFinishedAt: {$ifNull: ['$lastFinishedAt', 0]},
                failedAt: {$ifNull: ['$failedAt', 0]},
                repeatInterval: {$ifNull: ['$repeatInterval', 0]},
                disabled: {$ifNull: ['$disabled', false]}
            }},
            {$project: {
                job: '$job',
                _id: '$job._id',
                running: {$and: [
                        '$lastRunAt',
                        {$gt: ['$lastRunAt', '$lastFinishedAt']}
                    ]},
                scheduled: {$and: [
                        '$nextRunAt',
                        {$gte: ['$nextRunAt', new Date()]}
                    ]},
                queued: {$and: [
                        '$nextRunAt',
                        {$gte: [new Date(), '$nextRunAt']},
                        {$gte: ['$nextRunAt', '$lastFinishedAt']}
                    ]},
                completed: {$and: [
                        '$lastFinishedAt',
                        {$gt: ['$lastFinishedAt', '$failedAt']}
                    ]},
                failed: {$and: [
                        '$lastFinishedAt',
                        '$failedAt',
                        {$eq: ['$lastFinishedAt', '$failedAt']}
                    ]},
                repeating: {$and: [
                        '$repeatInterval',
                        {$ne: ['$repeatInterval', null]}
                    ]},
                disabled: {$and: [
                        '$disabled',
                        {$eq: ['$disabled', true]}
                    ]}
            }},
            {$match: postMatch},
            {$limit: limit},
            {$skip: skip}
        ]).toArray((err, results) => {
            if (err) {
                return callback(err);
            }
            callback(null, results);
        });
    };

    const getOverview = callback => {
        const collection = agenda._collection.collection || agenda._collection;
        collection.aggregate([
            {$project: {
                _id: 0,
                name: '$name',
                type: '$type',
                priority: '$priority',
                repeatInterval: '$repeatInterval',
                repeatTimezone: '$repeatTimezone',
                nextRunAt: {$ifNull: ['$nextRunAt', 0]},
                lockedAt: {$ifNull: ['$lockedAt', 0]},
                lastRunAt: {$ifNull: ['$lastRunAt', 0]},
                lastFinishedAt: {$ifNull: ['$lastFinishedAt', 0]},
                failedAt: {$ifNull: ['$failedAt', 0]},
                disabled: {$ifNull: ['$disabled', false]}
            }},
            {$project: {
                name: '$name',
                type: '$type',
                priority: '$priority',
                repeatInterval: '$repeatInterval',
                repeatTimezone: '$repeatTimezone',
                running: {$cond: [{$and: [
                            '$lastRunAt',
                            {$gt: ['$lastRunAt', '$lastFinishedAt']}
                        ]}, 1, 0]},
                scheduled: {$cond: [{$and: [
                            '$nextRunAt',
                            {$gte: ['$nextRunAt', new Date()]}
                        ]}, 1, 0]},
                queued: {$cond: [{$and: [
                            '$nextRunAt',
                            {$gte: [new Date(), '$nextRunAt']},
                            {$gte: ['$nextRunAt', '$lastFinishedAt']}
                        ]}, 1, 0]},
                completed: {$cond: [{$and: [
                            '$lastFinishedAt',
                            {$gt: ['$lastFinishedAt', '$failedAt']}
                        ]}, 1, 0]},
                failed: {$cond: [{$and: [
                            '$lastFinishedAt',
                            '$failedAt',
                            {$eq: ['$lastFinishedAt', '$failedAt']}
                        ]}, 1, 0]},
                repeating: {$cond: [{$and: [
                            '$repeatInterval',
                            {$ne: ['$repeatInterval', null]}
                        ]}, 1, 0]},
                disabled: {$cond: [{$and: [
                            '$disabled',
                            {$eq: ['$disabled', true]}
                        ]}, 1, 0]}
            }},
            {$group: {
                _id: '$name',
                displayName: {$first: '$name'},
                meta: {$addToSet: {
                        type: '$type',
                        priority: '$priority',
                        repeatInterval: '$repeatInterval',
                        repeatTimezone: '$repeatTimezone'
                    }},
                total: {$sum: 1},
                running: {$sum: '$running'},
                scheduled: {$sum: '$scheduled'},
                queued: {$sum: '$queued'},
                completed: {$sum: '$completed'},
                failed: {$sum: '$failed'},
                repeating: {$sum: '$repeating'},
                disabled: {$sum: '$disabled'}
            }}
        ]).toArray((err, results) => {
            if (err) {
                return callback(err);
            }
            const totals = {displayName: 'All Jobs'};
            const states = ['total', 'running', 'scheduled', 'queued', 'completed', 'failed', 'repeating', 'disabled'];
            states.forEach(state => {
                totals[state] = 0;
            });
            results.forEach(job => {
                states.forEach(state => {
                    totals[state] += job[state];
                });
            });
            results.unshift(totals);
            // TODO Update the agenda query to not return all the groupings, just return all jobs
            callback(null, results[0]);
        });
    };

    const api = function(job, state, callback) {
        if (!agenda) {
            return callback('Agenda instance is not ready');
        }
        async.parallel({
            overview: getOverview,
            jobs: getJobs.bind(this, job, state)
        },
        (err, apiResponse) => {
            if (err) {
                return callback(err.message);
            }
            apiResponse.title = options.title || 'Emarsys Agendash';
            apiResponse.currentRequest = {
                title: options.title || 'Emarsys Agendash',
                job: job || 'All Jobs',
                state
            };
            callback(null, apiResponse);
        });
    };

    const runJobs = (jobIds, callback) => {
        if (!agenda) {
            return callback('Agenda instance is not ready');
        }
        try {
            const collection = agenda._collection.collection || agenda._collection;
            // Only update jobs that are not currently running (so we don't spawn multiple instances).
            collection
            .update(
                {
                    _id: {$in: jobIds.map(jobId => collection.s.pkFactory(jobId))},
                    lockedAt : null
                },
                { $set: { nextRunAt: new Date()} },
                { multi: true },
                function (err, commandResult) {
                    // console.log("commandResult:", commandResult);
                    let numUpdated = commandResult.result.nModified;
                    if (err || numUpdated === 0) {
                        return callback('Jobs not found, or jobs were locked.');
                    }

                    console.log('Agenda Updated %d jobs.', parseInt(numUpdated, 10) || 0);
                    callback(err, numUpdated);
                }
            );
        } catch (err) {
            callback(err.message);
        }
    };

    const requeueJobs = (jobIds, callback) => {
        if (!agenda) {
            return callback('Agenda instance is not ready');
        }
        try {
            const collection = agenda._collection.collection || agenda._collection;
            collection
            .find({_id: {$in: jobIds.map(jobId => collection.s.pkFactory(jobId))}})
            .toArray((err, jobs) => {
                if (err || jobs.length === 0) {
                    return callback('Jobs not found');
                }
                async.series(jobs.map(job => done => {
                    const newJob = agenda.create(job.name, job.data).save(() => {
                        done(null, newJob);
                    });
                }), (err, results) => {
                    callback(err, results);
                });
            });
        } catch (err) {
            callback(err.message);
        }
    };

    const unlockJobs = (jobIds, callback) => {
        if (!agenda) {
            return callback('Agenda instance is not ready');
        }
        try {
            const collection = agenda._collection.collection || agenda._collection;
            // Only update jobs that are not currently running (so we don't spawn multiple instances).
            collection
            .update(
                {
                    _id: {$in: jobIds.map(jobId => collection.s.pkFactory(jobId))},
                    lockedAt : {$ne: null}
                },
                { $set: { lockedAt: null} },
                { multi: true },
                function (err, commandResult) {
                    // console.log("commandResult:", commandResult);
                    let numUpdated = commandResult.result.nModified;
                    if (err || numUpdated === 0) {
                        return callback('Jobs not found, or jobs were unlocked.');
                    }

                    console.log('Agenda Unlocked %d jobs.', parseInt(numUpdated, 10) || 0);
                    callback(err, numUpdated);
                }
            );
        } catch (err) {
            callback(err.message);
        }
    };

    const enableJobs = (jobIds, callback) => {
        if (!agenda) {
            return callback('Agenda instance is not ready');
        }
        try {
            console.log('jobs to enable:', jobIds);

            const collection = agenda._collection.collection || agenda._collection;
            // Only enabled jobs that are currently disabled.
            collection
                .update(
                    {
                        _id: {$in: jobIds.map(jobId => collection.s.pkFactory(jobId))},
                        disabled : {$ne: null}
                    },
                    { $set: { disabled: null} },
                    { multi: true },
                    function (err, commandResult) {
                        // console.log("commandResult:", commandResult);
                        let numUpdated = commandResult.result.nModified;
                        if (err || numUpdated === 0) {
                            return callback('Jobs not found, or jobs were already enabled.');
                        }

                        console.log('Agenda Enabled %d jobs.', parseInt(numUpdated, 10) || 0);
                        callback(err, numUpdated);
                    }
                );
        } catch (err) {
            callback(err.message);
        }
    };

    const disableJobs = (jobIds, callback) => {
        if (!agenda) {
            return callback('Agenda instance is not ready');
        }
        try {
            console.log('jobs to disable:', jobIds);

            const collection = agenda._collection.collection || agenda._collection;
            // Only disable jobs that are currently enabled.
            collection
            .update(
                {
                    _id: {$in: jobIds.map(jobId => collection.s.pkFactory(jobId))},
                    disabled : {$eq: null}
                },
                { $set: { disabled: true} },
                { multi: true },
                function (err, commandResult) {
                    // console.log("commandResult:", commandResult);
                    let numUpdated = commandResult.result.nModified;
                    if (err || numUpdated === 0) {
                        return callback('Jobs not found, or jobs were already disabled.');
                    }

                    console.log('Agenda Disabled %d jobs.', parseInt(numUpdated, 10) || 0);
                    callback(err, numUpdated);
                }
            );
        } catch (err) {
            callback(err.message);
        }
    };

    const deleteJobs = (jobIds, callback) => {
        if (!agenda) {
            return callback('Agenda instance is not ready');
        }
        try {
            const collection = agenda._collection.collection || agenda._collection;
            agenda.cancel({_id: {$in: jobIds.map(jobId => collection.s.pkFactory(jobId))}}, (err, deleted) => {
                if (err || !deleted) {
                    callback('Jobs not deleted');
                }
                callback();
            });
        } catch (err) {
            callback(err.message);
        }
    };

    const createJob = (jobName, jobSchedule, jobRepeatEvery, jobData, callback) => {
        if (!agenda) {
            return callback('Agenda instance is not ready');
        }
        try {
            // @TODO: Need to validate user input.
            const job = agenda.create(jobName, jobData);
            if (jobSchedule && jobRepeatEvery) {
                job.repeatAt(jobSchedule);
                job.repeatEvery(jobRepeatEvery);
            } else if (jobSchedule) {
                job.schedule(jobSchedule);
            } else if (jobRepeatEvery) {
                job.repeatEvery(jobRepeatEvery);
            } else {
                return callback('Jobs not created');
            }
            job.save(err => {
                if (err) {
                    return callback('Jobs not created');
                }
                callback();
            });
        } catch (err) {
            callback(err.message);
        }
    };

    return {
        api,
        runJobs,
        requeueJobs,
        unlockJobs,
        enableJobs,
        disableJobs,
        deleteJobs,
        createJob
    };
};
