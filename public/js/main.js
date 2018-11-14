/* global $, _, Backbone */
$(function () {
    let CurrentRequestModel = Backbone.Model.extend({
        defaults: {
            // refreshInterval: 2000000,
            refreshInterval: 2000,
            overviewFilterRegex: /.*/,
            jobListFilterRegex: /.*/
        }
    })

    let ActiveTitleModel = Backbone.Model.extend({})
    let ActiveTabModel = Backbone.Model.extend({})

    let OverviewItemModel = Backbone.Model.extend({})
    let OverviewItemCollection = Backbone.Collection.extend({
        model: OverviewItemModel
    })

    let JobItemModel = Backbone.Model.extend({
        idAttribute: '_id',
        defaults: {
            selected: false
        }
    })
    let JobItemCollection = Backbone.Collection.extend({
        model: JobItemModel
    })

    let ActiveTitleView = Backbone.View.extend({
        el: '#active-title',
        initialize: function (options) {
            this.activeTitle = options.activeTitle
            _.bindAll(this, 'render')
            this.listenTo(this.activeTitle, 'change', this.render)
        },
        render: function () {
            this.$('.active-state').text(
                (this.activeTitle.get('state') ? this.activeTitle.get('state') : 'All') + ' jobs'
            );
            return this
        }
    })

    let OverviewItemView = Backbone.View.extend({
        model: OverviewItemModel,
        template: _.template($('#overview-item-template').html()),
        initialize: function () {
            _.bindAll(this, 'render', 'handleClick')
        },
        events: {
            'click [data-state]': 'handleClick'
        },
        handleClick: function (e) {
            App.trigger('requestChange', {
                job: this.model.get('_id'),
                state: $(e.currentTarget).data('state')
            })
        },
        render: function () {
            let html = this.template(this.model.toJSON())
            this.setElement(html)
            return this
        }
    })

    let OverviewListView = Backbone.View.extend({
        el: '#job-overview-list',
        initialize: function (options) {
            this.overviewItems = options.overviewItems
            this.currentRequest = options.currentRequest
            this.activeTab = options.activeTab
            _.bindAll(this, 'render')
            this.listenTo(this.overviewItems, 'update', this.render)
            this.listenTo(this.activeTab, 'change', this.render)
            this.render()
        },
        render: function () {
            let self = this;

            let overviewFilterRegex = this.currentRequest.get('overviewFilterRegex')
            this.$el.empty().append(this.overviewItems.filter(function (overviewItem) {
                return overviewFilterRegex.test(overviewItem.get('_id'))
            }).map(function (overviewItem) {
                overviewItem.attributes.activeTab = self.activeTab.get('state');
                let overviewItemView = new OverviewItemView({
                    model: overviewItem
                })
                return overviewItemView.render().$el
            }))
            return this
        }
    })

    let JobItemView = Backbone.View.extend({
        model: JobItemModel,
        tagName: 'tr',
        template: _.template($('#job-item-template').html()),
        initialize: function () {
            _.bindAll(this, 'render', 'handleClick')
            this.listenTo(this.model, 'change', this.render)
        },
        events: {
            'click': 'handleClick'
        },
        handleClick: function (e) {
            this.model.set('selected', !this.model.get('selected'))
        },
        render: function () {
            this.$el.html(this.template(this.model.toJSON()))
            this.$el.toggleClass('active', this.model.get('selected'))
            return this
        }
    })

    let JobListView = Backbone.View.extend({
        el: '#job-list',
        initialize: function (options) {
            // console.log("OPTIONS:", options);
            this.jobItems = options.jobItems
            this.currentRequest = options.currentRequest
            _.bindAll(this, 'render')
            this.listenTo(this.jobItems, 'update', this.render)
            this.render()
        },
        render: _.throttle(function () {
            // TODO REGEX DOESN'T WORK YET
            // console.log(this.currentRequest);
            let jobListFilterRegex = this.currentRequest.get('jobListFilterRegex');
            this.$el.empty().append(this.jobItems.filter(function (jobItem) {
                return jobListFilterRegex.test(jobItem.get('_id'))
            }).map(function (jobItem) {
                let jobItemView = new JobItemView({
                    model: jobItem
                })
                return jobItemView.render().$el
            }));
            // this.$el.empty().append(this.jobItems.map(function (jobItem) {
            //   let jobItemView = new JobItemView({
            //     model: jobItem
            //   })
            //   return jobItemView.render().$el
            // }));
            return this
        }, 300)
    })

    let SidebarView = Backbone.View.extend({
        el: '#sidebar',
        events: {
            'keyup .overview-filter': 'updateOverviewFilter',
            'keyup .job-list-filter': 'updateJobListFilter',
            'change .refresh-interval': 'updateRefreshInterval'
        },
        initialize: function (options) {
            this.currentRequest = options.currentRequest
            _.bindAll(this, 'updateOverviewFilter', 'updateJobListFilter', 'updateRefreshInterval')
        },
        updateOverviewFilter: function (e) {
            // http://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
            let str = $(e.currentTarget).val()
            let newFilterRegex = new RegExp(str.split('').map(function (char) {
                return char.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/, '\\$&')
            }).join('.*'), 'i')
            this.currentRequest.set({
                overviewFilterRegex: newFilterRegex
            })
        },
        updateJobListFilter: function (e) {
            let str = $(e.currentTarget).val()
            let newFilterRegex = new RegExp(str.split('').map(function (char) {
                return char.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/, '\\$&')
            }).join('.*'), 'i')
            this.currentRequest.set({
                jobListFilterRegex: newFilterRegex
            })
        },
        updateRefreshInterval: function (e) {
            this.currentRequest.set({
                refreshInterval: +$(e.currentTarget).val() * 1000
            })
        }
    })

    let JobDetailsPaneView = Backbone.View.extend({
        el: '#details-pane',
        initialize: function (options) {
            this.jobItems = options.jobItems
            _.bindAll(this, 'render', 'getSelectedJobs', 'runJobs', 'unlockJobs', 'enableJobs', 'requeueJobs', 'allowDeleteJobs', 'deleteJobs')
            this.listenTo(this.jobItems, 'update', this.render)
            this.listenTo(this.jobItems, 'change', this.render)
            this.render()
        },
        events: {
            'click [data-action=run-jobs]': 'runJobs',
            'click [data-action=requeue-jobs]': 'requeueJobs',
            'click [data-action=unlock-jobs]': 'unlockJobs',
            'click [data-action=enable-jobs]': 'enableJobs',
            'click [data-action=delete-jobs]': 'allowDeleteJobs',
            'click [data-action=delete-jobs].deleteable': 'deleteJobs'
        },
        getSelectedJobs: function () {
            return this.jobItems.where({selected: true})
        },
        render: function () {
            let selectedJobCount = this.getSelectedJobs().length
            this.$('.number-selected').text(selectedJobCount)
            this.$el.toggle(!!selectedJobCount)
            this.$('[data-action=delete-jobs]').removeClass('deleteable').text('Delete selected')
            return this
        },
        runJobs: function () {
            let selectedJobIds = this.getSelectedJobs().map(function (j) { return j.get('_id') })
            postJobs('run', selectedJobIds)
            .success(function () {
                App.trigger('refreshData')
            })
        },
        requeueJobs: function () {
            let selectedJobIds = this.getSelectedJobs().map(function (j) { return j.get('_id') })
            postJobs('requeue', selectedJobIds)
            .success(function () {
                App.trigger('refreshData')
            })
        },
        unlockJobs: function () {
            let selectedJobIds = this.getSelectedJobs().map(function (j) { return j.get('_id') })
            postJobs('unlock', selectedJobIds)
            .success(function () {
                App.trigger('refreshData')
            })
        },
        enableJobs: function () {
            let selectedJobIds = this.getSelectedJobs().map(function (j) { return j.get('_id') })
            postJobs('enable', selectedJobIds)
            .success(function () {
                App.trigger('refreshData')
            })
        },
        allowDeleteJobs: function () {
            this.$('[data-action=delete-jobs]').addClass('deleteable').text('Confirm delete selection')
        },
        deleteJobs: function () {
            let selectedJobIds = this.getSelectedJobs().map(function (j) { return j.get('_id') })
            postJobs('delete', selectedJobIds)
            .success(function () {
                App.trigger('refreshData')
            })
        }
    })

    let JobDetailsListView = Backbone.View.extend({
        el: '#details-list',
        initialize: function (options) {
            this.jobItems = options.jobItems
            _.bindAll(this, 'render')
            this.listenTo(this.jobItems, 'update', this.render)
            this.listenTo(this.jobItems, 'change', this.render)
            this.render()
        },
        render: _.throttle(function () {
            let selectedJobs = this.jobItems
                .where({selected: true})
                .map(function (jobItem) {
                    let jobDetailsView = new JobDetailsView({
                        model: jobItem
                    })
                    return jobDetailsView.render().$el
                })
            this.$el.empty().toggle(!!selectedJobs.length).append(selectedJobs)
            return this
        }, 300)
    })

    let JobDetailsView = Backbone.View.extend({
        model: JobItemModel,
        template: _.template($('#job-item-details-template').html()),
        initialize: function () {
            _.bindAll(this, 'render', 'close', 'runJob', 'unlockJob', 'requeueJob', 'enableJob', 'showDisableJobModal', 'allowDeleteJob', 'deleteJob')
            this.listenTo(this.model, 'change', this.render)
        },
        events: {
            'click .close': 'close',
            'click [data-action=run-job]': 'runJob',
            'click [data-action=unlock-job]': 'unlockJob',
            'click [data-action=requeue]': 'requeueJob',
            'click [data-action=enable]': 'enableJob',
            'click [data-action=disable]': 'showDisableJobModal',
            'click [data-action=delete]': 'allowDeleteJob',
            'click [data-action=delete].deleteable': 'deleteJob'
        },
        showJob: function (jobItem) {
            this.model = jobItem
            this.$el.empty().append(this.jobItemDetailsTemplate(jobItem.toJSON()))
        },
        runJob: function (e) {
            postJobs('run', [this.model.get('job')._id])
            .success(function () {
                $(e.currentTarget).remove()
                App.trigger('refreshData')
            })
        },
        unlockJob: function (e) {
            postJobs('unlock', [this.model.get('job')._id])
            .success(function () {
                $(e.currentTarget).remove()
                App.trigger('refreshData')
            })
        },
        requeueJob: function (e) {
            postJobs('requeue', [this.model.get('job')._id])
            .success(function () {
                $(e.currentTarget).remove()
                App.trigger('refreshData')
            })
        },
        enableJob: function (e) {
            postJobs('enable', [this.model.get('job')._id])
            .success(function () {
                App.trigger('refreshData')
            })
        },
        showDisableJobModal: function (e) {
            // Clear out existing values, provide job data, then show modal
            $(App.createDisableJobModalView.el).find('input').val('')
            $(App.createDisableJobModalView.el).find('.job-name').text(this.model.get('job').name)
            $(App.createDisableJobModalView.el).find('input.job-id').val(this.model.get('job')._id)
            $(App.createDisableJobModalView.el).modal('show')
        },
        allowDeleteJob: function (e) {
            $(e.currentTarget).addClass('deleteable').text('Confirm deletion')
        },
        deleteJob: function (e) {
            postJobs('delete', [this.model.get('job')._id])
            .success(function () {
                App.trigger('refreshData')
            })
        },
        close: function () {
            this.model.set('selected', false)
        },
        render: function () {
            this.$el.html(this.template(this.model.toJSON()))
            // Initialize tooltips
            this.$('[data-toggle="tooltip"]').tooltip()
            return this
        }
    })

    let SelectJobsView = Backbone.View.extend({
        el: '#select-jobs',
        initialize: function (options) {
            this.jobItems = options.jobItems
            _.bindAll(this, 'selectAll', 'selectNone')
        },
        events: {
            'click [data-action=schedule-job]': 'scheduleJob',
            'click [data-action=select-all]': 'selectAll',
            'click [data-action=select-none]': 'selectNone'
        },
        scheduleJob: function () {
            $(App.createJobPaneView.el).find('input').val('')
            $(App.createJobPaneView.el).show()
        },
        selectAll: function () {
            this.jobItems.forEach(function (jobItem) {
                jobItem.set({selected: true})
            })
        },
        selectNone: function () {
            this.jobItems.forEach(function (jobItem) {
                jobItem.set({selected: false})
            })
        }
    })

    let CreateJobPaneView = Backbone.View.extend({
        el: '#create-job-pane',
        initialize: function (options) {
            _.bindAll(this, 'render', 'hideView', 'saveJob')
            this.render()
        },
        events: {
            'click [data-action=cancel]': 'hideView',
            'click [data-action=save]': 'saveJob'
        },
        render: function () {
            this.$el.hide()
            return this
        },
        hideView: function () {
            this.$el.hide()
            return this
        },
        saveJob: function () {
            /*
            TODO: Need to validate user input.
            */
            let jobName = this.$el.find('.job-name').val()
            let jobSchedule = this.$el.find('.job-schedule').val()
            let jobRepeatEvery = this.$el.find('.job-repeat-every').val()
            let jobData = JSON.parse(this.$el.find('.job-data').val())
            $.ajax({
                type: 'POST',
                url: 'api/jobs/create',
                data: JSON.stringify({jobName: jobName, jobSchedule: jobSchedule, jobRepeatEvery: jobRepeatEvery, jobData: jobData}),
                contentType: 'application/json',
                dataType: 'json'
            })
            this.$el.hide()
            return this
        }
    })

    let CreateDisableJobModalView = Backbone.View.extend({
        el: '#disable-job-pane',
        initialize: function (options) {
            _.bindAll(this, 'render', 'disableJob')
            this.render()
        },
        events: {
            'click [data-action=save]': 'disableJob'
        },
        render: function () {
            return this
        },
        disableJob: function () {
            let self = this,
                jobReasonEl = this.$el.find('.job-disable-reason');

            if (jobReasonEl.val() === '') {
                jobReasonEl.parent().addClass('has-error');
                this.$el.find('#reasonRequiredHelpBlock').removeClass('hide');
                return this;
            }
            else {
                jobReasonEl.parent().removeClass('has-error');
                this.$el.find('#reasonRequiredHelpBlock').addClass('hide');
            }

            let jobIds = [this.$el.find('.job-id').val()],
                jobDisableReason = jobReasonEl.val();
            $.ajax({
                type: 'POST',
                url: 'api/jobs/disable',
                data: JSON.stringify({jobIds: jobIds, jobDisableReason: jobDisableReason}),
                contentType: 'application/json',
                dataType: 'json'
            }).done(function() {
                self.$el.modal('hide');
            }).always(function() {
                return this;
            });
        }
    });

    let AppView = Backbone.View.extend({
        el: '#app',
        initialize: function () {
            _.bindAll(this,
                'handleRequestChange',
                'handleShowJobDetails',
                'fetchData',
                'resultsFetched'
            )

            this.activeTitle = new ActiveTitleModel()
            this.activeTab = new ActiveTabModel()
            this.currentRequest = new CurrentRequestModel()
            this.overviewItems = new OverviewItemCollection()
            this.jobItems = new JobItemCollection()

            this.activeTitleView = new ActiveTitleView({
                activeTitle: this.activeTitle
            })
            this.sidebarView = new SidebarView({
                currentRequest: this.currentRequest
            })
            this.overviewListView = new OverviewListView({
                currentRequest: this.currentRequest,
                overviewItems: this.overviewItems,
                activeTab: this.activeTab
            })
            this.jobListView = new JobListView({
                currentRequest: this.currentRequest,
                jobItems: this.jobItems
            })
            this.jobDetailsPaneView = new JobDetailsPaneView({
                jobItems: this.jobItems
            })
            this.jobDetailsListView = new JobDetailsListView({
                jobItems: this.jobItems
            })
            this.selectJobsView = new SelectJobsView({
                jobItems: this.jobItems
            })
            this.createJobPaneView = new CreateJobPaneView({
            })
            this.createDisableJobModalView = new CreateDisableJobModalView({
            })

            this.listenTo(this, 'requestChange', this.handleRequestChange)
            this.listenTo(this, 'showJobDetails', this.handleShowJobDetails)
            this.listenTo(this, 'refreshData', this.fetchData)
            this.listenTo(this.currentRequest, 'change', this.fetchData)

            this.fetchData()
        },
        handleRequestChange: function (newRequest) {
            this.currentRequest.set(newRequest)
        },
        handleShowJobDetails: function (jobItem) {
            this.jobDetailsView.showJob(jobItem)
        },
        fetchData: function () {
            this._fetchRequest && this._fetchRequest.abort()
            this._fetchTimeout && clearTimeout(this._fetchTimeout)
            this._fetchRequest = $.get('api', {
                job: this.currentRequest.get('job'),
                state: this.currentRequest.get('state')
            }).success(this.resultsFetched)
        },
        resultsFetched: function (results) {
            this.overviewItems.set(results.overview)
            this.activeTitle.set({
                job: results.currentRequest.job,
                state: results.currentRequest.state
            })
            this.activeTab.set({state: results.currentRequest.state})
            this.render(results)
            this.jobItems.set(results.jobs)
            this._fetchTimeout = setTimeout(this.fetchData, this.currentRequest.get('refreshInterval'))
        },
        render: function (results) {
            document.title = results.title
            $('.page-title').text(results.title)
        }
    })

    let App = new AppView()

    function postJobs (action, jobIds) {
        return $.ajax({
            type: 'POST',
            url: 'api/jobs/' + action,
            data: JSON.stringify({jobIds: jobIds}),
            contentType: 'application/json',
            dataType: 'json'
        })
    }
})
