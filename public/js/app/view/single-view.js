define(['App', 'underscore', 'backbone', 'hbs!template/single', 'hbs!template/loading', 'view/post-row-view', 'view/sidebar-view', 'view/basem-view', 'model/single', 'view/comment-view', 'cookie', 'model/parseComments'],
  function(App, _, Backbone, singleTmpl, loadingTmpl, PostRowView, SidebarView, BaseView, SingleModel, CommentView, Cookie, parseComments) {
    return BaseView.extend({
      template: singleTmpl,
      events: {
        'click #retry': 'tryAgain',
        'click #retryForComments': 'tryAgain',
        //'click .expando-button': 'toggleExpando',
        'click .leftArrow': 'gotoPrev',
        'click .rightArrow': 'gotoNext',
        'click .toggleDropdownCmntSort': 'toggleDropDownCmtSort',
        'click .drop-choices-single a': 'changeCmntSort',
        'click .mdHelpShow': 'showMdHelp',
        'click .mdHelpHide': 'hideMdHelp',
        'submit #mainComment': 'comment',
        'keyup .userTxtInput': 'keyPressComment',
        'click .startSlideshow': 'startSlideshow'

      },
      regions: {
        'thepost': '#thepost',
        'siteTableComments': '#siteTableComments'
      },
      ui: {

        loadingC: '#loadingC',
        text: '.text',
        commentreply: '.commentreply',
        'mdHelp': '.mdHelp',
        'mdHelpShow': '.mdHelpShow',
        'mdHelpHide': '.mdHelpHide',
        'status': '.status',
        'singleCommentText': '#singleCommentText',
        'userTxtInput': '.userTxtInput',
        'liveTextarea': '.liveTextarea',
        'noCommentError': '.noCommentError'
      },
      initialize: function(options) {
        _.bindAll(this);
        //$(document).bind('keyup', this.keyPressComment);
        var self = this;

        this.subName = options.subName
        this.id = options.id
        this.commentLink = options.commentLink
        this.hasRendered = false
        this.blinking = '<img class="blinkingFakeInput" src="/img/text_cursor.gif" />'

        if (typeof App.curModel === 'undefined') {

          this.fetchComments(this.loaded, null, this.fetchError)
          this.template = loadingTmpl

        } else {
          // console.log('loading a model from memory')
          //this is what we do when we pass in a model with out the comments
          this.model = App.curModel;
          this.updatePageTitle(this.model.get('title'));
          delete App.curModel; //memory management
          this.renderStuff(this.model);
          //well now we need to get the comments for this post!
          this.fetchComments(this.loadComments, null, this.fetchErrorForComments)

        }

        this.listenTo(App, "single:remove", this.remove, this);
        this.listenTo(App, "single:giveBtnBarID", this.triggerID, this);

      },
      onRender: function() {
        var self = this
        if (typeof this.model !== 'undefined') {

          self.thepost.show(new PostRowView({
            model: self.model,
            gridOption: 'normal',
            expand: true,
            isSingle: true
          }));

        }
        this.triggerID()
        this.scrollTop()

        this.disableComment()
        this.addOutboundLink()

        this.setupTextareaExpanding()

      },
      onBeforeDestroy: function() {

        this.destroyed = true

        this.ui.singleCommentText.off("click", this.showLoginBox)

        //removes the ajax call if the user decided to leave the page while still waiting on reddit api
        if (typeof this.fetchXhr !== 'undefined' && this.fetchXhr.readyState > 0 && this.fetchXhr.readyState < 4) {
          this.fetchXhr.abort();
        }
        this.fetchXhr.abort()

      },
      startSlideshow: function() {
        App.curModel = this.model;
        //this.fullScreen(document.body);
        App.trigger("bottombar:selected", "t3_" + this.id);

        //'comments/:subName/:id/slideshow': 'slideshow',

        Backbone.history.navigate(this.model.get('slideshowUrl'), {
          trigger: true
        });

      },

      disableComment: function() {
        var self = this
          //disable textbox if user is not logged in
          //because we have to refresh the page if they login via oauth
        if (this.checkIfLoggedIn() === false) {
          this.ui.singleCommentText.attr('readonly', true);
          this.ui.singleCommentText.val('login to comment')
          this.ui.singleCommentText.on("click", this.showLoginBox)
          this.ui.singleCommentText.css('background-color', '#E9E6E6')
        }
      },
      toggleDropDownCmtSort: function() {
        this.$('.drop-choices-single').toggle()
      },
      changeCmntSort: function(e) {
        e.preventDefault()
        e.stopPropagation()
        this.$('.drop-choices-single').hide()
        var target = this.$(e.currentTarget)
        var sortOrder = target.text()
        this.$('.selectedCmntSort').html(sortOrder)
        this.$('#siteTableComments').empty()
          //this.comments.reset()
        this.fetchComments(this.loadComments, sortOrder, this.fetchError)
      },

      updatePageTitle: function(title) {
        document.title = title + " | redditJS.com"
      },

      fetchComments: function(callback, sortOrder, errorCallback) {

        this.comments = new SingleModel({
          subName: this.subName,
          id: this.id,
          parseNow: true,
          sortOrder: sortOrder
        });

        //this.render();
        this.fetchXhr = this.comments.fetch({
          success: callback,
          error: errorCallback
        });

        if (this.commentLink !== null) {
          this.loadLinkedComment()
        }

      },
      //this function displays a single comment if the user is viewing a linked comment via the permalink feature
      loadLinkedComment: function() {

        //$(this.el).html("<div class='loadingS'></div>")
        var self = this
        var link_id = 't3_' + this.id
        var params = {
          link_id: link_id,
          id: this.commentLink,
          api_type: 'json',
          //children: this.model.get('children').join(","),
          children: this.commentLink,
          byPassAuth: true
        }

        this.api("api/morechildren.json", 'POST', params, function(data) {
          if (typeof data !== 'undefined' && typeof data.json !== 'undefined' && typeof data.json.data !== 'undefined' && typeof data.json.data.things !== 'undefined') {

            require(['model/comment'], function(CommentModel) {
              data.children = data.json.data.things
              var tmpModel = new CommentModel({
                skipParse: true
              })
              self.linkedCommentModel = parseComments(data, link_id)
              self.linkedCommentModel = self.linkedCommentModel.models[0]

              self.linkedCommentModel.set('permalink', document.URL)

              if (self.hasRendered === true) {
                self.loadLinkedCommentView()
              }

            })

          }
        });

      },

      triggerID: function() {
        App.trigger("bottombar:selected", "t3_" + this.id);
        //App.trigger("bottombar:selected", this.model);
      },

      /**************Fetching functions ****************/
      fetchErrorForComments: function(response, error) {
        //$(this.el).html("<div id='retry' >  <div class='loading'></div> </div> ")
        this.ui.noCommentError.html("<div id='retryForComments'><img src='/img/sad-icon.png' title='click here to try again'/> </div> ")
        this.nextErrorFunctionToRun = this
        this.ui.loadingC.hide()

      },

      fetchError: function(response, error) {
        // console.log('error=', error)
        // if (error && error.status === 419) {
        //   console.log('show them the relogin modal')
        // }
        this.nextErrorFunctionToRun = this
        $(this.el).html("<div id='retry' >  <div class='loading'></div> </div> ")
        $(this.el).html("<div id='retry' >  <img src='/img/sad-icon.png' /><br /> click here to try again </div> ")
        this.ui.loadingC.hide()

      },

      tryAgain: function() {
        // $(this.el).
        // $(this.el).append("<style id='dynamicWidth'> </style>")
        // $(this.el).html("<div id='retry'><img src='img/sad-icon.png' /><br /> click here to try again </div> ")

        this.model.fetch({
          success: this.loaded,
          error: this.nextErrorFunctionToRun
        });
      },
      gotoPrev: function() {
        App.trigger('btmbar:gotoPrev')
      },
      gotoNext: function() {
        App.trigger('btmbar:gotoNext')
      },

      renderStuff: function(model) {
        //console.log('rendering single=', this.model)
        this.template = singleTmpl
        this.render()

        this.hasRendered = true
        this.addOutboundLink()
        this.loadLinkedCommentView()
        $(this.el).append("<style id='dynamicWidth'> </style>")
          // this.resize()
        this.disableComment()

        //shows the key navigation help on hover
        this.$('.arrowNav').hover(
          function(e) {

            self.$('#arrowNavHelp').show()

          },
          function(e) {
            self.$('#arrowNavHelp').hide()
          }
        )

      },
      loadLinkedCommentView: function() {
        if (typeof this.linkedCommentModel !== 'undefined') {
          var self = this
            //add this model to the start of the reply collection
          this.model.attributes.replies.unshift(this.linkedCommentModel)
          setTimeout(function() {
            //self.$('#siteTableComments .usertext-body').first().css('background-color', '#F5F5A7')
            self.$('#siteTableComments .usertext-body').first().addClass('highlightedComment')
          }, 300)

        }
      },
      //if we dont pass in a model we need to render the comments here
      loadComments: function(model, res) {
        //this.$('.loadingS').remove()
        this.ui.loadingC.hide()
        this.permalinkParent = this.model.get('permalink') //this is for the comment callback so we can set the permalink after someone comments on a main post

        this.renderComments(model.get('replies'))

      },
      loaded: function(model, res) {
        //this.$('.loading').hide()
        this.model = model

        //this.model = model.parseOnce(model.attributes)
        this.renderStuff(model);
        this.loadComments(model);
        //console.log('before activiating btm bar=', model)

      },

      addOneChild: function(model) {
        this.collection.add(model)
      },

      renderComments: function(collection) {
        //console.log('collection in renderComments', collection)
        var self = this
        this.updatePageTitle(this.model.get('title'))
        this.collection = collection

        this.listenTo(App, "comment:addOneChild" + this.model.get('name'), this.addOneChild);

        //console.log('single view passing in op', self.model.get('author'))

        require(['cView/comments', 'view/comment-view'], function(CViewComments, CommentView) {
          self.commentCollectionView = new CViewComments({
            collection: collection,
            childView: CommentView,
            originalPoster: self.model.get('author'),
            commentsDisabled: self.model.get('commentsDisabled')
          })
          self.siteTableComments.show(self.commentCollectionView)

        })

      }

    });

  });
