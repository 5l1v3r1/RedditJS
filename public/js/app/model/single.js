define(['App', 'underscore', 'backbone', 'collection/comments'], function(App, _, Backbone, CommentsCollection) {
  return Backbone.Model.extend({
    initialize: function(attributes, options) {
      this.id = options.id
      this.parseNow = options.parseNow
      this.sortOrder = options.sortOrder

    },
    url: function() {
      var sortOrderStr = ""
      if (this.sortOrder !== "undefined") {
        sortOrderStr = "&sort=" + this.sortOrder
      }

      var username = App.user.name || false
      if (username !== false) {
        return "/api/?url=comments/" + this.id + ".json" + sortOrderStr
      } else {
        //use jsonp if user is not logged in

        if (App.isBot === true) {
          return App.baseURL + "comments/" + this.id + ".json?" + sortOrderStr
        } else {
          return App.baseURL + "comments/" + this.id + ".json?jsonp=?" + sortOrderStr
        }

      }
    },
    // Default attributes 
    defaults: {
      done: false,
      startedDL: false
        //  slug: "slug"
    },
    //so we have the attributes in the root of the model
    parse: function(response) {
      var data;
      //console.log("RESPONSE of single model", response)
      if (typeof response[0] === 'undefined') {
        data = response
      } else {

        //set the value for the single reddit post
        data = response[0].data.children[0].data
          //set the values for the comments of this post
          //data.replies = parseComments(response[1].data, data.name)
        data.replies = new CommentsCollection(response[1].data, {
          name: data.name,
          parse: true
        })
      }

      var timeAgo = moment.unix(data.created_utc).fromNow(true) //"true" removes the "ago"
      timeAgo = timeAgo.replace("in ", ''); //why would it add the word "in"
      data.timeAgo = timeAgo
      data.timeUgly = moment.unix(data.created).format()
        //format Sun Aug 18 12:51:06 2013 UTC
      data.timePretty = moment.unix(data.created).format("ddd MMM DD HH:mm:ss YYYY") + " UTC"

      //disabled comments if post is over one year old
      data.commentsDisabled = false
      var secondsAgo = ((new Date()).getTime() / 1000) - data.created
      if (secondsAgo > 31536000) data.commentsDisabled = true

      data.rname = "/r/" + data.subreddit

      //so we can have external URLS add data-bypass to the a tag
      data.selftext_html = (typeof data.selftext_html === 'undefined') ? '' : $('<div/>').html(data.selftext_html).text();

      if (data.thumbnail == 'self') {
        data.thumbnail = 'img/self.png'
      } else if (data.thumbnail == 'nsfw') {
        data.thumbnail = 'img/nsfw.png'
      } else if (data.thumbnail === '' || data.thumbnail == 'default') {
        data.thumbnail = 'img/notsure.png'
      }

      /*keeps track if the user voted for this or not
				putting the class upmod makes the vote count as an upvote
				downmod makes the vote show as a downvote
				leave the classes as "down" and "up" to leave the no vote option
			*/
      var score = data.score
      if (data.likes === null) {
        data.voted = 'unvoted'
        data.downmod = 'down'
        data.upmod = 'up'
        data.scoreUp = +score + 1
        data.scoreDown = +score - 1

      } else if (data.likes === true) {
        data.voted = "likes"
        data.downmod = 'down'
        data.upmod = 'upmod'
        score = data.score - 1
        data.scoreUp = +score + 1
        data.scoreDown = +score - 1
      } else {
        data.voted = "dislikes"
        data.downmod = 'downmod'
        data.upmod = 'up'
        score = data.score + 1
        data.scoreUp = +score + 2
        data.scoreDown = +score - 1
      }

      //comments or plural comments
      if (typeof data.num_comments !== 'undefined' && data.num_comments == 1) {
        data.commentsPlural = 'comment'
      } else {
        data.commentsPlural = 'comments'
      }
      //We have to print the score out for the upvoted and downvoted values

      //figure out a URL that we can embed in an image tag
      var imgUrl = data.url

      if (this.checkIsImg(imgUrl) === false) {
        //URL is NOT an image
        //try and fix an imgur link?
        imgUrl = this.fixImgur(imgUrl)

      }
      data.imgUrl = imgUrl

      data.smallImg = this.getSmallerImg(data.imgUrl)

      var expandedOrCollapsed = 'expanded' //values can be expaned or collapsed
      data.expandHTML = ""
      data.embededImg = false // if its a single image/video we can embed into a single post view

      if (typeof data.media_embed.content === 'undefined' && data.is_self === false && data.imgUrl !== false) {
        //this is a single image we can embed
        data.embededImg = true
          //data.media_embed = new Array()
        data.media_embed = "<img class='embedImg dragImg' src='" + data.imgUrl + "' />"
        data.expandHTML = "<li><div class='expando-button " + expandedOrCollapsed + " video'></div></li>"

      } else if (typeof data.media_embed.content !== 'undefined') {
        //if it has embed content, lets embed it
        data.embededImg = true
        data.media_embed = $('<div/>').html(data.media_embed.content).text();
        //data.media_embed.content = "<div class='embed'><p><a data-bypass  href='" + data.url + "' target='_blank'> <img src='" + data.imgUrl + "' /> </a></p></div>"
        data.expandHTML = "<li><div class='expando-button " + expandedOrCollapsed + " video'></div></li>"

      } else {
        data.media_embed = ""
      }

      //data.permalink = data.permalink.replace('?ref=search_posts', '')
      data.permalink = data.url

      if (data.is_self === true) {
        //data.external = 'data-bypass'
        data.actualUrl = data.url
        data.url = data.permalink
      } else if (data.embededImg === true) {
        //change the users URL link if its an embeded image/video type
        data.actualUrl = data.url
        data.url = data.permalink
        data.external = ''
      } else {
        //this is not a post we can embed
        data.actualUrl = data.url
        data.external = 'data-bypass'
      }

      data.actualPermalink = data.permalink //we have this because we override the permalink in the slideshow, but we need a link to get to the comment page

      data.slideshowUrl = '/comments/' + data.subreddit + "/" + data.id + '/slideshow'

      //console.log(data.media_embed.content)

      //delete things we wont use to save space in localstorage
      delete data.secure_media_embed;
      delete data.selftext;
      //delete data.created_utc;
      delete data.created;
      delete data.approved_by;
      delete data.over_18;
      delete data.secure_media;
      delete data.stickied;
      delete data.banned_by

      return data;

    },

    checkIsImg: function(url) {
      if (!url) return false
      return (url.match(/\.(jpeg|jpg|gif|png)$/) !== null);
    },
    fixImgur: function(url) {
      if (this.containsStr("imgur.com", url)) {
        //check if its a gallery
        url = url.replace('http://imgur.com', 'http://i.imgur.com')
        url = url.replace('/g/memes', '')
        if (this.containsStr("imgur.com/a/", url) === true || this.containsStr("gallery", url) === true) {
          return false
        } else {
          url = url.replace(/(\?.*)|(#.*)|(&.*)/g, "")
            //first remove query parameters from the url

          return url + ".jpg"
        }

      }
      return false;
    },
    //imgur keeps a small image that we can use in the grid view
    getSmallerImg: function(url) {

      if (url !== false && this.containsStr("imgur.com", url)) {
        //check if its a gallery
        if (this.containsStr("imgur.com/a", url) === true || this.containsStr("gallery", url) === true) {
          return false
        } else {
          url = url.replace(/(\?.*)|(#.*)|(&.*)/g, "")
            //url = url.substr(0, url.lastIndexOf('.'));
          url = url.replace('.jpg', '')
          url = url.replace('.png', '')
          url = url.replace('.jpeg', '')
          url = url.replace('.gif', '')

          return url + "l.jpg" //add l to the end of the img url to give it a better preview
        }

      }
      return false;

    },
    containsStr: function(needle, haystack) {
      if (typeof haystack === 'undefined') return false
      return (haystack.indexOf(needle) >= 0)
    }

  });

});
