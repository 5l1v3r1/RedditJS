define(['App', 'underscore', 'backbone', 'hbs!template/subreddit', 'hbs!template/post-row-small', 'hbs!template/post-row-grid', 'view/post-row-view', 'view/basem-view', 'collection/subreddit', 'cView/subreddit', 'hbs!template/post-row', 'cookie'],
  function(App, _, Backbone, subredditTmpl, PostViewSmallTpl, PostRowGrid, PostRowView, BaseView, SubredditCollection, SrCView, PostRowTmpl, Cookie) {
    return BaseView.extend({
      template: subredditTmpl,
      events: {
        'click #retry': 'tryAgain',
        'click .thumbnailSmall': 'gotoSingle',
        'click .nextprev': 'fetchMore',
        //events for dropdown timeframe
        'click .drop-time-frame': 'toggleTimeFrame',
        'click .drop-time-frameSR': 'toggleTimeFrame'
      },
      ui: {
        'siteTable': '#siteTable',
        'nextprev': '.nextprev',
        'srTimeFrame': '#srTimeFrame',
        'dropTimeFrameSR': '.drop-time-frameSR'
      },
      regions: {
        'siteTable': '#siteTable'
      },
      initialize: function(options) {
        //_.bindAll(this);
        _.bindAll(this, 'gotNewPosts', 'fetchError')
        var self = this;
        this.subName = options.subName
        if (this.subName == 'front') {
          document.title = "RedditJS Beta"
        } else {
          document.title = this.subName + " - RedditJS Beta"
        }

        this.gridOption = $.cookie('gridOption') || 'normal';
        this.sortOrder = options.sortOrder
        this.domain = options.domain
        this.timeFrame = options.timeFrame

        //putting stuff in model so we can pass to handlebars template
        this.model = new Backbone.Model({
          sortOrder: this.sortOrder,
          subName: this.subName,
          timeFrame: this.timeFrame
        })

        if (typeof this.domain === 'undefined') {
          this.domain = null
        }
        this.subID = this.subName + this.domain + this.sortOrder + this.timeFrame
        console.log('subid in SR', this.subID)
        if (typeof this.sortOrder === 'undefined') {
          this.sortOrder = 'hot'
        }

        this.loading = false;

        this.currentFetch = null //so we can abort the current fetch if its active

        this.listenTo(App, "subreddit:changeGridOption", this.changeGridOption, this);
        //this.listenTo(App,"subreddit:remove", this.remove, this);
        //this.render();
        this.imagesAdded = 0; //keeps a total of how many images we are loading
        this.imgAry = []

        //$(window).on("scroll", this.watchScroll);
        $(window).on("scroll", this.debouncer(function(e) {

          self.watchScroll()
        }));
        $(window).resize(this.debouncer(function(e) {

          self.resize()
        }));

        //this.target = $("#siteTable"); //the target to test for infinite scroll
        this.target = $(window); //the target to test for infinite scroll
        this.loading = false;

        this.scrollOffset = 1000;
        this.prevScrollY = 0; //makes sure you are not checking when the user scrolls upwards
        this.errorRetries = 0; //keeps track of how many errors we will retry after

        //$(window).bind("resize.app", _.bind(this.debouncer));

        setTimeout(function() {
          self.changeHeaderLinks()
        }, 100);

        //this.helpFillUpScreen();

      },

      onBeforeDestroy: function() {
        console.log('closing subreddit-view')
          //window.stop() //prevents new images from being downloaded
        this.removePendingGrid()

        //$(window).off('resize', this.debouncer);
        //$(window).off("scroll", this.watchScroll);
        //$(window).off("scroll", this.debouncer);
        $(window).off('resize');
        $(window).off("scroll");

        //abort current fetch for more posts
        if (this.currentFetch !== null) {
          this.currentFetch.abort()
        }

      },

      onRender: function() {
        var self = this
        this.initGridOption();
        $(this.el).prepend("<style id='dynamicWidth'> </style>")
          //console.log("window.subs=", window.subs)

        if (typeof App.subs[this.subID] === 'undefined') {

          this.collection = new SubredditCollection([], {
            domain: this.domain,
            subName: this.subName,
            sortOrder: this.sortOrder,
            timeFrame: this.timeFrame
          });

          this.fetchMore();

        } else {
          console.log('loading collection from memory')
          this.collection = App.subs[this.subID]

          this.appendPosts(this.collection) //WE DONT NEED THIS WITH MARIONETTE COLLECTION VIEWS

          this.showMoarBtn()
            //this.fetchMore();
        }

        //if (this.gridOption != 'grid') {
        //this.subredditCollectionView = new SrCView({
        //collection: this.collection,
        //childView: PostRowView,
        //gridOption: this.gridOption
        //})

        //this.siteTable.show(this.subredditCollectionView)
        //}

        if (typeof this.collection !== 'undefined' && typeof this.collection.scroll !== 'undefined') {
          setTimeout(function() {
            $(window).scrollTop(self.collection.scroll)
          }, 10)

        }

        //show or hide the timeframe option
        if (this.sortOrder == 'controversial' || this.sortOrder == 'top') {
          this.ui.srTimeFrame.show()
        } else {
          this.ui.srTimeFrame.hide()
        }

        this.hideMoarBtn()
        this.resize()
      },
      toggleTimeFrame: function() {
        this.ui.dropTimeFrameSR.toggle()
      },

      //the image callback from waiting it to be loaded before being display
      //this needs to get removed or it will add images everywhere
      removePendingGrid: function() {

        var self = this
          //console.log('deleting', self.imgAry)
        for (var id in this.imgAry) {
          clearTimeout(self.imgAry[id]);
        }
        //*window.stop() is !important!  It floods the grid view if not set to trigger between page views

      },

      gotoSingle: function(e) {
        var name = this.$(e.currentTarget).data('id')
        App.curModel = this.collection.findWhere({
          name: name
        })
      },

      /**************Grid functions ****************/
      initGridOption: function() {
        var self = this
          /*grid option:
						normal - the default Reddit styling
						small - small thumbnails in the page
						large - full sized images in the page
					*/
        this.gridOption = $.cookie('gridOption');
        if (typeof this.gridOption === 'undefined' || this.gridOption === null || this.gridOption === "") {
          this.gridOption = 'normal'
        } else if (this.gridOption == "large") {
          this.resize()
        }

        this.gridViewSetup()

      },
      gridViewSetup: function() {
        var self = this

        if (this.gridOption == 'grid') {

          $('.side').hide()
          this.ui.siteTable.css('margin-right', '0') //some custom CSS was making this bad in grid mode
          this.ui.siteTable.css('text-align', 'center')
            //calculate how many columns we will have

          var colCount = Math.floor($(document).width() / 305)
          if (App.isMobile() === true) {
            var fakeMobileWidth = $(document).width()
            if (fakeMobileWidth < 550) {
              fakeMobileWidth = 550
            }

            colCount = Math.floor(fakeMobileWidth / 249)
          }

          for (var i = 0; i < colCount; i++) {
            self.ui.siteTable.append('<div class="column"> </div>')
          }

          this.ui.siteTable.append('<div id="fullImgCache"></div>')

        }
      },
      shortestCol: function() {
        var shortest = null
        var count = 0
        this.$('.column').each(function() {
          if (shortest === null) {
            shortest = $(this)
          } else if ($(this).height() < shortest.height()) {
            //console.log($(this).height(), shortest.height())
            shortest = $(this)
          }
        });
        return shortest;
      },
      changeHeaderLinks: function() {
        App.trigger("header:updateSortOrder", {
          sortOrder: this.sortOrder,
          domain: this.domain,
          subName: this.subName
        });
      },

      resize: function() {
        if (this.gridOption == "large") {

          var docWidth = $(document).width()
          var newWidth = 0;
          if (docWidth > App.mobileWidth) {
            newWidth = docWidth - 355;
          } else {
            newWidth = docWidth;
          }

          console.log('newwidth=', newWidth)

          $('#dynamicWidth').html(' <style> .large-img {max-width: ' + newWidth + 'px;} </style>');
        }

        if (App.settings.get('showSidebar') === true && this.gridOption != "grid") {

          if (App.mobileWidth > $(document).width()) {
            $('.side').hide()
          } else {
            $('.side').show()
          }
        }

      },

      changeGridOption: function(data) {
        var self = this
        if (typeof data.gridOption === 'undefined') {
          this.gridOption = $.cookie('gridOption');
        }
        if (this.gridOption == data.gridOption) {
          return;
          //do nothingif the user already clicked this once
        }

        this.removePendingGrid()

        this.gridOption = data.gridOption
        $.cookie('gridOption', this.gridOption, {
          path: '/'
        });

        //this.siteTable.destroy()
        this.ui.siteTable.empty();

        if (this.gridOption == "grid") {
          //this.changeActiveGrid()

          //this.resetPosts()
          this.gridViewSetup()
          this.appendPosts(this.collection)
        } else {

          //this.ui.siteTable.empty();
          this.ui.siteTable.css('text-align', 'left')
          this.appendPosts(this.collection)
            //this.subredditCollectionView = new SrCView({
            //collection: this.collection,
            //childView: PostRowView,
            //gridOption: this.gridOption
            // })
            // this.siteTable.show(this.subredditCollectionView)

          //this.subredditCollectionView.changeGridView(this.gridOption)

        }
        this.resize()
        this.helpFillUpScreen()

      },
      resetPosts: function() {
        //this.$('#siteTable').html(" ")
        this.ui.siteTable.empty();
      },
      /**************Fetching functions ****************/
      fetchError: function(response, error) {
        console.log("fetch error, lets retry", this.collection)
        if (this.errorRetries < 10) {
          this.loading = false;
          this.showMoarBtn()
        }

        if (this.collection.length <= 5) {
          this.ui.siteTable.html("<div id='retry' >  <img src='img/sad-icon.png' /><br /> click here to try again </div> ")
        }
        this.errorRetries++;

      },
      tryAgain: function() {
        this.$('#retry').remove()

        this.fetchMore();
      },
      fetchMore: function() {
        //$(this.el).append("<div class='loading'> </div>")
        this.loading = true
        this.hideMoarBtn()

        if (this.collection.after == "stop") {
          this.ui.nextprev.html('Done')
        } else {

          this.currentFetch = this.collection.fetch({
            success: this.gotNewPosts,
            error: this.fetchError,
            remove: false
          });
        }
      },

      //this function is for grid mode only
      //TODO: replace this and use collectionView somehow
      //Hard to use collectionView because its not calculating the shortest column
      appendPosts: function(collection) {
        var self = this
        var count = 0;
        var countSelfs = 0
        var startTime = new Date()
        var fragment = ''

        collection.each(function(model) {

          //if (model.get('imgUrl')) {
          count++;
          self.imagesAdded++

            if (self.gridOption != 'grid') {

              var newPost2 = PostRowTmpl(model.attributes)
              fragment += newPost2

              //self.ui.siteTable.append(newPost)
              //var newPost2 = new PostRowView({
              //model: model,
              //gridOption: self.gridOption
              // })
              // self.ui.siteTable.append(newPost2.el)

              //$('#siteTable').append(newPost)

            } else
          if (model.get('imgUrl')) {

            var newPost = $(PostRowGrid({
              model: model.attributes
            }))

            var biggerImg = model.get('imgUrl')
            if (self.gridOption == "grid" && model.get('smallImg')) {
              //only load scroll over event if user is in grid mode and that grid mode has a smaller imgur img displaying
              //this is so the user can hover over the post and load the full size img/full gif
              if (biggerImg.split('.').pop() == 'gif') {
                newPost.find('.gridLoading').show()
                  //newPost.find('.gridLoading').show() //only show loading icon if its a gif
              }

              newPost.one("mouseenter", function() {
                console.log("Loading bigger IMG");
                if (biggerImg.split('.').pop() == 'gif') {
                  newPost.find('.gridLoading').attr('src', '/img/loading.gif')
                    //newPost.find('.gridLoading').show() //only show loading icon if its a gif
                }

                $('<img src="' + biggerImg + '" />').load(function() {
                  console.log('loaded img')
                  newPost.find('img').attr('src', biggerImg);
                  newPost.find('.gridLoading').hide() //hide loading gif
                }).error(function() {
                  console.log("ERROR loading img")
                  newPost.find('.gridLoading').hide() //hide loading gif
                    //TODO show a failed to load img
                });

              });
            }

            if (count < 20) {

              var col = self.shortestCol()
              if (col) {
                col.append(newPost);
              }
            } else {
              //check if image is cached
              //var img = new Image()
              //img.src = model.get('imgUrl');

              var timeout = count * 230 //add an img to the screen every 230 milaseconds
              self.imgAry[model.get('id')] = setTimeout(function() {

                self.imagesAdded--;
                var col = self.shortestCol()
                if (col) {
                  col.append(newPost);
                }
              }, timeout);

            }

          } else {
            countSelfs++;
            //do not add self posts or links

          }

        }, this);

        this.resize()

        console.log('b4 dom in ', new Date().getTime() - startTime.getTime())
        self.ui.siteTable.append(fragment)
        console.log('dom in ', new Date().getTime() - startTime.getTime())

        if (this.gridOption == 'grid' && count === 0 && countSelfs > 0) {
          //if the grid image finder did not find any images, we need to find some more!
          console.log('found no images, searching for more')
          this.$('.column:first-child').html('<div style="margin:20% 20%;font-size:20px;">no images found, switch views to see self posts and links</div>')

        }

      },

      gotNewPosts: function(models, res) {
        //this.$('.loading').hide()

        //if (this.gridOption == 'grid') {
        this.currentFetch = null //so we can abort the current fetch if its active
          //displaying posts with collection view for everything besides gridview
        if (typeof res.data.children.length === 'undefined') {
          return; //we might have an undefined length?
        }
        var newCount = res.data.children.length
        var newModels = new Backbone.Collection(models.slice((models.length - newCount), models.length))

        this.appendPosts(newModels)
          //}

        this.loading = false; //turn the flag on to go ahead and fetch more!
        App.subs[this.subID] = this.collection
        this.showMoarBtn()
        this.helpFillUpScreen()
          //fetch more  posts with the After
        if (this.collection.after == "stop") {
          console.log("AFTER = stop")
          $(window).off("scroll", this.watchScroll);
          this.ui.nextprev.html('Done')
        }

      },

      /**************Infinite Scroll functions ****************/
      watchScroll: function(e) {
        console.log('watching scroll in ', this.subID)

        if (App.settings.get('infin') === true) {

          var self = this;
          if (this.gridOption == 'grid') {
            this.triggerPoint = 5000; // px from the bottom 
          } else {
            this.triggerPoint = 2000; // px from the bottom 
          }

          //keep the scrollheight in the collection so when we return to it, we can auto-move to it
          //bad?
          //if we are not checking for this it will reset the scrolltop back to zero when we reach this subreddit
          var windowScrollTop = $(window).scrollTop()
          if (typeof this.subID !== 'undefined') {
            //this.collection.scroll = windowScrollTop
            App.subs[this.subID].scroll = windowScrollTop

          }

          if ((($(window).scrollTop() + $(window).height()) + this.triggerPoint >= $(document).height()) && this.loading === false) {

            console.log('loading MOAR')
            if (this.collection.after != "stop") {
              this.fetchMore()
            } else {
              this.ui.nextprev.html('Done')
            }
          }
          //this.prevScrollY = scrollY;
        }
      },
      helpFillUpScreen: function() {
        //in small thumbnail mode, its sometimes impossible for the infinite scroll event to fire because there is no scrollbar yet
        if (this.collection.length < 301 && (this.gridOption == 'small')) {
          this.watchScroll()
        }

        if (this.collection.length < 55 && this.gridOption == 'grid') {

          this.watchScroll()
        }

      },

      showMoarBtn: function() {
        if (this.isDestroyed === false) {
          this.ui.nextprev.html('MOAR ›').show()
        }
      },
      hideMoarBtn: function() {
        if (this.isDestroyed === false) {
          this.ui.nextprev.html('<img class="loadingMOAR" src="img/loading.gif" />').show()
        }
      }

    });

  });
