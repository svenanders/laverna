/*global define*/
define([
    'underscore',
    'app',
    'backbone',
    'dropbox',
    'constants'
], function (_, App, Backbone, Dropbox, constants) {
    'use strict';

    var Adapter = function () { };

    Adapter = _.extend(Adapter.prototype, {

        // OAuth authentification
        // ---------------------
        auth: function () {
            _.bindAll(this, 'sync');

            this.client = new Dropbox.Client({
                key    : constants.DROPBOX_KEY
                // secret : constants.DROPBOX_SECRET
            });

            this.client.authDriver(new Dropbox.AuthDriver.Popup({
                receiverUrl: constants.URL + 'dropbox.html',
                rememberUser: true
            }));

            this.client.authenticate({interactive: false});

            if ( !this.client.isAuthenticated()) {
                var self = this;
                App.Confirm.start({
                    content : 'Now you will be redirected to **Dropbox** authorization page.\r> Please click **OK** button.',
                    success : function () {
                        self.client.authenticate();
                    }
                });
            }

            // Override backbone sync method
            if (this.client.isAuthenticated()) {
                Backbone.cloud = this.sync;
            }
        },

        // Sync method
        // -----------
        sync: function (method, model, options) {
            var self = this,
                resp;

            if (this.client === void 0) {
                throw new Error('no dropbox client');
            }
            if (false === (this.client instanceof Dropbox.Client)) {
                throw new Error('invalid dropbox client');
            }

            options         = options           || {};
            options.success = options.success   || function() {};
            options.error   = options.error     || function() {};
            options.store = this.getStore(model);

            // Store every collection in different places
            this.createDir( options.store )
                .fail(options.error)
                .done(function () {
                    resp = self.query(method, model, options);
                });

            return resp;
        },

        // Process request
        // ---------------
        query: function (method, model, options) {
            var resp;

            switch (method) {
            case 'read':
                resp = model.id !== undefined ? this.find(model, options) : this.findAll(options);
                break;
            case 'create':
                resp = this.create(model, options);
                break;
            case 'update':
                resp = this.update(model, options);
                break;
            case 'delete':
                resp = this.destroy(model, options);
                break;
            }

            if (resp) {
                resp.fail(options.error).done(options.success);
            }

            return resp;
        },

        // Create directory for files
        // --------------------------
        createDir: function (dir) {
            var d = $.Deferred(),
                self = this;

            this.client.metadata(dir, function (error, stat) {
                // Create only if not exists
                if (error) {
                    self.client.mkdir(dir, function (error, stat) {
                        if (error) {
                            d.reject(error);
                        }
                        else {
                            d.resolve(stat);
                        }
                        return true;
                    });
                }
                else {
                    d.resolve(stat);
                }
            });

            return d;
        },

        // Add a new model
        // ---------------
        create: function (model, options) {
            return this.writeFile(model, options);
        },

        // Update a model by replacing its copy in dropbox
        // -----------------------
        update: function (model, options) {
            return this.writeFile(model, options);
        },

        // Delete a model from Dropbox
        // ------------------------
        destroy: function (model, options) {
            if ( !model.id) {
                return;
            }
            var d = $.Deferred();
            this.client.remove(options.store + '/' + model.id + '.json', function (error, stat) {
                if (error) {
                    d.reject(error);
                } else {
                    d.resolve(stat);
                }
            });
            return d;
        },

        // Retrieve a model from dropbox
        // ----------------------------
        find: function (model, options) {
            var d = $.Deferred();

            this.client.readFile(
                options.store + '/' + model.get('id') + '.json',
                function (error, data) {
                    if (error) {
                        d.reject(error);
                    } else {
                        d.resolve(JSON.parse(data));
                    }
                    return true;
                }
            );

            return d;
        },

        // Collection of files - no content, just id and modified time
        // -------------------
        findAll: function (options) {
            var d = $.Deferred(),
                items = [],
                data,
                id;

            this.client.readdir(options.store, function (error, entries, fileStat) {
                if (error) {
                    d.reject(error);
                } else {
                    if (entries.length === 0) {
                        d.resolve(entries);
                    }
                    data = fileStat.json();
                    _.each(data.contents, function (item, iter) {
                        id = item.path.replace('/' + options.store + '/', '');
                        id = id.replace('.json', '');

                        items.push({
                            id : id,
                            updated: new Date(item.modified).getTime()
                        });

                        if (iter === data.contents.length-1) {
                            d.resolve(items);
                        }
                    });
                }
                return true;
            });

            return d;
        },

        // Write model's content to file
        // -----------------------------
        writeFile: function (model, options) {
            var d = $.Deferred();
            if ( !model.id) {
                return;
            }

            this.client.writeFile(
                options.store + '/' + model.id + '.json',
                JSON.stringify(model),
                function (error, stat) {
                    if (error) {
                        d.reject(error);
                    } else {
                        d.resolve(stat);
                    }
                    return true;
                }
            );

            return d;
        },

        // Directory name
        // --------------
        getStore: function (model) {
            return model.storeName || model.collection.storeName;
        }

    });

    return Adapter;
});
