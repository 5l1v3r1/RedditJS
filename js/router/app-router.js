define(['underscore', 'backbone', 'view/subreddit-view', 'view/header-view', 'view/single', 'view/sidebar-view', 'event/channel', 'backbone-queryparams'],
    function(_, Backbone, SubredditView, HeaderView, SingleView, SidebarView, channel) {

        var AppRouter = Backbone.Router.extend({

            initialize: function() {
                Backbone.history.start({
                    pushState: true,
                    root: "/"
                });

                this.header = new HeaderView();

            },
            routes: {
                '(:sortOrder)(/)': 'home',
                'r/:subName(/)': 'subreddit',
                'r/:subName/:sortOrder': 'subreddit',
                'r/:subName/comments/:id/:slug(/)': 'single',
                //  'r/:subName/': 'subreddit'
            },
            //middleware, this will be fired before every route
            route: function(route, name, callback) {
                var router = this;
                if (!callback) callback = this[name];
                var f = function() {
                    //middleware functions
                    channel.trigger("subreddit:remove") //clear old subreddit views
                    channel.trigger("single:remove") //clear old subreddit views

                    //end middleware functions
                    callback.apply(router, arguments); //call the actual route
                };
                return Backbone.Router.prototype.route.call(this, route, name, f);
            },

            home: function(sortOrder) {

                channel.trigger("header:updateSortOrder")

                console.debug("Main route activated");

                this.doSidebar('front');

                subredditView = new SubredditView({
                    subName: "front",
                    sortOrder: sortOrder
                });
            },

            subreddit: function(subName, sortOrder) {

                this.doSidebar(subName);

                subredditView = new SubredditView({
                    subName: subName,
                    sortOrder: sortOrder
                });

            },

            single: function(subName, id) {

                this.doSidebar(subName);

                singleView = new SingleView({
                    subName: subName,
                    id: id
                });

            },
            doSidebar: function(subName) {
                if (typeof this.sidebar === 'undefined' || this.sidebar.subName != subName) { //only update sidebar if the subreddit changes
                    this.sidebar = new SidebarView({
                        subName: subName,
                    })
                }
            }

        });

        return AppRouter;

    });